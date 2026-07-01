---
phase: 4
slug: sandbox-write-capability-exploration-red-team
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-01
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Deno built-in test runner (`Deno.test`), matching `acculynx-read-sweep/sweep.test.ts` |
| **Config file** | none — Edge Function tests run directly via `deno test <path>` (read-sweep precedent) |
| **Quick run command** | `deno test supabase/functions/acculynx-write-sweep/sweep.test.ts` |
| **Full suite command** | `deno test supabase/functions/acculynx-write-sweep/` |
| **Estimated runtime** | ~5 seconds (pure-function unit tests; no live API calls) |

Integration/reconciliation gate (run against live prod DB post-sweep): `scripts/acculynx-write-sweep-reconcile.sql`.

---

## Sampling Rate

- **After every task commit:** Run `deno test supabase/functions/acculynx-write-sweep/`
- **After every plan wave:** Full suite + one limited invocation of the deployed function against the **sandbox**, inspecting the JSON summary (`verdicts` / `calls_made`) as read-sweep does.
- **Before `/gsd-verify-work`:** `scripts/acculynx-write-sweep-reconcile.sql` returns **zero rows** across all assertions (no unreconciled endpoint, no missing result_summary on a 2xx, no non-sandbox row).
- **Max feedback latency:** ~5 seconds (unit); reconciliation is a phase-gate, not per-commit.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-WS-gate | write-sweep | 1 | REQ-06 | T-04-sandbox | `assertSandbox()` throws for every non-sandbox secret name, accepts only the sandbox name | unit | `deno test supabase/functions/acculynx-write-sweep/sweep.test.ts` | ❌ W0 | ⬜ pending |
| 04-WS-redact | write-sweep | 1 | REQ-06 | T-04-pii | `redactSample` masks PII in stored write-probe payloads, preserves structure | unit | `deno test supabase/functions/acculynx-write-sweep/sweep.test.ts` | ❌ W0 | ⬜ pending |
| 04-WS-shape | write-sweep | 1 | REQ-06 | — | Request-body builders produce correct per-endpoint shape (contact address = objects; job address = strings) | unit | `deno test supabase/functions/acculynx-write-sweep/sweep.test.ts` | ❌ W0 | ⬜ pending |
| 04-WS-stop | write-sweep | 1 | REQ-06 | — | Pure `shouldStopProbing(history)` applies the D-05 rule (2 consecutive no-new-signal probes → stop) | unit | `deno test supabase/functions/acculynx-write-sweep/sweep.test.ts` | ❌ W0 | ⬜ pending |
| 04-WS-cover | write-sweep | 2 | REQ-06 | — | Every one of the 38 checklist endpoints has ≥1 probe row after a sweep; every row tagged `source_account_key='sandbox'` | integration (SQL) | `psql … -f scripts/acculynx-write-sweep-reconcile.sql` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supabase/functions/acculynx-write-sweep/sweep.ts` — `assertSandbox`, per-endpoint request-body builders, `redactSample`, and a pure `shouldStopProbing(history)` making the D-05 stop rule unit-testable
- [ ] `supabase/functions/acculynx-write-sweep/sweep.test.ts` — mirror read-sweep's test file + new body-shape-builder and stop-rule tests
- [ ] `schemas/cleverwork-roofer/182-acculynx-write-catalog-ddl.sql` — `acculynx_write_catalog` + `acculynx_write_probe` DDL (additive/idempotent)
- [ ] `schemas/cleverwork-roofer/183-acculynx-write-checklist-seed.sql` — 38-row seed with tier (deep/smoke), dependency chain, request-body schema ref
- [ ] `scripts/acculynx-write-sweep-reconcile.sql` — structural mirror of `acculynx-read-sweep-reconcile.sql` for the write tables/checklist

*Framework install: none — Deno + `jsr:@std/assert@1` already vendored via the read-sweep precedent.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Red-team dimension coverage on the ~8 deep-lane endpoints (bad input / partial failure / idempotency / ordering / authz) produces evidence-backed verdicts | REQ-06 | The verdict on a live vendor API's real error/side-effect behavior is an interpretation of actual sandbox responses, not a pure function | After a sweep, inspect `acculynx_write_probe` rows per deep-lane endpoint; confirm ≥1 probe per applicable dimension and a catalog verdict (writable / write-only / unsupported / fragile-with-guardrail) with a guardrail note |
| Generated matrix supersedes docs/37 + write-capability.md (incl. correcting the stale `POST /jobs/{id}/measurements`) | REQ-06 | Doc-generation correctness against source-of-truth evidence rows is a human-reviewed diff | Regenerate the matrix from `acculynx_write_catalog`; diff against docs/37; confirm the non-existent measurements endpoint is gone |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
