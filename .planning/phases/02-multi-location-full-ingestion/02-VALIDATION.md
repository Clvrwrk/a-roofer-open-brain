---
phase: 2
slug: multi-location-full-ingestion
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-30
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno built-in test runner (`Deno.test`), `jsr:@std/assert@1` |
| **Config file** | none — tests co-located with source under `supabase/functions/acculynx-sync/` |
| **Quick run command** | `deno test supabase/functions/acculynx-sync/lib/ --allow-env` |
| **Full suite command** | `deno test supabase/functions/acculynx-sync/ --allow-env --allow-net=localhost` |
| **Estimated runtime** | ~5 seconds (pure unit tests, mock sb, no network) |

---

## Sampling Rate

- **After every task commit:** Run `deno test supabase/functions/acculynx-sync/lib/ --allow-env`
- **After every plan wave:** Run `deno test supabase/functions/acculynx-sync/ --allow-env --allow-net=localhost`
- **Before `/gsd-verify-work`:** Full suite green + `v_acculynx_reconciliation` delta_pct < 5% for at least the sandbox account
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-0 | 01 | 1 | REQ-04 | T-02-01 | Live schema introspected before mig 169 | MCP read | execute_sql information_schema (manual) | ❌ W0 | ⬜ pending |
| 2-01-1 | 01 | 1 | REQ-03/04 | T-02-02 | Additive idempotent DDL only | grep | `grep -ci 'add column if not exists' 168` | ✅ | ⬜ pending |
| 2-01-2 | 01 | 1 | REQ-03/04 | T-02-02 | Migrations applied live | MCP execute_sql | execute_sql column/constraint checks | ❌ W0 | ⬜ pending |
| 2-02-1 | 02 | 1 | REQ-03 | T-02-04/05 | Production-only fan-out; secret-name only | deno check | `deno check acculynx-sync/index.ts` | ❌ W0 | ⬜ pending |
| 2-02-2 | 02 | 1 | REQ-03/04 | T-02-06 | mark-not-delete; tuple watermark (RED) | unit | `deno test acculynx-sync/lib/ --allow-env` (non-zero) | ❌ W0 | ⬜ pending |
| 2-03-1 | 03 | 2 | REQ-03 | T-02-06 | lib GREEN: mark-not-delete, prod-only | unit | `deno test acculynx-sync/lib/ --allow-env` | ❌ W0 | ⬜ pending |
| 2-03-2 | 03 | 2 | REQ-04 | T-02-04 | per-row account_key/market stamping; correct pagination param | deno check | `deno check resources/{jobs,contacts,estimates}.ts` | ❌ W0 | ⬜ pending |
| 2-03-3 | 03 | 2 | REQ-04 | T-02-07/08 | invoice two-level; budget resume; serial fan-out | unit | `deno test acculynx-sync/ --allow-env --allow-net=localhost` | ❌ W0 | ⬜ pending |
| 2-04-1 | 04 | 3 | REQ-03 | T-02-05 | 8 keys pinged; sandbox-first | CLI+API | `supabase secrets list` + per-account ping (manual) | ❌ W0 | ⬜ pending |
| 2-04-3 | 04 | 3 | REQ-03/04 | T-02-04 | populated + no cross-account bleed + reconcile | MCP+SQL | execute_sql group-by + `acculynx-reconcile-check.sql` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supabase/functions/acculynx-sync/lib/accounts.test.ts` — REQ-03 fan-out + stamping (Plan 02)
- [ ] `supabase/functions/acculynx-sync/lib/watermark.test.ts` — REQ-03 per-(account,resource) watermark (Plan 02)
- [ ] `supabase/functions/acculynx-sync/lib/diff.test.ts` — REQ-04 mark-not-delete (Plan 02)
- [ ] `supabase/functions/acculynx-sync/resources/job-walk.test.ts` — REQ-04 invoice two-level + budget resume (Plan 02)
- [ ] `scripts/acculynx-reconcile-check.sql` — delta_pct smoke against v_acculynx_reconciliation (Plan 02)
- [ ] Hand-rolled mock Supabase client fixture (recording .from/.select/.eq/.is/.lt/.update/.upsert/.delete) shared across lib tests (Plan 02)

Existing: `supabase/functions/acculynx-read-sweep/sweep.test.ts` — 6/6 passing; covers `paginationParam` logic reused in Phase 2.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live schema introspection (11 tables + watermark) | REQ-04 | Read-only Supabase MCP, not a unit test | execute_sql over information_schema.columns; record shapes in SUMMARY (Plan 01 Task 0) |
| Migration apply to live prod DB | REQ-03/04 | Supabase MCP apply_migration against shared prod | execute_sql confirms account_key + UNIQUE(account_key,resource) + v_acculynx_reconciliation (Plan 01 Task 2) |
| 8 production key presence + 200 ping | REQ-03 | Live API + Supabase CLI; secrets not in test env | `supabase secrets list` + per-account cheap GET → 200; log status, never values (Plan 04 Task 1) |
| Sandbox-first resource proof | REQ-04 | No-first-tries mandate; sandbox is sparse | sandbox-only run fetches contacts (>0); job-walk path runs for sandbox job (Plan 04 Task 1) |
| Production fan-out population + no bleed + reconcile | REQ-03/04 | Requires deployed function + live data | execute_sql group-by account_key; reconcile-check delta_pct < 5 (Plan 04 Task 3) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 / manual-MCP dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated/grep verify
- [x] Wave 0 covers all MISSING references (5 test/script files + mock fixture)
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-30
