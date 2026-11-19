---
'@diginodes/stellarforge-cli': patch
---

Add deterministic timeout and termination regression coverage (SW-022). The shared process runner now explicitly sets `killSignal: 'SIGTERM'` to ensure consistent cross-platform termination behavior when a diagnostic command exceeds its timeout. New test coverage in `executable-classification.test.ts` verifies that timed-out processes receive the documented termination sequence, processes that ignore SIGTERM are forcefully stopped within the timeout boundary, no child processes remain after test completion on Linux, macOS, and Windows, and the doctor command completes with a stable timeout failure category. Docker diagnostic tests now verify timeout scenarios are classified distinctly from missing executables or daemon unavailability, with appropriate user-facing remediation messages that do not leak raw error codes.
