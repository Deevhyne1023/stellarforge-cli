import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import type * as NodeFs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ValidationCliError } from '../src/errors/errors.js';
import { withTempDirectory } from './helpers/index.js';

// Deterministically simulates the time-of-check/time-of-use race between the
// upfront destination validation and the later write phase: a one-shot hook
// fires exactly once copyTemplateTree has finished writing into the staging
// directory (the only write that happens during the vulnerable window), then
// swaps the real destination out from under the generator before it reaches
// the mutating rmdirSync/renameSync calls.
let onceTemplateCopyCompletes: (() => void) | null = null;

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();

  return {
    ...actual,
    writeFileSync: ((...args: Parameters<typeof actual.writeFileSync>) => {
      const result = actual.writeFileSync(...args);

      if (onceTemplateCopyCompletes) {
        const hook = onceTemplateCopyCompletes;
        onceTemplateCopyCompletes = null;
        hook();
      }

      return result;
    }) as typeof actual.writeFileSync,
  };
});

function createTemplate(root: string): string {
  const templateRoot = join(root, 'template');
  mkdirSync(templateRoot);
  writeFileSync(join(templateRoot, 'README.md'), '# {{projectName}}\n');
  return templateRoot;
}

afterEach(() => {
  onceTemplateCopyCompletes = null;
});

describe('generator destination race (TOCTOU)', () => {
  it('rejects when the destination is replaced with a symlink mid-generation', async () => {
    const { generateProjectFromTemplate } =
      await import('../src/generator/template-generation.js');

    await withTempDirectory(async (root) => {
      const templateRoot = createTemplate(root);
      const elsewhere = join(root, 'elsewhere');
      mkdirSync(elsewhere);
      const destination = join(root, 'demo');
      mkdirSync(destination);

      onceTemplateCopyCompletes = () => {
        rmSync(destination, { recursive: true, force: true });
        symlinkSync(elsewhere, destination, 'junction');
      };

      expect(() =>
        generateProjectFromTemplate(
          {
            input: { projectName: 'demo', cwd: root, templateId: 'basic-app' },
            destination: { projectName: 'demo', destination },
            template: { templateId: 'basic-app' },
          },
          { templateRoot },
        ),
      ).toThrow(ValidationCliError);

      expect(onceTemplateCopyCompletes).toBeNull();
      // The attacker-controlled symlink target must remain untouched.
      expect(readdirSync(elsewhere)).toEqual([]);
      // No files were written outside the originally requested destination.
      expect(existsSync(join(elsewhere, 'README.md'))).toBe(false);
      // No staging leftovers outside the destination.
      expect(
        readdirSync(root).filter((name) => name.startsWith('.stellarforge-')),
      ).toEqual([]);
    });
  });

  it('rejects when an ancestor of the destination parent is swapped mid-generation', async () => {
    const { generateProjectFromTemplate } =
      await import('../src/generator/template-generation.js');

    await withTempDirectory(async (root) => {
      const templateRoot = createTemplate(root);
      const realParent = join(root, 'real-parent');
      const decoyParent = join(root, 'decoy-parent');
      mkdirSync(realParent);
      mkdirSync(decoyParent);
      const parentLink = join(root, 'parent-link');
      symlinkSync(realParent, parentLink, 'junction');
      const destination = join(parentLink, 'demo');

      onceTemplateCopyCompletes = () => {
        rmSync(parentLink, { recursive: true, force: true });
        symlinkSync(decoyParent, parentLink, 'junction');
      };

      expect(() =>
        generateProjectFromTemplate(
          {
            input: { projectName: 'demo', cwd: root, templateId: 'basic-app' },
            destination: { projectName: 'demo', destination },
            template: { templateId: 'basic-app' },
          },
          { templateRoot },
        ),
      ).toThrow(ValidationCliError);

      expect(onceTemplateCopyCompletes).toBeNull();
      expect(readdirSync(decoyParent)).toEqual([]);
      expect(
        readdirSync(root).filter((name) => name.startsWith('.stellarforge-')),
      ).toEqual([]);
    });
  });

  it('still succeeds for ordinary generation with no interference', async () => {
    const { generateProjectFromTemplate } =
      await import('../src/generator/template-generation.js');

    await withTempDirectory(async (root) => {
      const templateRoot = createTemplate(root);
      const destination = join(root, 'demo');

      const result = generateProjectFromTemplate(
        {
          input: { projectName: 'demo', cwd: root, templateId: 'basic-app' },
          destination: { projectName: 'demo', destination },
          template: { templateId: 'basic-app' },
        },
        { templateRoot },
      );

      expect(result.destination).toBe(resolve(destination));
      expect(readFileSync(join(destination, 'README.md'), 'utf8')).toBe(
        '# demo\n',
      );
    });
  });
});
