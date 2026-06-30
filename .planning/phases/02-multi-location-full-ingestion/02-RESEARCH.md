# Phase 2: Multi-Location Full Ingestion — Research

**Researched:** 2026-06-30
**Domain:** AccuLynx REST API V2 multi-account fan-out · Supabase Edge Functions (Deno) · pg_cron / pg_net · incremental watermark ingestion · per-resource target table DDL
**Confidence:** HIGH (live Edge Function code read, migration DDL read, OpenAPI index parsed, Phase 1 research read, archive table review read; the one MEDIUM area is exact live column shapes for tables created in the live DB before the repo DDL gap was identified — those need MCP introspection in a plan task)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-03 | Full ingestion across all 8 production location accounts — not just Kansas | Fan-out pattern via `acculynx_accounts` registry; per-account key resolution; account/market stamping; backfill windowing per account |
| REQ-04 | Ingest the currently-unfed resources: contacts, job-contacts, estimates, invoices, invoice lines, job financials, job insurance, milestone history | Per-resource watermark design; target table DDL (some tables pre-exist in live DB, need verify); pagination patterns per resource; diff detection mechanism |
</phase_requirements>

---

## Summary

Phase 2 fans the existing `acculynx-sync` Edge Function (v10, currently Kansas-only / jobs+users) out to all 8 production location accounts and adds ingestion for 8 currently-unfed resource types. The core technical surface is already proven: the `acculynx_accounts` registry (migration 165) maps all 9 keys, the rate-limit and backoff logic are live in the existing function, and the watermark-resume pattern already works for jobs.

The critical design constraint is that **only `GET /jobs` supports date-window filtering natively** (`dateFilterType=ModifiedDate`, `startDate`/`endDate`). Contacts, estimates, invoices, and the job-scoped sub-resources (financials, insurance, milestone-history) have no date filter at all [VERIFIED: OpenAPI index parameter scan]. This means the incremental watermark strategy is **jobs-anchored for new/modified accounts** and **full-page-sweep-with-upsert for the sub-resources** — the watermark for sub-resources tracks which jobs have been walked, not a date. The function already handles a 120s runtime budget with per-page watermark advancement, so multi-pass resumption is the correct pattern for the sub-resource fan-out.

Phase 2 does NOT fix the pg_net reconciliation gap (`v_acculynx_cron_outcomes` perpetual `pending`) or move the scheduler to hourly — those are Phase 3. Phase 2's scope is breadth (8 accounts × all readable resources) plus a windowed historical backfill, not scheduler hardening.

**Primary recommendation:** Extend the existing `acculynx-sync` Edge Function to fan out over the production rows of `acculynx_accounts`, add per-resource watermarks keyed on `(account_key, resource)`, and add a "job-walk" phase that iterates known job IDs to pull the sub-resources. Deliver the schema DDL (target tables + extended watermark table) as migrations 168–170, then update the Edge Function as a new deploy.

---

## Project Constraints (from CLAUDE.md)

- **Hard rule 1 (No destructive SQL):** Every migration is additive and idempotent. `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE`. Diff detection for not-seen-in-API records must mark/archive — never `DELETE` or `TRUNCATE`. `archive_reason` + `archived_at` + `last_seen_by_api` column approach is compliant.
- **Hard rule 2 (No secrets in code):** AccuLynx keys resolved only via `Deno.env.get(env_secret_name)` where `env_secret_name` comes from `acculynx_accounts`. No key value in the DB or repo.
- **Property-first (rule 7):** `acculynx_jobs.id` is the permanent join key; sub-resource rows carry `job_id` FK. Where a contact or property address can be linked to a `property_id` (brain atom), it should be.
- **Era-aware (rule 8):** Milestone history rows carry their timestamp natively; no era_of_practice addition needed unless a practice/code is described (not applicable here).
- **Trust-tier discipline (rule 4):** All inferred/generated memory is `evidence` by default. API-pulled contact data = `evidence`.
- **Verify against live DB, not migration files (working style):** The 11 empty AccuLynx tables (confirmed in archive Strategic-Table-Review-20260420.md) were created in the live DB before the repo DDL gap was closed. Their exact live schemas must be introspected via Supabase MCP at plan time, not assumed from the SKILL.md summary.
- **Sandbox first (PROJECT.md constraint):** All new behavior proven in sandbox before production. The backfill fan-out will be tested against the sandbox account (single key) before enabling the 8 production keys.
- **pg_net reconciliation is Phase 3:** Do not scope `v_acculynx_cron_outcomes` fixes into Phase 2 plans.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Multi-account fan-out | DB (`acculynx_accounts` registry) read by Edge Function | — | Registry already live (mig 165); function loops production rows |
| Per-key rate limiting | Edge Function (Deno, per-key pacing) | — | 10 req/s per API key; pace each account independently in series or with inter-key delay |
| Per-resource watermark | DB (`acculynx_sync_watermark`, keyed `account_key + resource`) | Edge Function reads/writes watermark | Already live table (not in repo DDL yet — needs mig 168 DDL capture) |
| Backfill windowing | Edge Function (date-window loop for jobs; job-walk loop for sub-resources) | DB (job IDs drive the walk) | Only `/jobs` supports date filter; sub-resources need job-walk |
| Target table upsert | Edge Function → Supabase JS client | DB (RLS service_role) | Existing pattern in acculynx-sync |
| Source-account stamping | Edge Function (sets `account_key` column on every upserted row) | DB (NOT NULL constraint on `account_key`) | No cross-account key bleed: each row is FK-traceable to its account |
| Diff detection (not-seen mark) | DB trigger or Edge Function post-walk | `last_seen_by_api` + `archived_at` on target tables | Mark-on-absent, never delete (hard rule 1) |
| Row count reconciliation | DB view (`v_acculynx_reconciliation`) | Manual query / Phase 7 dashboard | Count jobs in `acculynx_jobs` by `account_key`; compare to API-reported `count` stored in `acculynx_sync_watermark.last_api_count` |

