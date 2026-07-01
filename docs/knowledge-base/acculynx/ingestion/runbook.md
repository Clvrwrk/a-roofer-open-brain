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

**KNOWN ISSUE — jobs sweep stalls at ~25/run (blocks large-account jobs backfill).**
The date-windowed jobs sweep (`resources/jobs.ts`) fetches only the first page
(`PAGE_SIZE=25`) then terminates, every run — observed uniformly across all
API-swept accounts (georgia 25/470, texas 25/2300, multi_family 25/352, colorado
crawls ~25/run). KC (166/166) and Wichita (1284/1286) look complete only because
their jobs were loaded by the **legacy backfill script**, not this sweep. Contacts
and estimates are unaffected (page-number fix works). Diagnosis pending edge-fn
console logs on the page-2 response (recordStartIndex=25) — a `status != 200` or
empty-items early break. Until fixed, large-account jobs reconciliation stays high
(colorado jobs 97.4%); the account is enabled and contacts/estimates are current.
Fix path: instrument jobs.ts page-2 with logging, redeploy, inspect
`get_logs edge-function`; compare against the legacy `pageStartIndex` jobs path.

## Owners

- **Ingestion / Data (AccuLynx):** owns watermark, backfill, and edge-fn recovery.
- **Ops Conductor:** owns the alert channel (#ob-ops-conductor) and the Vault
  secret; first responder to a fired alert.
- **Security Guardian:** owns secret rotation review and the
  [security posture](../security/posture.md).

## Citations

[1] `scripts/verify-acculynx-cron.sql` — health gate (schedule + stuck-dispatch).
[2] Migrations `173` (`acculynx_cron_dispatch`), `174` (`reconcile_acculynx_cron_outcomes()` + `*/10` cron), `175` (`v_acculynx_cron_outcomes` v2), `176` (`check_acculynx_alerts()` + `*/15` cron).
[3] Edge Function `acculynx-sync` (v19), project `rnhmvcpsvtqjlffpsayu`; rollback target v12.
[4] [Sync Pipeline](sync-pipeline.md), [Account Registry](../accounts.md), [Auth & Rate Limits](../api/auth-and-limits.md).
