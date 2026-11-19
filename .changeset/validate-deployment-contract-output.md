---
'@diginodes/stellarforge-cli': patch
---

Harden parsing and validation of Stellar CLI deployment output into structured contract data. Accept only canonical Stellar Contract IDs in the official supported output format, reject malformed, truncated, or conflicting IDs, ensure non-zero exits fail safely, and redact secret-like text from output and failure messages.