---

## Standard Stack

### Core (existing infrastructure — no new packages)

| Library / Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase Edge Functions (Deno) | Deno 2.8.1 (local); live function v10 | Multi-account fan-out sync, per-resource watermark | Already the integration of record [VERIFIED: project docs + live function] |
| `@supabase/supabase-js` | `jsr:@supabase/supabase-js@2` | DB access from Edge Function | Already used in acculynx-read-sweep and acculynx-sync [VERIFIED: index.ts imports] |
| pg_cron + pg_net | live in Supabase project `rnhmvcpsvtqjlffpsayu` | Trigger/poll the Edge Function (current: daily 08:15 UTC) | Proven path; Phase 3 moves to hourly; Phase 2 keeps daily trigger [CITED: sync-pipeline.md] |
| AccuLynx REST API V2 | `https://api.acculynx.com/api/v2` | Source of truth for all job/contact/financial data | Single vendor API [VERIFIED: OpenAPI index, auth-and-limits.md] |
| `acculynx_accounts` table | migration 165 | Registry of 9 accounts; fan-out reads `WHERE environment='production' AND is_active=true` | Phase 1 deliverable, live [VERIFIED: migration 165 DDL] |

### No New External Packages Required

Phase 2 installs no npm, JSR, or PyPI packages beyond those already used in the existing Edge Functions. All logic uses the Deno standard library and `@supabase/supabase-js@2` already imported.

---

## Package Legitimacy Audit

Not applicable — Phase 2 introduces **no external package dependencies**. All work extends existing Deno Edge Functions using already-imported `jsr:@supabase/supabase-js@2` and Deno built-ins. If the planner later proposes a new JSR/npm import (e.g., a retry helper), run the legitimacy gate at that point.

---

## Architecture Patterns

### System Architecture Diagram

```
pg_cron (daily 08:15 UTC — unchanged, Phase 3 moves to hourly)
  │
  └─► trigger_acculynx_sync (SQL fn → pg_net POST)
        │
        └─► acculynx-sync Edge Function (Deno, extended)
              │
              ├─ 1. Load production accounts from acculynx_accounts
              │      WHERE environment='production' AND is_active=true
              │      ORDER BY account_key   (deterministic order)
              │
              ├─ 2. For each account (serial, one key active at a time):
              │      a. Resolve key:  Deno.env.get(row.env_secret_name)
              │      b. Load resource watermarks for this account:
              │           acculynx_sync_watermark WHERE account_key = row.account_key
              │
              │   ── RESOURCE LOOP ──────────────────────────────────────────────
              │      c. JOBS (date-windowed, ModifiedDate):
              │           GET /jobs?dateFilterType=ModifiedDate&startDate=wm&pageSize=25
              │           → upsert acculynx_jobs (account_key, market stamped)
              │           → advance watermark.last_modified_date per page
              │
              │      d. CONTACTS (full sweep, pageStartIndex):
              │           GET /contacts?pageSize=50&pageStartIndex=0..N
              │           → upsert acculynx_contacts (account_key stamped)
              │           → advance watermark.last_page_index per page
              │
              │      e. ESTIMATES (full sweep, pageStartIndex):
              │           GET /estimates?pageSize=50&pageStartIndex=0..N
              │           → upsert acculynx_estimates (account_key, job_id stamped)
              │
              │      f. JOB-WALK phase (iterate acculynx_jobs for this account):
              │           For each job_id not yet walked (watermark: last_walked_job_id):
              │             GET /jobs/{id}/contacts       → upsert acculynx_job_contacts
              │             GET /jobs/{id}/financials     → upsert acculynx_job_financials
              │             GET /jobs/{id}/insurance      → upsert acculynx_job_insurance
              │             GET /jobs/{id}/milestone-history → upsert acculynx_job_milestone_history
              │             GET /jobs/{id}/invoices       → upsert acculynx_invoices
              │               (for each invoice: GET /invoices/{id} → upsert acculynx_invoice_lines)
              │           → advance watermark.last_walked_job_id after each job
              │           → budget check: stop at 110s, resume next run
              │
              │      g. DIFF DETECTION:
              │           For each resource, set last_seen_by_api = now() on upserted rows.
              │           Rows not seen in last full sweep → set archived_at = now(),
              │           archive_reason = 'not_seen_in_api' (never DELETE)
              │
              └─ 3. Advance watermarks; write sync summary row
```

### Recommended Project Structure (new files)

```
schemas/cleverwork-roofer/
├── 168-acculynx-watermark-ddl.sql         # DDL capture for acculynx_sync_watermark (account_key column + resource column)
├── 169-acculynx-resource-tables-ddl.sql   # DDL capture / additive for the 11 pre-existing empty target tables
│                                           #   + add account_key, market, last_seen_by_api, archived_at, archive_reason
└── 170-acculynx-reconciliation-view.sql   # v_acculynx_reconciliation by account/resource

supabase/functions/acculynx-sync/          # New repo copy of the live function (currently not in repo)
├── index.ts                               # Updated fan-out + multi-resource entry point
├── resources/
│   ├── jobs.ts                            # Existing jobs sync logic extracted
│   ├── contacts.ts                        # New: contacts full-sweep
│   ├── estimates.ts                       # New: estimates full-sweep
│   └── job-walk.ts                        # New: per-job sub-resource walk
└── lib/
    ├── accounts.ts                        # acculynx_accounts loader
    ├── watermark.ts                       # Watermark read/write helpers
    └── diff.ts                            # Mark-not-seen-in-api logic
```

