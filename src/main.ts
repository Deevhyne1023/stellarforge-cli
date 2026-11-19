import { createRootCommand } from './commands/root.js';
import type { Command } from 'commander';

export async function runCli(
  argv: string[] = process.argv,
  createProgram: () => Command = createRootCommand,
): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}
