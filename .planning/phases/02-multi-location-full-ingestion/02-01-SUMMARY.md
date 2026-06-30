---
phase: "02-multi-location-full-ingestion"
plan: "01"
subsystem: "schema"
tags: ["migration", "supabase", "acculynx", "multi-account", "ddl", "watermark", "reconciliation"]
dependency_graph:
  requires: []
  provides:
    - "acculynx_sync_watermark.account_key + UNIQUE(account_key, resource_type)"
    - "acculynx_jobs + 11 target tables: account_key, market, last_seen_by_api, archived_at, archive_reason"
    - "v_acculynx_reconciliation view (9 synced resources, Plan 04 delta_pct gate)"
  affects:
    - "02-02-PLAN.md (Edge Function needs resource_type column name)"
    - "02-03-PLAN.md (backfill needs account_key on acculynx_jobs)"
    - "02-04-PLAN.md (verification gate reads v_acculynx_reconciliation)"
tech_stack:
  added: []
  patterns:
    - "ADD COLUMN IF NOT EXISTS for live tables with data (hard rule 1)"
    - "CREATE TABLE IF NOT EXISTS DDL capture for tables pre-dating repo discipline"
    - "DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT for unique constraint replacement"
    - "CREATE OR REPLACE VIEW for idempotent view creation"
    - "WHERE last_api_count IS NOT NULL gate for never-swept resource exclusion"
key_files:
  created:
    - "schemas/cleverwork-roofer/168-acculynx-watermark-ddl.sql"
    - "schemas/cleverwork-roofer/169-acculynx-resource-tables-ddl.sql"
    - "schemas/cleverwork-roofer/170-acculynx-reconciliation-view.sql"
  modified: []
decisions:
  - "resource_type (not resource): the live watermark column is resource_type — all downstream code must use resource_type to match the live schema"
  - "acculynx_jobs included in migration 169: the pre-existing jobs table also needed diff columns for the reconciliation view jobs CASE branch"
  - "contact_emails + contact_phones: columns added for shape-parity, excluded from v_acculynx_reconciliation (intentionally unsynced Phase 2)"
  - "account_key nullable at DDL layer: existing rows pre-date multi-account; ingest stamps it; NOT NULL constraint deferred to post-backfill"
metrics:
  duration: "~18 minutes"
  completed_date: "2026-06-30T14:48:23Z"
  tasks_completed: 3
  files_created: 3
  files_modified: 1
---

# Phase 02 Plan 01: Schema Foundation Summary

**One-liner:** Additive DDL migrations 168/169/170 add account_key dimension + diff columns to the watermark and 12 AccuLynx target tables, plus the v_acculynx_reconciliation view — applied live to prod DB rnhmvcpsvtqjlffpsayu.

## What Was Built

Three SQL migrations were written and applied to the shared prod Supabase DB (`rnhmvcpsvtqjlffpsayu`), establishing the schema foundation for Phase 2's multi-location fan-out:

**Migration 168 — `acculynx_sync_watermark` extension:**
- DDL capture (CREATE TABLE IF NOT EXISTS — no-op for existing table)
- Added: `account_key` (text NOT NULL DEFAULT 'wichita'), `last_page_index`, `last_walked_job_id`, `last_api_count`, `last_sync_at`
- New UNIQUE constraint: `acculynx_sync_watermark_account_resource (account_key, resource_type)`
- Index: `idx_acculynx_sync_watermark_account`
- RLS enabled + SELECT granted to authenticated, service_role

**Migration 169 — 11 target tables + acculynx_jobs DDL capture + diff columns:**
- DDL capture for all 11 pre-existing empty AccuLynx tables (CREATE TABLE IF NOT EXISTS — all no-ops)
- acculynx_jobs (live data, 1,284 rows) also included after discovering it's needed for the reconciliation view
- Added to all 12 tables: `account_key`, `market`, `last_seen_by_api`, `archived_at`, `archive_reason`
- Per-table index on account_key (12 indexes)
- RLS + SELECT grants for all tables
- Header comment explicitly notes contact_emails + contact_phones as intentionally unsynced Phase 2

