---
type: runbook
title: AccuLynx Ingestion — Recovery Runbook
description: Recover the hourly pull-based AccuLynx sync — stuck pg_net, watermark rewind, edge-fn rollback, rate-limit lockout, secret rotation, torn backfill.
resource: https://supabase.com/dashboard/project/rnhmvcpsvtqjlffpsayu/functions
tags: [acculynx, ingestion, pg_cron, edge-function, watermark, runbook]
timestamp: "2026-07-01"
---

# AccuLynx Ingestion Recovery Runbook

The live ingestion is the Supabase Edge Function `acculynx-sync`, driven by
`pg_cron → pg_net`, reconciled by an owned dispatch table, and alerted on by a
SQL check function. This runbook makes recovery repeatable by anyone — not just
the author. See [Sync Pipeline](sync-pipeline.md) for the architecture.

**Golden rules (hard rules 1 & 2):** every recovery step here is **additive or
reversible** — you `UPDATE` a watermark, you never `DELETE` its row; you
`cron.unschedule` then re-schedule, you never `DROP`; you redeploy a prior edge
version, you never destroy the current one. **No secret value is ever typed into
a migration, a log, an `execute_sql` call, or this document** — only env var and
Vault secret *names*.

## Preconditions

- Supabase project ref: `rnhmvcpsvtqjlffpsayu` (the shared prod client brain).
- Edge deploy is CLI-only (independent of the Coolify Command-Center deploy):
  `supabase functions deploy acculynx-sync --project-ref rnhmvcpsvtqjlffpsayu`.
  Current version: **v19**. Last known-good rollback target: **v12**.
- Cron jobs (`cron.job`): one **hourly** sync `0 * * * *` (drives
  `multiAccount:true`), one reconcile `*/10 * * * *`, one alert-check `*/15 * * * *`.
- DB writes during recovery go through the Supabase SQL editor / dashboard (so a
  secret never transits an agent tool) or `psql $DATABASE_URL`.

## Health check

Run this **first** on any suspected problem — it is the single gate that tells
you whether the cron is in its hardened state and whether any dispatch is stuck:

```bash
psql "$DATABASE_URL" -f scripts/verify-acculynx-cron.sql
```

Healthy output:
- **Section 1** — exactly one `%acculynx%` sync row at schedule `0 * * * *` whose
  command drives `multiAccount:true`; **no** legacy `acculynx-sync-daily` row.
- **Section 2** — **zero** rows (every pg_net dispatch reconciled within the
  30-minute grace window).

Any Section-2 row → go to **Scenario A**. A missing/duplicate/daily Section-1 row
→ go to **Scenario D** (schedule surgery).

## Scenario A — Stuck / pending pg_net dispatch

**Symptom:** `verify-acculynx-cron.sql` Section 2 returns rows, or
`v_acculynx_cron_outcomes` shows runs stuck `pending`, or the alert
`unreconciled pg_net >30min` (D-05d) fires.

**Cause:** a `pg_net` request completed but its response in the transient
`net._http_response` table (6h TTL) was never copied into the owned
`acculynx_cron_dispatch` before the reconcile cron could read it, or the reconcile
cron itself stopped.

**Recover:**
1. Confirm the reconcile cron is scheduled: `select jobname, schedule, active from cron.job where jobname ilike '%reconcile%';` — expect `*/10 * * * *`, `active = t`.
2. Reconcile manually (idempotent — copies outcomes from `net._http_response` into the owned table):
   ```sql
   select public.reconcile_acculynx_cron_outcomes();
   ```
3. Inspect what is still unreconciled:
   ```sql
   select request_id, dispatched_at, status_code, reconciled_at
   from public.acculynx_cron_dispatch
   where reconciled_at is null and dispatched_at < now() - interval '30 minutes'
   order by dispatched_at;
   ```
4. If a row is genuinely lost (dispatched >6h ago, response purged past TTL), it
   is safe to leave — the next hourly run re-pulls from the watermark; the sync is
   incremental, not fire-once. Do **not** delete the dispatch row (audit trail).
5. Re-run the health check to confirm Section 2 is empty.

## Scenario B — Watermark rewind / reset

**Symptom:** an account/resource is missing recent records, double-pulled, or a
bad `last_modified_date` is skipping a window; or you must intentionally re-pull a
range after fixing a mapping bug.

**Cause:** the incremental cursor
(`acculynx_sync_watermark`, composite PK `(account_key, resource_type)`) advanced
past data that needs re-fetching, or is parked on a bad value.

