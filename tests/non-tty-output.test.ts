import { describe, expect, it } from 'vitest';
import {
  EXIT_CODES,
  ValidationCliError,
  handleCliError,
} from '../src/errors/index.js';
import {
  getStringDisplayWidth,
  sanitizeTerminalText,
  TerminalOutput,
  wrapTerminalText,
  type TextOutputStream,
} from '../src/output/terminal.js';
import { TERMINAL_FIXTURES } from './fixtures/terminal-output-fixtures.js';

type CaptureStream = TextOutputStream & {
  isTTY?: boolean;
  columns?: number;
};

function createCaptureStream(
  target: string[],
  isTTY?: boolean,
  columns?: number,
): CaptureStream {
  const stream: CaptureStream = {
    write(chunk: string) {
      target.push(chunk);
    },
  };

  if (isTTY !== undefined) {
    stream.isTTY = isTTY;
  }

  if (columns !== undefined) {
    stream.columns = columns;
  }

  return stream;
}

function createOutput(options?: {
  isTTY?: boolean;
  columns?: number;
  terminalColumns?: number;
}): {
  readonly output: TerminalOutput;
  readonly stdout: string[];
  readonly stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const streamStdout = createCaptureStream(
    stdout,
    options?.isTTY ?? false,
    options?.columns,
  );
  const streamStderr = createCaptureStream(
    stderr,
    options?.isTTY ?? false,
    options?.columns,
  );

  return {
    output: new TerminalOutput(
      {
        stdout: streamStdout,
        stderr: streamStderr,
      },
      options?.terminalColumns !== undefined
        ? { columns: options.terminalColumns }
        : {},
    ),
    stdout,
    stderr,
  };
}

describe('non-TTY output readability', () => {
  it('writes plain, newline-terminated lines without TTY decorations', () => {
    const { output, stdout, stderr } = createOutput();

    output.info('first line');
    output.success('second line');
    output.warning('third line');
    output.error('fourth line');

    expect(stdout).toEqual(['first line\n', 'second line\n']);
    expect(stderr).toEqual(['third line\n', 'fourth line\n']);
  });

  it('does not require TTY-specific stream properties', () => {
    const stdout: string[] = [];
    const output = new TerminalOutput({
      stdout: createCaptureStream(stdout),
      stderr: createCaptureStream([]),
    });

    expect(() => output.info('works without isTTY')).not.toThrow();
    expect(stdout).toEqual(['works without isTTY\n']);
  });

  it('neutralizes ANSI and terminal control characters in non-TTY output', () => {
    const { output, stdout } = createOutput();

    output.info('start\u001b[31mred\u001b[0m\u0000end');

    expect(stdout).toEqual(['startredend\n']);
  });

  it('preserves tabs and newlines while removing carriage returns', () => {
    expect(sanitizeTerminalText('one\ttwo\nthree\rfour')).toBe(
      'one\ttwo\nthreefour',
    );
  });

  it('produces stable output for repeated and multi-line messages', () => {
    const { output, stdout } = createOutput();

    output.info('line one\nline two');
    output.info('line one\nline two');

    expect(stdout).toEqual(['line one\nline two\n', 'line one\nline two\n']);
  });

  it('writes a bare newline for an empty message', () => {
    const { output, stdout } = createOutput();

    output.info('');

    expect(stdout).toEqual(['\n']);
  });

  it('does not change exit semantics when rendering to a non-TTY stream', () => {
    const { output, stdout, stderr } = createOutput();

    const exitCode = handleCliError(
      new ValidationCliError('Project name is required.'),
      output,
    );

    expect(exitCode).toBe(EXIT_CODES.validation);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual(['Project name is required.\n']);
  });
});