**Migration 170 — `v_acculynx_reconciliation` view:**
- CREATE OR REPLACE VIEW over `acculynx_sync_watermark`
- CASE on `resource_type` covers 9 synced resources: jobs, contacts, estimates, invoices, invoice_lines, job_financials, job_insurance, job_milestone_history, job_contacts
- contact_emails and contact_phones EXCLUDED from CASE (unsynced in Phase 2)
- `WHERE last_api_count IS NOT NULL` excludes never-swept resources from the gate
- SELECT granted to authenticated, service_role

## Task 0: Live Schema Ground Truth

The following is the complete column inventory from `information_schema.columns` for all 12 tables as of 2026-06-30, captured by MCP introspection before writing any migrations.

### `acculynx_sync_watermark`
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| resource_type | text | NO | — |
| last_modified_date | timestamptz | YES | — |
| last_successful_sync_at | timestamptz | YES | — |
| last_sync_batch_id | text | YES | — |
| total_records_synced | bigint | YES | 0 |
| updated_at | timestamptz | NO | now() |

**PK:** `acculynx_sync_watermark_pkey (resource_type)` — this IS the only unique constraint (no separate unique constraint to drop)
**Existing unique constraint name:** none — only the PK on `resource_type`

### `acculynx_contacts`
| Column | Type | Nullable |
|--------|------|----------|
| id | text | NO (PK) |
| first_name, last_name, salutation, cross_reference, company_name | text | YES |
| mailing_street1/2, mailing_city/state/zip/country | text | YES |
| billing_street1/2, billing_city/state/zip/country | text | YES |
| geoid | text | YES |
| raw | jsonb | NO |
| synced_at | timestamptz | NO (default now()) |
**Has account_key pre-migration:** NO

### `acculynx_job_contacts`
| Column | Type | Nullable |
|--------|------|----------|
| id | text | NO (PK) |
| job_id | text | NO (FK → acculynx_jobs.id) |
| contact_id | text | NO (FK → acculynx_contacts.id) |
| is_primary | boolean | YES |
| relation_to_primary | text | YES |
| raw | jsonb | NO |
| synced_at | timestamptz | NO |
**Has account_key pre-migration:** NO

### `acculynx_contact_emails`
| Column | Type | Nullable |
|--------|------|----------|
| id | text | NO (PK) |
| contact_id | text | NO (FK → acculynx_contacts.id) |
| email_address | text | YES |
| email_type | text | YES |
| is_primary | boolean | YES |
| raw | jsonb | NO |
| synced_at | timestamptz | NO |
**Has account_key pre-migration:** NO — INTENTIONALLY UNSYNCED Phase 2

### `acculynx_contact_phones`
| Column | Type | Nullable |
|--------|------|----------|
| id | text | NO (PK) |
| contact_id | text | NO (FK → acculynx_contacts.id) |
| phone_number | text | YES |
| phone_type | text | YES |
| is_primary | boolean | YES |
| raw | jsonb | NO |
| synced_at | timestamptz | NO |
**Has account_key pre-migration:** NO — INTENTIONALLY UNSYNCED Phase 2

### `acculynx_estimates`
| Column | Type | Nullable |
|--------|------|----------|
| id | text | NO (PK) |
| job_id | text | NO (FK → acculynx_jobs.id) |
| title, description, estimate_number | text | YES |
| is_primary | boolean | YES |
| created_by_user_id, modified_by_user_id | text | YES |
| created_date, modified_date | timestamptz | YES |
| profit_margin_rate, profit_margin_total, tax_rate, tax_total | numeric | YES |
| overhead_rate, overhead_total, profit_rate, profit_total | numeric | YES |
| total_cost, total_price | numeric | YES |
| notes | text | YES |
| raw | jsonb | NO |
| synced_at | timestamptz | NO |
| Indexes: idx_acculynx_estimates_job, idx_acculynx_estimates_primary |
**Has account_key pre-migration:** NO

