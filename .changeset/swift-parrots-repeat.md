---
"@diginodes/stellarforge-cli": patch
---

`stellarforge.config.json` no longer silently accepts documents with duplicate keys (e.g. a repeated `network`, `identity`, or `version`), which could be interpreted ambiguously by different JSON parsers. Duplicate keys at any nesting level, including escaped-equivalent spellings (`\u006Eetwork` vs `network`), are now rejected before schema validation with a stable, bounded message that names the offending key without echoing its value. Documents with other JSON errors keep the existing `stellarforge.config.json is not valid JSON.` message.