### Pattern 1: Fan-Out over Account Registry

**What:** Loop `acculynx_accounts WHERE environment='production' AND is_active=true`, resolve each key at runtime, run the full resource sync for that account, then advance to the next.

**When to use:** Any multi-account sync invocation.

**Example:**

```typescript
// Source: acculynx_accounts pattern (migration 165 schema)
const { data: accounts } = await sb
  .from("acculynx_accounts")
  .select("account_key, env_secret_name, label, market, state")
  .eq("environment", "production")
  .eq("is_active", true)
  .order("account_key");

for (const acct of accounts ?? []) {
  const apiKey = Deno.env.get(acct.env_secret_name);
  if (!apiKey) {
    console.warn(`[sync] secret ${acct.env_secret_name} not set — skipping ${acct.account_key}`);
    continue;
  }
  await syncAccount(acct, apiKey, deadline);
}
```

**Source stamping (no cross-account bleed):** Every `upsert` call on every resource table passes `account_key: acct.account_key` as a column value. The target tables have a NOT NULL `account_key` column (migration 169). The unique constraint is `(id, account_key)` or `(acculynx_id, account_key)`, not `id` alone — because the same contact might theoretically appear in two accounts.

### Pattern 2: Per-Resource Watermark (extended schema)

**What:** `acculynx_sync_watermark` is the existing per-resource watermark table. It currently tracks `(resource, last_modified_date)` for jobs. Phase 2 extends it with an `account_key` dimension and additional watermark fields per resource type.

**Extended watermark schema (migration 168):**

```sql
-- Additive: add account_key + extended fields if not already present
ALTER TABLE public.acculynx_sync_watermark
  ADD COLUMN IF NOT EXISTS account_key     text NOT NULL DEFAULT 'wichita',  -- FK to acculynx_accounts
  ADD COLUMN IF NOT EXISTS last_page_index integer,         -- for pageStartIndex resources
  ADD COLUMN IF NOT EXISTS last_walked_job_id text,         -- for job-walk resumption
  ADD COLUMN IF NOT EXISTS last_api_count  integer,         -- last reported count from API (for reconciliation)
  ADD COLUMN IF NOT EXISTS last_sync_at    timestamptz;     -- when this watermark was last advanced
-- New unique constraint: one watermark row per (account_key, resource)
ALTER TABLE public.acculynx_sync_watermark
  DROP CONSTRAINT IF EXISTS acculynx_sync_watermark_resource_key,
  ADD CONSTRAINT acculynx_sync_watermark_account_resource UNIQUE (account_key, resource);
```

**Watermark per resource:**

| Resource | Watermark field | Strategy |
|----------|----------------|---------|
| `jobs` | `last_modified_date` | `dateFilterType=ModifiedDate&startDate=wm` — API native date filter [VERIFIED: OpenAPI params] |
| `contacts` | `last_page_index` | Full sweep every run; skip pages already completed this run; reset to 0 after confirmed full sweep [ASSUMED — contacts has no date filter] |
| `estimates` | `last_page_index` | Same as contacts — no date filter [VERIFIED: OpenAPI params show only pageSize/pageStartIndex/includes] |
| `job_walk` | `last_walked_job_id` | Sorted `acculynx_jobs` by `created_date ASC`; resume from last walked ID |
| `invoices` | per-job (via job_walk) | Covered by job_walk watermark; invoice list is per-job |
| `job_financials` | per-job | Covered by job_walk |
| `job_insurance` | per-job | Covered by job_walk |
| `job_milestone_history` | per-job | Covered by job_walk |
| `job_contacts` | per-job | Covered by job_walk |

### Pattern 3: Date-Window Backfill for Jobs

**What:** Jobs are the only resource with `dateFilterType=ModifiedDate` [VERIFIED: OpenAPI parameter scan]. Backfill walks backward in time windows to pull historical jobs. The existing function already does incremental forward sync; the backfill walks windows from `created_date_min` of the account backward to `account_open_date`.

**Window size:** 30-day windows recommended (produces bounded page counts; avoids >100k-record single queries per auth-and-limits.md guidance). Each window is one sync pass; the budget-resume pattern handles multi-pass.

**Example:**

```typescript
// Source: existing acculynx-sync pattern (docs/knowledge-base/acculynx/ingestion/sync-pipeline.md)
const url = `${BASE}/jobs?dateFilterType=ModifiedDate` +
  `&startDate=${startDate}&endDate=${endDate}` +
  `&pageSize=25&recordStartIndex=${offset}` +
  `&sortBy=ModifiedDate&sortOrder=Ascending`;
```

### Pattern 4: Job-Walk for Sub-Resources

**What:** For resources with no date filter (financials, insurance, milestone-history, invoices, job-contacts), walk the known job IDs sorted by `created_date ASC`, pulling each job's sub-resources in one batch of API calls. Resume from `last_walked_job_id` watermark.

