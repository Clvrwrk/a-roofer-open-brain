---
phase: 03-commercial-cron-hardening
plan: 02
completed: 2026-07-01
status: complete
requirements: [REQ-07]
---

# Plan 03-02 Summary — Hourly cutover + pg_net reconciliation

## What was built

- **Migration 172** — `trigger_acculynx_sync` redefined so the POST body is the caller payload (object sent as-is → `{"multiAccount":true}` drives the fan-out; legacy array wrapped for compat) and each dispatched `request_id` is recorded in `acculynx_cron_dispatch`. Unscheduled `acculynx-sync-daily`; scheduled `acculynx-hourly-sync` `0 * * * *`.
- **Migration 173** — owned `acculynx_cron_dispatch` table (survives the pg_net 6h TTL), RLS deny-by-default (76-pattern).
- **Migration 174** — `reconcile_acculynx_cron_outcomes()` (copies `net._http_response` → owned table) + `acculynx-reconcile` cron `*/10`.
- **Migration 175** — `v_acculynx_cron_outcomes` rewritten to read the owned table (never the transient pg_net response table); 11-column contract preserved, 3 columns appended.
- **`lib/reconcile.test.ts`** — 9 contract tests (outcome classification mirror + reconcile UPDATE join shape), all green.

## Applied to prod (`rnhmvcpsvtqjlffpsayu`) via Supabase MCP — live-verified

All four migrations applied (173→172→174→175). Live results:

| Check | Result |
|-------|--------|
| Cron state | old `acculynx-sync-daily` gone; `acculynx-hourly-sync` `0 * * * *` (multiAccount) + `acculynx-reconcile` `*/10` live; geoid job untouched |
| Immediate run (req 253) | dispatched, `batch_context={"multiAccount":true}` |
| Reconciliation | `reconcile_acculynx_cron_outcomes()` → 1 row; `v_acculynx_cron_outcomes` shows req 253 **status 200, outcome `success`, reconciled** — no perpetual pending (SC2 ✓) |
| `last_api_count` | (kansas_city, jobs) = **8** (was `1`) — real API value, cutover fixed it, **no `jobs.ts` change** (SC-carryforward literal bug ✓) |

## Deviations / follow-ups

1. **Executed inline by orchestrator** (not a `gsd-executor` subagent) — the executor agent type lacks Supabase MCP + `apply_migration`; only this session can apply to the shared prod DB. Same tasks, verified identically. Applied under the explain-then-ship human gate (user approved).
2. **[FOLLOW-UP for 03-06] jobs `last_api_count` is the INCREMENTAL modified-count, not the full jobs total.** `jobs.ts` captures the API `count` from a ModifiedDate-windowed query, so `last_api_count=8` = jobs modified since the last watermark, not the ~166 full KC total. The literal `=1` bug is fixed, but `v_acculynx_reconciliation` compares this incremental count against the FULL `brain_count`, so jobs `delta_pct` is not yet a meaningful ≤2% signal. **Before the 03-06 expansion gate can trust jobs reconciliation, `jobs.ts` (or a periodic full-count pass) must populate `last_api_count` with the full unfiltered jobs total.** Full-sweep resources (contacts=1312) are unaffected — they already report the full total. Recorded here so 03-06's tolerance gate accounts for it rather than reading a false jobs delta.

## Self-Check: PASSED

- reconcile.test.ts: 9/9 green.
- Migrations 172–175 written to house idempotency standard (guarded cron, CREATE OR REPLACE, hard-rule-1 footer), applied to prod, live-verified.
- `v_acculynx_cron_outcomes` body references only `acculynx_cron_dispatch` (no `net._http_response`).
- Acceptance criteria 1–5 met (cutover, dispatch table + REVOKE, reconcile fn + `*/10`, view off owned table, `last_api_count` real not `1`).

## key-files
- created: `schemas/cleverwork-roofer/172-acculynx-cron-hourly-cutover.sql`
- created: `schemas/cleverwork-roofer/173-acculynx-cron-dispatch-log.sql`
- created: `schemas/cleverwork-roofer/174-acculynx-reconcile-fn.sql`
- created: `schemas/cleverwork-roofer/175-acculynx-cron-outcomes-view-v2.sql`
- created: `supabase/functions/acculynx-sync/lib/reconcile.test.ts`