describe('SW-126: narrow terminal width wrapping policy', () => {
  it('wraps long diagnostic messages non-lossily at narrow column widths', () => {
    const { output, stdout } = createOutput({ columns: 40 });

    output.info(TERMINAL_FIXTURES.diagnosticReport.warn);

    const emitted = stdout.join('');
    expect(emitted).toBe(
      '[WARN] Docker: Docker daemon is\n  unavailable and container workflows\n  cannot run.\n',
    );

    // Verify all original words are preserved in output
    for (const word of [
      'Docker',
      'daemon',
      'unavailable',
      'container',
      'workflows',
      'cannot',
      'run.',
    ]) {
      expect(emitted).toContain(word);
    }
  });

  it('applies hanging indentation for remediation lines at narrow widths', () => {
    const { output, stdout } = createOutput({ columns: 40 });

    output.info(TERMINAL_FIXTURES.diagnosticReport.remediation);

    const emitted = stdout.join('');
    expect(emitted).toBe(
      '  Remediation: Start Docker Desktop or\n    daemon service only when a\n    container-based workflow is needed.\n',
    );
  });

  it('respects columns override passed to TerminalOutput options', () => {
    const { output, stdout } = createOutput({
      columns: 120,
      terminalColumns: 35,
    });

    output.info(
      'Configuring project environment with default template parameters for local testnet verification.',
    );

    const lines = stdout.join('').trimEnd().split('\n');
    for (const line of lines) {
      expect(getStringDisplayWidth(line)).toBeLessThanOrEqual(35);
    }
  });

  it('does not wrap when columns are undefined or non-positive', () => {
    const { output, stdout } = createOutput();

    output.info(TERMINAL_FIXTURES.diagnosticReport.warn);

    expect(stdout).toEqual([`${TERMINAL_FIXTURES.diagnosticReport.warn}\n`]);
  });

  it('handles extremely narrow column widths without crashing or infinite loops', () => {
    const text = 'Simple test message for narrow boundary checking.';
    const wrapped20 = wrapTerminalText(text, 20);
    const wrapped10 = wrapTerminalText(text, 10);

    expect(wrapped20.length).toBeGreaterThan(0);
    expect(wrapped10.length).toBeGreaterThan(0);
    expect(wrapped20).toContain('Simple');
    expect(wrapped10).toContain('checking.');
  });
});

describe('SW-126: copyable paths and remediation commands', () => {
  it('preserves long POSIX file paths intact without ambiguous line splitting', () => {
    const { output, stdout } = createOutput({ columns: 40 });
    const posixPath = TERMINAL_FIXTURES.longPaths.posix;

    output.info(`Wrote smart contract to ${posixPath}`);

    const emitted = stdout.join('');
    // The path should appear completely intact on its own line
    expect(emitted).toContain(`\n${posixPath}\n`);
  });

  it('preserves long Windows file paths intact without ambiguous line splitting', () => {
    const { output, stdout } = createOutput({ columns: 40 });
    const winPath = TERMINAL_FIXTURES.longPaths.windows;

    output.info(`Configuration loaded from ${winPath}`);

    const emitted = stdout.join('');
    expect(emitted).toContain(`\n${winPath}\n`);
  });

  it('keeps backtick-quoted commands copyable on a single line', () => {
    const { output, stdout } = createOutput({ columns: 40 });
    const cmd = TERMINAL_FIXTURES.commands.installCommand;

    output.info(`To fix dependency resolution run ${cmd} in root.`);

    const emitted = stdout.join('');
    // The backticked command must remain intact
    expect(emitted).toContain(cmd);
    expect(emitted).not.toMatch(/@stellar\/\s*\n\s*stellar-sdk/);
  });

  it('keeps URLs intact without breaking at slashes or colons', () => {
    const { output, stdout } = createOutput({ columns: 40 });
    const url = 'https://stellar.org/docs/learn/smart-contract-internals';

    output.info(`Read documentation at ${url} before deployment.`);

    const emitted = stdout.join('');
    expect(emitted).toContain(`\n${url}\n`);
  });

  it('keeps long Stellar StrKeys and Contract IDs intact without character splitting', () => {
    const { output, stdout } = createOutput({ columns: 40 });
    const contractId = TERMINAL_FIXTURES.stellarIdentifiers.contractId;
    const accountId = TERMINAL_FIXTURES.stellarIdentifiers.accountId;

    output.info(`Contract deployed: ${contractId}`);
    output.info(`Signer account: ${accountId}`);

    const emitted = stdout.join('');
    expect(emitted).toContain(`\n${contractId}\n`);
    expect(emitted).toContain(`\n${accountId}\n`);
  });

  it('preserves CLI flag arguments intact', () => {
    const { output, stdout } = createOutput({ columns: 30 });
    const message =
      'Verify installation using `stellar version --only-version`.';

    output.info(message);

    const emitted = stdout.join('');
    expect(emitted).toContain('`stellar version --only-version`');
  });
});