**Pacing within a job walk:** Each job may require 4–5 API calls (financials, insurance, milestone-history, invoices, job-contacts). At ≤8 req/s on a single key, walking 1,284 Kansas jobs = ~6,420 API calls = ~800s. This exceeds the 120s Edge Function budget. The watermark-resume pattern is REQUIRED: stop at 110s, advance the watermark to `last_walked_job_id`, let the next cron run continue.

**At full speed (across 8 accounts, running serially):** A complete first-pass job walk for all 8 accounts may take many runs. The Phase 2 success criteria require that "a full historical backfill has run" — this means the planner must allow for multiple daily cron runs before the backfill completes. The success gate is verified by `last_walked_job_id IS NULL OR = (max job_id for account)`, not by completion in a single run.

### Pattern 5: Diff Detection (Mark-Not-Seen, Never Delete)

**What:** After a full sweep of a resource for an account, rows in the target table that were NOT upserted in this sweep may have been deleted in AccuLynx. The rule (hard rule 1) is to mark them, never delete.

**Mechanism:** Add to each target table:
- `last_seen_by_api timestamptz` — updated on every upsert to `now()`
- `archived_at timestamptz` — set when the row is confirmed absent from the API
- `archive_reason text` — `'not_seen_in_api'`

**Detection query (run after a complete account sweep for a resource):**

```sql
-- After a complete sweep of account_key='wichita', resource='contacts'
UPDATE public.acculynx_contacts
SET    archived_at = now(),
       archive_reason = 'not_seen_in_api'
WHERE  account_key = 'wichita'
  AND  archived_at IS NULL
  AND  last_seen_by_api < :sweep_started_at;
```

This is safe (additive column update), idempotent, and complies with hard rule 1.

**Scope limitation:** Diff detection is only reliable for full sweeps. For the job-walk (which may take many runs to complete), diff detection runs only after `last_walked_job_id` reaches the last known job for the account — i.e., after the initial backfill is done.

### Pattern 6: Row Count Reconciliation

**What:** After each account sweep, compare the count of non-archived rows in each target table to the `count` reported by the AccuLynx API for that resource.

**Storage:** `acculynx_sync_watermark.last_api_count` stores the last API-reported total count for the resource (e.g., from the `/jobs?pageSize=1` response `count` field).

**Reconciliation view (migration 170):**

```sql
CREATE OR REPLACE VIEW public.v_acculynx_reconciliation AS
SELECT
  w.account_key,
  w.resource,
  w.last_api_count        AS api_count,
  w.last_sync_at,
  CASE w.resource
    WHEN 'jobs'     THEN (SELECT count(*) FROM acculynx_jobs WHERE account_key = w.account_key AND archived_at IS NULL)
    WHEN 'contacts' THEN (SELECT count(*) FROM acculynx_contacts WHERE account_key = w.account_key AND archived_at IS NULL)
    -- ... etc
  END                     AS brain_count,
  CASE WHEN w.last_api_count > 0
    THEN round(100.0 * ABS(brain_count - w.last_api_count) / w.last_api_count, 1)
  END                     AS delta_pct
FROM public.acculynx_sync_watermark w;
```

**Acceptable tolerance:** Jobs sync uses ModifiedDate incremental — 100% match expected after backfill completes. Sub-resources use full sweeps — 100% expected. A tolerance of <2% delta_pct covers race conditions (new records created between the API count call and the sweep completing). Any delta >5% should be investigated. [ASSUMED — no AccuLynx documentation on data consistency window; 2%/5% is industry standard for near-real-time mirrors]

### Anti-Patterns to Avoid

- **Using a single watermark row for all accounts:** Without `account_key` on the watermark, Kansas's `last_modified_date` would corrupt or override other accounts' incremental state. Each `(account_key, resource)` must be its own watermark row.
- **Running all 8 accounts in parallel:** The 30 req/s IP limit means 8 parallel keys = 4× the IP limit. Run accounts serially within a single invocation, or add a configurable inter-account delay.
- **Assuming `/contacts` has a date filter:** It does not [VERIFIED: OpenAPI params]. Full-sweep-with-upsert is the only option for contacts.
- **Comparing raw counts across accounts:** Each AccuLynx account is a separate company instance; counts are per-account and must always be segmented by `account_key`.
- **Deleting rows during diff detection:** Violates hard rule 1. Always `UPDATE ... SET archived_at = now()`.
- **Storing the raw API key value in any column:** Only `env_secret_name` (the name) lives in `acculynx_accounts`. The value never touches the DB (hard rule 2).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 429 retry with backoff | Custom retry loop | Existing `acculynxFetch` in acculynx-sync v10 (Retry-After + exp backoff, 3 retries) | Already proven in production; re-use, don't duplicate |
| PII redaction in raw storage | Custom scrubber | `redactSample()` from acculynx-read-sweep/sweep.ts | Already implemented and unit-tested (6/6 passing) |
| Account key resolution | Any other method | `Deno.env.get(acct.env_secret_name)` where `env_secret_name` from `acculynx_accounts` | The only approved pattern (hard rule 2); no value ever in DB |
| Pagination parameter selection | Hardcoded per-endpoint | `paginationParam()` from sweep.ts (reads checklist `pagination_param` column) | Already handles recordStartIndex/pageStartIndex split per endpoint |
| Concurrency between accounts | Thread/worker pools | Serial account loop with runtime budget check | IP rate limit (30 req/s total) makes parallel dangerous; serial + budget-resume is safe |
| DB access from Edge Function | Raw fetch to PostgREST | `createClient(SB_URL, SB_SRK, {auth:{persistSession:false}})` + `.from()` | Existing pattern from both read-sweep and acculynx-sync |

