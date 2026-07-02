---
type: Pipeline
title: AccuLynx Sync Pipeline
description: The live pull-based incremental sync — pg_cron → pg_net → acculynx-sync Edge Function. Capture-first (D-14), crm_pipeline restored on the multiAccount cron (Phase 7 gap closure).
resource: https://supabase.com/dashboard/project/rnhmvcpsvtqjlffpsayu/functions
tags: [acculynx, ingestion, pg_cron, edge-function, watermark, capture-first, crm-pipeline]
timestamp: 2026-07-02T00:00:00Z
---

The integration of record is **NOT** the repo's `integrations/bridges/acculynx`
webhook stub — it is a live Supabase Edge Function. Plan against this.

# Architecture

```
pg_cron (hourly, 0 * * * *)
  → trigger_acculynx_sync('{"multiAccount":true}')   -- SQL fn, fans out over acculynx_accounts
    → pg_net  (async HTTP POST)  ── dispatch logged to acculynx_cron_dispatch
      → acculynx-sync  (Deno Edge Function)
        → per account (D-18 fair-share rotation, serial — see below):
          1. syncJobs        -- AccuLynx API V2 GET, incremental by ModifiedDate -> upsert acculynx_jobs
          2. syncContacts    -- full sweep -> upsert acculynx_contacts
          3. syncEstimates   -- full sweep -> upsert acculynx_estimates
          4. syncJobWalk     -- D-14 capture-first per-job sub-resource walk (see below);
                                D-15/D-16 pull scheduling decides which jobs are walked this run;
                                returns Map<jobId, repName> from the full /representatives fetch
          5. syncCrmPipeline -- upserts crm_pipeline for this account, consuming this run's
                                acculynx_jobs + acculynx_job_financials + the repName Map
        → advance acculynx_sync_watermark  (composite PK: account_key, resource_type)

pg_cron (*/10)  → reconcile_acculynx_cron_outcomes()  -- copies pg_net results into the owned table
pg_cron (*/15)  → check_acculynx_alerts()             -- fires Slack/Sentry on failure/staleness/
                                                          unresolved job-walk write errors
```

**D-14 capture-first (every GET, not just job-walk):** every AccuLynx API response body is
archived to the append-only `acculynx_raw` table BEFORE any typed mapping/upsert is attempted.
A mapping or PostgREST-rejection failure never loses the payload — remediation is re-map-from-raw,
not re-call-the-API. `job-walk.ts`'s `archiveRaw()` is the canonical implementation; every per-job
sub-resource GET (contacts, financials, insurance, milestone-history, invoices, invoice lines,
representatives) is archived this way.

**`syncJobWalk` per-job walk** (`resources/job-walk.ts`), for each job selected by the D-15/D-16
schedule below:

1. `GET /jobs/{jobId}/contacts` → archive → map → upsert `acculynx_job_contacts`
2. `GET /jobs/{jobId}/financials` → archive → map → upsert `acculynx_job_financials`
3. `GET /jobs/{jobId}/insurance` → archive → map → upsert `acculynx_job_insurance`
4. `GET /jobs/{jobId}/milestone-history` → archive → map → upsert `acculynx_job_milestone_history`
5. `GET /jobs/{jobId}/invoices` (level 1) → archive → map → upsert `acculynx_invoices` headers
6. Per invoice: `GET /invoices/{invoiceId}` (level 2) → archive → map → upsert `acculynx_invoice_lines`
7. `GET /jobs/{jobId}/representatives` (**full collection**, not the 204-empty-for-many-jobs
   `/representatives/sales-owner` sub-path) → archive → resolve the company/primary rep's
   `user.id` to a name via `acculynx_users` → returned in a `jobId → repName` map that
   `syncCrmPipeline` consumes for `crm_pipeline.primary_salesperson`

Any typed-upsert failure in the walk is INSERTed into `acculynx_job_walk_errors`
(account_key, job_id, resource_type, sync_batch_id, error_message, http_status) — no longer
swallowed by `console.warn`. `check_acculynx_alerts()` (migration 186) alerts on unresolved
job-walk errors in the last 6h.

# Pull scheduling (D-15 first-sight / D-16 change-driven)

`shouldWalkJob()` decides, per job, whether the full 7-endpoint walk above runs this pass:

