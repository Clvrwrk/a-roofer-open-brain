# Maya runtime release candidate

- Version: `1.0.0-rc.3`
- State: build only; not activated
- Package-content commit: `PENDING_CONTENT_COMMIT`
- Package digest: `80ce143a3acf5055600de3d7be2b39a40cb453967089e50248aa47eed33118a8`
- Builder: `cw-codex`
- Auditor: pending independent disposable acceptance
- Destination identity: `INJECT_AT_LAUNCH`
- Provider adapters: none
- Rollback target: fenced legacy release is evidence only; candidate rollback uses the prior accepted candidate release

## Build verification

- Node.js tests: 18 passed; 0 failed
- Negative secret and destination-identity scan: pass
- Required artifact and manifest validation: pass
- Shell syntax check: pass
- Dependency audit: 0 dependencies; 0 known vulnerabilities
- Package dry run: 39 published files; 15.9 kilobytes compressed; 51.6 kilobytes unpacked
- Software Bill of Materials (`SBOM`): `sbom.spdx.json`

## RC3 repair

RC3 retains RC2's pinned official Node.js 22.22.3 runtime. It moves Maya's private writable state under `/var/lib/cleverwork`, keeps the runtime code root-owned under `/opt/cleverwork`, and grants no access to the interactive Orgo user's home. Its package verifier and transfer builder fail closed on macOS AppleDouble, Finder, and `__MACOSX` metadata.

The package content and builder verification are frozen. Candidate acceptance and activation remain blocked until an independent auditor records the disposable-computer verdict.
