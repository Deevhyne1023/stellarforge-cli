---
"@diginodes/stellarforge-cli": patch
---

Treat blank and whitespace-only dev/start/start:backend values as absent in `stellarforge dev` project discovery; whitespace-only candidates are skipped and a fully blank or missing script set yields actionable guidance with no subprocess spawned. Update the dev supervisor's partial-line buffering so bare carriage returns act as line boundaries for progress frames, keeping 64 KiB bounds and secret redaction per line.
