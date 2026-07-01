# Phase 3: Commercial Cron Hardening - Research

**Researched:** 2026-06-30
**Domain:** Supabase pg_cron + pg_net async HTTP reconciliation, Deno Edge Function hardening, RLS deny-by-default, Slack/Sentry alerting, DB-invariant trust guardrails
**Confidence:** MEDIUM-HIGH (live edge function code fully read; pg_net/pg_cron internals confirmed via official docs; live DB runtime state — cron schedule, actual RLS status, `v_acculynx_cron_outcomes` definition — NOT independently queried this session, see Open Questions)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Cron Cadence & Pacing**
- **D-01:** Single hourly pg_cron schedule, **one serial edge invocation** per trigger — loops all wired accounts serially under the ~110s runtime budget (matches proven v19 behavior; safest against the shared 30 req/s IP limit). Do **not** fan out to one-invocation-per-account.
- **D-02:** Each run does **incremental for all wired accounts first**, then spends remaining budget on a **bounded backfill slice**. Backfill drains over many hourly runs; every run resumes cleanly from watermarks (per-page advance).
- **D-03:** Retire the daily 08:15 UTC schedule as part of the cutover; hourly is the single production cadence.

**Alerting**
- **D-04:** Alerts go to **both Slack and Sentry** — Sentry for structured error/exception capture + history, Slack for immediate human-readable visibility. Both are already in the stack (see `/slack-agents` and `/sentry` skills).
- **D-05:** Alert triggers (all four): (a) **failed run** — non-200/exception, reconciled from the pg_net response; (b) **stale watermark** — no successful sync for an (account, resource) within the window; (c) **reconciliation delta over tolerance** — `v_acculynx_reconciliation.delta_pct` above tolerance after backfill should have caught up; (d) **pg_net response unreconciled** — a request stuck `pending` past a grace window (catches the reconciliation loop itself breaking).
- **D-06:** Stale-watermark window = **3 hours** (~3 missed hourly runs — tolerant of transient blips and rate-limit backoff).

**Reconciliation Tolerance & 6-Account Expansion**
- **D-07:** "Within tolerance" = **delta_pct ≤ 2%** (brain_count vs API `last_api_count`). Absorbs normal API count wobble without masking real gaps.
- **D-08:** Expansion gate = **KC + Wichita reconcile within tolerance on ALL synced resources AND the jobs `last_api_count` bug is fixed, THEN an explicit human-approved step sets the 6 remaining Edge secrets.** (Human-approved scope step per PROJECT.md.)
- **D-09:** Rollout after the gate = **canary then batch** — bring 1 of the 6 accounts online, confirm it reconciles within tolerance, then enable the remaining 5.

