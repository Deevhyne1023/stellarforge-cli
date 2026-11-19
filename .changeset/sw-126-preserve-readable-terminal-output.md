---
"@diginodes/stellarforge-cli": patch
---

Preserve readable terminal output at narrow widths and in non-TTY mode (SW-126):
- Add non-lossy terminal wrapping policy for narrow widths and constrained streams.
- Ensure file paths, URLs, remediation commands, CLI flags, and Stellar StrKeys remain intact and copyable without ambiguous line splits.
- Enhance terminal text sanitization to neutralize ANSI CSI cursor movements, OSC window titles, DEC cursor controls, and carriage returns.
- Accurately measure Unicode display widths (wide CJK, emojis, combining marks) and protect multi-byte sequences and surrogate pairs from corruption.
- Provide deterministic regression tests and fixtures across supported operating systems.
