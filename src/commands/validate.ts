import { Command } from 'commander';
import {
  renderProjectValidationReport,
  runProjectValidationChecks,
} from '../validate.js';
import { EXIT_CODES } from '../errors/errors.js';
import { TerminalOutput } from '../output/terminal.js';

export interface ValidateCommandOptions {
  readonly root?: () => string;
  readonly output?: TerminalOutput;
  readonly setExitCode?: (code: number) => void;
}

export function createValidateCommand(
  options: ValidateCommandOptions = {},
): Command {
  const root = options.root ?? process.cwd;
  const output = options.output ?? new TerminalOutput();
  const setExitCode =
    options.setExitCode ?? ((code) => (process.exitCode = code));

  return new Command('validate')
    .description(
      'Check the current directory against StellarForge local project requirements.',
    )
    .action(() => {
      const report = runProjectValidationChecks(root());
      renderProjectValidationReport(report, output);
      setExitCode(
        report.summary.requiredFailures > 0
          ? EXIT_CODES.diagnostic
          : EXIT_CODES.success,
      );
    });
}
