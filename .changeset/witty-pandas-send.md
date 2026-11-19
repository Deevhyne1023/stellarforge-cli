---
"@diginodes/stellarforge-cli": patch
---

Generated projects now carry a small `.stellarforge.json` provenance marker recording only the generator package identifier, the template identifier, and the generator version. The byte format is stable and deterministic apart from the version value; no user, host, path, timestamp, or environment information is recorded, and the marker never collects anything (no network, no executable code).
