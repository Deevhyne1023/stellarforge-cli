---
"@diginodes/stellarforge-cli": patch
---

Harden project generation against a destination being replaced between
validation and the write phase (SW-127), bound dev-server child output
forwarding with backpressure so a noisy child can no longer accumulate an
unbounded output queue (SW-208), and exclude source maps from the
published package while adding an opt-in `DEBUG=stellarforge` flag for
diagnostic stack traces (SW-197).