- **D-15 first-sight full pull:** a job with zero prior `acculynx_raw` rows (matched via
  `api_endpoint LIKE '%/jobs/{jobId}%'` — `acculynx_raw` has no `job_id` column) is
  unconditionally walked in full.
- **D-16 change-driven re-pull:** a job that already has prior raw archives is only
  re-walked when `acculynx_jobs.modified_date` is newer than the newest prior archive for
  that job. An unchanged, already-fully-pulled job is skipped (its watermark still advances)
  rather than blanket re-pulled every hour — with ~6,400+ jobs across 8 accounts and ~7
  endpoints per job, hourly full re-pulls are not viable under the rate limit.

# How it paces (rate-limit safety)

- Incremental: `dateFilterType=ModifiedDate`, `startDate = watermark.last_modified_date`,
  `sortBy=ModifiedDate Ascending` for the `jobs` resource. `contacts`/`estimates` are full
  sweeps; `job_walk` uses the D-15/D-16 schedule above instead of a date filter.
- Small pages: `pageSize=25` (jobs, `pageStartIndex`), `50` (users).
- HTTP 429 → retry with `Retry-After` + exponential backoff (3 retries).
- ~110s runtime budget per invocation; the `job_walk` watermark advances **per job** (via the
  shared `advanceWatermark()` upsert helper, which works even for a never-seeded
  `(account_key, 'job_walk')` pair), so a crash or budget cutoff resumes cleanly next run.
- **D-18 fair-share account rotation:** the no-arg (`accountFilter` absent) default fan-out
  rotates which account leads each run, via a persisted cursor
  (`acculynx_sync_watermark` row `account_key='__rotation__', resource_type='fanout_start'`).
  Remaining runtime is fair-shared across not-yet-synced accounts, recomputed after each
  account completes, so a larger account (e.g. colorado) can no longer permanently exhaust
  the shared budget before a smaller one (e.g. wichita) gets its turn. An explicit
  `accountFilter` (e.g. `{"multiAccount":true,"accountFilter":["wichita"]}`) still overrides
  rotation and gives the named account(s) the full budget.

See [Auth & Rate Limits](../api/auth-and-limits.md) for the 30/10 req/s limits.

# Where it lands

[`acculynx_jobs`](../data/jobs.md) (flat mirror, `id` = AccuLynx GUID = permanent key) and
`crm_pipeline` (normalized: milestone, market, `data_source='api_sync'`) — **written by the
hourly `multiAccount` cron for all 8 accounts** via `syncCrmPipeline()`
(`resources/crm-pipeline.ts`), called from `runAccountSync` after job-walk on every fan-out
pass. `crm_pipeline.contract_amount`/`balance_due` are mapped from
`acculynx_job_financials.approved_job_value`/`balance_due`; `primary_salesperson` is mapped
from the job-walk's full-representatives company rep. Both mappings are null-safe by key
omission — a run with no fresh financials/rep value for a job leaves that column untouched on
upsert rather than blanking a previously-synced real value with an absent-this-run read
(T-07-06-01). See [Brain Tables](../data/tables.md).

# Resolved in Phase 3 (2026-07-01)

- **Hourly, multi-account.** The daily 08:15 single-key run was cut over to an
  hourly `0 * * * *` run that fans out over the `acculynx_accounts` registry
  (`multiAccount:true`) — see [Account Registry](../accounts.md). Each account's
  key is resolved at runtime from `Deno.env` (name only), never shared module-level.
- **Cron observability fixed (no more perpetual `pending`).** Every dispatch is
  logged to the owned `acculynx_cron_dispatch` table; `reconcile_acculynx_cron_outcomes()`
  (`*/10`) copies each pg_net response out of the transient `net._http_response`
  (6h TTL) well inside the window, so `v_acculynx_cron_outcomes` reflects real
  `success`/`failure` instead of stuck `pending`.
