# Diagnostic Timeout and Process Termination

## Overview

The shared diagnostic process runner in `src/diagnostics/process.ts` executes external commands with bounded timeouts and guaranteed termination to ensure the `stellarforge doctor` command completes reliably without leaving orphaned processes.

## Timeout Parameters

```typescript
export const DIAGNOSTIC_COMMAND_TIMEOUT_MS = 5_000; // 5 seconds
export const DIAGNOSTIC_KILL_SIGNAL_GRACE_MS = 1_000; // Documentation constant
```

- **DIAGNOSTIC_COMMAND_TIMEOUT_MS**: Maximum time allowed for any diagnostic command to complete
- **DIAGNOSTIC_KILL_SIGNAL_GRACE_MS**: Documented grace period for reference (Node.js handles the actual kill internally after SIGTERM)

## Termination Sequence

When a diagnostic command exceeds the timeout, Node.js's `spawnSync` follows this termination sequence:

1. **Initial Timeout**: After `DIAGNOSTIC_COMMAND_TIMEOUT_MS` elapses, the process is sent `SIGTERM`
2. **Graceful Exit Window**: The process has a brief window to handle the signal and exit cleanly
3. **Forced Termination**: If the process ignores `SIGTERM`, Node.js automatically sends `SIGKILL` (Unix) or forcefully terminates the process (Windows)
4. **Result Classification**: The command result is returned with `error.code === 'ETIMEDOUT'`

### Implementation

```typescript
const result = spawnSync(executable, [...args], {
  encoding: 'utf8',
  shell: false,
  timeout: DIAGNOSTIC_COMMAND_TIMEOUT_MS,
  killSignal: 'SIGTERM',
});
```

Key parameters:
- `shell: false` — Prevents shell injection and ensures direct process control
- `killSignal: 'SIGTERM'` — Explicitly sets the initial termination signal for cross-platform consistency
- `timeout` — Triggers the termination sequence when exceeded

## Platform Behavior

### Unix (Linux, macOS)

1. `SIGTERM` is sent to the child process
2. If the process ignores or doesn't handle the signal, `SIGKILL` follows automatically
3. `SIGKILL` cannot be ignored and guarantees termination
4. Process exit is synchronous in `spawnSync`

### Windows

1. Windows doesn't have POSIX signals, but Node.js abstracts this
2. The process receives a termination notification
3. If the process doesn't exit, it is forcefully terminated via `TerminateProcess`
4. Process exit is synchronous in `spawnSync`

## Outcome Classification

The `classifyCommandResult` function maps timeout scenarios to user-facing outcomes:

```typescript
export type CommandOutcome = 'ok' | 'missing-executable' | 'timed-out' | 'failed';
```

### Classification Logic

1. **timed-out**: `error.code === 'ETIMEDOUT'` — command exceeded its timeout
2. **missing-executable**: `error.code === 'ENOENT'` — executable not found on PATH
3. **failed**: Any other error or non-zero exit status
4. **ok**: Exit status 0 with no error

This classification ensures:
- Timeouts are reported with actionable remediation (e.g., "check that `docker info` responds promptly")
- Missing executables provide installation guidance
- Generic failures don't expose raw error codes or stack traces
- Each diagnostic handles these outcomes consistently

## User-Facing Messages

Diagnostic checks convert `timed-out` outcomes to user-friendly messages:

### Docker Example

```typescript
if (clientOutcome === 'timed-out') {
  return {
    status: unavailableStatus(required),
    message: timeoutMessage(required),
    remediation: timeoutRemediation(),
  };
}
```

**Messages:**
- Warning: "Docker CLI timed out; container-based workflows may be unavailable."
- Required: "Docker is required but the Docker CLI timed out."
- Remediation: "Check that `docker --version` responds promptly and retry the diagnostic."

**Guarantees:**
- No raw error codes (like `ETIMEDOUT`) appear in user output
- No `Error:` prefix or stack traces leak
- Remediation is actionable and specific to the tool

## Process Cleanup Guarantees

The `spawnSync` approach with explicit timeout guarantees:

1. **Bounded Execution**: No diagnostic command runs longer than `DIAGNOSTIC_COMMAND_TIMEOUT_MS` + termination overhead (typically < 100ms)
2. **No Orphans**: Child processes are forcefully terminated if they ignore `SIGTERM`
3. **Synchronous Completion**: The parent process doesn't continue until the child is fully terminated
4. **Cross-Platform**: Behavior is consistent on Linux, macOS, and Windows

### Testing

The `executable-classification.test.ts` suite verifies these guarantees:

- Quick processes complete without timeout
- Slow processes are terminated within the timeout boundary
- Processes that ignore `SIGTERM` are forcefully killed
- No Node.js child processes remain after test completion
- Timeout classification is stable across all diagnostics

## Security Considerations

### No Shell Invocation

Setting `shell: false` prevents:
- Command injection via specially-crafted arguments
- Shell metacharacter expansion
- Unintended subprocess spawning
- Platform-specific shell quirks

### Bounded Resource Consumption

The timeout prevents:
- Indefinitely hanging diagnostics from blocking the `doctor` command
- Resource exhaustion from runaway processes
- Denial-of-service via malicious or misconfigured tools

### Consistent Error Handling

Classification and redaction ensure:
- Internal error details don't leak to unauthorized users
- Sensitive environment variables or tokens aren't reflected
- Error messages are bounded and safe for logging

## Future Considerations

### Async Diagnostics

If diagnostics move from `spawnSync` to `spawn` for parallel execution:
- Timeout logic must be manually implemented with `setTimeout` and `kill()`
- Cleanup on early exit or interruption becomes the caller's responsibility
- Tests must verify no lingering processes after promise rejection

### Configurable Timeouts

If per-diagnostic timeouts become necessary:
- Keep the current default as a safe upper bound
- Document why specific tools need longer timeouts
- Ensure the doctor command still completes within a reasonable total time

### Signal Handling

Currently `SIGTERM` → `SIGKILL` is automatic. If more control is needed:
- Implement explicit grace period with `setTimeout`
- Track child PIDs for manual cleanup
- Test signal handling on all supported platforms

## References

- **Node.js `child_process.spawnSync` documentation**: [https://nodejs.org/api/child_process.html#child_processspawnsynccommand-args-options](https://nodejs.org/api/child_process.html#child_processspawnsynccommand-args-options)
- **SW-022**: Shared diagnostic timeout result classification
- **Test Coverage**: `tests/executable-classification.test.ts`, `tests/docker-diagnostic.test.ts`
- **Implementation**: `src/diagnostics/process.ts`
