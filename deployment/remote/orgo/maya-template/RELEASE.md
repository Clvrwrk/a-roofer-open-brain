# Maya runtime release candidate

- Version: `1.0.0-rc.4`
- State: build only; not activated
- Package-content commit: `536f51d05552daccce1c158128087c9df43428a8`
- Package digest: `d946e0f30e1235efb7d296b07816c543cf50c9d388f71957fdefbbb4780e7ce1`
- Builder: `cw-codex`
- Auditor: pending independent disposable acceptance
- Destination identity: `INJECT_AT_LAUNCH`
- Provider adapters: none
- Rollback target: fenced legacy release is evidence only; candidate rollback uses the prior accepted candidate release

## Build verification

- Node.js tests: 19 passed; 0 failed
- Negative secret and destination-identity scan: pass
- Required artifact and manifest validation: pass
- Shell syntax check: pass
- Dependency audit: 0 dependencies; 0 known vulnerabilities
- Package dry run: 39 published files; 16.1 kilobytes compressed; 52.4 kilobytes unpacked
- Software Bill of Materials (`SBOM`): `sbom.spdx.json`

## RC4 repair

RC4 retains RC3's verified transfer and filesystem isolation repairs. It launches Maya through `/usr/bin/env -i` with only `HOME`, `MAYA_ENABLED`, `NODE_ENV`, and `PATH`, preventing Supervisor's platform environment—including the Virtual Network Computing password variable—from entering the Maya process.

The package content and builder verification are frozen. Candidate acceptance and activation remain blocked until an independent auditor records the disposable-computer verdict.