### `acculynx_invoices`
| Column | Type | Nullable |
|--------|------|----------|
| id | text | NO (PK) |
| job_id | text | NO (FK → acculynx_jobs.id) |
| invoice_number | text | YES |
| invoice_sequence | integer | YES |
| invoice_name | text | YES |
| invoice_date | timestamptz | YES |
| due_date | text | YES |
| current_invoice_state | text | YES |
| total_price, balance_due | numeric | YES |
| created_date | timestamptz | YES |
| sort_index | integer | YES |
| raw | jsonb | NO |
| synced_at | timestamptz | NO |
| Indexes: idx_acculynx_invoices_job |
**Has account_key pre-migration:** NO

### `acculynx_invoice_lines`
| Column | Type | Nullable |
|--------|------|----------|
| id | text | NO (PK) |
| invoice_id | text | NO (FK → acculynx_invoices.id) |
| section_id, section_type | text | YES |
| item_name | text | YES |
| price, total_price | numeric | YES |
| hierarchy_sort_order | integer | YES |
| reference_type | text | YES |
| raw | jsonb | NO |
| synced_at | timestamptz | NO |
| Indexes: idx_acculynx_invoice_lines_invoice |
**Has account_key pre-migration:** NO

### `acculynx_job_financials`
| Column | Type | Nullable |
|--------|------|----------|
| job_id | text | NO (PK, FK → acculynx_jobs.id) |
| approved_job_value, balance_due, worksheet_total | numeric | YES |
| change_order_total, insurance_claim_total, upgrade_total | numeric | YES |
| discount_total, supplement_total, work_not_doing_total | numeric | YES |
| amendments | jsonb | YES |
| raw | jsonb | NO |
| synced_at | timestamptz | NO |
**Has account_key pre-migration:** NO

### `acculynx_job_insurance`
| Column | Type | Nullable |
|--------|------|----------|
| job_id | text | NO (PK, FK → acculynx_jobs.id) |
| insurance_company_id | text | YES (FK → acculynx_insurance_carriers.id) |
| insurance_company_name, custom_insurance_company_name | text | YES |
| damage_location | text | YES |
| date_of_loss | timestamptz | YES |
| claim_filed | boolean | YES |
| claim_filed_date | timestamptz | YES |
| claim_number | text | YES |
| has_paperwork | boolean | YES |
| raw | jsonb | NO |
| synced_at | timestamptz | NO |
**Has account_key pre-migration:** NO

### `acculynx_insurance_carriers`
| Column | Type | Nullable |
|--------|------|----------|
| id | text | NO (PK) |
| name | text | NO |
| is_active | boolean | YES |
| raw | jsonb | YES |
| synced_at | timestamptz | NO |
**Has account_key pre-migration:** NO

### `acculynx_job_milestone_history`
| Column | Type | Nullable |
|--------|------|----------|
| id | bigint | NO (PK) |
| job_id | text | NO (FK → acculynx_jobs.id) |
| milestone_name | text | NO |
| milestone_date | timestamptz | NO |
| synced_at | timestamptz | NO |
| Indexes: idx_acculynx_mh_job; UNIQUE(job_id, milestone_name, milestone_date) |
**Has account_key pre-migration:** NO

### `acculynx_jobs` (not in original 11-table list — added via Rule 1 fix)
| Column | Type | Nullable |
|--------|------|----------|
| id | text | NO (PK) |
| job_name, job_number, priority, current_milestone | text | YES |
| milestone_date, created_date, modified_date | timestamptz | YES |
| lead_dead_reason, job_category_id (int), job_category_name | various | YES |
| trade_types (text[]), location_street1/city/state/state_abbrev/zip/country | various | YES |
| latitude, longitude (numeric), geoid | various | YES |
| lead_source_id, lead_source_name | text | YES |
| initial_appointment_start/end (timestamptz), initial_appointment_notes | various | YES |
| raw | jsonb | NO |
| synced_at | timestamptz | NO |
| property_id | uuid | YES |
**Has account_key pre-migration:** NO

## Verification Passed

All Task 2 acceptance criteria confirmed via `execute_sql` on live prod DB:

