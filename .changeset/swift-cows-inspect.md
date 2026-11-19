---
"@diginodes/stellarforge-cli": patch
---

The `basic-app` template ships an `.env.example` documenting the three public network configuration variables its `src/network.js` reads (`STELLAR_HORIZON_URL`, `STELLAR_RPC_URL`, `STELLAR_NETWORK_PASSPHRASE`), aligned with the other templates. All template `.env.example` files are now verified to contain placeholders only — never credential-like values — and to document exactly the variables the template's code consumes; the test suite enforces this and the git-ignore rules protecting generated `.env` files.
