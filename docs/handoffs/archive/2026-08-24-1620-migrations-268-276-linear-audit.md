# Project Handoff — Pro Exteriors Open Brain / Command Center
**Project:** a-roofers-open-brain (Pro Exteriors Command Center + agent fleet)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain
**Production URL:** https://cc.proexteriorsus.net
**Date:** 2026-08-24 16:20 (CT)
**Agent:** Lead Orchestrator (Claude Code)
**Reason:** `/project-handoff /wrapup` + full Linear audit

---

## Accomplished This Session

Migrations **268–276**, all additive. Five commits, all deployed and verified live.
Detail lives in `docs/106`; this section is the index, not a second copy.

### The pricing matcher — PEC-231 (migs 268, 271)

Chris ruled "move ABC onto the colour rule." Simulated first: the swap was not
like-for-like. Trigram wins **961 of 2,230** priced ABC lines (43%) and carries
**91%** of ABC claim value, and the colour key — tuned on SRS's pipe-delimited
text — does not survive ABC's abbreviations (`MAL` vs `MALARKEY`).

ABC's real failure mode is **dimension blindness, not colour blindness**: the
board-topping 129.28% / $412.08 claim was `GAF 12" Cobra Snow Country` priced off
`cobra 9 snow country`. Shipped a four-rank fallback with a numeric-token subset
guard on the trigram arm.

**Live: priced 2,267 → 2,013 · claims $7,281.40 → $6,097.30 · worst variance
129.28% → 58.84% · 105 lines now won by the colour arm.**

### Expiry as an explicit choice — PEC-238/239 (migs 269, 270)

`renewal_mode` (`evergreen` default | `expires`) on both agreement tables, gate
wired on all four arms and **dormant** — all 5 ABC lines priced in the last 7 days
bill at 0.00% against a June-expired book, so the books demonstrably roll.
`priced_by_expired_agreement` discloses on **613 lines**. Fixed the legacy branch
arm reaching back to superseded versions. Seven duplicate ABC rows in the generic
price book deactivated; both halves of the dual-audit hazard are now standing
`silo_assertions()` checks.

### The surfaces that were never rendering — PEC-241/243 (migs 272–274)

Found while verifying the above. `authenticator` carries `statement_timeout = 8s`,
`service_role` inherits it, and `v_invoice_audit_line` cost 8.8s — so **every**
PostgREST read failed. The page returned HTTP 200 with `{"offices":[],...}` and a
"Supabase pending" badge; the expand row 500'd. **Proven to predate this session**
(pre-session probe scans in 8.60s vs 8.84s now).

`mv_invoice_audit_line` + all readers repointed. **44.6s/empty → 0.18s/1.13MB;
expand 500 → 200 in 0.97s.** Mig 274 adds `request_matview_refresh()` +
a one-minute pg_cron drain so a price-list save triggers a rebuild without
blocking on it.

### Performance and hygiene — PEC-215/216/217 (migs 275, 276)

Price Agreements **13.56s/3.77MB → 0.72s/315KB**, output byte-identical.
Structural CHECK guard on `abc_invoices.invoice_number`. Site-hygiene sweep closed.

### Chris's standing ruling, recorded

> "All price list remain in effect until a new price list is generated."

`expiry_date` is documentary. Written into `docs/105` §6b and propagated to
`CONVENTIONS.md` §10b, `AGENTS.md`, `.cursor/rules/agent-conventions.mdc`.

## Git State
- **Branch:** `main` — `main == origin/main`
- **Last commit:** `266dd5f` — "chore(pec-217): document the one undocumented shell-less page, and log the sweep"
- **Live `buildCommit`:** `266dd5f`, status `ok`
- **Uncommitted changes:** none

## Task Cut Off
None. Every migration applied and verified, build + 309 tests green, deployed.

## Next Task — Start Here

**Task: PEC-235 — apply the Long-list disclosure rule to the 5 remaining surfaces.**

Deliberately not started rather than half-done: five surfaces, each with the four
sticky-header traps the ticket documents, each needing real browser verification
of scroll ownership and measured pane height.

**What to check / do:**
1. Read PEC-235 and `standards/design/v1.md` § Long-list disclosure. The reference
   implementation is `app/command-center/src/pages/accounting/friday-wip.astro`.
2. Surfaces: Invoice Audit, Price List Review, Categorize Price Lines, Credit
   Memos, Agreement Builder.
3. **Measure, never hardcode.** Two-pass sizing — set the height, then add back
   `offsetHeight − clientHeight`; a horizontal scrollbar steals ~15px, clips row
   10, and adds a vertical scrollbar to a list that fits.
