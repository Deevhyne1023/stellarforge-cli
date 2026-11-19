/**
 * Bounded backpressure for forwarded child output (SW-208).
 *
 * The supervisor used to forward every child output chunk straight to
 * `TerminalOutput` and ignore the destination stream's write/backpressure
 * result, so a noisy child could outpace a slow or redirected output stream
 * and accumulate an unbounded writable queue. These tests assert: the output
 * adapter exposes a testable backpressure signal, child streams pause/resume
 * around it, buffering has an explicit upper bound with deterministic
 * overflow behaviour, and stdout/stderr stay ordered independently.
 */

import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  superviseDevProcesses,
  type DevSignalSource,
  type ManagedChildProcess,
} from '../src/dev/orchestrator.js';
import { TerminalOutput, type TextOutputStream } from '../src/output/index.js';
import type { DevProcessSpec } from '../src/dev/project.js';

class FakeChild implements ManagedChildProcess {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  #exitListener:
    ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;

  once(event: 'error', listener: (error: Error) => void): this;
  once(
    event: 'exit',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
  once(
    event: 'error' | 'exit',
    listener:
      | ((error: Error) => void)
      | ((code: number | null, signal: NodeJS.Signals | null) => void),
  ): this {
    if (event === 'exit') {
      this.#exitListener = listener as (
        code: number | null,
        signal: NodeJS.Signals | null,
      ) => void;
    }
    return this;
  }

