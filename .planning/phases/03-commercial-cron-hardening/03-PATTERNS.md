# Phase 3: Commercial Cron Hardening - Pattern Map

**Mapped:** 2026-06-30
**Files analyzed:** 15 (9 new SQL migrations, 2-3 edge function files, 1 verification script, 1 new test, 1 runbook doc, 1 doc update)
**Analogs found:** 15 / 15 (all have at least a role-match; several exact)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `schemas/cleverwork-roofer/172-acculynx-cron-hourly-cutover.sql` | migration (pg_cron scheduling) | event-driven | No prior pg_cron `cron.schedule`/`cron.unschedule` migration exists in repo — closest structural analog is `171-acculynx-watermark-pk-fix.sql` (idempotent DROP-then-ADD pattern) | role-match (idempotency pattern only; no pg_cron precedent) |
| `schemas/cleverwork-roofer/173-acculynx-cron-dispatch-log.sql` | migration (owned table DDL) | event-driven | `168-acculynx-watermark-ddl.sql` (new owned table + RLS + comment pattern) | exact |
| `schemas/cleverwork-roofer/174-acculynx-reconcile-fn.sql` | migration (SQL function + cron entry) | batch / event-driven | No SQL-function-with-cron-entry precedent in repo; closest is `170-acculynx-reconciliation-view.sql` for the query-shape half, plus pg_net docs for the join (RESEARCH.md Pattern 1) | role-match |
| `schemas/cleverwork-roofer/175-acculynx-cron-outcomes-view-v2.sql` | migration (view) | CRUD (read) | `170-acculynx-reconciliation-view.sql` (`CREATE OR REPLACE VIEW`, per-resource CASE) | exact |
| `schemas/cleverwork-roofer/176-acculynx-alert-check-fn.sql` | migration (SQL function + cron entry) | event-driven | `170-acculynx-reconciliation-view.sql` (reads `delta_pct`) combined with pg_net POST example in RESEARCH.md | role-match |
| `schemas/cleverwork-roofer/177-acculynx-rls-deny-by-default.sql` | migration (RLS/grants) | request-response (access control) | `76-app-settings-and-agreement-id.sql` (deny-by-default: ENABLE RLS + REVOKE anon,authenticated + GRANT service_role) | exact — **but see Shared Patterns note: existing acculynx_* RLS (mig 165/168/169) currently GRANTs SELECT to `authenticated`, not deny-by-default; 177 must REVOKE that** |
| `schemas/cleverwork-roofer/178-acculynx-trust-invariants.sql` | migration (constraints) | CRUD | `169-acculynx-resource-tables-ddl.sql` (ADD COLUMN IF NOT EXISTS pattern; account_key/market columns already added here, nullable) | role-match |
| `schemas/cleverwork-roofer/179-acculynx-rot-guard-views.sql` | migration (monitoring views) | CRUD (read) | `170-acculynx-reconciliation-view.sql` (CREATE OR REPLACE VIEW, per-table CASE/UNION) | exact |
| `schemas/cleverwork-roofer/180-acculynx-legacy-null-row-triage.sql` (if needed as data-fix) | migration (data fix, not schema) | CRUD | `171-acculynx-watermark-pk-fix.sql` (surgical, documented, idempotent live-data fix) | exact |
| `supabase/functions/acculynx-sync/index.ts` (edit: cron payload cutover + alert call) | controller (Deno edge entry point) | event-driven / request-response | itself (existing v19 `index.ts`, `Deno.serve` handler) | exact (editing in place) |
| `supabase/functions/acculynx-sync/resources/jobs.ts` (verify only — likely no code change) | service (resource sync) | request-response (paginated fetch) | itself — already correct; see Pattern below | exact |
| `supabase/functions/acculynx-sync/lib/alerts.ts` (NEW) | utility (Slack/Sentry posting helper) | event-driven (fire-and-forget POST) | `supabase/functions/acculynx-sync/lib/accounts.ts` (small, focused Deno lib module: explicit params, no module-level secrets, `deno-lint-ignore-file no-explicit-any` header) | role-match |
| `supabase/functions/acculynx-sync/lib/reconcile.test.ts` (NEW) | test (Deno.test) | — | `supabase/functions/acculynx-sync/lib/watermark.test.ts` (mock-Supabase-client, `Deno.test(...)` per-behavior blocks) | exact |
| `scripts/verify-acculynx-cron.sql` (NEW) | utility (SQL verification script) | batch (manual/CI check) | `scripts/acculynx-reconcile-check.sql` (Phase 2's committed, runnable SQL gate script) | exact |
| `docs/knowledge-base/acculynx/ingestion/runbook.md` (NEW) | doc (runbook) | — | `docs/knowledge-base/runbooks/release-day.md` (frontmatter + Preconditions/Steps/Rollback/Owners shape) | exact |
| `docs/knowledge-base/acculynx/ingestion/sync-pipeline.md` (edit: hourly cadence, reconciliation fixed) | doc (architecture reference) | — | itself (existing file, frontmatter + Architecture/pacing/gaps sections) | exact |

## Pattern Assignments

### `schemas/cleverwork-roofer/172-acculynx-cron-hourly-cutover.sql` (migration, event-driven)

**Analog:** `schemas/cleverwork-roofer/171-acculynx-watermark-pk-fix.sql` (idempotency discipline) + RESEARCH.md's documented pg_cron API (no in-repo pg_cron schedule/unschedule precedent — confirmed via grep, no committed migration contains `cron.schedule`).

**Idempotent DROP-then-ADD pattern to copy** (`171-acculynx-watermark-pk-fix.sql` lines 26-42):
```sql
-- Step 1: Drop the original single-column PK.
-- IF EXISTS guards: safe to re-run (idempotent).
alter table public.acculynx_sync_watermark
  drop constraint if exists acculynx_sync_watermark_pkey;
...
-- Step 3: Add the composite PRIMARY KEY on (account_key, resource_type).
alter table public.acculynx_sync_watermark
  add primary key (account_key, resource_type);
```
Apply the same "guard, then act" idiom to pg_cron: `select cron.unschedule('<old-job-name>');` wrapped so it does not error if already unscheduled (pg_cron's `cron.unschedule` raises if the job doesn't exist — wrap in a `DO $$ ... EXCEPTION WHEN OTHERS THEN NULL; END $$;` block or check `cron.job` first), then `select cron.schedule('acculynx-hourly-sync', '0 * * * *', $$select trigger_acculynx_sync('{"multiAccount":true}')$$);` guarded with `select 1 from cron.job where jobname = 'acculynx-hourly-sync'` to avoid duplicate schedules on re-run.

**CRITICAL — must resolve via live query before writing this migration (RESEARCH.md Open Question 1 / A1):** the exact current `cron.job.jobname` and whether `trigger_acculynx_sync(...)` currently passes `multiAccount:true` or the legacy `resources:["users","jobs"]` array (per `sync-pipeline.md` line 17: `trigger_acculynx_sync('["users","jobs"]')`). Query live: `select jobid, jobname, schedule, command from cron.job;` and `select prosrc from pg_proc where proname = 'trigger_acculynx_sync';` — the migration's `cron.unschedule()` call must target the REAL jobname, not a guessed one.

**Documentation header pattern to copy** (all migrations in this repo use this preamble style — see `171` lines 1-24): number-prefixed filename, PROBLEM/FIX/design-decision comment block, explicit "Additive; no DROP TABLE/DROP COLUMN/TRUNCATE/DELETE (hard rule 1)" footer line.

---

### `schemas/cleverwork-roofer/173-acculynx-cron-dispatch-log.sql` (migration, owned table DDL)

**Analog:** `schemas/cleverwork-roofer/168-acculynx-watermark-ddl.sql`

**Owned-table creation + comment pattern** (lines 21-33):
```sql
create table if not exists public.acculynx_sync_watermark (
  resource_type            text primary key,
  ...
  updated_at               timestamptz not null default now()
);

comment on table public.acculynx_sync_watermark is
  'Per-(account_key, resource_type) incremental sync watermark for the AccuLynx fan-out. ...';
```

**RLS tail pattern for a new service-role-only table** (lines 96-98):
```sql
-- ── RLS: match the deny-all posture of the sibling acculynx_* tables ──────────────────────────────
alter table public.acculynx_sync_watermark enable row level security;
grant select on public.acculynx_sync_watermark to authenticated, service_role;
```
**Deviation required for D-14:** the new `acculynx_cron_dispatch` table should NOT grant SELECT to `authenticated` per D-14's deny-by-default — use the `76-app-settings-and-agreement-id.sql` REVOKE/GRANT shape instead (see Shared Patterns > RLS below), since this is new infrastructure (no existing dashboard read path depends on `authenticated` access to it).

**RESEARCH.md's concrete table shape to implement** (already specified in RESEARCH.md Pattern 1, lines 222-230):
```sql
create table if not exists public.acculynx_cron_dispatch (
  request_id      bigint primary key,       -- matches net._http_response.id
  batch_context   jsonb,
  dispatched_at   timestamptz not null default now(),
  status_code     integer,
  reconciled_at   timestamptz,
  timed_out       boolean
);
```

---

### `schemas/cleverwork-roofer/174-acculynx-reconcile-fn.sql` (migration, SQL function + cron entry)

**Analog:** RESEARCH.md Pattern 1 (verbatim reconciliation function, sourced from Supabase pg_net docs) — no in-repo SQL-function-with-own-cron-entry precedent exists yet; this is genuinely new infrastructure for this repo.

**Function + cron entry to copy (from RESEARCH.md, already vetted against Supabase docs):**
```sql
create or replace function public.reconcile_acculynx_cron_outcomes()
returns void language plpgsql as $$
begin
  update public.acculynx_cron_dispatch d
  set status_code   = r.status_code,
      reconciled_at = now(),
      timed_out     = r.timed_out
  from net._http_response r
  where d.request_id = r.id
    and d.reconciled_at is null;
end;
$$;

select cron.schedule('acculynx-reconcile', '*/10 * * * *',
  $$select public.reconcile_acculynx_cron_outcomes()$$);
```
Wrap the `cron.schedule` call in the same existence-guard idiom as 172 (`select 1 from cron.job where jobname = 'acculynx-reconcile'`) to keep the migration idempotent per hard rule 1's "additive and idempotent" requirement.

---

### `schemas/cleverwork-roofer/175-acculynx-cron-outcomes-view-v2.sql` (migration, view)

**Analog:** `schemas/cleverwork-roofer/170-acculynx-reconciliation-view.sql`

**View pattern to copy — `CREATE OR REPLACE VIEW` + per-value CASE, header comment block explaining design decisions** (lines 1-22):
```sql
-- 170 — AccuLynx reconciliation view (Phase 2, REQ-03 + REQ-04)
--
-- v_acculynx_reconciliation compares, per (account_key, resource_type), the
-- API-reported count ... DESIGN DECISIONS: 1. ... 2. ... 3. ...
--
-- Additive + idempotent via CREATE OR REPLACE VIEW (hard rule 1).

create or replace view public.v_acculynx_reconciliation as
select
  w.account_key,
  w.resource_type,
  ...
from public.acculynx_sync_watermark w
where w.last_api_count is not null;
```

**Grant tail pattern** (line 141):
```sql
grant select on public.v_acculynx_reconciliation to authenticated, service_role;
```
Reuse this exact grant line for `v_acculynx_cron_outcomes` — a *view* reflecting an underlying deny-by-default table is the correct way to give the Command Center dashboard read access without granting `authenticated` direct table access (RESEARCH.md's ASVS V4 note on this exact tradeoff).

**Rewrite target:** the view must read from `acculynx_cron_dispatch` (owned table, migration 173) joined/aggregated with `crm_sync_log`, NOT directly from `net._http_response` (RESEARCH.md Anti-Pattern: "Reading `net._http_response` directly from a dashboard-facing view").

---

### `schemas/cleverwork-roofer/176-acculynx-alert-check-fn.sql` (migration, SQL function + cron entry)

**Analog:** `170-acculynx-reconciliation-view.sql` for the `delta_pct` read shape + RESEARCH.md's `net.http_post` example for Slack delivery.

**Query the tolerance view directly (D-07: delta_pct ≤ 2%)** — reuse the exact column from 170:
```sql
select account_key, resource_type, delta_pct
from public.v_acculynx_reconciliation
where delta_pct > 2;
```

**Slack POST via pg_net (from RESEARCH.md "Correlating a pg_net request to its response" example, lines 346-362)** — same `net.http_post()` call shape as `trigger_acculynx_sync`, pointed at the Slack webhook instead of the edge function:
```sql
select net.http_post(
  url := '<slack-webhook-url>',
  headers := jsonb_build_object('Content-Type', 'application/json'),
  body := jsonb_build_object('text', '<alert message>')
) as request_id;
```
Function + cron-entry structure otherwise identical to 174's `reconcile_acculynx_cron_outcomes()` (plpgsql function, own `cron.schedule` entry at 15-30 min per RESEARCH.md).

---

### `schemas/cleverwork-roofer/177-acculynx-rls-deny-by-default.sql` (migration, RLS/grants)

**Analog:** `schemas/cleverwork-roofer/76-app-settings-and-agreement-id.sql`

**Exact deny-by-default block to copy** (lines 32-34):
```sql
ALTER TABLE public.app_setting ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_setting FROM anon, authenticated;
GRANT  ALL ON public.app_setting TO service_role;
```

**CRITICAL FINDING — this migration must REVOKE, not just ENABLE:** `169-acculynx-resource-tables-ddl.sql` (lines 357-383) and `168-acculynx-watermark-ddl.sql` (line 98) already ran `ENABLE ROW LEVEL SECURITY` on every `acculynx_*` table AND `GRANT SELECT ... TO authenticated, service_role` — this is RLS-enabled-but-NOT-deny-by-default (authenticated can currently SELECT with no restricting policy, which under RLS-enabled-no-policy means **zero rows are returned to `authenticated`, not that they're blocked from connecting** — functionally similar outcome to REVOKE today, but structurally different and worth closing per D-14's explicit language "anon/public denied"). The 177 migration must:
```sql
-- Repeat per table (12 acculynx_* tables from mig 169 + acculynx_accounts + acculynx_sync_watermark + acculynx_cron_dispatch, new in 173)
REVOKE ALL ON public.acculynx_jobs FROM anon, authenticated;
GRANT  ALL ON public.acculynx_jobs TO service_role;
-- ... repeat for acculynx_contacts, acculynx_job_contacts, acculynx_contact_emails,
--     acculynx_contact_phones, acculynx_estimates, acculynx_invoices, acculynx_invoice_lines,
--     acculynx_job_financials, acculynx_job_insurance, acculynx_insurance_carriers,
--     acculynx_job_milestone_history, acculynx_accounts, acculynx_sync_watermark
```
This closes RESEARCH.md's Open Question 2 gap explicitly and should be verified live first: `select relname, relrowsecurity from pg_class where relname like 'acculynx_%' and relkind = 'r';`.

**Confirmed safe against the dashboard read path** — `app/command-center/src/lib/supabase.server.ts` (lines 62-76) always constructs its client with `SUPABASE_SERVICE_ROLE_KEY` (never anon/authenticated key):
```typescript
return {
  client: createClient(config.url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-open-brain-client": "command-center" } },
  }),
  config,
};
```
service_role always bypasses RLS entirely — REVOKE from anon/authenticated cannot break any Command Center read.

**Different-house-pattern note:** `127-invoice-lines-full-grants-rls.sql` uses `CREATE POLICY` (policy-based, not pure REVOKE) for a table that DOES need `authenticated` read (`abc_invoice_lines_full`). Do NOT use the 127 pattern here — D-14 explicitly wants deny-by-default with service_role-only, matching 76, not policy-based authenticated access.

---

### `schemas/cleverwork-roofer/178-acculynx-trust-invariants.sql` (migration, constraints)

**Analog:** `schemas/cleverwork-roofer/169-acculynx-resource-tables-ddl.sql` (the table that already added the nullable `account_key`/`market` columns this migration will constrain).

**Sequencing note is itself the pattern to follow** (from 169's own header comment, lines 13-15):
```
-- account_key is nullable at the DDL layer (no NOT NULL here) because the tables may hold
-- rows from the pre-account_key era. The ingest layer (Plan 03) stamps account_key on every
-- new upserted row; a follow-up constraint will enforce NOT NULL once all rows are backfilled.
```
This is 169 explicitly deferring the NOT NULL constraint to a future migration — this phase (178) is that future migration. **Must run AFTER migration 180 (legacy NULL-row triage)** per RESEARCH.md Pitfall 3 — do not add `ALTER TABLE ... ALTER COLUMN account_key SET NOT NULL` until a live query confirms zero NULL rows: `select count(*) from acculynx_contacts where account_key is null;` (repeat per affected table: contacts, job_contacts, job_financials, job_insurance per 02-VERIFICATION.md's 8-row list).

**Column-add idiom to copy** (169 lines 232-237, repeated per table):
```sql
alter table public.acculynx_contacts
  add column if not exists account_key      text,
  add column if not exists market           text,
  ...
```
For 178, the analogous idiom is `ALTER COLUMN ... SET NOT NULL` (not `IF NOT EXISTS` — that clause doesn't apply to SET NOT NULL) guarded by a preceding `DO $$ ... $$` NULL-count check, or simply sequenced strictly after 180 with a comment explaining the ordering dependency (matching 169's own documentation discipline).

---

### `schemas/cleverwork-roofer/179-acculynx-rot-guard-views.sql` (migration, monitoring views)

**Analog:** `schemas/cleverwork-roofer/170-acculynx-reconciliation-view.sql`

Four views (duplicate GUID, orphan sub-resource, NULL-provenance, stale-tail) — reuse 170's `CREATE OR REPLACE VIEW` + `comment on view ... is '...'` + `grant select ... to authenticated, service_role` shape for each. Example structure for the duplicate-GUID guard (using `acculynx_jobs.id` which is documented as the AccuLynx GUID, `169` line 222):
```sql
create or replace view public.v_acculynx_duplicate_guids as
select 'acculynx_jobs' as table_name, id, count(*) as row_count
from public.acculynx_jobs
group by id having count(*) > 1
-- UNION ALL per additional table
;
```
NULL-provenance guard reuses the exact WHERE clause pattern from `scripts/acculynx-reconcile-check.sql` (`WHERE account_key IS NULL`) turned into a view instead of a one-off script.

---

### `supabase/functions/acculynx-sync/index.ts` (edit — cron payload cutover + alert hook)

**Analog:** itself. Read in full (lines 1-792) — v19 production code, no rewrite needed.

**The cron cutover is a payload change only, not a code change to this file** — confirmed by reading the `Deno.serve` handler (lines 644-665): `multiAccount` already branches correctly at `body.multiAccount ?? false`. The migration 172 payload `{"multiAccount":true}` alone routes execution to `runAccountSync` (line 719) instead of `legacySyncJobs`/`legacySyncUsers` (lines 724-757). **No index.ts edit is required for the cutover itself** — only for D-04 alerting.

**Error-handling / failure-hook pattern to extend for Slack/Sentry alerting** (lines 772-783, the outer catch):
```typescript
} catch (err) {
    const msg = (err as Error).message;
    await sb.from("crm_sync_log").update({
      completed_at: new Date().toISOString(),
      status: "failed",
      rows_fetched: totalFetched,
      error_count: errorCount + 1,
      error_details: [...errorDetails, { message: msg }],
      api_response_ms: Date.now() - started,
    }).eq("sync_batch_id", batchId);
    return json({ error: msg, batch_id: batchId }, 500);
}
```
Add the new `lib/alerts.ts` helper call here (and optionally after `result.status = "partial_success"` at line 760) — this is the single choke point for "hard failure before returning" per RESEARCH.md's architecture diagram.

**Secret-handling discipline to preserve in any new alerting code** (lines 46-48, comment; enforced throughout):
```typescript
// Module-level key for v10 compatibility — only used by legacy helpers below.
// Phase 2 resource modules all receive apiKey as an explicit parameter (T-02-04).
const LEGACY_KEY = Deno.env.get("ACCULYNX_API_KEY");
```
Never log `LEGACY_KEY`/`apiKey`/resolved secret values — only `env_secret_name` (see `accounts.ts` below). Any Slack/Sentry message payload assembled in `lib/alerts.ts` must be checked against this rule before POSTing.

---

### `supabase/functions/acculynx-sync/resources/jobs.ts` (verify only)

**Analog:** itself — already correct, confirmed by direct read.

**apiCount capture already present and correct** (lines 178-183, 230-231):
```typescript
// Capture the API-reported total count (present on every page response).
if (typeof typedBody?.count === "number") {
  lastApiCount = typedBody.count;
  totalCount = typedBody.count;
}
// ...
return {
  apiCount: lastApiCount,
  maxModifiedDate: maxModified ? maxModified.toISOString() : null,
};
```
This return value is already consumed correctly by `index.ts::runAccountSync` (lines 546, 558): `...(jobApiCount !== null ? { last_api_count: jobApiCount } : {})`. **No code change anticipated here** — the "jobs last_api_count stores 1" bug (02-VERIFICATION.md) is in the LEGACY `legacySyncJobs` path (`index.ts` lines 292-297, 466-474, 499-504 — sets only `total_records_synced`, never `last_api_count`), which the migration 172 cutover retires from the cron hot path. Confirm via live watermark query per RESEARCH.md Open Question 3 before closing this carry-forward item as "no code change."

---

### `supabase/functions/acculynx-sync/lib/alerts.ts` (NEW)

**Analog:** `supabase/functions/acculynx-sync/lib/accounts.ts` (module shape/style)

**Module header + explicit-param style to copy** (accounts.ts lines 1-19):
```typescript
// acculynx-sync — lib/accounts.ts (Phase 2, plan 02-03)
//
// Fan-out account loader: queries acculynx_accounts WHERE environment='production'
// and resolves each key at runtime from Deno.env only.
//
// Hard rule 2: the secret VALUE is never stored, logged, or returned.

// deno-lint-ignore-file no-explicit-any

/** Minimal interface for an account row from acculynx_accounts. */
export interface AccountRow { ... }

export async function loadProductionAccounts(sb: any): Promise<AccountRow[]> { ... }
export function resolveKey(acct: AccountRow): string | undefined { ... }
```
For `alerts.ts`: export small, focused, explicitly-parameterized functions (e.g. `postSlackAlert(webhookUrl: string, message: string)`, `captureSentryError(dsn: string, error: Error, context: Record<string, unknown>)`), no module-level secret constants (mirrors T-02-04's "explicit param, no module-level key" discipline already enforced for `apiKey` throughout this codebase).

**Command Center's existing Slack helper is the sibling to check for reusable shape** (mentioned in RESEARCH.md Package Legitimacy Audit): `app/command-center/src/lib/slack.server.ts::postSlackMessage()` — read that file at execution time if the planner wants to mirror its exact webhook-call signature; not read in this pattern-mapping pass (Deno edge function and Astro server code are different runtimes, so the Slack POST body shape is more directly reusable than the TS module wrapper).

---

### `supabase/functions/acculynx-sync/lib/reconcile.test.ts` (NEW)

**Analog:** `supabase/functions/acculynx-sync/lib/watermark.test.ts`

**Mock-Supabase-client + per-behavior `Deno.test` block pattern to copy** (lines 1-62 + 68-80):
```typescript
// acculynx-sync — lib/watermark.test.ts (Phase 2, plan 02-02 Task 2 — Wave 0 RED)
//
// Unit tests for readWatermark() and advanceWatermark().
// Pure unit tests: mock Supabase client injected, no live DB, no network.
//
// Run: deno test supabase/functions/acculynx-sync/lib/watermark.test.ts --allow-env
import { assertEquals } from "jsr:@std/assert@1";
import { readWatermark, advanceWatermark, type WatermarkRow } from "./watermark.ts";

/** Mock that records upsert calls and captures options (for onConflict assertion). */
function makeUpsertMock(returnError: { message: string } | null = null) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {
    from: (table: string) => { calls.push({ method: "from", args: [table] }); return builder; },
    upsert: (row: unknown, options: unknown) => {
      calls.push({ method: "upsert", args: [row, options] });
      return Promise.resolve({ error: returnError });
    },
  };
  return { sb: builder, calls };
}

Deno.test("advanceWatermark — upserts with onConflict 'account_key,resource_type'", async () => {
  const { sb, calls } = makeUpsertMock();
  const row: WatermarkRow = { account_key: "kansas_city", resource_type: "contacts", ... };
  await advanceWatermark(sb, row);
  const upsertCall = calls.find((c) => c.method === "upsert");
  assertEquals(upsertCall !== undefined, true, "upsert must be called");
  ...
});
```
For `reconcile.test.ts`: build an analogous mock recording `.from("acculynx_cron_dispatch").update(...).from(...).where(...)` chain calls, seed a fixture of unreconciled `request_id`s, assert the join/update targets the right rows — same "record calls, assert shape" style, no live DB/network (matches RESEARCH.md's Validation Architecture test framework: `deno test supabase/functions/acculynx-sync/lib/ --allow-env`).

**Sibling test for delete-never-called discipline** (`diff.test.ts`, referenced but not fully re-read here — confirmed via `diff.ts` itself, lines 34-40): `markNotSeen` uses `.update()` only. If `reconcile.test.ts` needs an analogous "never DELETE" assertion (unlikely for reconciliation, which only sets `status_code`/`reconciled_at`), mirror `diff.test.ts`'s delete-spy-never-invoked pattern.

---

### `scripts/verify-acculynx-cron.sql` (NEW)

**Analog:** `scripts/acculynx-reconcile-check.sql`

**Full structure to copy** (entire file, 41 lines):
```sql
-- acculynx-reconcile-check.sql
-- Phase 2, plan 02-02 Task 2 — Wave 0 content check (functional gate: Plan 04 Task 3)
--
-- Purpose: Flag any (account_key, resource) pair where the brain's row count
-- deviates more than 5% from the AccuLynx API's reported count.
--
-- Run (after Plan 04 Task 3 applies mig 170 to the live DB):
--   psql $DATABASE_URL -f scripts/acculynx-reconcile-check.sql
--
-- Expected output when Phase 2 is healthy:
--   Zero rows returned (all accounts+resources within <5% tolerance).

SELECT
  account_key, resource_type, api_count, brain_count, delta_pct, last_sync_at
FROM public.v_acculynx_reconciliation
WHERE delta_pct IS NULL OR delta_pct > 5
ORDER BY delta_pct DESC NULLS FIRST, account_key, resource_type;
```
For `verify-acculynx-cron.sql`, follow the same "Purpose / Run / Expected output when healthy" header comment convention and query `cron.job` per RESEARCH.md's Validation Architecture (REQ-07 SC1 test map, line 461):
```sql
-- Expected: exactly one row, schedule '0 * * * *', jobname 'acculynx-hourly-sync' (or the real
-- confirmed jobname from Open Question 1), AND zero rows matching the old daily jobname.
SELECT jobid, jobname, schedule, command
FROM cron.job
WHERE jobname ILIKE '%acculynx%'
ORDER BY jobname;
```
Combine with a second query section checking `acculynx_cron_dispatch`/`v_acculynx_cron_outcomes` for stuck-pending rows past the grace window (D-05d), using the same tolerance/threshold-flagging style as `acculynx-reconcile-check.sql`'s `WHERE delta_pct IS NULL OR delta_pct > 5`.

---

### `docs/knowledge-base/acculynx/ingestion/runbook.md` (NEW)

**Analog:** `docs/knowledge-base/runbooks/release-day.md`

**Full frontmatter + section shape to copy** (lines 1-34):
```markdown
---
type: runbook
title: Release Day — Command Center and marketing deploy
description: Preflight, deploy, smoke, rollback for cc.proexteriorsus.net and proexteriorsus.com.
tags: [release, dev-team, open-skills, pec-3]
timestamp: "2026-06-28"
---

# Release Day Runbook

## Preconditions
- ...

## Steps
1. **Step name** — one-line action
...

## Rollback
- ...

## Owners
- ...
```
Map D-15's required coverage onto this shape: separate `## Steps` subsections (or separate `##` headers) for (a) stuck/pending pg_net, (b) watermark rewind/reset, (c) edge function rollback v19→v12, (d) rate-limit lockout, (e) secret rotation, (f) re-running a torn backfill. Use `docs/knowledge-base/acculynx/ingestion/sync-pipeline.md`'s frontmatter `tags: [acculynx, ingestion, pg_cron, edge-function, watermark]` style, extended with `runbook`.

**Edge Function rollback specifics to include (RESEARCH.md A4, Runtime State Inventory):** `supabase functions deploy acculynx-sync --project-ref rnhmvcpsvtqjlffpsayu` is the confirmed deploy path (distinct from the Coolify-based Command Center deploy) — v19 is current, v12 is the last known-good rollback target per CONTEXT.md canonical refs.

---

### `docs/knowledge-base/acculynx/ingestion/sync-pipeline.md` (edit — hourly cadence)

**Analog:** itself (existing file, 56 lines, read in full).

**Section to update — "Known gaps (2026-06-30)"** (lines 42-50) becomes "Resolved in Phase 3" or is removed/updated in place; the Architecture diagram (lines 15-23) changes `pg_cron (daily 08:15 UTC)` → `pg_cron (hourly, 0 * * * *)` and `trigger_acculynx_sync('["users","jobs"]')` → `trigger_acculynx_sync('{"multiAccount":true}')`. Preserve the file's existing frontmatter/citation style (lines 1-8, 52-56) exactly — just update `timestamp` and the architecture/gaps content.

---

## Shared Patterns

### RLS Deny-by-Default (house pattern)
**Source:** `schemas/cleverwork-roofer/76-app-settings-and-agreement-id.sql` lines 32-34
**Apply to:** `177-acculynx-rls-deny-by-default.sql` (all `acculynx_*` tables), `173-acculynx-cron-dispatch-log.sql` (new dispatch table)
```sql
ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.<table> FROM anon, authenticated;
GRANT  ALL ON public.<table> TO service_role;
```
**Note:** existing `acculynx_*` tables (migrations 165, 168, 169) already ran `ENABLE ROW LEVEL SECURITY` + `GRANT SELECT ... TO authenticated, service_role` — this is a WEAKER posture than D-14 requires (no explicit REVOKE from `authenticated`). 177 must add the REVOKE to close the gap. Confirmed safe: `app/command-center/src/lib/supabase.server.ts` always uses `SUPABASE_SERVICE_ROLE_KEY`, never anon/authenticated — service_role bypasses RLS entirely regardless of REVOKE.

### Idempotent Migration Discipline (hard rule 1)
**Source:** every migration in `schemas/cleverwork-roofer/` — canonical recent examples `171-acculynx-watermark-pk-fix.sql`, `169-acculynx-resource-tables-ddl.sql`
**Apply to:** all 9 new migrations (172-180)
```sql
-- Guard pattern for constraints/PKs:
alter table public.<t> drop constraint if exists <name>;
alter table public.<t> add constraint <name> ...;

-- Guard pattern for columns:
alter table public.<t> add column if not exists <col> <type>;

-- Guard pattern for views/functions:
create or replace view public.<v> as ...;
create or replace function public.<fn>() ...;
```
Every migration file must end with a hard-rule-1 compliance comment ("Additive; no DROP TABLE/DROP COLUMN/TRUNCATE/DELETE") — present in 100% of sampled migrations (76, 165, 168, 169, 170, 171).

### Secret Handling (hard rule 2 / T-02-05)
**Source:** `supabase/functions/acculynx-sync/lib/accounts.ts` lines 41-53
**Apply to:** `lib/alerts.ts`, any new edge-function code touching Slack/Sentry tokens
```typescript
// Only the secret NAME is ever referenced in code/logs; Deno.env.get()'s
// return value is never logged or stored.
export function resolveKey(acct: AccountRow): string | undefined {
  return Deno.env.get(acct.env_secret_name);
}
```

### Watermark / Diff-Detection Discipline (hard rule 1)
**Source:** `supabase/functions/acculynx-sync/lib/diff.ts` lines 28-41, `lib/watermark.ts` lines 31-59
**Apply to:** any reconciliation code that touches rows (never applicable to `net._http_response` itself, but applicable if 178/179's rot-guard remediation ever writes back to `acculynx_*` tables — must use `.update()` with `archived_at`/`archive_reason`, never `.delete()`)

### Deno.test Mock-Client Style
**Source:** `supabase/functions/acculynx-sync/lib/watermark.test.ts` lines 20-62
**Apply to:** `lib/reconcile.test.ts`
Record every chained call (`from`, `select`/`update`, `eq`, terminal method) into a `calls` array on a hand-built mock object; assert against `calls` contents rather than mocking a full Supabase client library.

### SQL Verification Script Convention
**Source:** `scripts/acculynx-reconcile-check.sql` (full file)
**Apply to:** `scripts/verify-acculynx-cron.sql`
Header comment: Purpose / tolerance thresholds / `Run:` command / `Expected output when healthy:`. Query returns zero rows when healthy, non-empty when a problem needs investigation — makes the script usable as both a human-run check and a future CI/monitoring gate.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| pg_cron `cron.schedule`/`cron.unschedule` calls (migration 172) | migration | event-driven | No committed migration in this repo has ever contained a `cron.schedule`/`cron.unschedule` call — all prior pg_cron wiring was applied directly to the live DB outside git (confirmed via grep across `schemas/cleverwork-roofer/`). Use RESEARCH.md's Supabase-docs-sourced examples (Pattern 3, "Don't Hand-Roll" table) as the primary source instead of an in-repo analog. |
| SQL function with its own dedicated `cron.schedule` entry (migrations 174, 176) | migration | event-driven | No prior "SQL function + attached cron job" pattern exists in this repo (all existing cron entries, per the docs, are simple `trigger_acculynx_sync` HTTP dispatches, not local reconciliation/check functions). RESEARCH.md's Pattern 1 (verbatim, sourced from Supabase pg_net docs) is the primary source. |
| `lib/alerts.ts` Slack+Sentry dual-channel posting from a Deno Edge Function | utility | event-driven | No existing Deno edge function in this repo posts to Slack or Sentry — all existing Slack/Sentry integrations (`postSlackMessage()`, `@sentry/astro`) live in the Astro/Node Command Center app, a different runtime. `accounts.ts` supplies the *module shape* convention only, not the Slack/Sentry call itself; the planner should also check `app/command-center/src/lib/slack.server.ts` at execution time and `.claude/skills/slack-agents/SKILL.md` + `.claude/skills/sentry/SKILL.md` for concrete tokens/channel IDs (both flagged as required reading in CONTEXT.md canonical_refs). |

## Metadata

**Analog search scope:** `schemas/cleverwork-roofer/` (all 171 migrations, targeted grep + 6 full reads), `supabase/functions/acculynx-sync/` (index.ts, lib/{accounts,watermark,diff}.ts + tests, resources/jobs.ts), `app/command-center/src/lib/supabase.server.ts`, `scripts/` (SQL verification scripts), `docs/knowledge-base/acculynx/ingestion/` and `docs/knowledge-base/runbooks/`
**Files scanned:** ~20 read in full or targeted grep across 171+ migration files
**Pattern extraction date:** 2026-06-30

---

## PATTERN MAPPING COMPLETE

**Phase:** 3 - Commercial Cron Hardening
**Files classified:** 16 (9 migrations, 3 edge-function files, 1 test, 1 SQL script, 2 docs)
**Analogs found:** 16 / 16 (13 exact/role-match with strong in-repo precedent; 3 flagged "No Analog Found" for genuinely new infrastructure classes — pg_cron schedule/unschedule in a migration, SQL-function-with-own-cron-entry, and Deno-edge-function-side Slack/Sentry posting — where RESEARCH.md's vetted external-docs examples are the correct primary source instead)

### Coverage
- Files with exact analog: 11
- Files with role-match analog: 5
- Files with no in-repo analog (RESEARCH.md-sourced instead): 3 (counted within role-match/exact rows above where a partial analog existed; itemized separately in "No Analog Found")

### Key Patterns Identified
- **RLS deny-by-default is a proven house pattern** (`76-app-settings-and-agreement-id.sql`) but the EXISTING `acculynx_*` tables (migrations 165/168/169) only got `ENABLE ROW LEVEL SECURITY` + `GRANT SELECT TO authenticated` — NOT the REVOKE half. D-14's migration 177 is closing a real gap, not just applying an already-done pattern; verify live RLS/grant status first (`select relrowsecurity from pg_class where relname like 'acculynx_%'`).
- **Every migration in this repo follows strict idempotency discipline** (`DROP ... IF EXISTS` then `ADD`, `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE VIEW/FUNCTION`, header comment naming the hard-rule-1 compliance) — all 9 new migrations must match this exactly.
- **The "jobs last_api_count = 1" bug and the cron cutover are the same fix** — `jobs.ts::syncJobs` already correctly returns `apiCount`; `index.ts::runAccountSync` already correctly persists it. The bug lives entirely in the LEGACY `legacySyncJobs` path that the current (likely) daily cron invokes. Migration 172's payload change to `multiAccount:true` is very likely sufficient — confirm via live watermark query before writing any `jobs.ts` code change.
- **No pg_cron-schedule-in-migration precedent exists in this repo** — all current cron/pg_net wiring lives only in the live DB (confirmed via repo-wide grep). Migrations 172/174/176 are the first migrations of this kind; use RESEARCH.md's Supabase-docs-sourced SQL as the primary reference, with 171's idempotency discipline as the style guide.
- **`scripts/acculynx-reconcile-check.sql` is a direct, complete template** for `scripts/verify-acculynx-cron.sql` — same header convention, same "zero rows = healthy" query design.
- **Command Center dashboard reads are provably safe under RLS deny-by-default** — `supabase.server.ts` always authenticates with `SUPABASE_SERVICE_ROLE_KEY`, confirmed by direct read; no REVOKE from `anon`/`authenticated` can break any known read path.

### File Created
`/Users/chussey/Documents/a-roofers-open-brain/.planning/phases/03-commercial-cron-hardening/03-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns in PLAN.md files.
