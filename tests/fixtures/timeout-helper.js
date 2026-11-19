#!/usr/bin/env node
import process from 'node:process';
import { setInterval, setTimeout } from 'node:timers';
/**
 * Test fixture: Simulates an executable that ignores termination signals.
 * Usage: node timeout-helper.js <behavior>
 * Behaviors:
 *   - quick: exits immediately with success
 *   - slow: sleeps for 10 seconds then exits
 *   - ignore-sigterm: ignores SIGTERM and continues running
 *   - graceful: handles SIGTERM and exits cleanly
 */

const behavior = process.argv[2] ?? 'quick';

// Prevent Node.js from exiting on unhandled signals during testing
process.on('SIGTERM', () => {
  if (behavior === 'graceful') {
    process.stdout.write('Received SIGTERM, exiting gracefully\n');
    process.exit(0);
  } else if (behavior === 'ignore-sigterm') {
    process.stdout.write('Ignoring SIGTERM\n');
    // Continue running
  }
});

process.on('SIGINT', () => {
  if (behavior === 'graceful') {
    process.stdout.write('Received SIGINT, exiting gracefully\n');
    process.exit(0);
  }
});

switch (behavior) {
  case 'quick':
    process.stdout.write('version 1.0.0\n');
    process.exit(0);
    break;

  case 'slow':
    process.stdout.write('Starting slow process...\n');
    setTimeout(() => {
      process.stdout.write('Slow process completed\n');
      process.exit(0);
    }, 10_000);
    break;

  case 'ignore-sigterm':
    process.stdout.write('Process ignoring signals started\n');
    // Keep process alive indefinitely
    setInterval(() => {
      // Keep event loop active
    }, 1_000);
    break;

  case 'graceful':
    process.stdout.write('Graceful process started\n');
    // Keep process alive until signal received
    setInterval(() => {
      // Keep event loop active
    }, 1_000);
    break;

  default:
    process.stderr.write(`Unknown behavior: ${behavior}\n`);
    process.exit(1);
}
