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
- **Uncommitted changes:** none

### Open branch not on main — PR #9 (ready for review)
`claude/project-handoff-5ua2fw` carries the PEC-221 price-agreement coverage work: migrations
**281-285** (already applied to prod, all additive) plus `docs/107`. It is 0 behind main and
kept merged with it. Marked **ready for review** on 2026-08-21; head is now `0eb5e0d` after
several rounds of review fixes and **ten** renumberings — the tenth on 2026-08-24, when main
landed its own 268-280 and took every number the set held (CodeRabbit + Greptile + Cursor
Security all green on the reviewed heads; Greptile confidence 5/5). Also carries
`docs/108-repo-wide-pii-remediation.md`, an escalated repo-wide finding that is NOT this
branch's to fix. **It is not merged and not deployed.**

Five items on that branch need a human, recorded in `docs/107` and `docs/108`:
1. Confirm `AMSDE` == `SBP-SOUTHDENVER` so the two Denver books can be repointed, **or**
   approve repointing the agreement join to `vendor_branch_id` with mig 244's proof.
2. **One-minute cleanup in an external tool:** CodeRabbit stored a learning during PR #9's
   review saying to use `abc_invoices.id` as a tiebreak. That column does not exist. It has
   since stored a corrected learning that contradicts it, so the risk is mostly neutralised,
   but the stale entry can only be deleted from the CodeRabbit learnings UI
   (app.coderabbit.ai/learnings) — not from a PR thread. Worth removing next time someone is
   in there.
3. Four branches (21, 39, 465, 684) are geocoded but marked `geocode_status = 'pending'`,
   against a `geom IS NOT NULL` ⇒ `'ok'` invariant that holds for 1,752 rows. Mig 282
   demoted two of them; 39 and 465 were touched at 13:04 on 2026-08-21 by another process,
   where `pending` may be a deliberate re-geocode request. Left alone rather than guessed at.
4. `v_office_vendor_branch` and `v_office_vendor_inheritance` are readable by `anon` on the
   same default grants that mig 285 closed for the four coverage views. They predate this
   branch and expose territory mapping rather than dollars, so they were flagged, not
   changed. Owner's call whether to tighten them.
5. **Repo-wide customer PII** — `docs/108`. Named individuals sit beside their outstanding
   balances across at least 18 tracked files, including test fixtures that assert on the
   names. On `main` today, not introduced here. Needs a policy boundary, a replacement
   token, a decision on git history, and a CI check. **The most urgent of the five.**

Numbering note: parallel sessions
claimed 245-262 and both `docs/99` and `docs/100` while it was in flight, so it yielded seven
times — its applied
Supabase labels still read `245_`/`246_`/`248_`/`249_`, which is cosmetic (Supabase keys on
timestamp; all four applied before the files numbered 246-248 existed).

## Task Cut Off
None — session ended at a clean boundary. All four migrations applied to prod, verified, and pushed.

## Next Task — Start Here

**Task:** PEC-257 — disposition the 7 reopened August lines

**What to check / do:**
1. Open the Invoice Audit surface, Wichita office, August window.
2. Seven lines sit `pending` with restored benchmarks totalling **$142.25** over agreement (4.8%–18.7%; five of seven are ≥6%, hold-notice grade under docs/57 §1). Full table in PEC-257.
3. Approve or reject each. Approved lines become credit-memo claims.
4. Once dispositioned, the 6 blocked invoices clear for the weekly QB export.

> **Carried caution from PR #9 (measured 2026-08-21), still relevant:** the exact-token
> backfill in mig 256 matched Colorado **4 of 101** and Melissa **4 of 97** — SRS unpriced
> lines moved only **216 → 211**. Exact-token matching on description-only sheets is close
> to a no-op, so approving the 24 candidates fixes the *line-level* half only.

**If a candidate looks ambiguous:** reject it. This feeds credit-memo claims sent to a
vendor; a wrong price is worse than no price.
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

### Also open — PR #9 (`claude/project-handoff-5ua2fw`), not merged

