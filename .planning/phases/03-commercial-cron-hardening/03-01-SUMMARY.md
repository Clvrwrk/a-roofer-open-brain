---
phase: 03-commercial-cron-hardening
plan: 01
completed: 2026-06-30
status: complete
requirements: [REQ-07]
---

# Plan 03-01 Summary — Wave 0 Live-DB Verification

Executed inline by the orchestrator (the `gsd-executor` subagent lacks Supabase MCP access; only the main session can query the live prod DB `rnhmvcpsvtqjlffpsayu`). Read-only introspection only — no mutations (hard rule 1).

## What was built

- `.planning/phases/03-commercial-cron-hardening/03-LIVE-STATE.md` — recorded answers to RESEARCH Open Questions 1–4 from the live DB, with a per-decision "Downstream impact" section for plans 02/03/04.
- `scripts/verify-acculynx-cron.sql` — committed, re-runnable cron + reconciliation health gate (Section 1 cron assertion; Section 2 unreconciled-dispatch guard).

## Key findings (ground truth)

1. **Cutover required.** Live cron `acculynx-sync-daily` (`15 8 * * *`) calls `trigger_acculynx_sync('["users","jobs"]')`; the fn body is `{"resources": …}` with **no `multiAccount`** → legacy path. mig 172 must emit `multiAccount:true` + reschedule hourly `0 * * * *` + unschedule `acculynx-sync-daily`.
2. **`last_api_count` bug confirmed live** — `(kansas_city, jobs) = 1`. **No `jobs.ts` change needed**; the cutover fixes it (Phase-2 `syncJobs` already captures the real count). Verify post-cutover.
3. **RLS = revoke-only.** All 22 `acculynx_*` tables already have `relrowsecurity = true`, but `anon`+`authenticated` hold **full** privileges. mig 177 = `REVOKE ALL FROM anon, authenticated` (enable is a no-op).
4. **NOT NULL = `account_key` only.** 8 NULL-`account_key` rows in exactly 4 tables (contacts 3, job_contacts 3, job_financials 1, job_insurance 1); other 5 clean. **`market` must stay nullable** (191/1450 jobs + all contacts NULL — derived field). mig 178 constrains `account_key` on all 9; NOT `market`.
5. **pg_net 0.20.0 / pg_cron 1.6.4, TTL 6h** — `*/10` reconcile cron (mig 174) is safe.
6. **Alerts → `#cc-proexteriors` (`C0BCUJV0MLY`)**, the existing Sentry Slack channel (integration 443674). Slack via `SLACK_BOT_TOKEN`; Sentry via `SENTRY_DSN` + `SENTRY_PERSONAL_TOKEN`.

## Deviations

- Plan assumed a `gsd-executor` would run this; instead the orchestrator ran it inline because the executor agent type has no Supabase MCP tool. Same tasks, same artifacts, verified identically.
- The prior checker BLOCKER (9-vs-4-table NOT NULL scope) is now confirmed **safe in current state**: the 5 previously-unchecked tables have 0 NULL `account_key`. The widened idempotent triage remains as defensive no-op.

## Self-Check: PASSED

- `03-LIVE-STATE.md` exists, answers OQ1–OQ4/OQ3b/OQ3c, all 9 table names present, no raw secret.
- `scripts/verify-acculynx-cron.sql` exists with Purpose/Run/Expected header, `cron.job` query, `0 * * * *` assertion, unreconciled-dispatch guard.

## key-files
- created: `.planning/phases/03-commercial-cron-hardening/03-LIVE-STATE.md`
- created: `scripts/verify-acculynx-cron.sql`