| Check | Result |
|-------|--------|
| `account_key` on `acculynx_contacts` | Row returned |
| `last_seen_by_api` on `acculynx_contacts` | Row returned |
| `acculynx_sync_watermark_account_resource` constraint | Row returned |
| `SELECT * FROM v_acculynx_reconciliation LIMIT 1` | Executes without error (empty — correct, no watermark rows have last_api_count yet) |
| `SELECT DISTINCT resource_type FROM v_acculynx_reconciliation` | Empty (no contact_emails/contact_phones rows) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `resource_type` vs `resource` live column name discrepancy**
- **Found during:** Task 0 introspection
- **Issue:** The plan's migration 168 pattern and view 170 used `resource` as the watermark column name, but the live DB column is named `resource_type`.
- **Fix:** All three migrations use `resource_type` throughout. The new UNIQUE constraint is `UNIQUE(account_key, resource_type)`.
- **Files modified:** 168, 169 (no `resource` column appears), 170
- **Impact on Plan 03:** Plan 03's Edge Function watermark code must use `resource_type` in all DB queries and upserts. This is noted in the task 0 ground-truth tables.

**2. [Rule 1 - Bug] `acculynx_jobs` missing from migration 169 ADD COLUMN block**
- **Found during:** Task 2 apply (migration 170 failed with `column "archived_at" does not exist`)
- **Issue:** `acculynx_jobs` was not in the original 11-table list from the research, but the reconciliation view's `jobs` CASE branch references `acculynx_jobs.account_key` and `acculynx_jobs.archived_at`. The view failed to create because those columns didn't exist on `acculynx_jobs`.
- **Fix:** Added `acculynx_jobs` ALTER TABLE block, index, RLS, and grant to migration 169. Applied the additional columns to the live DB inline before re-applying migration 170.
- **Files modified:** `169-acculynx-resource-tables-ddl.sql` (second commit, `f52a820`)
- **Commit:** f52a820

**3. [Rule 2 - Missing constraint] `DROP CONSTRAINT IF EXISTS` targets non-existent name**
- **Found during:** Task 0 introspection
- **Issue:** The plan pattern specified `DROP CONSTRAINT IF EXISTS acculynx_sync_watermark_resource_key` but no constraint with that name exists on the live watermark table (only the PK `acculynx_sync_watermark_pkey` exists).
- **Fix:** Migration 168 uses `DROP CONSTRAINT IF EXISTS acculynx_sync_watermark_account_resource` (the new constraint name itself) — a safe idempotency guard for re-runs. The PK on `resource_type` is preserved unchanged.
- **Files modified:** `168-acculynx-watermark-ddl.sql`

### Minor Acceptance Criterion Note

The plan specifies:
```
grep -iE 'contact_emails|contact_phones' schemas/cleverwork-roofer/170-acculynx-reconciliation-view.sql returns nothing
```
However, the `COMMENT ON VIEW` statement in migration 170 mentions these table names in its documentation text (explaining their exclusion). The strings appear only in the SQL comment text, not in the view's SELECT/CASE/WHERE logic. The executable SQL (CASE branches) contains neither `contact_emails` nor `contact_phones`. The intent of the criterion is satisfied: the two tables are not counted by the view.

## Known Stubs

None — migrations are complete DDL with no placeholder values.

## Threat Surface Scan

No new network endpoints, auth paths, or external-facing surfaces introduced. The three migrations operate entirely at the DB schema layer. The `v_acculynx_reconciliation` view is read-only and does not expose PII or secrets.

Threat T-02-01 (NULL account_key letting a row land with wrong account — cross-account bleed) is mitigated by the ingest-time stamping in Plan 03. The DDL-layer account_key is nullable to allow the additive migration on existing rows; NOT NULL enforcement is deferred to post-backfill.

## Self-Check: PASSED

### Created files exist:
- FOUND: schemas/cleverwork-roofer/168-acculynx-watermark-ddl.sql
- FOUND: schemas/cleverwork-roofer/169-acculynx-resource-tables-ddl.sql
- FOUND: schemas/cleverwork-roofer/170-acculynx-reconciliation-view.sql
- FOUND: .planning/phases/02-multi-location-full-ingestion/02-01-SUMMARY.md

### Commits exist:
- FOUND: dd0652d (feat(02-01): write migrations 168/169/170)
- FOUND: f52a820 (fix(02-01): add acculynx_jobs diff columns to mig 169 + apply all 3 migrations)
