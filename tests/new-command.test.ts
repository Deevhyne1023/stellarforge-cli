import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNewCommand } from '../src/commands/new.js';
import { EXIT_CODES, runWithCliErrorBoundary } from '../src/errors/index.js';
import type { ProjectGeneratorServices } from '../src/generator/types.js';
import {
  createCapturedTerminalOutput,
  withTempDirectory,
} from './helpers/index.js';

function services(calls: string[]): ProjectGeneratorServices {
  return {
    validate(input) {
      calls.push(
        `validate:${input.projectName}:${input.cwd}:${input.templateId ?? 'default'}`,
      );
      return input;
    },
    planDestination(input) {
      calls.push('plan');
      return {
        projectName: input.projectName,
        destination: `/workspace/${input.projectName}`,
      };
    },
    selectTemplate() {
      calls.push('template');
      return { templateId: 'fixture-template' };
    },
    generate(context, options) {
      calls.push(options?.dryRun ? 'generate:preview' : 'generate');
      if (options?.dryRun) {
        return {
          dryRun: true,
          projectName: context.input.projectName,
          destination: context.destination.destination,
          templateId: context.template.templateId,
          files: [
            {
              path: 'package.json',
              substitutions: ['{{projectName}} -> demo'],
            },
          ],
        };
      }

      return {
        projectName: context.input.projectName,
        destination: context.destination.destination,
        templateId: context.template.templateId,
      };
    },
  };
}

describe('new command', () => {
  it('delegates project creation to the generator orchestration layer', () => {
    const calls: string[] = [];
    const captured = createCapturedTerminalOutput();
    const command = createNewCommand({
      services: services(calls),
      output: captured.output,
      cwd: () => '/workspace',
    });

    command.parse(['node', 'new', 'demo']);

    expect(calls).toEqual([
      'validate:demo:/workspace:default',
      'plan',
      'template',
      'generate',
    ]);
    expect(captured.stdoutText()).toContain(
      'Created demo from fixture-template at /workspace/demo.',
    );
    expect(captured.stderrText()).toBe('');
  });

  it('forwards an explicit bundled template identifier', () => {
    const calls: string[] = [];
    const command = createNewCommand({
      services: services(calls),
      output: createCapturedTerminalOutput().output,
      cwd: () => '/workspace',
    });

    command.parse(['node', 'new', 'demo', '--template', 'smart-contract']);

    expect(calls[0]).toBe('validate:demo:/workspace:smart-contract');
  });

  it('passes preview mode through orchestration and does not report creation', () => {
    const calls: string[] = [];
    const captured = createCapturedTerminalOutput();
    const command = createNewCommand({
      services: services(calls),
      output: captured.output,
      cwd: () => '/workspace',
    });

    command.parse(['node', 'new', 'demo', '--dry-run']);

    expect(calls).toEqual([
      'validate:demo:/workspace:default',
      'plan',
      'template',
      'generate:preview',
    ]);
    expect(captured.stdoutText()).toContain('Preview for fixture-template');
    expect(captured.stdoutText()).toContain('package.json');
    expect(captured.stdoutText()).toContain('{{projectName}} -> demo');
    expect(captured.stdoutText()).not.toContain('Created');
  });

  it('requires a project name argument', () => {
    const command = createNewCommand({
      services: services([]),
      cwd: () => '/workspace',
    });
    command.exitOverride();

    expect(() => command.parse(['node', 'new'])).toThrow();
  });

  it.each(['unknown', '', 'Basic-App', ' basic-app '])(
    'gives actionable validation guidance for template %j',
    async (templateId) =>
      withTempDirectory(async (cwd) => {
        const captured = createCapturedTerminalOutput();
        const command = createNewCommand({
          output: captured.output,
          cwd: () => cwd,
        });

        const exitCode = await runWithCliErrorBoundary(async () => {
          await command.parseAsync([
            'node',
            'new',
            'demo',
            '--template',
            templateId,
          ]);
        }, captured.output);

        expect(exitCode).toBe(EXIT_CODES.validation);
        expect(captured.stderrText()).toContain(
          'Supported templates: basic-app, full-stack, smart-contract, api-service.',
        );
        expect(captured.stderrText()).toContain(
          'Usage: stellarforge new <project-name> --template <id>.',
        );
        expect(captured.stderrText()).not.toContain('templates/');
      }),
  );

  it('previews the bundled template without creating destination or staging files', async () =>
    withTempDirectory(async (cwd) => {
      const before = readdirSync(cwd);
      const captured = createCapturedTerminalOutput();
      const command = createNewCommand({
        output: captured.output,
        cwd: () => cwd,
      });

      await command.parseAsync([
        'node',
        'new',
        'preview-app',
        '--template',
        'basic-app',
        '--dry-run',
      ]);

      expect(captured.stdoutText()).toContain(
        `Preview for basic-app at ${join(cwd, 'preview-app')}:`,
      );
      expect(captured.stdoutText()).toContain('package.json');
      expect(captured.stdoutText()).toContain('{{projectName}} -> preview-app');
      expect(existsSync(join(cwd, 'preview-app'))).toBe(false);
      expect(readdirSync(cwd)).toEqual(before);

      const repeated = createCapturedTerminalOutput();
      await createNewCommand({
        output: repeated.output,
        cwd: () => cwd,
      }).parseAsync([
        'node',
        'new',
        'preview-app',
        '--template',
        'basic-app',
        '--dry-run',
      ]);
      expect(repeated.stdoutText()).toBe(captured.stdoutText());
    }));

  it('rejects unsafe destinations identically in preview and generation modes', async () =>
    withTempDirectory(async (cwd) => {
      const errors = [];
      for (const dryRun of [false, true]) {
        const captured = createCapturedTerminalOutput();
        const command = createNewCommand({
          output: captured.output,
          cwd: () => cwd,
        });
        const exitCode = await runWithCliErrorBoundary(async () => {
          await command.parseAsync([
            'node',
            'new',
            '../outside',
            ...(dryRun ? ['--dry-run'] : []),
          ]);
        }, captured.output);
        errors.push({ exitCode, message: captured.stderrText() });
      }

      expect(errors[0]?.exitCode).toBe(EXIT_CODES.validation);
      expect(errors[1]).toEqual(errors[0]);
    }));
});
