# CenterPoint Connect → Supabase mirror (PEC-110)

**Status:** full historical mirror live on PE Supabase (metadata for files; no binaries)  
**Linear:** [PEC-110](https://linear.app/cleverwork/issue/PEC-110)  
**Division:** PE service / commercial (CenterPoint Connect)  
**Initiative:** CashFlow / WIP Executive Surface  
**PE project:** `rnhmvcpsvtqjlffpsayu`

## Purpose

Full historical extract of live **CenterPoint Connect** (JSON:API) into PE Supabase for commercial/service WIP joins alongside AccuLynx + QBO + ABC. Production CenterPoint is **read-only** for agents — the brain is the mutable copy.

## Source

| Item | Value |
| --- | --- |
| API base | `https://api.centerpointconnect.io/centerpoint/` |
| Auth | `Authorization: $CENTERPOINT_API_TOKEN` |
| Pattern | JSON:API 1.0 |
| Catalog | GROK `Tools/catalog/centerpoint` (68 OpenAPI paths) |
| App | PE_CC (see `CENTERPOINT_APP_ID` / `CENTERPOINT_APP_NAME`) |

## Cadence

| Mode | When | Command |
| --- | --- | --- |
| `smoke` | After schema change | `node …/mirror-backfill.mjs --mode=smoke` |
| `backfill` | Inception / catch-up | `node …/mirror-backfill.mjs --mode=backfill` |
| `thursday` | Weekly with QBO | `bash scripts/cp-thursday-sync.sh` |

Skip heavy collections during a quick catch-up:

```bash
node integrations/bridges/centerpoint/mirror-backfill.mjs --mode=backfill --skip=files,model_files
```

## Schema

Migration: `schemas/cleverwork-roofer/190-centerpoint-mirror-ddl.sql`

| Object | Contents |
| --- | --- |
| `cp_sync_runs` | Run ledger |
| `cp_sync_watermarks` | Per-resource high-water |
| `cp_resources` | All JSON:API records `(resource_type, cp_id)` |
| `v_cp_*` | Convenience views per resource type |

Keys: `(resource_type, cp_id)` where `resource_type` is the **collection path** (not JSON:API `data.type`). Column `api_type` stores the JSON:API type. Full payload in `attributes` / `relationships` / `raw`. RLS: service_role only.

**JSON:API type collisions (critical):** `/opportunities` and `/services` both return `type: "productions"`; `/profiles` returns `type: "employees"` (and subtypes). Always key by collection path.

**Env pin:** repo `.env` wins for `SUPABASE_*` (PE `rnhmvcpsvtqjlffpsayu`). Do not let `master.env` / shell override to another project. Job refuses a non-PE host.

**Files / model_files:** metadata rows only — do **not** call `/file/url` or download binaries.

## Entities mirrored (GET lists)

companies, productions, opportunities, properties, profiles, employees, invoices, services, service_agreements, materials, products, product_templates, purchase_orders, tasks, work_time_entries, production_days, production_items, production_materials, cost_codes, tax_codes, budget_types, budget, warranties, locations, files, model_files, product_template_tags, transactions

Live API totals at first probe (2026-07-27): companies 173 · productions 589 · opportunities 589 · properties 509 · invoices 282 · services 589 · work_time_entries 2,121 · production_items 5,446 · products 3,186 · **files ~407k** · **model_files ~31k**.

**Inception backfill (PE Supabase, 2026-07-27):** core 17,337 rows (26 collections) + **files 406,904** + **model_files 31,483** (metadata only). Query: `SELECT resource_type, count(*) FROM cp_resources GROUP BY 1 ORDER BY 2 DESC;`

## Client / job

```bash
# Env: repo .env (Supabase) + ~/.config/cleverwork/master.env (CENTERPOINT_API_TOKEN)
node integrations/bridges/centerpoint/mirror-backfill.mjs --mode=smoke
node integrations/bridges/centerpoint/mirror-backfill.mjs --mode=backfill
```

Gates:

1. `CENTERPOINT_API_TOKEN` present
2. Companies list succeeds (company_gate)
3. Upserts only into Supabase — never CenterPoint writes

Run JSON: `integrations/bridges/centerpoint/.mirror-runs/` (gitignored).

## Query examples

```sql
SELECT name, status, attributes->>'salesStatus' AS sales_status
FROM v_cp_companies
ORDER BY name;

SELECT name, status, attributes
FROM v_cp_productions
WHERE deleted_at_src IS NULL
ORDER BY updated_at_src DESC NULLS LAST
LIMIT 50;

SELECT resource_type, count(*) FROM cp_resources GROUP BY 1 ORDER BY 2 DESC;
```

## Out of scope (v1)

- Writing / mutating CenterPoint
- File binary download
- Webhook subscribe (incremental CDC) — Thursday/full re-pull first
- Atomizing into `public.thoughts`
