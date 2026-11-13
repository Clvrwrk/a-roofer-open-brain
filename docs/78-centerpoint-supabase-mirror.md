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
| `thursday` | Weekly with QBO, every collection | `bash scripts/cp-thursday-sync.sh` |
| work sync | Daily, the six work-table collections | `bash scripts/centerpoint-work-sync.sh` |

Skip heavy collections during a quick catch-up:

```bash
node integrations/bridges/centerpoint/mirror-backfill.mjs --mode=backfill --skip=files,model_files
```

## Schema

Landing mirror: `schemas/cleverwork-roofer/190-centerpoint-mirror-ddl.sql` (`cp_resources`, `cp_sync_runs`, `cp_sync_watermarks`).

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

## Work tables and read layer (2026-11-13)

Chris asked on 2026-11-13 for the CenterPoint commercial, multi-family and service work to appear on the existing PE work surfaces, with no new screens. This section is the database half of that. No screen reads it yet.

```
CenterPoint API ──GET──▶ cp_resources ──project──▶ work_* (6 tables) ──▶ mv_work_job_money ──▶ existing surfaces (next phase)
   daily 19:45 CT            (190)        hourly :10      (343, 344)          (345)
```

| File | Ledger name | What it holds |
| --- | --- | --- |
| `343-centerpoint-work-tables.sql` | `centerpoint_work_tables` (20261113154512) | Six source-neutral tables keyed `(source, source_id)`: `work_companies`, `work_jobs`, `work_property_sources`, `work_invoices`, `work_payments`, `work_labor`. First written as an untracked `342-…`, which collided with the privacy baseline; 343 is the same DDL. |
| `344-centerpoint-work-projection.sql` | `centerpoint_work_projection` | `project_centerpoint_work_tables()`: the six upserts from `cp_resources`, plus `missing_since` on rows the newest pull no longer returns. |
| `345-centerpoint-work-read-layer.sql` | `centerpoint_work_read_layer` | `work_companies.is_test`, property link columns, `link_work_property_sources()`, `mv_work_job_money`, `v_work_labor_day`, `v_work_invoice_qbo_recon`, `refresh_centerpoint_work()` and the hourly pg_cron job `centerpoint-work-refresh`. |
| `346-centerpoint-sync-expectation.sql` | not applied | Stale alarm for the daily host pull. Apply after the host timer has reported one run. |

**Rules for anything that reads this data**

1. Read `mv_work_job_money`, `v_work_labor_day` and `v_work_invoice_qbo_recon`. Never read the raw `work_*` tables from a surface.
2. **Test company.** "CP Support Test Company" carries one job and two draft invoices worth $533,400.18. `work_companies.is_test` keeps it out of the money view. The first report's invoice total of $1,480,257.48 included it.
3. **Drafts are not billed.** `billed` counts non-draft invoices only; drafts are in `draft_amount`.
4. **Never add clock hours to job hours.** 848 time rows are day clock-ins with no job. They cover the same worker-days as the job rows (803 of 839). Job hours are in the money view; both measures sit side by side in `v_work_labor_day`.
5. **QuickBooks already has these invoices.** `qbo_invoices.doc_number` is the CenterPoint job number. Company revenue from QuickBooks already includes this work, so do not add `work_invoices` to a revenue total. Use the work tables for job detail and receivables by job.
6. **No due dates.** CenterPoint returns no due date. Age receivables from `oldest_open_invoice_date`.
7. **Deletes.** CenterPoint does not flag deletes on these collections. A row missing from the newest pull gets `missing_since` and drops out of the money view; it returns if the row does.
8. **Property links.** A unique street-and-ZIP match fills `property_id` (method `address_zip`, 0.95, the AccuLynx bar). A unique pin within 30 m is stored as a suggestion only. A person's match or rejection is never overwritten.

**Verified on prod, 2026-11-13 16:32 UTC**

| Measure | Value |
| --- | --- |
| Jobs in the money view | 1,004 (649 service, 355 sales; 4 test jobs left out) |
| Billed (service, non-draft) | $942,487.66 |
| Drafts held apart | $4,369.64 |
| Collected | $685,701.18 |
| Outstanding | $256,786.48 on 109 invoices |
| Job hours / clock hours | 7,139.09 on the jobs in the money view / 8,571.66 |
| Properties linked by address | 110 of 667; 9 more suggested by pin; 557 have no property in the spine yet |
| QuickBooks check, by job number | 437 match to the cent; 18 billed differs; 8 collected differs; 11 QuickBooks only; 9 CenterPoint only |

**Schedule**

- `centerpoint-work-refresh` (pg_cron, hourly at :10) runs `refresh_centerpoint_work()`. Watched as `cron:centerpoint-work-refresh`.
- `openbrain-centerpoint-sync.timer` (agent host, 19:45 CT daily) runs `scripts/centerpoint-work-sync.sh`, which pulls the six collections. **Not installed yet:** the host has no `CENTERPOINT_API_TOKEN` and its checkout is behind `origin/main`. Until it is installed, a pull is a hand run of that script.

**Open items**

- [ ] Put `CENTERPOINT_API_TOKEN` on the agent host, install the timer, confirm one reported run, then apply 346 and add the unit to `SYSTEMD_JOBS` in `runtime-registry.ts`.
- [ ] `docs/delivery/PEC-755/business-sync-scope.md` still lists CenterPoint as outside the approved business sources (Chris, 2026-10-23). That needs Chris's written reversal before CenterPoint joins `BUSINESS_SYNC_PROVIDERS`.
- [ ] 557 CenterPoint properties have no row in `public.properties`. Creating commercial properties in the spine is a separate decision.
- [ ] Work through the 46 job numbers where CenterPoint and QuickBooks disagree.
- [ ] 149 service jobs are Closed Out or Invoiced with $0 invoiced.
- [ ] Surfaces: Command Center, then CRM (`centerpoint:` job key), then PM. Each needs a mockup, brand audit and gap analysis first (CONVENTIONS §11c).

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
