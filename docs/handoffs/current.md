# Project Handoff — Pro Exteriors Open Brain / Command Center
**Project:** a-roofers-open-brain (Pro Exteriors Command Center + agent fleet)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain
**Production URL:** https://cc.proexteriorsus.net
**Date:** 2026-08-25 12:40 (CT)
**Agent:** Lead Orchestrator (Claude Code)
**Reason:** User-requested (/project-handoff + /wrapup with full Linear documentation)

---

## Accomplished This Session

Session opened with "verify the invoice audit loop has been running daily since 08/10." It has — 16/16 days, zero failures. But verifying it exposed four defects, all now fixed and deployed.

### Pricing join — the evergreen rule, applied per item (PEC-253, PEC-254)

- `schemas/cleverwork-roofer/277-item-aware-version-cascade.sql`: version supersession is now **item-aware** on all three ABC arms (exact, fuzzy, branch-match). A newer agreement version supersedes an older one **only for the items it actually prices**. 414 lines regained a benchmark; 0 changed, 0 lost.
- `schemas/cleverwork-roofer/279-vendor-arm-parity.sql`: ported the same rule to the SRS/QXO arm, which had **no supersession at all** (its lateral ordered by price with no `effective_date` term, so a cheaper *older* sheet would have won). Unified the evergreen predicate across all four arms.

### Weekly QB export — built the producer that was never built (PEC-255, PEC-256)

- `schemas/cleverwork-roofer/278-inv-processed-weekly-view.sql`: `v_inv_processed_weekly`, the export membership set (load-once contract).
- `schemas/cleverwork-roofer/280-negatives-are-credit-memos.sql`: positive-total gate on the export set + new `v_credit_memo_tbd`, a cross-vendor CM reconciliation queue.
- `scripts/build-inv-processed-weekly.mjs`: renders `INV-PROCESSED-[vendor]-[date].csv` **one file per vendor**, plus `SUMMARY.md`. Prep-only by default; `--stamp` is opt-in. Hard-refuses a mixed-vendor file or a non-positive row.
- `.gitignore`: `exports/` ignored — generated batches carry client invoice data (hard rule 2).

### Docs and rules

- `CONVENTIONS.md` §10b, `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/agent-conventions.mdc`: item-aware supersession, the **Vendor parity of the audit** block, negative-total = credit memo, per-vendor export. `check-harness-alignment.sh` passes.
- `docs/81-invoice-audit-v2-process-and-build-plan.md`: decisions 2 and 14 marked **SUPERSEDED** in place.
- `context/memory/2026-08-25.md`: daily log.

## Git State
- **Branch:** `main`
- **Last commit:** `55b99f1` — "fix(pec-248): a negative total is a credit memo; the QB export is per vendor (mig 280)"
- **Uncommitted changes:** handoff + daily log only (committed as the final wrap-up commit)

## Task Cut Off
None — session ended at a clean boundary. All four migrations applied to prod, verified, and pushed.

## Next Task — Start Here

**Task:** PEC-257 — disposition the 7 reopened August lines

**What to check / do:**
1. Open the Invoice Audit surface, Wichita office, August window.
2. Seven lines sit `pending` with restored benchmarks totalling **$142.25** over agreement (4.8%–18.7%; five of seven are ≥6%, hold-notice grade under docs/57 §1). Full table in PEC-257.
3. Approve or reject each. Approved lines become credit-memo claims.
4. Once dispositioned, the 6 blocked invoices clear for the weekly QB export.

**If the lines do not appear:** confirm `mv_invoice_audit_line` refreshed — `select * from matview_refresh_request;` — or force it with `REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_invoice_audit_line;`.

**Prompt to use:** "Read docs/handoffs/current.md. Then show me the 7 pending August lines from PEC-257 with their agreement evidence so I can disposition them."

## Decisions Made This Session

- **Evergreen applies per ITEM, not per agreement.** Expiry was never the cause of the No-Price flood — all 13 agreements were already `renewal_mode = 'evergreen'`. The bug was item-blind supersession: a shorter new price list silently repealed the prices it omitted. Do not re-litigate; the old wording in all four rule files described the bug as if it were the rule and has been corrected.
- **Vendor evals may differ only where the vendor process differs.** Legitimate differences are enumerated in CONVENTIONS §10b: QXO has no agreements ever; SRS prices off the Level 4 sheet → Richardson TX; PDF/OCR verification is ABC-only for want of a source. Everything else is vendor-agnostic. Never special-case a vendor to make a number look right.
- **A negative total is a credit memo,** whatever the vendor flag says. 5 negative documents were unflagged (4 ABC, 1 QXO) and leaked into the QB payables export. Derive from the amount; never write the flag onto the mirror — the nightly sync overwrites it.
- **The QB bank export is one file per vendor.** ABC, SRS and QXO keep separate QB bank registers. Supersedes docs/81 decisions 2 and 14.
- **The $1.67M export backlog was a records gap, not a money gap.** Everything had been hand-keyed into QuickBooks as **Purchases** (not Bills — `qbo_bills` for ABC stops at 2023-10-13). 620 invoices verified against the QBO mirror and reconciliation-stamped; **the CSV was never loaded**, because loading it would have double-entered $1.67M.
- **`2009557754-001` stays cancelled.** Lucinda withdrew it 2026-08-20; Chris upheld that call even though mig 277 made two *different* lines claimable. `do_not_auto_revive` stamped into the request's `packet`. A human cancellation is a decision, not a stale record.
- **No-Price threshold stays at `purchases_ytd >= 2`.**