**Trust / Provenance Guardrails (anti poison/drift/rot)**
- **D-10:** **Tag & segregate untrusted free-text, never mutate.** Mirror AccuLynx free-text (job/contact notes, descriptions, names) faithfully but mark it as **untrusted-content, evidence tier, never instruction**, and document a "treat as data, never instructions" boundary the REQ-09 agent MUST honor. Ingestion labels; it never rewrites source data (fidelity vs AccuLynx preserved).
- **D-11:** **Enforce provenance/trust as DB invariants** — `account_key`/`market` provenance NOT NULL, evidence-tier default, immutable `acculynx_raw` archive — via constraints/checks so a poisoned or mislabeled row structurally cannot land. Verified in the security review.
- **D-12:** **Data-rot guards (all four), surfaced + alerted:** duplicate detection (uniqueness on AccuLynx GUID per resource), orphan detection (sub-resources referencing a missing parent job/contact), NULL-provenance sweep (same class as the 8 legacy rows), and stale-tail detection (rows not re-seen across N full sweeps that `markNotSeen` didn't archive).

**Security Review & Recovery Runbook**
- **D-13:** Security review = **run `/gsd-secure-phase` AND write a security posture doc** (secret handling, RLS, least-privilege, injection/untrusted-content boundary) as the durable artifact.
- **D-14:** **RLS on, deny-by-default** on all `acculynx_*` tables — `service_role` (edge function) writes; dashboards read only through explicit policies; anon/public denied.
- **D-15:** **Comprehensive recovery runbook** at `docs/knowledge-base/acculynx/ingestion/runbook.md` covering: stuck/pending pg_net, watermark rewind/reset, edge function rollback (v19→v12), rate-limit lockout, secret rotation, and re-running a torn backfill.

### Claude's Discretion
- Exact pg_net → response reconciliation mechanism (join `net._http_response` to requests, retention/cleanup of the response table, whether reconciliation is a follow-up cron or a view rewrite).
- Backfill slice size + resource priority order within the "incremental first, then slice" rule (D-02) — subject to keeping within the 110s budget and 30 req/s IP limit.
- Which Slack channel the alerts post to and the exact alert message format (align with `/slack-agents`).
- Exact schema/constraint mechanics for D-11/D-12 (check constraints vs triggers vs monitoring views), provided the guarantee holds.
- Sentry capture wiring specifics (align with `/sentry`).

### Deferred Ideas (OUT OF SCOPE)
- **AccuLynx Agent runtime guardrails** (injection defense at read time, scope-drift limits on agent actions) — REQ-09, its own phase preceded by an approved A3. This phase only labels/constrains the *data*; the agent honors the documented untrusted-content boundary (D-10) later.
- Production write paths / write wrappers — REQ-06, REQ-08.
- Executive Sales Pipeline dashboard — REQ-10.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| REQ-07 | Commercial cron infrastructure — hourly, stable, observable (alerting on failure/staleness), secure, with healthchecks and incomplete-run resumption; off the Claude Cowork schedule. | See "Architecture Patterns" (hourly cutover + reconciliation + alerting design), "Common Pitfalls" (overlap safety, budget sizing), "Security Domain" (RLS + least-privilege), and "Validation Architecture" (per-success-criterion test map) below. The 4 ROADMAP success criteria for this phase (hourly scheduler, pg_net reconciliation + alerting, clean resume + runbook, security review) are all addressed by the reconciliation-table pattern (Pattern 1), the house RLS pattern (Pattern 2), the overlap-safety reasoning (Pattern 3), and the existing watermark/diff-detection code already proven in Phase 2. |
</phase_requirements>

## Summary

This phase hardens an already-proven ingestion pipeline (`acculynx-sync` v19, deployed, 56/56 unit tests green) rather than building new infrastructure. The core technical finding: **the two headline bugs this phase is chartered to fix (perpetual `pending` cron outcomes, and jobs `last_api_count` storing `1`) both trace to the same root cause — the current daily cron invokes the *legacy* v10 code path (`legacySyncJobs`/`legacySyncUsers` in `index.ts`, triggered when `multiAccount` is absent/false), not the Phase-2 `multiAccount: true` path (`runAccountSync` → `syncJobs`/`syncContacts`/`syncEstimates`). The legacy path never sets `last_api_count` on the watermark at all (verified by reading `index.ts` lines 292-297, 466-474, 499-504 — only `total_records_synced` is set), while the Phase-2 `resources/jobs.ts::syncJobs` already correctly captures the API's `count` field and returns it as `apiCount` (confirmed by reading the file directly). Cutting the cron over to `multiAccount: true` per D-01/D-03 is very likely to retire `legacySyncJobs` from the hot path entirely and fix the `last_api_count` bug as a side effect of the cadence cutover — not a separate code change.** This must be confirmed against the live watermark rows during planning/execution (see Open Questions), but it reframes "fix jobs last_api_count" from a new bugfix task into a verification task that rides along with the cron cutover.

The pg_net reconciliation problem is a known, well-documented pattern: `net._http_response.id` is the same bigint returned by `net.http_post()`, and Supabase's default `pg_net.ttl` is 6 hours — meaning any reconciliation job that runs at least once per hour (which an hourly cron enables) has a wide safety margin before responses are purged. A previously-reported bug where TTL was not respected (`pg_net` GitHub issue #80, rows vanishing after ~1 second) was fixed upstream in PR #81; current pg_net versions correctly honor the 6-hour default. The cleanest reconciliation design is a SQL function that persists the outcome (status_code + timing) from `net._http_response` into an owned table (or updates `crm_sync_log`, which already exists and already has a `sync_batch_id`/`status` column pattern) BEFORE the TTL window closes, decoupling `v_acculynx_cron_outcomes` from pg_net's transient response table.

RLS is simpler than the phase context implies: the Command Center dashboard (`app/command-center/src/lib/supabase.server.ts`) reads all `acculynx_*` tables exclusively through a server-side client authenticated with `SUPABASE_SERVICE_ROLE_KEY` — confirmed in both `live-work.ts` and `weekly-snapshot.ts`. Enabling RLS with `service_role` bypass (the default Postgres/Supabase behavior — service_role is not subject to RLS policies at all) and revoking `anon`/`authenticated` grants will not break any known read path. This exact pattern (`ENABLE ROW LEVEL SECURITY` + `REVOKE ALL FROM anon, authenticated` + `GRANT ALL TO service_role`) is already established in this codebase (migration 76, migration 148) — D-14 is applying an existing house pattern, not inventing one.

**Primary recommendation:** Treat this phase as "cut the cron over to the already-correct Phase-2 code path, add a persistent reconciliation layer on top of pg_net, apply the house RLS pattern to the remaining `acculynx_*` tables, and add DB-level trust invariants" — not as new pipeline construction. The main execution risk is the multi-account fan-out's 110s runtime budget once `job-walk` sub-resources and 8 accounts are all in scope hourly; sizing/pacing needs explicit verification against real per-account row counts before hourly cutover, per D-02's incremental-first-then-bounded-backfill design.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Hourly trigger cadence | Database (pg_cron) | — | pg_cron is a Postgres extension; scheduling lives in the DB, not the app |
| Async HTTP dispatch to Edge Function | Database (pg_net) | API/Backend (Edge Function) | pg_net fires the request; the Edge Function is the actual compute |
| AccuLynx API fan-out + upserts | API/Backend (Deno Edge Function) | Database (Postgres tables) | All ingestion logic already lives in `acculynx-sync`; DB is the write target |
| pg_net response reconciliation | Database (SQL function/cron) | — | `net._http_response` only exists in Postgres; reconciliation must run there before TTL purge |
| Alerting (Slack) | API/Backend (Edge Function or Command Center server route) | Database (SQL → pg_net POST to webhook) | Either the edge function posts directly, or a DB-side check-fn uses pg_net to hit the Slack webhook — both are backend-tier, never client-tier |
| Alerting (Sentry) | API/Backend (Deno `@sentry/node`-style capture in Edge Function, or Command Center Node runtime) | — | Sentry SDK requires a JS/Deno/Node runtime; SQL cannot call the Sentry SDK directly |
| RLS / access control | Database (Postgres RLS policies) | — | Enforced at the table level; the app never needs anon/authenticated read on these tables |
| Trust/provenance invariants (NOT NULL, evidence-tier default) | Database (CHECK/NOT NULL constraints) | API/Backend (Edge Function write shape) | Constraints are the structural backstop; the edge function should already emit compliant rows, but the DB is what "cannot poison" the brain |
| Dashboard reads of reconciliation/outcomes | Frontend Server (Astro SSR, service-role client) | — | Confirmed: `supabase.server.ts` is server-only, never shipped to the browser |

## Package Legitimacy Audit

**Not applicable.** This phase installs no new external packages. All Deno imports in `acculynx-sync` (`jsr:@supabase/functions-js`, `jsr:@supabase/supabase-js@2`) are pre-existing dependencies already deployed in v19. Slack/Sentry alerting will use the already-integrated `postSlackMessage()` helper (`app/command-center/src/lib/slack.server.ts`) and/or a raw `fetch`/`net.http_post` call to existing webhook URLs — no new SDK installation required. If the planner decides to add `@sentry/deno` (or equivalent) to the edge function specifically (distinct from the already-wired `@sentry/astro`/`@sentry/node` in the Command Center app), that package must go through the Package Legitimacy Gate at that time.

## Standard Stack

### Core
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|---------------|
| pg_cron | Supabase-managed extension (current) | Scheduled trigger for the sync | Already in use; native Postgres scheduling, no new infra |
| pg_net | Supabase-managed extension (current) | Async, non-blocking HTTP POST from SQL to the Edge Function | Already in use; the only supported async-HTTP path from Postgres on Supabase |
| Deno Edge Functions | Supabase-managed runtime | `acculynx-sync` compute | Already in use; 400s max invocation ceiling (function currently self-limits to 110s) |
| Supabase JS client | `jsr:@supabase/supabase-js@2` | DB read/write from the edge function | Already imported in `index.ts` |

### Supporting
| Component | Version | Purpose | When to Use |
|-----------|---------|---------|-------------|
| `net._http_response` | pg_net internal table | Source of truth for outbound request outcomes | Read immediately (within `pg_net.ttl`, default 6h) after dispatch; do not rely on it as durable storage |
| `cron.job_run_details` | pg_cron internal table (schema `cron`) | Per-run status/timing of the scheduled job itself (distinct from the HTTP outcome) | Cross-reference with `net._http_response` for a full picture: cron fired vs. HTTP succeeded are two different failure modes |
| `crm_sync_log` | existing app table | Already-owned durable run log (`sync_batch_id`, `status`, `error_details`, `rows_fetched`) written by the Edge Function itself | Preferred reconciliation target — the Edge Function already writes richer status here than pg_net alone can provide (it knows partial_success vs failed at a granular level) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SQL-side reconciliation cron reading `net._http_response` | Rely purely on `crm_sync_log` written by the Edge Function itself | `crm_sync_log` already captures completion status but CANNOT distinguish "edge function never got invoked at all" (pg_net dispatch failure, network partition, cold start timeout) from "ran and logged". `net._http_response` is the only place that proves pg_net's HTTP layer actually completed the round trip — needed for D-05(d)'s "unreconciled pg_net" alert. Recommendation: use BOTH — `crm_sync_log` for rich outcome detail, `net._http_response` reconciliation for "did the dispatch even land" detection. |
| Edge-function-side Slack/Sentry posting | Pure SQL-side alerting via `net.http_post` to Slack webhook + a scheduled `pg_net`-based Sentry envelope POST | SQL-side alerting can fire even if the Edge Function itself never got invoked (the true "run never happened" case) — this is why D-05 needs both layers. Edge-function-side alerting is simpler for in-run failures (a resource sync threw) but structurally cannot detect "cron didn't fire" or "pg_net dispatch failed". Recommend: Edge Function posts for its own run-scoped failures (has richest context); a separate SQL check-fn (its own small pg_cron entry, e.g. every 15-30 min) posts for staleness/unreconciled/delta-tolerance conditions that require querying state the edge function doesn't have visibility into after it's already exited. |

**Installation:** No new package installation. All work is SQL migrations (`schemas/cleverwork-roofer/172+`) and edits to existing Deno files under `supabase/functions/acculynx-sync/`.

**Version verification:** pg_cron and pg_net versions are managed by Supabase platform upgrades, not pinned in this repo. Confirm live versions during planning/execution via `select extversion from pg_extension where extname in ('pg_cron','pg_net');` — not verified in this research session (no live DB query tool available; see Environment Availability).

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  pg_cron: single hourly schedule (retiring the daily 08:15 job)      │
│    cron.schedule('acculynx-hourly-sync', '0 * * * *', $$              │
│      select trigger_acculynx_sync('{"multiAccount":true}')            │
│    $$)                                                                │
└───────────────────────────┬────────────────────────────────────────┘
                             │ SQL fn call
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  trigger_acculynx_sync(...)  — SQL fn wrapping net.http_post()        │
│    → returns bigint request_id (captured, e.g. into a log table)      │
└───────────────────────────┬────────────────────────────────────────┘
                             │ async POST (pg_net worker, non-blocking)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  acculynx-sync Edge Function (Deno)                                   │
│    ── Serial account loop (D-01), 110s budget ──                      │
│    for each wired account (kansas_city, wichita, [+6 gated]):         │
│      1. syncJobs      (incremental, date-windowed)                    │
│      2. syncContacts  (full sweep + markNotSeen)                      │
│      3. syncEstimates (full sweep + markNotSeen)                      │
│      4. syncJobWalk   (sub-resources: job-contacts, financials,       │
│                         insurance, milestone-history, invoices)       │
│      → advanceWatermark(last_api_count, last_modified_date, ...)      │
│    ── Then: bounded backfill slice (D-02) from remaining budget ──    │
│    → writes crm_sync_log (batch status, error_details, rows_fetched)  │
│    → [NEW] posts to Slack/Sentry on hard failure before returning     │
└───────────────────────────┬────────────────────────────────────────┘
                             │ HTTP response (200/4xx/5xx)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  net._http_response (pg_net internal, TTL default 6h)                 │
│    id = request_id, status_code, content, created                     │
└───────────────────────────┬────────────────────────────────────────┘
                             │ read within TTL window
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  [NEW] reconcile_acculynx_cron_outcomes()  — SQL fn, own pg_cron      │
│    entry (e.g. every 15 min — well inside the 6h TTL)                 │
│    → joins outstanding request_ids to net._http_response              │
│    → persists outcome into an OWNED table/columns (survives TTL       │
│      purge) — e.g. acculynx_cron_dispatch(request_id, batch_id,       │
│      status_code, reconciled_at)                                      │
│    → flags request_ids with NO response after grace window (D-05d)    │
└───────────────────────────┬────────────────────────────────────────┘
                             │ feeds
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  v_acculynx_cron_outcomes (rewritten view)                            │
│    reads from OWNED reconciliation table + crm_sync_log, NOT          │
│    directly from net._http_response (avoids TTL-purge blind spots)    │
└───────────────────────────┬────────────────────────────────────────┘
                             │ read by
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  [NEW] check_acculynx_alerts()  — SQL fn, own pg_cron entry           │
│    (e.g. every 15-30 min)                                             │
│    checks 4 conditions (D-05): failed run / stale watermark (>3h,     │
│    D-06) / delta_pct > 2% (D-07, from v_acculynx_reconciliation) /    │
│    unreconciled pg_net request past grace window                      │
│    → net.http_post() to Slack webhook on any breach                   │
│    → (Sentry: either edge-fn side captureException, or a periodic     │
│      SQL→HTTP POST of a Sentry envelope; edge-fn side preferred for   │
│      in-run errors — richer stack context)                            │
└─────────────────────────────────────────────────────────────────────┘

  Cross-cutting (Database tier, all additive migrations, mig 172+):
  - RLS: ENABLE ROW LEVEL SECURITY + REVOKE anon,authenticated + GRANT service_role
    on all acculynx_* tables not yet covered (house pattern, migs 76/148)
  - Trust invariants: NOT NULL account_key/market, evidence-tier default,
    immutable acculynx_raw (REVOKE UPDATE/DELETE from service_role on that table
    specifically, or a trigger that rejects mutation)
  - Rot-guard monitoring views: v_acculynx_duplicate_guids, v_acculynx_orphan_subresources,
    v_acculynx_null_provenance, v_acculynx_stale_tail
```

### Recommended Project Structure
```
schemas/cleverwork-roofer/
├── 172-acculynx-cron-hourly-cutover.sql        # unschedule daily, schedule hourly (multiAccount:true)
├── 173-acculynx-cron-dispatch-log.sql          # owned table: request_id, batch_id, dispatched_at
├── 174-acculynx-reconcile-fn.sql               # reconcile_acculynx_cron_outcomes() + its own cron entry
├── 175-acculynx-cron-outcomes-view-v2.sql      # v_acculynx_cron_outcomes rewritten off owned table
├── 176-acculynx-alert-check-fn.sql             # check_acculynx_alerts() (4 conditions) + cron entry
├── 177-acculynx-rls-deny-by-default.sql        # RLS + REVOKE/GRANT on remaining acculynx_* tables
├── 178-acculynx-trust-invariants.sql           # NOT NULL account_key/market, evidence-tier default, raw immutability
├── 179-acculynx-rot-guard-views.sql            # duplicate/orphan/null-provenance/stale-tail monitoring views
└── 180-acculynx-legacy-null-row-triage.sql     # (if data-fix, not schema-fix) stamp/archive the 8 legacy rows

supabase/functions/acculynx-sync/
├── index.ts                                     # add Slack/Sentry alert call on hard failure path
├── resources/jobs.ts                             # verify last_api_count already correct (likely no change)
└── lib/alerts.ts                                 # [NEW] shared Slack/Sentry posting helper for the edge fn

docs/knowledge-base/acculynx/ingestion/
├── sync-pipeline.md                              # update: hourly cadence, reconciliation fixed
└── runbook.md                                    # [NEW] D-15 recovery runbook
```

### Pattern 1: Owned reconciliation table instead of reading `net._http_response` directly in a view
**What:** Never build `v_acculynx_cron_outcomes` as a view that joins live against `net._http_response`. Instead, run a small, frequent (every 10-15 min) SQL function that copies the relevant rows from `net._http_response` into an owned, permanent table, then have the view read from that owned table.
**When to use:** Any pg_net-based integration where outcome history must outlive the 6-hour default TTL, or where "was this request ever reconciled" needs to be provable after the response row is gone.
**Example:**
```sql
-- Source: Supabase pg_net docs (https://supabase.com/docs/guides/database/extensions/pg_net) + pg_net GitHub (schema)
create table if not exists public.acculynx_cron_dispatch (
  request_id      bigint primary key,       -- matches net._http_response.id
  batch_context   jsonb,                    -- e.g. {"trigger":"hourly","multiAccount":true}
  dispatched_at   timestamptz not null default now(),
  status_code     integer,                  -- null until reconciled
  reconciled_at   timestamptz,
  timed_out       boolean
);

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

### Pattern 2: RLS deny-by-default (house pattern, already proven)
**What:** Enable RLS, revoke all grants from `anon`/`authenticated`, grant all to `service_role`. No policy rows needed for a purely service-role-driven table (RLS is enabled but service_role bypasses it entirely — this is default Postgres/Supabase behavior, not something that needs a policy to express).
**When to use:** Any table written exclusively by the Edge Function (service_role) and read exclusively by server-side app code (also service_role).
**Example:**
```sql
-- Source: this repo, migration 76-app-settings-and-agreement-id.sql (existing house pattern)
alter table public.acculynx_contacts enable row level security;
revoke all on public.acculynx_contacts from anon, authenticated;
grant all on public.acculynx_contacts to service_role;
-- Repeat per table. If a future authenticated dashboard role needs direct read
-- (bypassing the server route), add an explicit SELECT policy for that role —
-- not needed today per the confirmed supabase.server.ts usage.
```

### Pattern 3: Overlap-safe hourly cron for a serial, potentially-long-running sync
**What:** pg_cron does not natively prevent overlapping invocations of the same job. Because the edge function self-limits to 110s (well under the 3600s hourly interval) and pg_net dispatch is fire-and-forget (the SQL function returns immediately after enqueueing the HTTP request — it does not block for 110s), pg_cron itself will never "still be running" when the next hourly tick fires; the *edge function's own execution* is what could theoretically still be in flight. Given the 110s self-imposed budget vs. a 3600s interval, natural overlap is not a realistic risk at hourly cadence — no advisory lock needed for THIS phase's D-01 (single serial invocation/hour). Document this reasoning explicitly rather than adding unneeded locking complexity.
**When to use:** Confirms D-01 as safe without extra guarding, given the specific 110s-budget-vs-3600s-interval ratio. If the runtime budget or interval ever changes (e.g., cadence tightened to every 10 min), revisit — an advisory lock (`pg_try_advisory_lock`) around the `trigger_acculynx_sync` call becomes necessary once budget approaches interval.
**Example:**
```sql
-- Source: Supabase pg_cron docs (https://supabase.com/docs/guides/database/extensions/pg_cron) —
-- "pg_cron will start the next execution regardless of whether the previous one finished"
-- Defensive belt-and-suspenders (optional, cheap insurance):
create or replace function public.trigger_acculynx_sync_guarded(payload jsonb)
returns void language plpgsql as $$
begin
  if not pg_try_advisory_lock(hashtext('acculynx_sync_dispatch')) then
    raise notice 'acculynx sync dispatch already in flight — skipping this tick';
    return;
  end if;
  perform net.http_post(url := '<edge-function-url>', body := payload);
  perform pg_advisory_unlock(hashtext('acculynx_sync_dispatch'));
end;
$$;
```

### Anti-Patterns to Avoid
- **Reading `net._http_response` directly from a dashboard-facing view:** Rows disappear after `pg_net.ttl` (default 6h) — any run older than 6 hours silently vanishes from the view with no error, which looks identical to "never happened." Always materialize into an owned table first (Pattern 1).
- **Treating `crm_sync_log.status='completed'` as proof the HTTP dispatch succeeded:** `crm_sync_log` is written BY the edge function, from INSIDE its own execution — it cannot detect or record "pg_net never managed to invoke me at all" (network partition, cold-start timeout before the function body runs, wrong URL after a redeploy). That failure mode only shows up as a request_id in `net._http_response` with no matching `crm_sync_log` row, or no `net._http_response` row at all after the grace window. This is exactly D-05(d)'s "unreconciled pg_net" case — it needs the pg_net-side check, not just the app-side log.
- **Concurrent per-account fan-out to "go faster":** D-01 explicitly forbids this — the 30 req/s IP limit is shared across ALL accounts' requests when they originate from the same Edge Function's outbound IP; concurrent account loops would blow through it far faster than the serial loop's own pacing (130ms inter-request sleep = ~7.7 req/s per resource stream already leaves headroom, but concurrent streams multiply that).
- **Adding a CHECK constraint that would reject the 8 pre-existing NULL-provenance legacy rows:** A `NOT NULL account_key` constraint added directly via `ALTER TABLE ... ALTER COLUMN account_key SET NOT NULL` will fail outright if those 8 rows still have NULL `account_key`/`market` at migration time. The triage/stamp step (Phase 2 carry-forward item 3) must run BEFORE the NOT NULL constraint migration, or the constraint must be scoped to only new rows (a `CHECK (created_at < 'migration-date' OR account_key IS NOT NULL)` — messier) — sequencing matters here, not just "add a constraint."

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Async HTTP dispatch from a cron job | A custom polling loop, a second Edge Function that "waits", or a webhook relay service | pg_net's `net.http_post()` (already in use) | pg_net is purpose-built for exactly this; the existing architecture is correct, only the reconciliation half is missing |
| Reconciling async responses | A bespoke queueing/retry framework | A simple `reconcile_*()` SQL function on its own tight cron interval, materializing into an owned table | The problem is narrow (join request_id → response, persist before TTL) — a full queue framework is over-engineering for one integration |
| Staleness/failure detection | A custom monitoring service or external uptime tool | SQL queries against `acculynx_sync_watermark.last_sync_at` + `v_acculynx_reconciliation.delta_pct`, checked by a scheduled SQL function | The data needed already lives in Postgres; no external monitoring stack is justified for one integration's health checks |
| Alert delivery | A custom notification microservice | Existing Slack webhook/bot posting path (`postSlackMessage()` or a direct `net.http_post` to a Slack Incoming Webhook) + existing Sentry project | Both channels are already wired into this stack; adding a third notification layer duplicates existing infrastructure |
| Rate-limit compliance | A distributed rate limiter (Redis token bucket, etc.) | The existing serial-loop + fixed inter-request `sleep(130ms)` pattern already in `jobs.ts`/`contacts.ts` | Single-process, single-IP, well under the 30 req/s ceiling even fully serial — a distributed limiter solves a problem this integration doesn't have |
| Idempotent cron reschedule | Manual `DROP` + recreate scripts run by hand | `select cron.unschedule('old-job-name');` then `select cron.schedule('new-job-name', ...)` wrapped in a migration with existence checks (`select 1 from cron.job where jobname = '...'`) | pg_cron ships the exact primitives needed; wrap them in idempotent guards inside the migration, don't invent a new mechanism |

**Key insight:** Every piece of infrastructure this phase needs (async HTTP, scheduling, RLS, structured logging) already exists in this stack and is already partially wired for this exact integration. The work is *closing gaps in an existing design*, not introducing new architecture. The temptation to reach for something novel (a queue, a separate monitoring service, a new alerting SDK) should be resisted — every "Don't Hand-Roll" row above maps to a tool already present in this repo or this Supabase project.

## Runtime State Inventory

> This phase is hardening/cutover, not a rename/refactor, but it does change **live cron/pg_net wiring that is NOT captured in any committed migration file** (per `sync-pipeline.md` and the CONTEXT.md "Live DB is source of truth" note) — so the same discipline applies: what runtime state exists only in the live DB, outside git?

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `acculynx_sync_watermark` rows for `(kansas_city, jobs)` and possibly others likely have `last_api_count = 1` or NULL today (the legacy-path bug) — these are live rows, not schema. | Data verification during planning: query the live watermark table to confirm current `last_api_count` values before assuming the cutover alone fixes them (a stale `1` from a past legacy run will only be overwritten on the NEXT successful `multiAccount:true` run for that account/resource — not retroactively). |
| Live service config | **The pg_cron schedule itself (`cron.schedule(...)` call, currently daily 08:15 UTC) is NOT in any committed migration file** — confirmed via grep (`schemas/cleverwork-roofer/` has no `cron.schedule` or `trigger_acculynx_sync` definition). It was applied directly to the live DB, likely via Supabase MCP/dashboard, per the CONTEXT.md "Established Patterns" note. | The hourly cutover work in this phase MUST both (a) apply the change live AND (b) commit an additive migration capturing `cron.unschedule('<old-job-name>')` + `cron.schedule('<new-job-name>', '0 * * * *', ...)` to `schemas/cleverwork-roofer/172+` — closing the gap CONTEXT.md flags ("must be captured as an additive migration... AND applied to prod"). The exact current job name/id must be read live first (`select jobid, jobname, schedule, command from cron.job;`) — not knowable from the repo alone. |
| OS-registered state | None applicable — no OS-level task scheduler involved; pg_cron lives entirely inside Postgres. | None. |
| Secrets/env vars | Edge Function secrets `PE_CC_SANDBOX_ACCULYNX_API_KEY`, `PE_CC_KANSAS_CITY_ACCULYNX_API_KEY` (or similarly named per `env_secret_name` in `acculynx_accounts`), `PE_CC_WICHITA_ACCULYNX_API_KEY` currently set; the other 6 intentionally absent (D-08 gate). Slack bot tokens and `SENTRY_PERSONAL_TOKEN`/`SENTRY_AUTH_TOKEN` already exist per the respective skills. | No renames needed. The 6-account expansion (D-08/D-09) requires setting NEW edge secrets — a human-approved step, not a code change — using whatever exact `env_secret_name` values are registered in the live `acculynx_accounts` table (not verified in this session; read via `accounts.ts::AccountRow.env_secret_name` pattern but actual values are DB data). |
| Build artifacts | `acculynx-sync` is deployed at v19 (rollback target v12) — this is Supabase Edge Function *version* state, not a git artifact. Redeploying via `supabase functions deploy` (or Coolify-adjacent tooling — confirm the actual deploy path for Supabase Edge Functions specifically, which is separate from the Coolify-deployed Command Center app) will create v20+. | Confirm the deploy command for Supabase Edge Functions specifically (likely `supabase functions deploy acculynx-sync --project-ref rnhmvcpsvtqjlffpsayu`, via the `supabase` CLI already present at `/opt/homebrew/bin/supabase` in this environment) — this is a DIFFERENT deploy path from the Coolify skill, which only covers the Command Center Astro app. Document this distinction in the runbook (D-15). |

**Nothing found in category:** OS-registered state — verified by direct reasoning (pg_cron is Postgres-internal; no external OS scheduler is part of this integration).

## Common Pitfalls

### Pitfall 1: Reconciliation job races the same TTL it's trying to beat
**What goes wrong:** A reconciliation cron scheduled too infrequently (e.g., hourly, aligned with the sync itself) risks missing responses if pg_net's worker or the DB is briefly degraded for more than the gap between reconciliation runs stacked against the 6h TTL — low risk at 6h TTL with hourly reconciliation, but the margin shrinks if `pg_net.ttl` is ever lowered by a platform change.
**Why it happens:** Treating "reconcile once per sync" as sufficient, rather than running reconciliation on its own faster, independent cadence.
**How to avoid:** Schedule reconciliation every 10-15 minutes (independent of the hourly sync cadence) — cheap (a single UPDATE...FROM join), and gives roughly 24-36x margin against the 6h TTL even if a run is missed once.
**Warning signs:** `v_acculynx_cron_outcomes` shows a stretch of `pending`/unreconciled rows immediately followed by rows that are simply absent (no error, no success) — that gap is TTL-purged, unrecoverable data.

### Pitfall 2: Confusing "cron fired" with "HTTP succeeded" with "sync succeeded"
**What goes wrong:** Alerting logic checks only one of `cron.job_run_details.status`, `net._http_response.status_code`, or `crm_sync_log.status` and misses failure modes that only show up in the other two.
**Why it happens:** These are three independent success signals at three different layers (pg_cron trigger fired → pg_net delivered the HTTP request → the edge function's own logic completed without error), and each can fail while the others succeed.
**How to avoid:** D-05's four alert conditions should be built to read the specific layer where each failure mode is detectable: (a) failed run → `crm_sync_log.status='failed'` OR `net._http_response.status_code >= 400/500`; (d) unreconciled pg_net → a request_id present in the dispatch log with no matching `net._http_response` row past the grace window (catches pg_net/network-layer failures crm_sync_log can never see).
**Warning signs:** An alert fires for "failed run" but `crm_sync_log` shows no matching batch at all — that's actually the (d) unreconciled-dispatch case being mis-triaged as (a).

### Pitfall 3: NOT NULL constraint migration blocked by pre-existing NULL rows
**What goes wrong:** `ALTER TABLE acculynx_contacts ALTER COLUMN account_key SET NOT NULL;` fails outright (Postgres rejects it) because the 8 legacy rows (3 contacts, 3 job_contacts, 1 financial, 1 insurance — per 02-VERIFICATION.md) still have NULL `account_key`.
**Why it happens:** D-11 (enforce provenance NOT NULL) and the Phase-2 carry-forward item "stamp/triage the 8 legacy NULL rows" are two different decisions in the same CONTEXT.md, and it's easy to plan them as independent, parallelizable tasks when they actually have a hard ordering dependency.
**How to avoid:** Sequence explicitly: triage/stamp (or archive) the 8 legacy rows FIRST, in their own migration/task, verify zero NULL `account_key` rows remain, THEN add the NOT NULL constraint in a subsequent migration.
**Warning signs:** A migration fails at apply time with `column "account_key" contains null values` — this is Postgres correctly refusing an inconsistent constraint, not a bug in the constraint SQL.

### Pitfall 4: Hourly, all-accounts, all-resources fan-out exceeds the 110s budget before it exceeds rate limits
**What goes wrong:** D-02's "incremental for all wired accounts first, then a bounded backfill slice" sounds safe, but once `job-walk` (which does sub-resource per-job HTTP calls — job-contacts, financials, insurance, milestone-history, invoices) runs across even just 2 accounts (kansas_city ~166 jobs live, wichita ~1,284+ jobs live per 02-VERIFICATION.md) inside a single 110s window, the bottleneck is very plausibly wall-clock time (sequential paced requests), not the 30 req/s IP ceiling. At `PACE_MS=130` (~7.7 req/s) per resource stream, a single account's incremental-only pass could already consume a meaningful fraction of 110s before backfill even starts.
**Why it happens:** The 110s budget was sized and proven for kansas_city+wichita jobs+contacts (Phase 2); adding job-walk sub-resources and eventually 6 more accounts multiplies the serial workload without multiplying the budget.
**How to avoid:** During planning, explicitly size per-account, per-resource call counts against the 110s budget using known row counts (166 + 1,284+ jobs, 70+62 contacts, etc.) BEFORE assuming "incremental first" always completes within budget for all wired accounts every single hour. If it doesn't, D-02's design already anticipates this (per-page watermark resume across runs) — but the alerting layer (D-05b, stale watermark) must not fire false positives for resources that are legitimately mid-multi-hour-backfill by design, only for resources that have genuinely stalled.
**Warning signs:** `result.accounts[acct].jobWalk` consistently returns before completing all jobs even on incremental-only runs; watermark `last_page_index`/`last_walked_job_id` advancing very slowly hour over hour.

## Code Examples

### Correlating a pg_net request to its response
```sql
-- Source: Supabase pg_net docs (https://supabase.com/docs/guides/database/extensions/pg_net)
-- net.http_post() returns the request id synchronously; the response arrives later.
select net.http_post(
  url := 'https://<project-ref>.supabase.co/functions/v1/acculynx-sync',
  headers := jsonb_build_object('Authorization', 'Bearer <service-role-or-anon-key>', 'Content-Type', 'application/json'),
  body := jsonb_build_object('multiAccount', true)
) as request_id;
-- request_id is a bigint — INSERT it into an owned dispatch-log table immediately
-- so the reconciliation function has something to join against even before
-- net._http_response has a matching row yet.

-- Later (within pg_net.ttl, default 6h):
select id, status_code, timed_out, created
from net._http_response
where id = <request_id>;
```

### Existing house RLS pattern (verbatim, from this repo)
```sql
-- Source: schemas/cleverwork-roofer/76-app-settings-and-agreement-id.sql (this repo, already deployed)
ALTER TABLE public.app_setting ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_setting FROM anon, authenticated;
GRANT  ALL ON public.app_setting TO service_role;
```

### Existing pace-limited fetch pattern (jobs.ts, already correct — reuse, don't rewrite)
```typescript
// Source: supabase/functions/acculynx-sync/resources/jobs.ts (this repo, deployed v19)
// apiCount is ALREADY correctly captured — the "last_api_count stores 1" bug is in the
// LEGACY index.ts path (legacySyncJobs), not here. Confirm this during planning/execution
// by reading live watermark rows before writing a "fix jobs last_api_count" task.
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

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Daily 08:15 UTC, users+jobs only, single Kansas key, legacy `index.ts` code path | Hourly, all wired accounts, all synced resources, `multiAccount:true` path | This phase (D-01/D-03) | Retires `legacySyncJobs`/`legacySyncUsers` from the scheduled hot path; those functions can remain in the file for manual/backward-compat invocation but should no longer be what the cron calls |
| `net._http_response` read directly (or not read at all — current state) | Reconciled into an owned table on a fast independent cadence | This phase | Removes the TTL blind spot; makes `v_acculynx_cron_outcomes` durable and queryable beyond 6 hours |
| No RLS / unclear RLS status on `acculynx_*` tables (docs/knowledge-base claims "RLS enabled" but this is unverified against the live DB this session — see Open Questions) | RLS enabled deny-by-default, service_role-only, house pattern | This phase (D-14) | Closes a potential anon/public read exposure if the docs claim is aspirational rather than actual current state |

**Deprecated/outdated:**
- The v10 single-account `legacySyncUsers`/`legacySyncJobs`/`resolveLeadMilestones` functions in `index.ts` become effectively dead code once the cron always passes `multiAccount:true` — recommend NOT deleting them this phase (hard rule 1 spirit: don't remove working fallback code without a clear reason), but do stop invoking them from the scheduled trigger.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | The current daily cron invokes the legacy (`multiAccount` absent/false) code path, which is why `last_api_count` never gets set for jobs. | Summary, Pitfall/Code Examples | If the live `trigger_acculynx_sync` SQL function actually already passes `multiAccount:true` today, this diagnosis is wrong and a separate code bug exists in the Phase-2 path that needs direct investigation. **Verify live**: `select command from cron.job where jobname ilike '%acculynx%';` |
| A2 | `docs/knowledge-base/acculynx/data/tables.md`'s claim "RLS enabled (service-role writes)" describes an ASPIRATIONAL/forward-looking state (written 2026-06-30, same day as Phase 3 context gathering) rather than the actual current live-DB state. | Runtime State Inventory, State of the Art | If RLS is in fact already fully enabled deny-by-default on all `acculynx_*` tables, D-14's task becomes an audit/verification task rather than an implementation task — lower-risk either way, but the plan should not assume RLS is entirely un-done without checking `select relrowsecurity from pg_class where relname like 'acculynx_%';` live first. |
| A3 | pg_net's default `pg_net.ttl` is 6 hours on this specific Supabase project (`rnhmvcpsvtqjlffpsayu`) and has not been customized. | Standard Stack, Pattern 1 | If the project has a shorter custom TTL, the reconciliation cadence recommendation (every 10-15 min) still holds with wide margin; if customized LONGER, no risk. Only a risk if TTL were customized to something very short (e.g., minutes) — verify with `show pg_net.ttl;` live. |
| A4 | The Edge Function deploy path for `acculynx-sync` specifically is the `supabase` CLI (`supabase functions deploy`), separate from the Coolify-based Command Center app deploy. | Runtime State Inventory | If deploy actually flows through some other mechanism (e.g., a CI pipeline, or Coolify also proxies Supabase function deploys), the runbook (D-15) would document the wrong rollback procedure. Low risk — `supabase` CLI is present in this environment and is Supabase's standard tool for this. |
| A5 | Sentry alerting from the Deno Edge Function runtime is feasible using a `fetch`-based envelope POST to the Sentry ingest endpoint (the DSN is public, per the sentry skill), without necessarily needing the full `@sentry/node`/`@sentry/deno` SDK inside the edge function. | Don't Hand-Roll, Package Legitimacy Audit | If a full SDK is actually required for correct envelope formatting/retry semantics, a new package (`@sentry/deno` or similar) would need to be added and would then require the Package Legitimacy Gate — flag this for the planner to decide with a concrete spike/test rather than assuming raw fetch suffices. |

## Open Questions

1. **Does the live `trigger_acculynx_sync(...)` SQL function currently pass `multiAccount:true`, and what is the exact current pg_cron job name?**
   - What we know: `sync-pipeline.md` documents the call as `trigger_acculynx_sync('["users","jobs"]')` (a resources array, not a `multiAccount` flag) — this is consistent with A1 (legacy path).
   - What's unclear: The exact current SQL function body, its parameter shape, and the exact `cron.job.jobname` needed to `cron.unschedule()` it cleanly. None of this is captured in any committed migration.
   - Recommendation: First task of Phase 3 execution (or a planning-time spike) should be `select jobid, jobname, schedule, command from cron.job;` and `select prosrc from pg_proc where proname = 'trigger_acculynx_sync';` against the live DB, via Supabase MCP or `supabase db` tooling, before writing the cutover migration.

2. **What is the actual current RLS status of each `acculynx_*` table?**
   - What we know: One doc (`tables.md`) claims RLS is already enabled; CONTEXT.md/D-14 treats it as not-yet-done; no RLS-enabling statements for `acculynx_*` tables exist in any committed migration file (migrations 165-171 reviewed, none contain `ENABLE ROW LEVEL SECURITY`).
   - What's unclear: Whether RLS was enabled directly on the live DB (same "live DB is source of truth, not migrations" pattern noted elsewhere) without a corresponding committed migration, or whether the docs claim is simply aspirational/wrong.
   - Recommendation: `select relname, relrowsecurity from pg_class where relname like 'acculynx_%' and relkind = 'r';` live, before planning D-14 tasks — this determines whether the work is "enable RLS on N tables" or "audit + close policy gaps on tables that already have RLS enabled."

3. **What are the current `acculynx_sync_watermark.last_api_count` values, specifically for `(kansas_city, jobs)` and `(wichita, jobs)`?**
   - What we know: 02-VERIFICATION.md states jobs `last_api_count` "stores `1`" as of Phase 2 close.
   - What's unclear: Whether this is true for ALL accounts/resources or specifically the legacy-path-synced jobs rows; whether a stale `1` value will self-correct on the next `multiAccount:true` run or needs a manual UPDATE to unblock reconciliation sooner.
   - Recommendation: `select account_key, resource_type, last_api_count, last_modified_date, last_sync_at from acculynx_sync_watermark order by account_key, resource_type;` live before finalizing whether "fix jobs last_api_count" needs any code change at all (current evidence from reading `jobs.ts` suggests it may not).

4. **Which Slack channel should D-05 alerts post to, and under which agent identity (or the `@openbrain` fallback)?**
   - What we know: The `slack-agents` skill documents per-agent identities and several channels, but none are obviously "AccuLynx ingestion ops" — the closest is `#service-warranty-audit` or a generic ops channel; `ob-dev-internal`/`ob-ops-conductor` are private and would need a bot invite.
   - What's unclear: Whether a new channel should be created for AccuLynx cron alerts, or an existing one repurposed. This is explicitly Claude's Discretion per D-15's CONTEXT.md note ("exact Slack channel... align with /slack-agents").
   - Recommendation: Default to `#cc-proexteriors` (already the Sentry Slack-integration channel per the `sentry` skill) for consistency — one ops channel for both error classes — unless the user prefers a dedicated channel; confirm at planning time, not blocking research.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| `supabase` CLI | Edge Function deploy, potential local migration apply | ✓ | present at `/opt/homebrew/bin/supabase` (version not checked this session) | — |
| Supabase MCP / direct live-DB query tool | Verifying live cron schedule, RLS status, watermark values (Open Questions 1-3) | ✗ (not available in this research session — no `mcp__supabase__*` tools, no `SUPABASE_SERVICE_ROLE_KEY` in local `config/.env`) | — | Planner/executor MUST resolve Open Questions 1-3 via Supabase MCP (if available in their session) or Supabase Dashboard SQL editor before finalizing the cutover/RLS/watermark-fix tasks. This is a **blocking gap for plan verification, not for plan authorship** — the plan can be written now with explicit verification tasks as Wave 0. |
| Slack bot tokens (`slack-agents` skill) | Alert delivery | ✓ (per skill doc; tokens live in gitignored `config/.env` + Coolify, not independently re-verified this session) | — | — |
| Sentry tokens (`SENTRY_PERSONAL_TOKEN`, `SENTRY_AUTH_TOKEN`) | Alert-rule creation, error capture | ✓ (per skill doc, not independently re-verified this session) | — | — |
| Deno test runner | Edge function unit tests (Validation Architecture) | ✓ (established in Phase 2: `deno test supabase/functions/acculynx-sync/ --allow-env --allow-net=localhost`) | — | — |

**Missing dependencies with no fallback:**
- None — the one gap (direct live-DB query access in THIS research session) has a clear fallback: defer those specific verifications to a Wave 0 planning/execution task with Supabase MCP or dashboard access, which the executing agent is expected to have (per CLAUDE.md's project-wide pattern of verifying against the live DB).

**Missing dependencies with fallback:**
- Live DB query access (this session) → Wave 0 verification tasks in the plan, using Supabase MCP or SQL editor at execution time.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Deno's built-in test runner (`Deno.test`), already established in Phase 2 |
| Config file | None dedicated — invoked directly via `deno test <path> <flags>` (no `deno.json` test config found in `supabase/functions/`) |
| Quick run command | `deno test supabase/functions/acculynx-sync/lib/ --allow-env` |
| Full suite command | `deno test supabase/functions/acculynx-sync/ --allow-env --allow-net=localhost` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| REQ-07 (SC1: hourly cutover) | pg_cron schedule fires hourly with `multiAccount:true`; old daily job unscheduled | SQL/manual (cron internals are not unit-testable in Deno) | `select jobname, schedule from cron.job where jobname ilike '%acculynx%';` (expect exactly one row, schedule `0 * * * *`) | ❌ Wave 0 — no automated test exists; this is a live-DB assertion, run manually or via a lightweight SQL check script |
| REQ-07 (SC2: pg_net reconciliation) | `reconcile_acculynx_cron_outcomes()` correctly joins dispatch log to `net._http_response` and persists status | unit (SQL fn logic can be tested with a seeded fixture) or integration (real pg_net round trip against sandbox) | New: `deno test supabase/functions/acculynx-sync/lib/reconcile.test.ts --allow-env` (if reconciliation logic is expressed as testable TS) OR a `psql`-based fixture test | ❌ Wave 0 — new test file needed |
| REQ-07 (SC2: alerting fires) | `check_acculynx_alerts()` posts to Slack/Sentry when a condition is injected (e.g., a synthetic stale watermark row) | integration (seed a stale watermark row in sandbox, run the check fn, assert a webhook call was made — mockable via a test webhook URL) | Manual/scripted SQL fixture + webhook capture (e.g., point at `webhook.site` or a local echo server during testing) | ❌ Wave 0 — no automated harness exists yet; recommend a manual verification runbook step at minimum, with an optional scripted test as a stretch goal |
| REQ-07 (SC3: watermark resume) | Interrupting a run mid-sweep and re-invoking resumes from `last_page_index`/`last_walked_job_id` without re-fetching or skipping | unit (already covered) | `deno test supabase/functions/acculynx-sync/lib/watermark.test.ts --allow-env` | ✅ exists |
| REQ-07 (SC3: markNotSeen never deletes) | Diff detection uses `.update()` only | unit (already covered, asserts delete spy never invoked) | `deno test supabase/functions/acculynx-sync/lib/diff.test.ts --allow-env` | ✅ exists |
| REQ-07 (SC4: RLS deny-by-default) | `anon`/`authenticated` cannot SELECT from `acculynx_*` tables; `service_role` can | integration (requires a live/sandbox DB connection with each role's key) | `psql` fixture test using anon key vs service-role key against a sandbox project, or Supabase's `pgTAP`-style RLS test pattern | ❌ Wave 0 — no automated test exists; minimum bar is a manual verification step (attempt a `select` with the anon key, expect empty/denied) documented in the security posture doc (D-13) |
| REQ-07 (Carry-forward: last_api_count fix) | `(account_key, jobs)` watermark rows show a real API count, not `1`, after a `multiAccount:true` run | unit (jobs.test.ts already asserts `apiCount` is captured correctly) + live verification | `deno test supabase/functions/acculynx-sync/resources/jobs.test.ts --allow-env --allow-net=localhost` (unit) + live query per Open Question 3 | ✅ unit test exists; live verification is Wave 0 |
| REQ-07 (Carry-forward: NULL provenance rows) | 8 legacy rows triaged (stamped or archived); NOT NULL constraint then holds | SQL/manual | `select count(*) from acculynx_contacts where account_key is null;` (repeat per affected table; expect 0 before adding the constraint) | ❌ Wave 0 — data-fix verification, not a unit test |
| REQ-07 (Carry-forward: trust invariants — rot guards) | Duplicate GUID / orphan sub-resource / NULL-provenance / stale-tail monitoring views return zero rows (healthy) or correctly flag known-bad rows (injected fixture) | integration (seed a duplicate/orphan fixture, assert the view surfaces it) | New: a scripted SQL fixture test, or a `deno test` that seeds via the service-role client and queries the view | ❌ Wave 0 — new views + new tests needed |

### Sampling Rate
- **Per task commit:** `deno test supabase/functions/acculynx-sync/lib/ --allow-env` (fast, no network)
- **Per wave merge:** `deno test supabase/functions/acculynx-sync/ --allow-env --allow-net=localhost` (full suite) PLUS the live-DB assertion queries listed above for any SQL-only requirement touched in that wave
- **Phase gate:** Full Deno suite green AND every "❌ Wave 0" row above has either an automated test or an explicit documented manual-verification step performed and recorded (e.g., in the security posture doc for RLS, in the runbook for alert-firing) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `supabase/functions/acculynx-sync/lib/reconcile.test.ts` — covers pg_net reconciliation join logic (if expressed as testable TS rather than pure SQL)
- [ ] A SQL fixture/manual-check script for cron schedule assertion (`select jobname, schedule from cron.job ...`) — not a Deno test, but should be a committed, runnable artifact (e.g., `scripts/verify-acculynx-cron.sql`) rather than a one-off command typed at execution time
- [ ] A manual (or scripted) alert-firing verification procedure — seed a synthetic failure/staleness condition, confirm Slack + Sentry both receive it, document the exact steps in the runbook (D-15) so it's repeatable, not just a one-time proof
- [ ] A manual RLS verification procedure (anon-key SELECT attempt vs service-role-key SELECT attempt) — document in the security posture doc (D-13)
- [ ] New rot-guard monitoring view tests — seed known-bad fixtures (duplicate GUID, orphan sub-resource, NULL provenance, stale-tail) and assert each view surfaces exactly the expected rows

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|-----------------|---------|--------------------|
| V2 Authentication | No — no user-facing auth surface changes in this phase | — |
| V3 Session Management | No | — |
| V4 Access Control | Yes | RLS deny-by-default (D-14), house pattern (`ENABLE ROW LEVEL SECURITY` + `REVOKE`/`GRANT`); service_role/least-privilege separation between the Edge Function (write) and dashboard server route (read-only, same service_role key today — no additional read-only role currently exists, worth noting in the security posture doc as a possible future hardening, not required by D-14 as scoped) |
| V5 Input Validation | Yes | AccuLynx API responses are external, untrusted input. D-10's "tag & segregate untrusted free-text" is the primary control — free-text fields (notes, descriptions, names) must be stored with an explicit untrusted-content/evidence-tier marker, never interpreted as instructions downstream. This is a data-labeling control, not a traditional schema-validation library (no Zod/Joi equivalent identified as needed — the existing camelCase→snake_case explicit field mapping in `jobs.ts`/`contacts.ts` already acts as an allow-list, rejecting unknown fields by construction since it never uses `...item` spread, per the code comments) |
| V6 Cryptography | No new cryptography introduced — AccuLynx API keys are Bearer tokens over HTTPS (existing `Authorization: Bearer ${apiKey}` pattern), stored as Supabase Edge Function secrets (platform-managed encryption at rest), never in code or committed files (hard rule 2, already honored per Rule-2 comments throughout the codebase) | Continue existing pattern; no changes needed |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Secret leakage via logging | Information Disclosure | Already mitigated: `resolveKey()`/`accounts.ts` only ever logs `env_secret_name` (the NAME), never `Deno.env.get()`'s return value (hard rule 2, T-02-05 per code comments). Verify this discipline is preserved in any new alerting code (Slack/Sentry messages must never include the raw API key or full request headers) |
| Cross-account data bleed | Tampering / Information Disclosure | Already mitigated via explicit `account_key`/`market` stamping on every row (T-02-04) and per-account watermark isolation (migration 171 composite PK). D-11's NOT NULL constraint is the structural backstop making a future regression impossible, not just tested-against |
| Prompt/instruction injection via ingested free-text (notes, job names) reaching an LLM agent later | Elevation of Privilege (in the STRIDE-for-AI sense — untrusted data treated as instructions) | D-10: label all AccuLynx free-text as untrusted-content/evidence-tier at ingestion time; this phase does NOT build the agent-side defense (deferred to REQ-09) but MUST ensure the label/boundary exists so REQ-09 can consume it correctly later. Recommend a dedicated boolean or tier column (or reuse an existing `trust_tier`/`data_source` convention if the brain's atom schema already has one — not confirmed in this session, worth checking `schemas/ob1-base/` during planning) |
| Unreconciled/silent ingestion failure masking a real outage | Denial of Service (in the sense that stale data silently degrades trust without anyone knowing) | D-05's four alert conditions directly target this — the entire reconciliation + alerting design in this research IS the mitigation |
| RLS misconfiguration exposing `acculynx_*` PII (contact names, phones, addresses) to `anon`/public | Information Disclosure | D-14, Pattern 2 above — deny-by-default is the standard control; verify via the manual RLS check in Validation Architecture before considering this closed |

## Sources

### Primary (HIGH confidence)
- `supabase/functions/acculynx-sync/index.ts` (this repo, read directly) — legacy vs. Phase-2 code path split, `last_api_count` bug root cause
- `supabase/functions/acculynx-sync/resources/jobs.ts` (this repo, read directly) — confirms `apiCount` IS correctly captured in the Phase-2 path
- `supabase/functions/acculynx-sync/lib/{accounts,watermark,diff}.ts` (this repo, read directly)
- `schemas/cleverwork-roofer/170-acculynx-reconciliation-view.sql`, `171-acculynx-watermark-pk-fix.sql` (this repo, read directly)
- `schemas/cleverwork-roofer/76-app-settings-and-agreement-id.sql`, `148-stormwatch-full-field-contract.sql` (this repo, read directly) — house RLS pattern
- `app/command-center/src/lib/supabase.server.ts`, `live-work.ts`, `weekly-snapshot.ts` (this repo, read directly) — confirms server-only service_role dashboard reads
- [Supabase pg_net docs](https://supabase.com/docs/guides/database/extensions/pg_net) — schema, TTL, request/response correlation
- [Supabase pg_cron docs](https://supabase.com/docs/guides/database/extensions/pg_cron) — scheduling, unscheduling, overlap behavior
- [pg_net GitHub Issue #80](https://github.com/supabase/pg_net/issues/80) — TTL-not-respected bug, confirmed fixed via PR #81

### Secondary (MEDIUM confidence)
- WebSearch-sourced summary of `cron.job_run_details` columns (jobid, runid, status, return_message, start_time, end_time, jobname) — not independently cross-verified against a live Supabase project this session; standard pg_cron table shape, low-risk claim
- WebSearch-sourced Supabase RLS/service_role bypass behavior — cross-verified against the [official RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security) via the same search and against this repo's own existing, deployed RLS pattern (migrations 76/148)

### Tertiary (LOW confidence)
- None — all findings either verified in-repo or cross-referenced against official Supabase documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every component (pg_cron, pg_net, Deno Edge Functions, Supabase JS client) is already deployed and proven in this exact codebase; no new tooling introduced
- Architecture: HIGH — the reconciliation/alerting design is derived directly from reading the live edge function code and cross-referencing official pg_net/pg_cron documentation; the RLS pattern is copied verbatim from this repo's own prior work
- Pitfalls: MEDIUM-HIGH — pitfalls 1-3 are grounded in verified code/docs; pitfall 4 (110s budget sizing) is a reasoned projection from known row counts, not a live-measured runtime, and should be validated with real timing data during execution
- Runtime state / live DB facts (cron schedule contents, current RLS status, current watermark values): MEDIUM — these are documented in CONTEXT.md/PROJECT.md/02-VERIFICATION.md (themselves produced by live-DB verification in prior phases) but were NOT independently re-queried in this research session (no Supabase MCP or service-role key available); flagged explicitly as Open Questions requiring a Wave 0 verification task

**Research date:** 2026-06-30
**Valid until:** 2026-07-14 (14 days — this phase touches live, frequently-changing runtime DB state; the pg_net/pg_cron documentation portions are stable for the full 30-day default, but the live-DB-specific findings should be re-verified if planning is delayed more than ~2 weeks)