1. **PEC-226** — the 24 candidates above.
2. **Denver × SRS branch identity — needs a human** (PR #9). Confirm `AMSDE` and
   `SBP-SOUTHDENVER` are the same physical branch so the two Denver books (101 + 22 items)
   can be repointed, **or** approve repointing the agreement join to `vendor_branch_id`
   with mig 244's equivalence proof. Not an agent's call — mig 240's rule is that a guess
   cannot become a fact. `v_agreement_unreachable` lists **6 agreements / 247 items** (re-verified 2026-08-22).
   - ⚠️ **PEC-226 alone will NOT make the Colorado sheet price.** It fixes the *line-level*
     half (missing `raw_item_number`). The Colorado book also fails the *office-ring* half,
     independently: it hangs on `AMSDE`, which `v_office_vendor_branch` cannot see. Expect
     Melissa to price after the backfill and **Colorado to stay at `priced_items = 0`**
     until this blocker is also cleared. Mig 267's effective-date backdate removes a THIRD,
     separate gate — re-verify rather than assuming it closed either of these two.
3. **4 branches geocoded but `geocode_status = 'pending'`** (21, 39, 465, 684) against a
   `geom IS NOT NULL` ⇒ `'ok'` invariant holding for 1,752 rows. Mig 282 demoted two; 39
   and 465 were touched 2026-08-21 13:04 by another process and may be a deliberate
   re-geocode request. Left alone rather than guessed at — see `docs/107`.
4. **PEC-231** — decide whether ABC moves onto the colour rule. Moves live claim numbers.
5. **PEC-233** — AccuLynx cleanup: 225 finished jobs to close, 5 balance contradictions
   ($195,099) to re-save.
6. **PEC-236** — tell Lucinda and the CPA the accrual snapshot moved lifetime → YTD and
   that `est_total_costs` is now a GM%-derived estimate. **Outward-facing.**
7. **PEC-232** — 427 categorization lines, 224 of them unambiguous.
8. **9 Colorado `$0.00`/`CALL` items** still need real prices from the SRS rep.
9. **Atlanta × ABC agreement** — still `pending` (mig 245); 19 covered branches, $5,226.90
   invoiced and un-auditable. **Atlanta × SRS** (11 branches) and **Kansas City, MO × SRS**
   (3) are unruled with no book. **QXO** is `no_book` at every office — do not chase.
10. `product_taxonomy` stores mangled entities — `Steep Slope Roofing (<gt/>2:12 Pitch)`.
    An import artefact, now visible on the categorize surface. Untouched: it is a 172-row
    reference-table text change and other surfaces may match the exact string.
11. **Prefer the SRS portal CSV over PDFs** when you can pull it: the PDF truncates PO
    NUMBER to 16 characters, and that field is the AccuLynx job key.

## Verification Commands
1. `curl -s https://cc.proexteriorsus.net/healthz` — `buildCommit` = `f2dbed7`, status `ok`
2. `git status --short` — empty
3. `cd app/command-center && npm run build && npm test` — Complete, **315 passed**
4. SQL: `select count(*) from v_qbo_job_cost_unattributed where names_a_real_acculynx_job;` → **0**
5. SQL: `select coalesce(attention_flag,'(active)'), count(*) from wip_ar_master where in_ar_population group by 1;` → 115 active / 225 stale_closeout / 5 balance_contradiction
6. SQL: `select count(*) from wip_office_margin where gm_pct_override is not null;` → **0**
7. SQL: `select location, gm_basis, effective_gm_pct from v_wip_office_margin order by 1;` → 4 office rates, 4 company fallbacks
8. SQL: `select count(*) from price_agreements where ceo_verified is distinct from true;` → **0**
9. SQL: `select count(*) from v_vendor_invoice_acculynx_match where matched and purchase_order_number is distinct from pe_job_number;` → **0**
10. SQL: `select count(*) from v_agreement_unreachable;` → **6** (247 items) — PR #9

## Full Context

### What was built across ALL sessions (complete feature list)
Carried forward from prior handoffs (see `docs/handoffs/archive/`), plus this session:
- Invoice Audit v2 (docs/81), office-inherited pricing, vendor/office/time/UOM silos (migs 119–122, 201, 208, 217)
- Friday WIP/AR board (mig 215), credit-memo claim sets, Agreement Builder + `agreement_gap_queue` (migs 229/229b)
- Materialised audit line + on-demand refresh (migs 272–276)
- **This session:** item-aware supersession (277), weekly QB export set (278), vendor arm parity (279), negative-total/CM routing + per-vendor export (280), the Tuesday INV-PROCESSED producer

### Architecture decisions

- **The header bleed was four independent faults**, each sufficient on its own:
  (1) `overflow-x: auto` with `overflow-y: visible` — per spec the `visible` axis computes
  to `auto`, so the pane became an *unbounded* scroll container and sticky anchored to
  nothing; (2) the second header row's sticky `top` was hardcoded 26px, the group row
  measures **31px**; (3) `th:nth-child(-n+2)` also matches the column-group row (spacer=1,
  MONEY=2), freezing MONEY left and demoting it to `z-index: 2`; (4) group header `colspan`
  fixed at 2, so an expanded group left columns uncovered — `colspan` cannot be set in CSS.
- **`vendor_desc_color_key` is STABLE, so the planner inlines it** back into join
  predicates and evaluates per pair (873 × 750) — it times out no matter how the CTEs are
  arranged. Only materialising helps: hence stored `color_key` columns + `refresh_color_keys()`.
- **Never retire rows by timestamp inside plpgsql.** The row default `now()` is transaction
  time and is EARLIER than a `clock_timestamp()` captured at function entry, so the run
  deletes its own inserts. Stamp a run id instead.
- **Two ingest fail modes, opposite by design.** Branch resolution fails **closed**; PO
  canonicalization fails **open**.
- **Agreements resolve at the OFFICE level**, never the branch.
  **⚠️ CORRECTED 2026-08-21 (PR #9): office-level resolution is not sufficient on its own.**
  Reachability also requires the branch to be **geocoded** — `v_office_vendor_branch` joins on
  `vb.geom IS NOT NULL AND st_contains(o.boundary, vb.geom)` and *then* matches the agreement
  by branch-number **text**. `AMSDE` and `SSMEL` both carry the correct territory and are both
  invisible to the ring. Do not plan work on the uncorrected wording.
- **The vendor price path is EXACT-match only** — `raw_item_number = item_number OR
  raw_description_normalized = lower(item_description)`. No trigram arm; ABC has one.
- **Branch resolution fails CLOSED, PO canonicalization fails OPEN** — deliberately. Losing a
  branch silently corrupts pricing; losing a PO silently destroys the only job clue.
- **`vendor_invoices` has two BEFORE triggers** — branch resolution (243) and PO
  canonicalization (255). Anything writing to that table gets both.
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
| Storage | `agreements` (11 objects: 7 ABC + 4 SRS), `invoices`, `wip-packs`, `slack-attachments`, `product-images`, `impact-reports` |
| Hetzner | ABC mirror daily 07:30 UTC · QBO mirror daily 01:00 UTC |
| Local dev | `.claude/launch.json` → `command-center` on port 4399 |
| Linear | PE-CC-DevTeam — **PEC-229/230/234** Done · **PEC-226** In Progress · **PEC-231/232/233/235/236** Todo |
