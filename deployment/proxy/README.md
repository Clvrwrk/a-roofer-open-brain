# Proxy composition on the Coolify host (docs/110)

`cc.proexteriorsus.net` is answered by **two** containers on `178.105.220.14`, composed by Traefik:

| Path | Container | Owner | Route source |
|---|---|---|---|
| everything else | Coolify app `command-center` (builds `origin/main`) | this repo | Coolify docker labels (auto) |
| `/sales`, `/sales/*`, `/api/sales`, `/api/sales/*`, `/sales-mirror-assets/*` | `cc-sales-<sha>` (isolated Sales companion built by the CRM release) | `Clvrwrk/CRM_PWA` | `/data/coolify/proxy/dynamic/crm-cc-sales-mirror.yml` (priority 1100) |

`crm-cc-sales-mirror.yml` here is a **read-only mirror** of the CRM-owned file for review; the CRM release runbook writes the live copy. The CRM side of this contract: [CRM_PWA/docs/integration/COMMAND-CENTER.md](https://github.com/Clvrwrk/CRM_PWA/blob/main/docs/integration/COMMAND-CENTER.md); index of that repo from here: [docs/111](../../docs/111-crm-pwa-companion-repo.md).

## Rules (docs/110 §3)

1. No dynamic file may match `Host(\`cc.proexteriorsus.net\`)` without a path restriction. The host-wide `crm-cc-staff.yml` was retired on 2026-09-11 (`deployment/remote/retire-cc-host-override.sh`); a copy lives in `/data/coolify/proxy/retired/`.
2. Every container behind the host carries the same `WORKOS_COOKIE_PASSWORD` and `WORKOS_CLIENT_ID` (Coolify env), so one WorkOS session works across both.
3. The runtime board (`/agents`) compares `/healthz.buildCommit` with the Coolify container's `SOURCE_COMMIT`; a mismatch means a host-wide override is back.

## Verify

```bash
curl -s https://cc.proexteriorsus.net/healthz                       # buildCommit = origin/main
curl -sI https://cc.proexteriorsus.net/sales-mirror-assets/pro-exteriors-logo.svg | head -1   # 200 from the companion
```