  kill(): boolean {
    queueMicrotask(() => this.#exitListener?.(null, 'SIGTERM'));
    return true;
  }

  emitExit(code: number | null, signal: NodeJS.Signals | null): void {
    // Completion requires both the exit event and stdio to have ended, so
    // every fixture must close both streams alongside the exit.
    this.stdout.end();
    this.stderr.end();
    this.#exitListener?.(code, signal);
  }
}

class FakeSignalSource implements DevSignalSource {
  once(): void {}
  removeListener(): void {}
}

function spec(label: string): DevProcessSpec {
  return { label, command: 'npm', args: ['run', 'start'], cwd: '/workspace' };
}

/**
 * A destination stream that can be told to refuse writes (simulating a slow
 * sink under backpressure) and later resume them, firing any queued 'drain'
 * listeners deterministically — no real timers or sleeps required.
 */
function createControllableStream() {
  const written: string[] = [];
  const drainListeners: Array<() => void> = [];
  let accepting = true;

  const stream: TextOutputStream = {
    write(chunk: string) {
      written.push(chunk);
      return accepting;
    },
    once(event, listener) {
      if (event === 'drain') {
        drainListeners.push(listener);
      }
      return stream;
    },
  };

  return {
    stream,
    written,
    pauseAccepting() {
      accepting = false;
    },
    drain() {
      accepting = true;
      const listeners = drainListeners.splice(0, drainListeners.length);
      for (const listener of listeners) listener();
    },
    pendingDrainListeners() {
      return drainListeners.length;
    },
  };
}

describe('dev supervisor output backpressure (SW-208)', () => {
  it('exposes a testable backpressure signal from the output adapter', () => {
    const controllable = createControllableStream();
    const output = new TerminalOutput({
      stdout: controllable.stream,
      stderr: controllable.stream,
    });

    expect(output.info('ready')).toBe(true);

    controllable.pauseAccepting();
    expect(output.info('still writes, but signals backpressure')).toBe(false);
  });

  it('pauses the child stream on backpressure and resumes it on drain', async () => {
    const controllable = createControllableStream();
    const output = new TerminalOutput({
      stdout: controllable.stream,
      stderr: controllable.stream,
    });
    const child = new FakeChild();

    const running = superviseDevProcesses([spec('api')], {
      output,
      spawnProcess: () => child,
      signalSource: new FakeSignalSource(),
    });

    controllable.pauseAccepting();
    child.stdout.write('first\n');
    await Promise.resolve();

    expect(child.stdout.isPaused()).toBe(true);
    expect(controllable.written.some((line) => line.includes('first'))).toBe(
      true,
    );

    controllable.drain();
    await Promise.resolve();

    expect(child.stdout.isPaused()).toBe(false);

    child.emitExit(0, null);
    await running;
  });

  it('bounds queued output and drops the oldest lines on sustained backpressure', async () => {
    const controllable = createControllableStream();
    const output = new TerminalOutput({
      stdout: controllable.stream,
      stderr: controllable.stream,
    });
    const child = new FakeChild();

    const running = superviseDevProcesses([spec('api')], {
      output,
      spawnProcess: () => child,
      signalSource: new FakeSignalSource(),
    });

    controllable.pauseAccepting();

    // One chunk containing many complete lines: all of them are split and
    // pushed to the forwarder synchronously within a single 'data' event, so
    // the queue bound is exercised deterministically regardless of how the
    // underlying stream chunks data across event-loop turns.
    const lines = Array.from({ length: 1100 }, (_, index) => `line-${index}`);
    child.stdout.write(`${lines.join('\n')}\n`);
    await Promise.resolve();

    expect(child.stdout.isPaused()).toBe(true);
    expect(
      controllable.written.some((line) =>
        line.includes('output buffer exceeded'),
      ),
    ).toBe(true);

    controllable.drain();
    await Promise.resolve();

    // line-0 triggered the backpressure signal on its own write (it was
    // already accepted, same as a real Writable#write returning false), so
    // it was emitted directly. Everything queued behind it is subject to the
    // bound: the oldest queued lines are dropped, the newest survive.
    expect(controllable.written.some((line) => line.includes('line-0\n'))).toBe(
      true,
    );
    expect(
      controllable.written.some((line) => line.includes('line-50\n')),
    ).toBe(false);
    expect(
      controllable.written.some((line) => line.includes('line-1099')),
    ).toBe(true);

    child.emitExit(0, null);
    await running;
  });

  it('keeps stdout and stderr ordered and paused independently', async () => {
    const controllable = createControllableStream();
    const output = new TerminalOutput({
      stdout: controllable.stream,
      stderr: controllable.stream,
    });
    const child = new FakeChild();

    const running = superviseDevProcesses([spec('api')], {
      output,
      spawnProcess: () => child,
      signalSource: new FakeSignalSource(),
    });

    controllable.pauseAccepting();
    // Both lines arrive in a single chunk so they are split and queued
    // synchronously within one 'data' event, independent of how the stream
    // happens to schedule separate write() calls across event-loop turns.
    child.stdout.write('out-1\nout-2\n');
    await Promise.resolve();

    // stderr never wrote anything, so it was never paused.
    expect(child.stderr.isPaused()).toBe(false);
    expect(child.stdout.isPaused()).toBe(true);

    controllable.drain();
    await Promise.resolve();

    const outLines = controllable.written.filter((line) =>
      line.startsWith('[api] out-'),
    );
    expect(outLines).toEqual(['[api] out-1\n', '[api] out-2\n']);

    child.emitExit(0, null);
    await running;
  });

  it('still redacts and line-buffers output while backpressured', async () => {
    const controllable = createControllableStream();
    const output = new TerminalOutput({
      stdout: controllable.stream,
      stderr: controllable.stream,
    });
    const child = new FakeChild();

    const running = superviseDevProcesses([spec('api')], {
      output,
      spawnProcess: () => child,
      signalSource: new FakeSignalSource(),
    });

    controllable.pauseAccepting();
    child.stdout.write('api_tok');
    child.stdout.write('en=sk_live_ABCDEF0123456789\n');
    await Promise.resolve();

    controllable.drain();
    await Promise.resolve();

    const emitted = controllable.written.join('');
    expect(emitted).not.toContain('sk_live_ABCDEF0123456789');
    expect(emitted).toContain('api_token=[REDACTED]');

    child.emitExit(0, null);
    await running;
  });
});