## Blockers Requiring Human Action

1. **PEC-257** — disposition the 7 August lines ($142.25). Blocks 6 invoices from the QB export.
2. **PEC-258** — 9 credit memos have no original invoice ($26,601.90: ABC 7/$21,421.33, QXO 1/$3,723.59, SRS 1/$1,456.98). Request the original invoice reference from each vendor.
3. **Weekly batch is unstamped** — 3 files, 13 invoices, $14,610.49 in `exports/inv-processed-2026-08-25/`. Run `--stamp` **only after** accounting loads them.
4. **Ruling needed:** 309 pre-August lines were also re-benchmarked; 38 show **$575.92** of overcharge. Not reopened (outside the authorised window). Sweep them or leave them?
5. **`morning_abc_sync` is still paused** — the agent pass that posts ≥6% hold notices to Slack has never run. docs/57 §0 still lists it as `paused` with no cron entry.

## ⚠️ Commit-message ID collision — do not chase these

Commits `9bafd1e`, `7e0eace`, `2a76a6b`, `ec71346`, `55b99f1` cite **PEC-244/245/246/247/248**. Those IDs were used before the board was checked and collide with unrelated live Pax issues. History was **not** rewritten (the commits are on `main` and deployed). Real mapping:

| Commit | Cited (void) | Real issue |
|---|---|---|
| `9bafd1e` | pec-244 | **PEC-253** |
| `7e0eace` | pec-245 | **PEC-255** |
| `2a76a6b` | pec-246 | docs alignment (PEC-253/254) |
| `ec71346` | pec-247 | **PEC-254** |
| `55b99f1` | pec-248 | **PEC-255 / PEC-256** |

Session report: **PEC-259**.

## Verification Commands
1. `git status --short` — should return empty
2. `git rev-parse --short HEAD origin/main` — both should match
3. `bash scripts/check-harness-alignment.sh` — should exit 0, no output
4. `node scripts/build-inv-processed-weekly.mjs` — should write 3 per-vendor files, 13 invoices, $14,610.49, and print "PREP ONLY"
5. `select count(*) filter (where negotiated_price is not null) from mv_invoice_audit_line;` — should return **2526** of 7003
6. `select vendor_slug, is_tbd, count(*) from v_credit_memo_tbd group by 1,2;` — 9 rows with `is_tbd = true`

## Full Context

### What was built across ALL sessions (complete feature list)
Carried forward from prior handoffs (see `docs/handoffs/archive/`), plus this session:
- Invoice Audit v2 (docs/81), office-inherited pricing, vendor/office/time/UOM silos (migs 119–122, 201, 208, 217)
- Friday WIP/AR board (mig 215), credit-memo claim sets, Agreement Builder + `agreement_gap_queue` (migs 229/229b)
- Materialised audit line + on-demand refresh (migs 272–276)
- **This session:** item-aware supersession (277), weekly QB export set (278), vendor arm parity (279), negative-total/CM routing + per-vendor export (280), the Tuesday INV-PROCESSED producer

### Architecture decisions
- `v_invoice_audit_line` is the **definition of record**; every reader goes through `mv_invoice_audit_line` (the view costs ~8.8s against an 8s `statement_timeout`, so a direct PostgREST read fails and surfaces render empty). Matview refreshes every 15 min via pg_cron job 13.
- The audit is **continuous, not batch** — variance is recomputed every 15 minutes, not by a nightly job. "Has the audit run?" is the wrong question; "is anything undispositioned?" is the right one.
- Credit status is **derived from the amount**, never written onto the vendor mirror — the nightly sync would overwrite it.

### Key invariants (never violate)
- **Four gates**, all independent: vendor · office · time (incl. item-aware supersession) · UOM. Failing any one means no comparison happens.
- **The audit refuses rather than converts** on UOM mismatch.
- **The final tie-break picks the LOWEST price** — simulate and diff before adding or backdating a book into an office that already has one.
- **Supersession is item-aware.** A shorter new price list does not repeal the prices it omits.
- **A negative total is a credit memo.** Never a payable line.
- **One QB export file per vendor.** Separate bank registers.
- `register_exported_at` is **one-way**. A stamped invoice never appears in a future QB file — only stamp what has actually reached QuickBooks.
- **A human cancellation is a decision.** Never bulk-revive a withdrawn CM request.

### Service / deployment map
| Service | Detail |
|---------|--------|
| Prod Supabase | `rnhmvcpsvtqjlffpsayu` (shared by dev and live) |
| Deploy | Coolify → `cc.proexteriorsus.net`, builds `app/command-center/Dockerfile` from `origin/main` |
| Nightly loop | `scripts/abc-nightly-sync.sh` 03:30 ET on the agent host — catalog sync → invoice ingest → PDF backfill → Alex No-Price triage |
| pg_cron job 13 | `mv_invoice_audit_line` + office pricing matviews, every 15 min |
| Weekly QB batch | `node scripts/build-inv-processed-weekly.mjs` (Tuesdays), prep-only unless `--stamp` |
