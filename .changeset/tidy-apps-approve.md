---
"@diginodes/stellarforge-cli": patch
---

Harden the dev supervisor: reconstruct UTF-8 code points split across child output chunks, finalize child output only after stdout and stderr close (so a sensitive assignment split across exit cannot defeat line-based redaction), and handle stdout/stderr stream errors with a stable, sanitized category while terminating sibling processes. The generated API Service template gains a bounded readiness contract: `GET /health` is a local, bounded liveness probe and `GET /ready` reports initialization completion without exposing internal error details.
