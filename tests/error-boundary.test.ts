import { Command, CommanderError } from 'commander';
import { describe, expect, it } from 'vitest';
import {
  EXIT_CODES,
  InternalCliError,
  isDebugEnabled,
  runWithCliErrorBoundary,
  SubprocessCliError,
  ValidationCliError,
} from '../src/errors/index.js';
import { runCli } from '../src/main.js';
import { createCapturedTerminalOutput } from './helpers/captured-output.js';

describe('CLI error boundary', () => {
  it.each([
    {
      error: new ValidationCliError('Injected command validation failure.'),
      exitCode: EXIT_CODES.validation,
      message: 'Injected command validation failure.',
    },
    {
      error: new Error('injected implementation detail'),
      exitCode: EXIT_CODES.unexpected,
      message: 'StellarForge encountered an unexpected error.',
    },
  ])(
    'normalizes async command rejection from runCli',
    async ({ error, exitCode, message }) => {
      const { output, stderr } = createCapturedTerminalOutput();
      const unhandled: unknown[] = [];
      const recordUnhandled = (reason: unknown): void => {
        unhandled.push(reason);
      };
      const program = new Command('stellarforge');
      program.addCommand(
        new Command('injected').action(async () => {
          throw error;
        }),
      );

      process.on('unhandledRejection', recordUnhandled);
      try {
        const result = await runWithCliErrorBoundary(
          () => runCli(['node', 'stellarforge', 'injected'], () => program),
          output,
        );
        await new Promise<void>((resolve) => setImmediate(resolve));

        expect(result).toBe(exitCode);
        expect(stderr.join('')).toContain(message);
        expect(stderr.join('')).not.toContain('injected implementation detail');
        expect(stderr.join('')).not.toMatch(/^\s+at /m);
        expect(unhandled).toEqual([]);
      } finally {
        process.removeListener('unhandledRejection', recordUnhandled);
      }
    },
  );

  it('returns success when the action completes', async () => {
    const { output, stdout, stderr } = createCapturedTerminalOutput();

    const exitCode = await runWithCliErrorBoundary(() => undefined, output);

    expect(exitCode).toBe(EXIT_CODES.success);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual([]);
  });

  it('renders validation errors safely and returns the validation code', async () => {
    const { output, stderr } = createCapturedTerminalOutput();

    const exitCode = await runWithCliErrorBoundary(() => {
      throw new ValidationCliError('Project name is required.');
    }, output);

    expect(exitCode).toBe(EXIT_CODES.validation);
    expect(stderr).toEqual(['Project name is required.\n']);
  });

  it('renders subprocess errors safely and returns the subprocess code', async () => {
    const { output, stderr } = createCapturedTerminalOutput();

    const exitCode = await runWithCliErrorBoundary(() => {
      throw new SubprocessCliError('The requested tool exited unsuccessfully.');
    }, output);

    expect(exitCode).toBe(EXIT_CODES.subprocess);
    expect(stderr).toEqual(['The requested tool exited unsuccessfully.\n']);
  });

  it('preserves an internal cause without exposing it to the user', async () => {
    const { output, stderr } = createCapturedTerminalOutput();
    const cause = new Error('private-key=SECRET_INTERNAL_VALUE');
    const error = new InternalCliError({ cause });

    const exitCode = await runWithCliErrorBoundary(() => {
      throw error;
    }, output);

    expect(exitCode).toBe(EXIT_CODES.internal);
    expect(error.cause).toBe(cause);
    expect(stderr).toEqual(['StellarForge encountered an internal error.\n']);
    expect(stderr.join('')).not.toContain('SECRET_INTERNAL_VALUE');
  });

  it('hides unexpected exception details behind a generic message', async () => {
    const { output, stderr } = createCapturedTerminalOutput();

    const exitCode = await runWithCliErrorBoundary(() => {
      throw new Error('token=SECRET_UNEXPECTED_VALUE');
    }, output);

    expect(exitCode).toBe(EXIT_CODES.unexpected);
    expect(stderr).toEqual(['StellarForge encountered an unexpected error.\n']);
    expect(stderr.join('')).not.toContain('SECRET_UNEXPECTED_VALUE');
  });

  it('maps Commander usage failures without double-rendering them', async () => {
    const { output, stderr } = createCapturedTerminalOutput();

    const exitCode = await runWithCliErrorBoundary(() => {
      throw new CommanderError(1, 'commander.unknownOption', 'unknown option');
    }, output);

    expect(exitCode).toBe(EXIT_CODES.validation);
    expect(stderr).toEqual([]);
  });

  it('preserves successful Commander help/version exits', async () => {
    const { output, stderr } = createCapturedTerminalOutput();

    const exitCode = await runWithCliErrorBoundary(() => {
      throw new CommanderError(0, 'commander.helpDisplayed', 'help displayed');
    }, output);

    expect(exitCode).toBe(EXIT_CODES.success);
    expect(stderr).toEqual([]);
  });

  it('stays a clean one-line message by default even for unexpected errors', async () => {
    const { output, stderr } = createCapturedTerminalOutput();

    await runWithCliErrorBoundary(() => {
      throw new Error('token=SECRET_UNEXPECTED_VALUE');
    }, output);

    expect(stderr).toEqual(['StellarForge encountered an unexpected error.\n']);
  });

  it('reports redacted stack detail only when debug is explicitly enabled', async () => {
    const { output, stderr } = createCapturedTerminalOutput();

    await runWithCliErrorBoundary(
      () => {
        throw new Error('token=SECRET_UNEXPECTED_VALUE');
      },
      output,
      { debug: true },
    );

    expect(stderr[0]).toBe('StellarForge encountered an unexpected error.\n');
    expect(stderr.length).toBeGreaterThan(1);
    expect(stderr.join('')).toContain('[debug]');
    expect(stderr.join('')).not.toContain('SECRET_UNEXPECTED_VALUE');
  });

  it('reports a redacted internal cause only when debug is explicitly enabled', async () => {
    const { output, stderr } = createCapturedTerminalOutput();
    const cause = new Error('private-key=SECRET_INTERNAL_VALUE');

    await runWithCliErrorBoundary(
      () => {
        throw new InternalCliError({ cause });
      },
      output,
      { debug: true },
    );

    expect(stderr.join('')).toContain('[debug]');
    expect(stderr.join('')).not.toContain('SECRET_INTERNAL_VALUE');
  });
});

describe('isDebugEnabled', () => {
  it.each([undefined, '', 'other-namespace'])('is false for %j', (value) => {
    expect(isDebugEnabled(value)).toBe(false);
  });

  it.each([
    '*',
    'stellarforge',
    'stellarforge*',
    'stellarforge:cli',
    'other,stellarforge',
  ])('is true for %j', (value) => {
    expect(isDebugEnabled(value)).toBe(true);
  });
});