**Recover — UPDATE only, never DELETE the row:**
```sql
-- Rewind one account/resource to re-pull from a chosen point.
-- Set the modified-date cursor back; reset paging to the start of the window.
update public.acculynx_sync_watermark
set last_modified_date = '2026-06-01T00:00:00Z',   -- choose a safe earlier point
    last_page_index    = 0
where account_key = 'kansas_city' and resource_type = 'jobs';
```
- Rewinding is **safe**: all resource tables upsert on the AccuLynx GUID
  (`id` PK), so re-pulling overwrites-in-place, never duplicates.
- Never `DELETE` the watermark row — a missing row silently blocks that
  account/resource from ever paging (this is exactly the single-col-PK bug
  migration 171 fixed). If a row is missing, `INSERT` it, don't rely on the fn.
- After the edit, let the next hourly run pick it up, or trigger once (Scenario F).

## Scenario C — Edge function rollback (v19 → v12)

**Symptom:** a freshly deployed `acculynx-sync` version regresses (e.g. a mapping
bug, an infinite page loop, a new hard-failure) and you need to fall back fast.

**Recover:**
1. Identify the last known-good source. v12 is the documented rollback target;
   the current source of record is `supabase/functions/acculynx-sync/` on `main`.
   To roll back, check out the prior known-good source:
   ```bash
   git log --oneline -- supabase/functions/acculynx-sync   # find the good commit
   git checkout <good_sha> -- supabase/functions/acculynx-sync
   ```
2. Redeploy (this is what advances/replaces the live version — deploy is the only
   version control Supabase Edge exposes):
   ```bash
   supabase functions deploy acculynx-sync --project-ref rnhmvcpsvtqjlffpsayu
   ```
3. Verify: trigger one run (Scenario F) and confirm `v_acculynx_cron_outcomes`
   shows `success` and no new hard-failure alert fires.
4. Restore your working tree (`git checkout main -- supabase/functions/acculynx-sync`)
   once the fix-forward is ready; do not leave the tree on an old checkout.

Edge secrets are **not** redeployed with code — they persist across deploys
(Scenario E covers rotating them).

## Scenario D — Rate-limit lockout (429)

**Symptom:** repeated `429 Too Many Requests` from the AccuLynx API; runs failing
on `Retry-After`; alert on failed dispatch (`status_code >= 400`).

**Cause:** AccuLynx enforces 30/10 req/s limits (see
[Auth & Rate Limits](../api/auth-and-limits.md)). The edge fn already backs off
(429 → `Retry-After` + exponential backoff, 3 retries), so a sustained lockout
means concurrent runs or an upstream throttle.

**Recover — pause, drain, resume (reversible schedule surgery):**
```sql
-- 1. Pause the hourly sync so no new run piles on. Note the jobname from Section 1 of the health check.
select cron.unschedule('<acculynx-hourly-jobname>');

-- 2. Wait out the window (minutes). Confirm no in-flight dispatch:
select count(*) from public.acculynx_cron_dispatch
where reconciled_at is null and dispatched_at > now() - interval '30 minutes';

-- 3. Re-schedule identically (this is the reverse of step 1 — never DROP the job definition):
select cron.schedule('<acculynx-hourly-jobname>', '0 * * * *', $$select public.trigger_acculynx_sync('{"multiAccount":true}'::jsonb)$$);
```
Re-run the health check to confirm exactly one hourly row is back.

## Scenario E — Secret rotation

**Symptom:** an API key or the alert bot token is rotated/compromised and must be
replaced without a code change.

**Recover (no code deploy needed):**
- **Per-account AccuLynx API key** — set the Edge secret by its *name* (the value
  is resolved at runtime via `Deno.env` only; the code references only
  `env_secret_name`, never the value):
  ```bash
  supabase secrets set PE_CC_<LOC>_ACCULYNX_API_KEY=<new_value> --project-ref rnhmvcpsvtqjlffpsayu
  ```
- **Slack alert bot token** — it lives in Supabase **Vault** as
  `acculynx_alert_slack_bot_token`, read by `check_acculynx_alerts()`. Rotate it
  from the **Supabase SQL editor / dashboard** (so the token never transits an
  agent tool):
  ```sql
  -- in the dashboard SQL editor only:
  select vault.update_secret(
    (select id from vault.secrets where name = 'acculynx_alert_slack_bot_token'),
    '<new xoxb token>');
  ```
