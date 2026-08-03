# Maya runtime release candidate

- Version: `1.0.0-rc.2`
- State: build only; not activated
- Package-content commit: `980a5fc1f19dae2ee48913c06bbea797f47c27c2`
- Package digest: `d5dff848964296292cd703fd41a53c81c4dadc287bae2d7835187bce9a90e8fd`
- Builder: `cw-codex`
- Auditor: pending independent disposable acceptance
- Destination identity: `INJECT_AT_LAUNCH`
- Provider adapters: none
- Rollback target: fenced legacy release is evidence only; candidate rollback uses the prior accepted candidate release

## Build verification

- Node.js tests: 15 passed; 0 failed
- Negative secret and destination-identity scan: pass
- Required artifact and manifest validation: pass
- Shell syntax check: pass
- Dependency audit: 0 dependencies; 0 known vulnerabilities
- Package dry run: 35 published files; 14.6 kilobytes compressed; 47.1 kilobytes unpacked
- Software Bill of Materials (`SBOM`): `sbom.spdx.json`

## RC2 repair

Disposable preflight found that the verified Orgo base template provides Node.js 18.19.1 and no npm. RC2 pins official Node.js 22.22.3 for Linux x86-64, records its official checksum, requires `/usr/local/bin/node`, and fails installation closed on a missing or mismatched runtime.

The package content and builder verification are frozen. Candidate acceptance and activation remain blocked until an independent auditor records the disposable-computer verdict.