describe('SW-126: cursor-control and color neutralization', () => {
  it('neutralizes CSI cursor movement sequences in non-TTY output', () => {
    const { output, stdout } = createOutput();

    output.info(TERMINAL_FIXTURES.escapeSequences.csiCursorMovement);

    expect(stdout).toEqual(['line 1line updated\n']);
  });

  it('neutralizes cursor visibility escape sequences', () => {
    const { output, stdout } = createOutput();

    output.info(TERMINAL_FIXTURES.escapeSequences.cursorVisibility);

    expect(stdout).toEqual(['Running task...\n']);
  });

  it('neutralizes OSC window-title escape sequences (both BEL and ST terminators)', () => {
    const { output, stdout } = createOutput();

    output.info(TERMINAL_FIXTURES.escapeSequences.oscTitle);
    output.info(TERMINAL_FIXTURES.escapeSequences.oscTitleEsc);

    expect(stdout).toEqual([
      'Command execution in progress\n',
      'Command execution in progress\n',
    ]);
  });

  it('neutralizes DEC cursor save and restore escapes', () => {
    const { output, stdout } = createOutput();

    output.info(TERMINAL_FIXTURES.escapeSequences.decCursor);

    expect(stdout).toEqual(['Saved positionRestored position\n']);
  });

  it('neutralizes ANSI color codes while keeping textual status badges readable', () => {
    const { output, stdout } = createOutput();

    output.info(TERMINAL_FIXTURES.escapeSequences.ansiColors);

    expect(stdout).toEqual(['[PASS] Git: git version 2.45.0 detected.\n']);
  });

  it('conveys diagnostic health status purely through textual markers without color dependence', () => {
    const { output, stdout } = createOutput();

    output.info(TERMINAL_FIXTURES.diagnosticReport.pass);
    output.info(TERMINAL_FIXTURES.diagnosticReport.warn);
    output.info(TERMINAL_FIXTURES.diagnosticReport.summary);
    output.info(TERMINAL_FIXTURES.diagnosticReport.health);

    expect(stdout).toEqual([
      '[PASS] Node.js: Supported version 22.13.0 detected.\n',
      '[WARN] Docker: Docker daemon is unavailable and container workflows cannot run.\n',
      'Summary: 1 passed, 2 warnings, 0 failed.\n',
      'Overall health: usable with warnings.\n',
    ]);
  });
});