- **Re-verify** with the alert seed→fire→observe procedure below. No code change,
  no redeploy — the fn and edge secrets resolve names at runtime.

## Scenario F — Re-running a torn backfill

**Symptom:** an in-progress multi-page backfill was interrupted (edge timeout,
crash, rollback) and you need to resume without re-pulling everything or losing
the tail.

**Cause:** by design the watermark advances **per page**, so a crash mid-backfill
leaves a valid resume point — a "torn" run resumes cleanly.

**Recover:**
1. Read the current cursor to confirm it advanced (not reset to 0):
   ```sql
   select account_key, resource_type, last_page_index, last_modified_date, last_sync_at
   from public.acculynx_sync_watermark
   where resource_type = 'jobs' order by account_key;
   ```
2. Do **nothing destructive** — just let the next hourly run continue from
   `last_page_index`, or trigger one immediately:
   ```sql
   select public.trigger_acculynx_sync('{"multiAccount":true}'::jsonb);
   ```
3. Each run is a **bounded slice** (per-page advance + runtime budget), so a large
   backfill completes over several hourly runs rather than one giant call — this
   is the intended pacing, not a fault. Watch `v_acculynx_cron_outcomes` for
   `success` and the watermark's `last_page_index` climbing.
4. If a resource must restart from the top, use **Scenario B** (rewind), never a
   delete.

## Alert verification (seed → fire → observe)

Prove the alerting path end-to-end after any change to it (from plan 03-03):
```sql
-- 1. Seed a synthetic stale condition (reversible):
update public.acculynx_sync_watermark
set last_sync_at = now() - interval '4 hours'
where account_key = 'kansas_city' and resource_type = 'jobs';

-- 2. Fire the detector:
select public.check_acculynx_alerts();   -- posts to ob-ops-conductor (C0BDF8QRF8A)

-- 3. Observe: confirm the message landed in #ob-ops-conductor, then restore:
update public.acculynx_sync_watermark
set last_sync_at = now()
where account_key = 'kansas_city' and resource_type = 'jobs';
```
Requires the `openbrain` bot to be a member of the (private) `ob-ops-conductor`
channel and the Vault secret `acculynx_alert_slack_bot_token` provisioned. If the
post returns `channel_not_found`, invite the bot; if it no-ops, the Vault secret
is unset (safe-fail by design).

## Rollback

- **Edge function:** redeploy the prior source (Scenario C) — deploy is the
  rollback mechanism.
- **Migration:** never roll back destructively. Every 172–180 migration is
  additive/idempotent; to reverse a schedule change, re-schedule (Scenario D); to
  reverse a watermark change, UPDATE it back (Scenario B). Legacy-row triage
  (mig 180) is UPDATE-only (archive flags), reversible by clearing `archived_at`.
- **Alerting:** unset the Vault secret to silence alerts safely
  (`check_acculynx_alerts()` no-ops with no token) without deleting the cron.

## 6-account expansion (canary-then-batch, 2026-07-01)

All 8 production accounts are now enabled (D-08 gate proven open — every KC+Wichita
reconciled resource ≤2% after the instrument + pagination fixes). D-09 sequence:

- **Canary:** `insurance_program` (smallest, 27 jobs) enabled first. contacts 28/28,
  estimates 1/1 (0.0%); no cross-account bleed; run well inside the 110s budget.
- **Batch:** colorado, florida, georgia, texas, multi_family_commercial enabled next.
  Each stamped correctly — `select distinct account_key from acculynx_jobs` returns
  exactly the 8 enabled accounts, zero bleed. contacts drain fully in one run
  (colorado 1909/1909, georgia 479/479, multi_family 369/369 — all 0.0%).

**Setting secrets — do NOT `source .env`.** `.env` line ~214 has a value zsh tries to
execute, so `source` aborts before the AccuLynx keys (lines 230+) and silently sets
EMPTY secrets (digest `e3b0c442…b855` = SHA-256 of ""). Set via a temp env-file
instead, then verify the digest is non-empty:
```bash
grep -E '^PE_CC_<ACCT>_ACCULYNX_API_KEY=' .env > /tmp/one.env
supabase secrets set --env-file /tmp/one.env --project-ref rnhmvcpsvtqjlffpsayu
shred -u /tmp/one.env
supabase secrets list --project-ref rnhmvcpsvtqjlffpsayu | grep <ACCT>   # digest must NOT be e3b0c442…
```
Edge secrets take ~30–60s to propagate before the fn resolves them (a too-soon run
skips the account: ~1s edge exec, no watermark written).

