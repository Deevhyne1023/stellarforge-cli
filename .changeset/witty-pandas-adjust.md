---
"@diginodes/stellarforge-cli": minor
---

Add `stellarforge validate`: a bounded, local check of the documented local project requirements. Findings carry stable ids (`project.manifest-present`, `project.package-json.parseable`, `project.package-json.scripts-test`, `project.cargo-toml.parseable`, `project.configuration.well-formed`), categories, and required/optional severity. Only required-check failures set the exit code (`5`, the diagnostic-failure category also used by `doctor`); `0` means the documented required requirements are met. Findings never echo configuration values or absolute paths, and every text is bounded like the rest of the CLI.