---

## Critical Known Facts: Pagination & Rate Limits

[VERIFIED: OpenAPI index + acculynx-api/SKILL.md + auth-and-limits.md + live read-sweep]

### Page sizes and pagination params

| Resource / Endpoint | Pagination param | Recommended pageSize | Notes |
|--------------------|-----------------|---------------------|-------|
| `GET /jobs` | `recordStartIndex` | 25 (existing) | date filter available |
| `GET /contacts` | `pageStartIndex` | 50 | no date filter |
| `GET /estimates` | `pageStartIndex` | 50 | no date filter |
| `GET /jobs/{id}/invoices` | `pageStartIndex` | 25 | no date filter; per-job |
| `GET /jobs/{id}/estimates` | `recordStartIndex` | 25 | no date filter; per-job |
| `GET /jobs/{id}/history` | `recordStartIndex` | 25 | has startDate/endDate |
| `GET /jobs/{id}/contacts` | none (single call) | — | returns array, no pagination |
| `GET /jobs/{id}/financials` | none (single object) | — | returns single financials object |
| `GET /jobs/{id}/insurance` | none (single object) | — | returns single insurance object |
| `GET /jobs/{id}/milestone-history` | none (array) | — | returns `{items:[]}` array |

### Rate limits

- **30 req/s per IP** (across all accounts combined)
- **10 req/s per API key** (per-account limit)
- Existing function paces at ≤8 req/s on the single sandbox key (130ms gap) [VERIFIED: index.ts `PACE_MS = 130`]
- With 8 accounts in serial: each account gets its own 130ms pace; between accounts, no inter-account delay needed (one key at a time)
- On 429: `Retry-After` header honored; if absent, exponential backoff with jitter; ban duration "30s to a few minutes" [CITED: auth-and-limits.md]

### Runtime budget

- Deno Edge Functions: 150s hard limit (Supabase default); existing function uses 120s budget (`RUNTIME_BUDGET_MS = 110_000` in read-sweep; docs say 120s budget)
- Budget-resume: `last_walked_job_id` + `last_page_index` advance per page; if `Date.now() >= deadline`, stop and let next cron run continue

---

## What Exists vs. What Needs Building

### Live in DB (no DDL in repo — needs DDL capture in migration 169)

These 11 tables were confirmed to exist in the live DB with 0 rows as of 2026-04-20 [VERIFIED: archive/local-uncommitted-2026-06-04/Property Enrichment/Strategic-Table-Review-20260420.md]:

| Table | Pre-exists in live DB | Needs DDL capture | Needs new columns (account_key, last_seen_by_api, archived_at) |
|-------|----------------------|-------------------|----------------------------------------------------------------|
| `acculynx_contacts` | YES (empty) | YES (mig 169) | YES |
| `acculynx_job_contacts` | YES (empty) | YES (mig 169) | YES |
| `acculynx_contact_emails` | YES (empty) | YES (mig 169) | YES |
| `acculynx_contact_phones` | YES (empty) | YES (mig 169) | YES |
| `acculynx_estimates` | YES (empty) | YES (mig 169) | YES |
| `acculynx_invoices` | YES (empty, schema known: `job_id, invoice_number, due_date, current_invoice_state, total_price, balance_due`) [VERIFIED: SKILL.md] | YES (mig 169) | YES |
| `acculynx_invoice_lines` | YES (empty) | YES (mig 169) | YES |
| `acculynx_job_financials` | YES (empty) | YES (mig 169) | YES |
| `acculynx_job_insurance` | YES (empty) | YES (mig 169) | YES |
| `acculynx_insurance_carriers` | YES (empty) | YES (mig 169) | YES |
| `acculynx_job_milestone_history` | YES (empty) | YES (mig 169) | YES |

**Important:** The plan must include a Task 0 that introspects the live DB (via Supabase MCP `list_tables`) to get the exact column list for each of these tables BEFORE writing migration 169. The tables were created via unknown earlier migrations (not in repo); the live column shapes are the ground truth.

### Live in DB and in repo DDL

| Table | Status |
|-------|--------|
| `acculynx_accounts` | Live + mig 165 |
| `acculynx_api_catalog` | Live + mig 166 |
| `acculynx_api_probe` | Live + mig 166 |
| `acculynx_get_checklist` | Live + mig 167 |
| `acculynx_jobs` | Live (not in repo DDL — pre-dates the DDL gap) |
| `acculynx_users` | Live (not in repo DDL) |
| `acculynx_sync_watermark` | Live (not in repo DDL — needs DDL capture in mig 168) |
| `acculynx_sync_cursor` | Live (not in repo DDL — 0 rows) |
| `acculynx_raw` | Live (not in repo DDL — raw API archive) |

### Needs new creation (not in live DB)

| Item | Migration |
|------|----------|
| `account_key` + `last_seen_by_api` + `archived_at` + `archive_reason` columns on all target tables | mig 169 (additive `ADD COLUMN IF NOT EXISTS`) |
| Extended watermark columns (`account_key`, `last_page_index`, `last_walked_job_id`, `last_api_count`, `last_sync_at`) | mig 168 |
| `v_acculynx_reconciliation` view | mig 170 |
| `acculynx-sync` Edge Function in repo (currently deployed but not committed) | New `supabase/functions/acculynx-sync/` directory |

---

## Common Pitfalls

