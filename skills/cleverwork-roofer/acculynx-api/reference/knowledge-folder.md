# AccuLynx Knowledge Folder (Google Drive) — repo pointer

The human-navigable AccuLynx knowledge base lives in a Google Drive folder named **"AccuLynx"**.
This file is the repo pointer agents follow to reach it. **No secrets or key values appear here**
(the account registry mirror lists `env_secret_name` NAMES only).

**Drive folder:** `<URL/ID set by the Phase-1 checkpoint — see 01-03 Task 3>`

## Folder index (who / what / how / why / where / when)

| File / folder | Contents |
|---|---|
| `00-README.md` | What this folder is; points back to the `acculynx-api` skill |
| `WHO.md` | The 9 accounts, owners, the AccuLynx Agent (Phase 6), Workspace personas |
| `WHAT.md` | Data surface: jobs, contacts, estimates, financials, supplements, milestones |
| `HOW.md` | Ingestion arch (`acculynx-sync` + pg_cron/pg_net), `acculynx_accounts` registry, sweep harness |
| `WHY.md` | OKR / core value: complete, hourly-current, multi-location data |
| `WHERE.md` | Tables (`acculynx_jobs`, `crm_pipeline`, `acculynx_api_catalog/probe`, `acculynx_get_checklist`), Supabase project `rnhmvcpsvtqjlffpsayu` |
| `WHEN.md` | Schedule (daily→hourly), watermarks, era-awareness |
| `matrices/read-capability-matrix.md` | Mirror of [docs/65](../../../../docs/65-acculynx-read-capability-matrix.md) (Phase 1) |
| `matrices/write-capability-matrix.md` | Placeholder → Phase 4 supersedes [docs/37](../../../../docs/37-acculynx-write-capability-matrix.md) |
| `account-registry.md` | Human-readable mirror of `public.acculynx_accounts` (NAMES only, no secrets) |
| `runbooks/` | Placeholder → Phase 3 (cron recovery, secret rotation) |

## Source-of-truth tables (in the brain DB)

- `public.acculynx_accounts` — the 9-account registry (Phase 1, migration 165)
- `public.acculynx_get_checklist` — 86 documented GETs (migration 167)
- `public.acculynx_api_catalog` / `public.acculynx_api_probe` — per-endpoint record + per-call evidence
- Read matrix: [docs/65](../../../../docs/65-acculynx-read-capability-matrix.md) · Write matrix: [docs/37](../../../../docs/37-acculynx-write-capability-matrix.md)

> The Drive folder is created/maintained through the Google Workspace OAuth bridge / a Workspace
> persona (no Google Workspace MCP is wired in this repo). Phase 6 completes it.
