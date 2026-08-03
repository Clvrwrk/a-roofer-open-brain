# Maya runtime release candidate

- Version: `1.0.0-rc.1`
- State: build only; not activated
- Source commit: pending CAT-17 package-content commit
- Package digest: `7eca30f6e3c3bc9a5ebbbe3ed00081983d2e197bd49040d049a8eb0fbb030842`
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
- Package dry run: 34 published files; 13.6 kilobytes compressed; 44.6 kilobytes unpacked
- Software Bill of Materials (`SBOM`): `sbom.spdx.json`

This receipt becomes immutable only after tests, negative secret scan, package digest, source commit, and independent review are recorded.