- **Alerting.** `check_acculynx_alerts()` (`*/15`) posts to Slack (#ob-ops-conductor)
  and Sentry on failed dispatch, stale watermark, over-tolerance reconciliation
  delta, unreconciled pg_net, or unresolved job-walk write failures (see below) —
  secret-safe (redaction guard; names only).
- **Deny-by-default + trust invariants.** RLS revokes `anon`/`authenticated` on all
  `acculynx_*` tables (service_role only); `account_key NOT NULL` + `trust_tier`
  default `evidence` on the ingested tables; `acculynx_raw` is immutable. Rot-guard
  views monitor duplicates/orphans/null-provenance/stale-tail.

Recovery procedures for each of these live in the
[Recovery Runbook](runbook.md).

# Resolved in Phase 7 gap closure (2026-07-02)

The Phase 3 multiAccount cutover above carried the job/contacts/estimates resources forward
onto the hourly cron, but did **not** carry `crm_pipeline` forward — the only `crm_pipeline`
upsert lived in the retired single-account `legacySyncJobs` path, gated `if (!multiAccount)`,
so `crm_pipeline` was frozen (never written by the live cron) from the Phase 3 cutover until
this fix landed. A live-DB/live-API verification pass on 2026-07-02 also found job-walk
sub-resource writes silently failing (raw camelCase spread into snake_case columns rejected by
PostgREST, `console.warn`-only), financials/full-representative data never mapped forward, and
wichita starved of sync budget. 07-05/07-06 (plans, this phase) closed these:

- **crm_pipeline restored on the multiAccount cron.** `syncCrmPipeline()`
  (`resources/crm-pipeline.ts`) runs for every fan-out account, mapping financials →
  `contract_amount`/`balance_due` and the full-representatives company rep →
  `primary_salesperson` — see "Where it lands" above.
- **Capture-first, explicit field mapping.** Every job-walk GET is archived to `acculynx_raw`
  before mapping (D-14); each sub-resource table now has an explicit snake_case field map
  instead of a raw camelCase spread.
- **Counted, alertable write failures.** `acculynx_job_walk_errors` (migration 186) replaces
  the former `console.warn`-only failure path; `check_acculynx_alerts()` alerts on unresolved
  errors in the last 6h.
- **First-sight / change-driven pull scheduling.** D-15/D-16 (`shouldWalkJob()`) replace an
  implicit "walk everything, watermark-gated" approach with an explicit first-sight-vs-changed
  decision per job — see "Pull scheduling" above.
- **Fair-share budget rotation (D-18).** The account fan-out order now rotates each run instead
  of always starting from the same registry position, so no single account can permanently
  starve another of sync budget — see "How it paces" above.
- **crm_pipeline csv/api duplicate dedup (dashboard-side, 07-07).** `crm_pipeline` can still
  carry legacy `csv_initial` rows alongside live `api_sync` rows for the same job (a
  `csv_initial`/`api_sync` twin pair is NOT itself resolved by this ingestion pipeline — no
  merge/backfill of `acculynx_job_id` onto orphaned csv rows has been implemented here). The
  Executive Pipeline dashboard loader (`app/command-center/src/lib/executive-pipeline.ts`)
  dedupes at read time, preferring the `api_sync` row when both exist for the same
  `acculynx_job_id`, so KPIs are honest even though the underlying table can still contain
  both rows.

# Still open (later phases)

- **Resource breadth.** Not every resource watermark is fed for every account yet;
  full backfill to tolerance is cron-paced (carry-forward from Phase 2).
- **Orphaned csv_initial rows.** ~5,578 legacy `crm_pipeline` rows lack `acculynx_job_id` and
  cannot be merged with an `api_sync` twin at all (dashboard-side dedup only helps when both
  rows share the join key) — a future backfill could resolve `acculynx_job_id` onto these rows
  from `job_name`/`job_number` if a reliable match is found.
- **Agent-side untrusted-content enforcement.** Free-text is *labeled* untrusted
  (evidence tier) now; the read-time agent that must honor "data never
  instructions" is REQ-09 (its own phase).

# Citations

[1] Edge Function `acculynx-sync`, Supabase project `rnhmvcpsvtqjlffpsayu`
[2] [Account Registry](../accounts.md)
[3] [Read-Capability Sweep](read-sweep.md)
[4] [Recovery Runbook](runbook.md); migrations 172–180, 186 (`schemas/cleverwork-roofer/`)
[5] [Security Posture](../security/posture.md)
[6] `resources/crm-pipeline.ts`, `resources/job-walk.ts` (`supabase/functions/acculynx-sync/`)
[7] `.planning/phases/07-executive-sales-pipeline-dashboard/07-06-SUMMARY.md` (D-14..D-18 as-built)