### Pitfall 1: Contacts Has No Date Filter
**What goes wrong:** Developer assumes contacts can be watermarked by `modifiedDate` like jobs, and builds an incremental contacts sync. It fails because the `/contacts` endpoint has only `pageSize` and `pageStartIndex` [VERIFIED: OpenAPI params].
**Why it happens:** The jobs endpoint's `dateFilterType=ModifiedDate` pattern is memorable and developers over-apply it.
**How to avoid:** Full-sweep-with-upsert for contacts. Watermark on `last_page_index` to track completion within a run; reset after a confirmed full sweep.
**Warning signs:** Contacts count stops growing after initial sync; missing contacts that were created before the watermark date.

### Pitfall 2: The Pagination Param Split
**What goes wrong:** Developer uses `recordStartIndex` for contacts (wrong) or `pageStartIndex` for jobs (wrong). The API returns 400 or silently ignores the param and always returns page 0.
**Why it happens:** Two different pagination params exist across the 86 endpoints; easy to pick the wrong one.
**How to avoid:** Read `pagination_param` from `acculynx_get_checklist` or the reference table above. Never hardcode a single global pagination param.
**Warning signs:** Sync loop never terminates (always gets page 0 back), or empty pages after the first.

### Pitfall 3: Cross-Account Key Bleed
**What goes wrong:** A bug in the fan-out loop applies account A's API key to account B's requests (e.g., shared mutable variable, missing `await`, wrong closure scope).
**Why it happens:** Async JavaScript closures in loops; reusing a shared `acculynxFetch` wrapper without explicitly passing the key per-account.
**How to avoid:** Pass `apiKey` as an explicit function argument to every helper; never store the resolved key in a module-level variable shared across the loop. Assert `account_key` column matches the current account after upsert (integration test gate).
**Warning signs:** `acculynx_jobs WHERE account_key='florida'` shows Kansas job numbers; row counts for one account inflate unexpectedly.