describe('SW-126: Unicode width handling and output integrity', () => {
  it('measures display width accurately for standard, wide, and zero-width characters', () => {
    expect(getStringDisplayWidth('abc')).toBe(3);
    expect(getStringDisplayWidth('日本語')).toBe(6);
    expect(getStringDisplayWidth('한국어')).toBe(6);
    expect(getStringDisplayWidth('中文')).toBe(4);
    expect(getStringDisplayWidth('🚀')).toBe(2);
    expect(getStringDisplayWidth('👨‍💻')).toBe(2);
    expect(getStringDisplayWidth('cafe\u0301')).toBe(4);
    expect(getStringDisplayWidth('\u200B')).toBe(0);
    expect(getStringDisplayWidth('\uFEFF')).toBe(0);
  });

  it('does not corrupt emoji surrogate pairs when wrapping at narrow widths', () => {
    const { output, stdout } = createOutput({ columns: 30 });

    output.info(TERMINAL_FIXTURES.unicode.emojiMessage);

    const emitted = stdout.join('');
    // Ensure emojis are intact and not split into orphan surrogates
    expect(emitted).toContain('🚀');
    expect(emitted).toContain('✨');
    expect(emitted).toContain('🛠️');

    // Verify string is well-formed with no orphan surrogates
    expect(() => encodeURI(emitted)).not.toThrow();
    const hasLoneSurrogate =
      /(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(
        emitted,
      );
    expect(hasLoneSurrogate).toBe(false);
  });

  it('preserves complex ZWJ and modifier emoji sequences without splitting', () => {
    const { output, stdout } = createOutput({ columns: 35 });

    output.info(TERMINAL_FIXTURES.unicode.zwjEmojiMessage);

    const emitted = stdout.join('');
    expect(emitted).toContain('👨‍💻');
    expect(emitted).toContain('👍🏽');
  });

  it('keeps combining diacritical marks attached to their base characters', () => {
    const { output, stdout } = createOutput({ columns: 20 });

    output.info(TERMINAL_FIXTURES.unicode.combiningMarks);

    const emitted = stdout.join('');
    expect(emitted).toContain('cafe\u0301');
    expect(emitted).toContain('re\u0301sume\u0301');
    expect(emitted).toContain('fac\u0327ade');
    expect(emitted).toContain('na\u0308ive');
  });

  it('wraps multilingual text without corruption', () => {
    const { output, stdout } = createOutput({ columns: 30 });

    output.info(TERMINAL_FIXTURES.unicode.mixedMultilingual);

    const emitted = stdout.join('');
    expect(emitted).toContain('Ελληνικά');
    expect(emitted).toContain('Русский');
    expect(emitted).toContain('العربية');
    expect(emitted).toContain('עברית');
    expect(emitted).toContain('日本語');
    expect(emitted).toContain('한국어');
    expect(emitted).toContain('中文');
  });
});

describe('SW-126: deterministic snapshots across supported operating systems', () => {
  it('produces stable, cross-platform formatted snapshots for narrow terminal output', () => {
    const { output, stdout } = createOutput({ columns: 40 });

    output.info(TERMINAL_FIXTURES.diagnosticReport.pass);
    output.info(TERMINAL_FIXTURES.diagnosticReport.warn);
    output.info(TERMINAL_FIXTURES.diagnosticReport.remediation);
    output.info(TERMINAL_FIXTURES.diagnosticReport.summary);
    output.info(TERMINAL_FIXTURES.diagnosticReport.health);

    const snapshot = stdout.join('');

    const expected = [
      '[PASS] Node.js: Supported version',
      '  22.13.0 detected.',
      '[WARN] Docker: Docker daemon is',
      '  unavailable and container workflows',
      '  cannot run.',
      '  Remediation: Start Docker Desktop or',
      '    daemon service only when a',
      '    container-based workflow is needed.',
      'Summary: 1 passed, 2 warnings, 0 failed.',
      'Overall health: usable with warnings.',
      '',
    ].join('\n');

    expect(snapshot).toBe(expected);
  });

  it('produces stable, cross-platform unwrapped snapshots for non-TTY redirected output', () => {
    const { output, stdout } = createOutput(); // no columns specified (redirected stream)

    output.info(TERMINAL_FIXTURES.diagnosticReport.pass);
    output.info(TERMINAL_FIXTURES.diagnosticReport.warn);
    output.info(TERMINAL_FIXTURES.diagnosticReport.remediation);
    output.info(TERMINAL_FIXTURES.diagnosticReport.summary);
    output.info(TERMINAL_FIXTURES.diagnosticReport.health);

    const snapshot = stdout.join('');

    const expected = [
      '[PASS] Node.js: Supported version 22.13.0 detected.',
      '[WARN] Docker: Docker daemon is unavailable and container workflows cannot run.',
      '  Remediation: Start Docker Desktop or daemon service only when a container-based workflow is needed.',
      'Summary: 1 passed, 2 warnings, 0 failed.',
      'Overall health: usable with warnings.',
      '',
    ].join('\n');

    expect(snapshot).toBe(expected);
  });
});
