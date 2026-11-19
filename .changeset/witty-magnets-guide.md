---
"@diginodes/stellarforge-cli": patch
---

Aligns the generated Node template READMEs (`basic-app`, `api-service`, `full-stack`) on diagnosing and recovering from a local port collision (EADDRINUSE): the actual port setting and default per template (none for basic-app, `API_PORT` for api-service, `BACKEND_PORT` for full-stack), guidance platform-neutral for Windows/macOS/Linux with `netstat -ano | findstr`/`taskkill /PID` and `lsof -i`/`kill <pid>` — always the user's own previous instance — and an explicit statement that no template hops ports automatically. Template documentation tests now assert these referenced variables, commands, and forbidden patterns.