### Pitfall 4: Parallel Accounts Exceed IP Rate Limit
**What goes wrong:** Running all 8 accounts in parallel (e.g., `Promise.all()`) means 80 req/s combined, hitting the 30 req/s per-IP limit and receiving 429s for all accounts.
**Why it happens:** Parallel looks faster; the per-IP limit is less obvious than the per-key limit.
**How to avoid:** Serial account loop within a single Edge Function invocation. If parallel is ever needed, add a global IP-level token bucket limiter.
**Warning signs:** All 8 accounts start getting 429s at the same time; no Retry-After header (AccuLynx doesn't always send it).

### Pitfall 5: Job-Walk Assumes One Run Completes All Jobs
**What goes wrong:** The job-walk for sub-resources is not designed for resumption; it tries to walk all 1,000+ jobs in one 120s budget and hits a hard timeout, writing incomplete state.
**Why it happens:** The existing jobs sync is fast (only fetch new/modified); the sub-resource walk is O(n_jobs × 5 API calls), which is much slower.
**How to avoid:** Budget check every N jobs (e.g., every 10 jobs); advance `last_walked_job_id` after each job; stop cleanly before the budget. Accept that the initial backfill takes many cron runs.
**Warning signs:** Edge Function returns 500/504; watermark is not advancing; sub-resource tables show partial data for early jobs and nothing for later ones.

### Pitfall 6: Invoices Require a Two-Level Walk
**What goes wrong:** Developer fetches `/jobs/{id}/invoices` (returns a list of invoice IDs) and stores only the list, missing the line-item detail that requires a second call per invoice to `/invoices/{invoiceId}`.
**Why it happens:** The capability matrix shows `getInvoicesForJob` (list) and `getInvoiceById` (detail) as separate operations; easy to miss the second.
**How to avoid:** For each job: (1) GET `/jobs/{id}/invoices` → list of `{id, ...}` → upsert header rows to `acculynx_invoices`; (2) for each invoice id → GET `/invoices/{invoiceId}` → upsert detail/lines to `acculynx_invoice_lines`. Both calls count against the job-walk budget.
**Warning signs:** `acculynx_invoice_lines` empty after sync; `acculynx_invoices` has rows but no line items.

### Pitfall 7: `acculynx_jobs.market` vs `acculynx_accounts.market`
**What goes wrong:** The `market` column on jobs is derived from the account's `market` field in `acculynx_accounts`, not from the job's address. Populating it from the job address (e.g., using the `state` field) produces incorrect market segmentation for accounts like `multi_family_commercial` that span multiple states.
**How to avoid:** Stamp `market` from `acculynx_accounts.market` (or `account_key` directly), not from job address fields.

---

## Runtime State Inventory

Not applicable — Phase 2 is not a rename/refactor/migration phase. It is a new feature phase (fan-out + new resource ingestion). No strings are being renamed. No existing runtime state carries an old name that needs updating.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Deno | Edge Function development / local test | ✓ | 2.8.1 | — |
| Supabase CLI | Migration apply, Edge Function deploy | ✓ | 2.105.0 | Dashboard manual apply |
| Node.js | Build tooling, scripts | ✓ | 22.23.0 | — |
| Supabase project `rnhmvcpsvtqjlffpsayu` | Live DB (all tasks) | ✓ (via MCP) | — | — |
| AccuLynx Sandbox key (`PE_CC_SANDBOX_ACCULYNX_API_KEY`) | Sandbox testing of new resources | ✓ (set as Supabase secret, Phase 1 verified) | — | — |
| 8 production AccuLynx keys | Phase 2 fan-out | UNVERIFIED — need to confirm all 8 are set as Supabase Edge secrets | — | Plan must include a verification task before enabling production fan-out |

**Missing dependencies with no fallback:**
- All 8 production AccuLynx API keys must be set as Supabase Edge secrets before Phase 2's fan-out can run in production. This is a plan gate: Task N must verify each secret is set (ping the sandbox equivalent, or verify via `supabase secrets list`) before enabling production accounts.

**Missing dependencies with fallback:**
- None identified.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Deno built-in test runner (`Deno.test`) |
| Config file | No separate config — tests co-located with source files |
| Quick run command | `deno test supabase/functions/acculynx-sync/lib/ --allow-env` |
| Full suite command | `deno test supabase/functions/acculynx-sync/ --allow-env --allow-net=localhost` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-03 | Fan-out loops production accounts, never sandbox | Unit | `deno test supabase/functions/acculynx-sync/lib/accounts.test.ts` | ❌ Wave 0 |
| REQ-03 | `account_key` column stamped on every upserted row; no cross-account bleed | Unit | `deno test supabase/functions/acculynx-sync/lib/accounts.test.ts` | ❌ Wave 0 |
| REQ-03 | Per-resource watermark keyed by `(account_key, resource)` | Unit | `deno test supabase/functions/acculynx-sync/lib/watermark.test.ts` | ❌ Wave 0 |
| REQ-04 | Correct pagination param per resource (recordStartIndex vs pageStartIndex) | Unit (reuse paginationParam from sweep.ts) | `deno test supabase/functions/acculynx-read-sweep/sweep.test.ts` | ✅ exists |
| REQ-04 | Invoice two-level walk: list + detail | Unit | `deno test supabase/functions/acculynx-sync/resources/job-walk.test.ts` | ❌ Wave 0 |
| REQ-04 | Diff detection marks absent rows with `archived_at`; does not DELETE | Unit | `deno test supabase/functions/acculynx-sync/lib/diff.test.ts` | ❌ Wave 0 |
| REQ-04 | Job-walk advances watermark after each job and stops at budget | Unit | `deno test supabase/functions/acculynx-sync/resources/job-walk.test.ts` | ❌ Wave 0 |
| Both | Row count reconciliation: `v_acculynx_reconciliation` computes delta_pct | SQL smoke | `psql $DATABASE_URL -f scripts/acculynx-reconcile-check.sql` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `deno test supabase/functions/acculynx-sync/lib/ --allow-env`
- **Per wave merge:** full suite `deno test supabase/functions/acculynx-sync/ --allow-env`
- **Phase gate:** full suite green + reconciliation view returns delta_pct < 5% for at least the sandbox account before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `supabase/functions/acculynx-sync/lib/accounts.test.ts` — covers REQ-03 fan-out + stamping
- [ ] `supabase/functions/acculynx-sync/lib/watermark.test.ts` — covers REQ-03 per-resource watermark
- [ ] `supabase/functions/acculynx-sync/lib/diff.test.ts` — covers REQ-04 mark-not-delete
- [ ] `supabase/functions/acculynx-sync/resources/job-walk.test.ts` — covers REQ-04 job-walk + invoice two-level
- [ ] `scripts/acculynx-reconcile-check.sql` — SQL smoke for v_acculynx_reconciliation

Existing: `supabase/functions/acculynx-read-sweep/sweep.test.ts` — 6/6 passing; covers pagination param logic reused in Phase 2.

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes (API key per account) | Bearer token resolved via `Deno.env.get(env_secret_name)` only; never in DB or repo (hard rule 2) |
| V3 Session Management | No | Stateless Edge Functions; no session |
| V4 Access Control | Yes (RLS) | Service-role key for DB writes; RLS enabled on all target tables; `authenticated` role gets SELECT only |
| V5 Input Validation | Partial | AccuLynx GUIDs used as path params — URL-encode before substituting; no user input in Phase 2 |
| V6 Cryptography | No | No crypto needed; keys are static Bearer tokens managed by Supabase secrets |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret value in DB / repo | Information Disclosure | `acculynx_accounts` stores name only; value lives in Supabase project secrets (hard rule 2) |
| Cross-account key bleed | Tampering | Per-account `apiKey` passed as explicit parameter; `account_key` NOT NULL on all target tables |
| Rate limit exhaustion | Denial of Service | Serial account loop; 130ms inter-call gap; existing `acculynxFetch` handles 429 |
| PII in raw column | Information Disclosure | Raw JSON stored in `acculynx_raw`; homeowner PII acceptable in raw (it's a walled internal table); not exposed to `authenticated` role |
| IP limit breach from parallel | DoS (self-inflicted) | Serial account loop enforced in code; no `Promise.all()` across accounts |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 11 empty AccuLynx target tables exist in the live DB with 0 rows as of 2026-04-20 | "What Exists" table | If any table was dropped since then, migration 169 `CREATE TABLE IF NOT EXISTS` will create it — no data loss, but schema may differ from expected |
| A2 | `acculynx_sync_watermark` exists in the live DB without an `account_key` column | Watermark pattern / migration 168 | If the column already exists, `ADD COLUMN IF NOT EXISTS` is a no-op — safe either way |
| A3 | All 8 production AccuLynx keys will be set as Supabase Edge secrets before the production fan-out runs | Environment Availability | If any key is missing, that account is skipped with a warning; data for that account will be empty — reconciliation will catch it |
| A4 | `GET /contacts` has no date filter (full sweep required) | Watermark per resource table | If AccuLynx adds a date filter in a future API version, the watermark strategy can be upgraded; wrong today means full sweep is the only option |
| A5 | Acceptable reconciliation tolerance is <2% (flag), >5% (investigate) | Reconciliation pattern | If AccuLynx's API count field reflects real-time state (not eventual), tolerance could be 0%; if it lags, tolerance may need to be higher |
| A6 | The `acculynx-sync` Edge Function v10 is not committed to the repo | "What Exists" table | If the function code is accessible elsewhere (e.g., Supabase dashboard export), it may be used as the starting point; the plan includes a task to pull/re-create it in the repo |
| A7 | Sandbox account has sufficient data for testing contacts/estimates/invoice pulls (sparse: 1 job in Phase 1) | Validation Architecture | Sandbox is sparse; Phase 4 write-seeding will deepen coverage; for Phase 2 testing, verify that at least contacts (53 in sandbox per capability matrix) and milestone-history load |

---

## Open Questions

1. **Live schema of the 11 empty target tables**
   - What we know: Tables exist in the live DB, were created before the DDL-in-repo discipline was established; SKILL.md confirms `acculynx_invoices` has `job_id, invoice_number, due_date, current_invoice_state, total_price, balance_due`.
   - What's unclear: Exact column list, types, constraints, and indexes for all 11 tables.
   - Recommendation: Task 0 in the plan uses Supabase MCP `list_tables` + `execute_sql` (`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'acculynx_contacts'`) to get the ground truth before writing migration 169.

2. **Does `acculynx-sync` v10 source code exist in the repo?**
   - What we know: The function is deployed to Supabase but the repo only has `acculynx-read-sweep` in `supabase/functions/`.
   - What's unclear: Whether v10 was ever committed (it may predate the current repo structure).
   - Recommendation: Plan task pulls the function via `supabase functions download acculynx-sync` or re-creates it in the repo from the documented architecture.

3. **Production key verification**
   - What we know: The 8 production secret names are canonical (`PE_CC_FLORIDA_ACCULYNX_API_KEY`, etc.) per migration 165 seed data.
   - What's unclear: Whether all 8 are currently set as Supabase Edge Function secrets (Phase 1 only required the sandbox key).
   - Recommendation: Plan includes a gate task that calls `GET /diagnostics/ping` for each account using its key, confirms 200, and logs the result — before any data sync task runs.

4. **Sandbox data depth for sub-resources**
   - What we know: Phase 1 sandbox had 1 job, 1 contact, 1 supplement. Contacts endpoint returned 53 contacts (company-level list). Invoice/estimate endpoints returned 0 in sandbox.
   - What's unclear: Whether contacts in the sandbox are fake seed data or real; whether financials/insurance/milestone-history will return data for the 1 sandbox job.
   - Recommendation: The plan includes a sandbox-first test run for each new resource type before enabling production. Accept that estimates/invoices may return 0 in sandbox; validate the fetch logic is correct via a code review gate rather than data presence.

---

## Sources

### Primary (HIGH confidence)
- `skills/cleverwork-roofer/acculynx-api/reference/openapi-index.json` — parameter scan for date filter capability [VERIFIED: Python parse, 2026-06-30]
- `supabase/functions/acculynx-read-sweep/index.ts` + `sweep.ts` — live code pattern for PACE_MS, RUNTIME_BUDGET_MS, acculynxFetch, assertSandbox, paginationParam [VERIFIED: file read]
- `schemas/cleverwork-roofer/165-acculynx-accounts-registry.sql` — account registry schema + 9-account seed [VERIFIED: file read]
- `schemas/cleverwork-roofer/166-acculynx-catalog-probe-ddl.sql` — catalog/probe DDL [VERIFIED: file read]
- `docs/65-acculynx-read-capability-matrix.md` — sandbox capability verdicts, pagination params, item keys [VERIFIED: file read]
- `docs/knowledge-base/acculynx/api/auth-and-limits.md` — rate limits (30 IP / 10 per-key), 429 behavior [CITED: apidocs.acculynx.com/docs/rate-limits]
- `docs/knowledge-base/acculynx/ingestion/sync-pipeline.md` — current sync architecture, watermark-resume pattern, 120s budget [VERIFIED: file read]
- `docs/knowledge-base/acculynx/data/tables.md` — table inventory, Phase 2 status per table [VERIFIED: file read]

### Secondary (MEDIUM confidence)
- `archive/local-uncommitted-2026-06-04/Property Enrichment/Strategic-Table-Review-20260420.md` — confirmation of 11 empty target tables in live DB [VERIFIED as of 2026-04-20; may have changed since]
- `skills/cleverwork-roofer/acculynx-api/SKILL.md` — `acculynx_invoices` column list (`job_id, invoice_number, due_date, current_invoice_state, total_price, balance_due`) [CITED: 2026-06-18 session discovery]

### Tertiary (LOW confidence / ASSUMED)
- Reconciliation tolerance (<2% flag, >5% investigate) — industry standard, not sourced from AccuLynx documentation [ASSUMED: A5]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All tooling is live and proven in the project; no new packages.
- Architecture: HIGH — Pagination params and date filter availability verified against OpenAPI index; fan-out pattern directly follows existing acculynx_accounts schema and read-sweep patterns.
- Pitfalls: HIGH for items VERIFIED against source; MEDIUM for reconciliation tolerance (ASSUMED).
- Live DB table schemas: MEDIUM — archive confirms existence; exact column shapes require MCP introspection at plan time.

**Research date:** 2026-06-30
**Valid until:** 2026-07-30 (AccuLynx API is stable; Supabase infrastructure is stable; 30-day validity)
