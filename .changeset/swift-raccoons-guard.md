---
"@diginodes/stellarforge-cli": patch
---

`stellarforge test` no longer accepts a present-but-empty `scripts.test` (including whitespace-only values such as spaces, tabs, newlines, and non-breaking spaces). npm treats an empty test script as a successful no-op, which previously reported success without running any tests. The resolution now raises a validation error before any subprocess is spawned: "This Node.js project defines an empty package.json test script." Valid, non-empty scripts resolve unchanged.