**RESOLVED (2026-07-01) — jobs sweep stalled at ~25/run (wrong pagination param).**
The jobs sweep (`resources/jobs.ts`) used `recordStartIndex`, which `/jobs` **silently
ignores** (a direct API probe showed `recordStartIndex=0` and `=25` return the
identical 25 rows) — so every page re-fetched the same 25, `offset` climbed to
`count`, and the loop ended with jobs stuck at 25 for every API-swept account
(georgia 25/470, texas 25/2300, colorado ~25/run). KC (166/166) and Wichita
(1284/1286) only looked complete because their jobs were loaded by the **legacy
backfill script**, not this sweep — which masked the bug. **Fix:** `/jobs` paginates
by `pageStartIndex` as a **record offset** (probe: `pageStartIndex=25` → records 26+;
`=460` → 10 tail records; `=470` → empty) — switched the sweep to `pageStartIndex`
(kept `offset += items.length`). Deployed + verified live (see the jobs-pagination
fix commit). Contacts/estimates were already correct (they use `pageStartIndex` as a
**page number**, `+= 1`). Docs corrected: [read-capability](../api/read-capability.md#pagination-split-a-real-quirk).
If a jobs sweep ever stalls again, first re-probe the endpoint's pagination unit.

## Backfill rotation (Phase 7 gap closure, 2026-07-02)

The 07-05..07-08 gap-closure plans rebuilt the sync to restore `crm_pipeline` writes,
fix job-walk sub-resource mapping, and add D-15 first-sight / D-16 change-driven pull
scheduling + D-18 fair-share account rotation. 07-09 deployed the rebuilt function
(v39 as of this writing) and kicked off the D-18 backfill: every one of the ~6,434
jobs across all 8 accounts gets its first-sight full pull (all job-walk sub-resource
endpoints) over a paced, multi-run rotation — not one giant call.

**Kickoff commands** — the default no-arg fan-out rotates across all 8 accounts
automatically (D-18 persisted cursor); to target one starved account explicitly (as
07-09 did for wichita, the account VERIFICATION.md flagged as budget-starved):
```sql
-- Default rotation (all enabled accounts, D-18 fair-share cursor):
select public.trigger_acculynx_sync('{"multiAccount":true}'::jsonb);

-- Targeted single-account backfill (own the account's full ~110s budget):
select public.trigger_acculynx_sync('{"multiAccount":true,"accountFilter":["wichita"]}'::jsonb);
```
Or via the CLI (no secrets ever transit this call): `supabase db query --linked`
with the same SQL piped on stdin.

**Expected multi-run pacing — this is by design, not a fault.** Each invocation has a
hard ~110s runtime budget (`RUNTIME_BUDGET_MS`, index.ts). For a never-before-walked
account, job-walk (7 endpoints/job + pacing sleeps) processes roughly 25-35 jobs per
run before the deadline is hit — `runAccountSync` returns before `syncCrmPipeline`
ever executes for that account this run (logged as `"crmPipeline":"skipped"` in the
`net._http_response` body, not an error). A 1,286-job account like wichita therefore
takes **dozens of runs across several hours** to complete its first-sight pass; the
hourly cron continues this automatically without any manual retrigger required.
`syncCrmPipeline`, once it DOES get a turn within an account's budget, re-reads that
account's ENTIRE `acculynx_jobs` + `acculynx_job_financials` and upserts all of them
into `crm_pipeline` in one pass (chunked by 200) — it is not scoped to only the jobs
job-walk touched that specific run, so the first successful crm_pipeline pass for an
account backfills every job walked so far, not just the newest ones.

**Watch progress:**
```sql
-- job-walk progress (last_walked_job_id advancing = forward progress, not stuck):
select account_key, last_walked_job_id, last_sync_at
from public.acculynx_sync_watermark where resource_type='job_walk' order by account_key;

-- Mapper health — must stay at/near zero; a spike means a mapper is wrong, not a pacing issue:
select resource_type, count(*) from public.acculynx_job_walk_errors
where occurred_at > now() - interval '1 hour' and resolved_at is null
group by resource_type order by count(*) desc;

-- crm_pipeline coverage growing per account (the dashboard's actual data source):
select count(*) from public.crm_pipeline
where data_source='api_sync' and updated_at > now() - interval '2 hours';
```

**07-09 live findings (wichita canary of the backfill):** the very first triggered run
surfaced 3 real mapper bugs the counted-error surface (07-05) was built to catch, all
fixed same-session (see `git log --grep 07-09` for the 3 fix commits) — verify-live-DB
over migration-file assumptions was required for two of them (a live schema
`GENERATED ALWAYS AS IDENTITY` column not matching the 169 migration file, and a real
AccuLynx milestone-history field shape `{date,name}` not the design-time-assumed
`{milestoneDate,milestoneName}`), plus one silently-broken D-16 skip query
(`acculynx_raw.created_at` does not exist; the real column is `fetched_at`) that had
made every job look like first-sight forever. After all three fixes: 0 job-walk
errors across multiple wichita runs, and the KS-11 ground-truth job (financials +
representatives) resolved correctly against the live API (`approved_job_value
30368.48`, `balance_due 17532.48`, company rep resolving to `Bob Smolek`) before
`crm_pipeline` itself had a budget turn to persist it.

## Owners

- **Ingestion / Data (AccuLynx):** owns watermark, backfill, and edge-fn recovery.
- **Ops Conductor:** owns the alert channel (#ob-ops-conductor) and the Vault
  secret; first responder to a fired alert.
- **Security Guardian:** owns secret rotation review and the
  [security posture](../security/posture.md).

## Citations

[1] `scripts/verify-acculynx-cron.sql` — health gate (schedule + stuck-dispatch).
[2] Migrations `173` (`acculynx_cron_dispatch`), `174` (`reconcile_acculynx_cron_outcomes()` + `*/10` cron), `175` (`v_acculynx_cron_outcomes` v2), `176` (`check_acculynx_alerts()` + `*/15` cron).
[3] Edge Function `acculynx-sync` (v39 as of 07-09's gap-closure deploy), project `rnhmvcpsvtqjlffpsayu`; rollback target v12 (pre-Phase-7; the last known-good version before the crm_pipeline/job-walk rebuild).
[4] [Sync Pipeline](sync-pipeline.md), [Account Registry](../accounts.md), [Auth & Rate Limits](../api/auth-and-limits.md).

## Troubleshooting: silent-truncation signatures (2026-07-03 incident family)

Five stacked live incidents shared one root class — data silently missing while everything
"reported ok". Check these signatures FIRST when counts look wrong:

| Signature | Root cause | Fix pattern |
|---|---|---|
| Works on small accounts, 400 "Bad Request" on big ones | `.in()` id-list blew the URL length cap | scope by `.eq("account_key",…)` or chunk ≤40 ids (playbook 9, docs/42) |
| A count lands EXACTLY on 1,000 (or any round limit) | unpaginated read at PostgREST max-rows | `pageAll` — `.order(stable).range()` loop (playbook 11) |
| A populated column loses rows after a sync pass | bulk-upsert column-UNION null-wipe | partition batch by column-presence (playbook 10) |
| Walk reports "ok" hourly, target table has 0 rows | warn-only error handling | counted errors → `acculynx_job_walk_errors` + alert condition (e) (mig 186) |
| Every location shows "stale" while cron is green | freshness computed over legacy NULL / job_walk watermark rows | freshness basis = per-account `jobs` (jobs/contacts/estimates) watermark only |

## Driver-loop recipe (force an account's backfill to completion)

The hourly cron finishes any backfill unattended, but to force one account through NOW
(e.g. after a fix, before a demo), loop the targeted trigger — each invocation owns the
account's full ~110s budget:

```bash
for i in $(seq 1 30); do   # ~30 runs finished a 1,286-job account
  # via Supabase MCP / psql:
  #   select public.trigger_acculynx_sync('{"multiAccount":true,"accountFilter":["wichita"]}'::jsonb);
  # or PostgREST: POST $SUPABASE_URL/rest/v1/rpc/trigger_acculynx_sync  {"p_resources":{...}}
  sleep 130
done
```
Pacing facts: ~25-35 first-sight walks per run; once the walk completes, EVERY subsequent run
executes the account's full `syncCrmPipeline` pass (whole-account refresh, not just new jobs).
Parallel loops on DIFFERENT accounts are safe (per-key rate limits). Session evidence: 2026-07-03
fleet backfill, 6,451/6,451 rows. The arg name is `p_resources` (`pg_get_function_identity_arguments`).