4. Verify each surface in the browser: pane height identical collapsed and
   expanded, wheel ownership changes only on click, filters apply before paging.

**If a surface has no table** (Invoice Audit is a nested `details` tree, not a
grid): say so and adapt rather than forcing the table contract onto it.

**Prompt to use:** "Read PEC-235 and standards/design/v1.md § Long-list disclosure. Apply the rule to the 5 listed surfaces one at a time, verifying each in the browser before moving to the next."

## Decisions Made This Session

- **The dimension guard, not the colour rule alone.** Chris's call, on measured evidence that colour-only cost 39% of coverage and 81% of claims.
- **`renewal_mode` defaults to `evergreen`** — evidence-based (0.00% variance against expired books), later confirmed as doctrine by Chris.
- **Did NOT raise `statement_timeout`.** It trades a visible failure for an invisible one; making the query fast was the answer.
- **Refresh is requested, never performed inline.** A direct REFRESH would 500 *after* the write landed. Proven: a `SECURITY DEFINER` fn with `SET statement_timeout TO '120s'` still dies at the caller's 2s — the timeout is armed when the outer statement begins.
- **`last_refreshed_at = now()`, not `clock_timestamp()`** — a request arriving during a 10s refresh must stay pending. Inverts the usual trap; same mechanism.
- **`v_item_api_price` stays a plain view.** API-observed prices are the freshest number on that page.
- **PEC-232 stays a human queue.** No exact tier remains; one candidate means nothing else scored, not that it is right.

## Blockers Requiring Human Action

1. **PEC-244** — 23 Maya intake tickets stalled since 08-18, incl. **11 Urgent** security-alert items needing one bulk ruling, and PEC-208 stuck in `Agent Working`. Flagged, not triaged: they are intake data, several phishing-shaped.
2. **PEC-240** — 9 Colorado SRS items printing `$0.00`/`CALL`; needs real prices from Blake Wells.
3. **PEC-242** — Wichita / Richardson / Kansas City need a current list out of the price-list builder.
4. **PEC-111** — confirm the 25 Richardson IKO items trace to a source document, not an inference.
5. **PEC-221 / PEC-214** — sitting in review; two vendor drafts await a decision.
6. **PEC-216 hold** — Chris said "hold" earlier, then "continue all PEC work". I read the hold as released and shipped it. Confirm, or I revert mig 276.

## Verification Commands
1. `curl -s https://cc.proexteriorsus.net/healthz` — `buildCommit` = `266dd5f`, `ok`
2. `git status --short` — empty
3. `cd app/command-center && npm run build && npm test` — Complete, **309 passed**
4. SQL: `select count(*) from silo_assertions();` → **0**
5. SQL: ABC priced lines **2,013** / claims **$6,097.30** / worst variance **58.84**
6. SQL: `select count(*) from v_invoice_audit_line where priced_by_expired_agreement;` → **613**
7. `curl -w '%{time_total} %{size_download}' localhost:4399/accounting/invoice-audit` → ~0.18s, ~1.13MB, badge "Supabase live"

## Full Context

Carried forward from `archive/2026-08-22-0810-abc-matcher-wip-overhaul.md`, which
holds the running feature list, architecture decisions, design system and service
map. Added this session:

- ABC colour arm + dimension guard; `desc_num_tokens()`; trigger-maintained match keys (268, 271)
- Generic-book ABC duplicates deactivated + two new silo assertions (269)
- `renewal_mode`, `priced_by_expired_agreement`, legacy-arm supersession fix (270)
- `mv_invoice_audit_line` + readers repointed (272, 273)
- On-demand matview refresh, debounced through pg_cron (274)
- `abc_invoices.invoice_number` CHECK (275); `v_item_api_price` (276)

### Key invariants added this session
- **A matcher change is not verified by its match counts.** Mig 268's numbers were right and its plan was wrong. **EXPLAIN the predicate before shipping a join over a large input.**
- **Never read a per-row-LATERAL view through PostgREST.** The service key buys no relief from the 8s ceiling.
- **A finance surface that silently shows zeros is worse than one that errors.** Still unfixed: `status !== "live"` renders as a small badge nobody read for weeks.
- **One non-indexable disjunct disqualifies a whole OR from a BitmapOr.**

### Service / deployment map
Unchanged from the archived handoff, plus: prod Supabase `rnhmvcpsvtqjlffpsayu`
schemas through **276**; pg_cron gains `service-matview-refresh-requests` (every
minute) and `refresh-office-pricing-matviews` now also refreshes
`mv_invoice_audit_line`.
