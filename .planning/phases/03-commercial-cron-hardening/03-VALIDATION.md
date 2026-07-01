---
phase: 3
slug: commercial-cron-hardening
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-30
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from 03-RESEARCH.md §Validation Architecture. Many success criteria here are live-DB / SQL assertions and manual-verification procedures rather than pure unit tests — that is expected for cron/infra hardening and is captured explicitly below.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno built-in test runner (`Deno.test`), established in Phase 2 |
| **Config file** | None — invoked directly via `deno test <path> <flags>` (no `deno.json` in `supabase/functions/`) |
| **Quick run command** | `deno test supabase/functions/acculynx-sync/lib/ --allow-env` |
| **Full suite command** | `deno test supabase/functions/acculynx-sync/ --allow-env --allow-net=localhost` |
| **Estimated runtime** | ~10–20 seconds (unit suite; 56/56 green at Phase 2 close) |

---

## Sampling Rate

- **After every task commit:** Run `deno test supabase/functions/acculynx-sync/lib/ --allow-env`
- **After every plan wave:** Run `deno test supabase/functions/acculynx-sync/ --allow-env --allow-net=localhost` PLUS the live-DB assertion queries for any SQL-only requirement touched that wave
- **Before `/gsd-verify-work`:** Full Deno suite green AND every "❌ W0" row has an automated test OR a performed-and-recorded manual verification step (RLS → security posture doc; alert-firing → runbook)
- **Max feedback latency:** ~20 seconds (unit); live-DB assertions are near-instant SQL

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| W0 verify | 0 | 0 | REQ-07 | — | Confirm live cron passes `multiAccount:true`; current RLS status; current `last_api_count` values; Slack channel | SQL/manual | `select jobname, schedule from cron.job where jobname ilike '%acculynx%';` + watermark/RLS queries | ❌ W0 | ⬜ pending |
| SC1 hourly | — | — | REQ-07 | — | Exactly one hourly acculynx cron (`0 * * * *`), old daily unscheduled, `multiAccount:true` | SQL/manual | `select jobname, schedule from cron.job where jobname ilike '%acculynx%';` (expect 1 row) | ❌ W0 (`scripts/verify-acculynx-cron.sql`) | ⬜ pending |
| SC2 reconcile | — | — | REQ-07 | T-DoS-silent-fail | pg_net responses copied to owned table before TTL; outcomes reflect real 200/failure | unit + integration | `deno test supabase/functions/acculynx-sync/lib/reconcile.test.ts --allow-env` | ❌ W0 (new) | ⬜ pending |
| SC2 alerting | — | — | REQ-07 | T-DoS-silent-fail | Injected stale/failure condition → Slack + Sentry both receive alert | integration/manual | Seed synthetic condition, run check fn, capture webhook (documented in runbook) | ❌ W0 (procedure) | ⬜ pending |
| SC3 resume | — | — | REQ-07 | — | Interrupt mid-sweep → resumes from `last_page_index`/`last_walked_job_id` | unit | `deno test supabase/functions/acculynx-sync/lib/watermark.test.ts --allow-env` | ✅ exists | ⬜ pending |
| SC3 no-delete | — | — | REQ-07 | T-tamper-bleed | Diff uses `.update()` only, never `.delete()` | unit | `deno test supabase/functions/acculynx-sync/lib/diff.test.ts --allow-env` | ✅ exists | ⬜ pending |
| SC4 RLS | — | — | REQ-07 | T-info-disclosure-PII | `anon`/`authenticated` cannot SELECT `acculynx_*`; `service_role` can | integration/manual | anon-key SELECT (expect denied) vs service-role SELECT; recorded in security posture doc | ❌ W0 (procedure) | ⬜ pending |
| CF last_api_count | — | — | REQ-07 | — | jobs watermark shows real API count, not `1`, after `multiAccount:true` run | unit + live | `deno test supabase/functions/acculynx-sync/resources/jobs.test.ts --allow-env --allow-net=localhost` + live query | ✅ unit / ❌ W0 live | ⬜ pending |
| CF NULL provenance | — | — | REQ-07 | T-tamper-bleed | NULL-provenance rows across all 9 constrained tables triaged, then NOT NULL constraint holds | SQL/manual | `select count(*) from <each of 9 tables> where account_key is null;` (expect 0 pre-constraint) | ❌ W0 | ⬜ pending |
| CF rot guards | — | — | REQ-07 | T-tamper-bleed | Dup-GUID / orphan / NULL-provenance / stale-tail views flag seeded bad rows, else zero | integration | Seed bad fixtures via service-role client, assert each view surfaces expected rows | ❌ W0 (new views + tests) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] **Live-DB verification task (Open Questions 1–4)** — confirm live `trigger_acculynx_sync` passes `multiAccount:true`; current RLS status of `acculynx_*`; current `acculynx_sync_watermark.last_api_count` for kansas_city/wichita jobs; NULL `account_key` counts across ALL 9 tables mig 178 constrains; confirm Slack alert channel (research recommends `#cc-proexteriors`). MUST run before finalizing cron-cutover + RLS + NOT-NULL migrations.
- [ ] `scripts/verify-acculynx-cron.sql` — committed, runnable cron-schedule assertion (not a one-off typed command)
- [ ] `supabase/functions/acculynx-sync/lib/reconcile.test.ts` — pg_net reconciliation join logic (if expressed as testable TS)
- [ ] Alert-firing verification procedure — seed synthetic failure/staleness, confirm Slack + Sentry receive it, document exact steps in the runbook (D-15)
- [ ] RLS verification procedure — anon-key SELECT (expect denied) vs service-role SELECT, documented in the security posture doc (D-13)
- [ ] Rot-guard view tests — seed known-bad fixtures (dup GUID, orphan sub-resource, NULL provenance, stale-tail), assert each view surfaces expected rows

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Hourly cron fires + old daily unscheduled | REQ-07 (SC1) | pg_cron internals aren't unit-testable in Deno | Run `scripts/verify-acculynx-cron.sql`; expect exactly one row, schedule `0 * * * *`, `multiAccount:true` in the command |
| Alerting reaches Slack + Sentry | REQ-07 (SC2) | Requires live webhook delivery | Seed synthetic stale watermark / failure, run `check_acculynx_alerts()`, confirm both channels received; record in runbook |
| RLS denies anon, allows service_role | REQ-07 (SC4) | Requires live per-role DB keys | Attempt `select` from an `acculynx_*` table with anon key (expect denied/empty) and with service-role key (expect rows); record in security posture doc |
| Backfill reconciles to ≤2% | REQ-07 (SC4) | Cron-paced over many runs; not a point-in-time test | Query `v_acculynx_reconciliation` for kansas_city/wichita; all synced resources `delta_pct ≤ 2` = expansion gate open |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify OR a recorded manual step
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s (unit)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
</content>
