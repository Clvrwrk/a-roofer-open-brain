# Pinned Node.js runtime

The candidate requires official Node.js `22.22.3` for Linux x86-64 at `/usr/local/bin/node`. The base Orgo template's Node.js 18 package is insufficient and must not be selected implicitly through `PATH`.

## Source and integrity

- Archive: `https://nodejs.org/dist/v22.22.3/node-v22.22.3-linux-x64.tar.xz`
- Official checksum ledger: `https://nodejs.org/dist/v22.22.3/SHASUMS256.txt`
- Secure Hash Algorithm 256-bit (`SHA-256`): `2e5d13569282d016861fae7c8f935e741693c269101a5bebcf761a5376d1f99f`

Download both files from `nodejs.org`, verify the archive against the official ledger and the pinned digest, extract under `/usr/local/lib/node-v22.22.3-linux-x64`, and install root-owned links for `node`, `npm`, `npx`, and `corepack` under `/usr/local/bin`.

The package installer fails closed unless `/usr/local/bin/node --version` is exactly `v22.22.3`. Runtime upgrades require a new release candidate, checksum receipt, tests, and disposable acceptance.
