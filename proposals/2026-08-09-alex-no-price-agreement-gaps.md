# A3 — Alex: No-Price repeat-purchase triage → Agreement Builder queue (PEC-195)

**Sponsor:** Chris Hussey · **Date:** 2026-08-09 · **Status:** APPROVED 2026-08-09 (Chris, in session: "APPROVE PEC-195") — build greenlit as specified (2+/yr per vendor+office threshold, `Alex (agent)` attribution)
**Trigger case:** 1,161 raw No-Price lines sitting in the Invoice Audit with no triage path; PEC-189 cleared the backlog by bulk approval, but nothing stops it re-accumulating.

## 1 · Problem

Every invoice line without a negotiated agreement price lands as "No-Price" and waits for
a human. Most are one-off purchases that will never justify an agreement; the ones that
matter — items the company keeps buying from the same vendor in the same office with no
negotiated price — are exactly where money leaks. Today nobody separates the two: the raw
count (1,161 on 2026-08-09) is noise, so it gets bulk-approved in batches (PEC-189) and
the repeat offenders never reach the Agreement Builder.

## 2 · Current condition

| Stage | Today |
| --- | --- |
| Detect No-Price lines | ✅ audit engine classifies them per invoice (docs/81) |
| Separate one-offs from repeats | ❌ nobody does it |
| Route repeats to Agreement Builder | ❌ no path |
| Approve one-offs | ⚠️ human bulk approval on directive (PEC-189: 1,033 lines as Chris; QXO standing auto-approve as System) |
| KPI surface | ✅ "Agreement Gaps — Alex Queue" pill deployed greyed "Coming Soon" (PEC-198, 2026-08-09) |

## 3 · Target condition

Nightly, Alex classifies each No-Price line: an item purchased **2+ times in the calendar
year for the same (vendor, PE office)** becomes an **agreement-gap candidate** and enters
the Agreement Builder review queue (grouped by vendor+office+item, with purchase count,
total spend, and last three prices as evidence). Everything else auto-approves as
`Alex (agent)` with a note naming the rule. The "Agreement Gaps — Alex Queue" pill counts
the candidate groups; clicking it opens the Agreement Builder queue filtered to them.
Humans only ever see the repeats worth negotiating.

## 4 · Analysis — why this is automatable and where the risk sits

The classification is a pure aggregate over data we already mirror: count of invoice
lines per (vendor_slug, office, item_number) with `negotiated_price IS NULL` within the
calendar year. No external calls, no writes to vendor systems, no money movement. The two
risks are (a) **silo violations** — the count must never join across vendors or offices
(hard rule; migs 217/222/223 history), and (b) **auto-approval scope creep** — Alex's
approve stamp must be append-only `invoice_line_audit` rows attributed to the agent, the
same ledger humans use, reversible by the existing Go-back reset.

## 5 · Proposed countermeasure (build plan, ~1 session)

1. Mig 229: `v_no_price_repeats` view — calendar-year purchase counts per
   (vendor_slug, office_id, item_number) over no-price lines; plus
   `agreement_gap_queue` table (append-only, status: candidate → in_review →
   agreement_created | dismissed).
2. Nightly Alex pass (PE-US-AGENTS timer, same pattern as maya-gate): populate the
   queue, auto-approve non-repeat No-Price lines as `Alex (agent)` with rule citation.
3. Agreement Builder queue tab reading `agreement_gap_queue` (vendor-roster-scoped,
   PEC-196 seam); pill flips live.
4. Verification: live call path on ABC + SRS; `silo_assertions()` = 0; nightly run
   logged to `dashboard_action_log`.

**Explicitly out of scope:** creating or requesting agreements automatically (human does
that from the queue), any vendor contact, any QBO write.

## 6 · Effort / ROI (rule 9 gate)

Build ≈ 1 session. Saves the recurring bulk-approval directive (PEC-189 was ~1,000 lines
of accumulated noise) and surfaces the repeat-purchase leak list nobody produces today —
the direct input to new agreements, where a single negotiated SKU typically clears 10x the
build cost in a season. Human review surface shrinks from every No-Price line to only
repeat-purchase groups.

## 7 · Decision requested

Approve building steps 1–4 as specified (auto-approval attribution `Alex (agent)`,
2+/calendar-year threshold per (vendor, office)). Reply in #pe-cc-dev-team or here:
`APPROVE PEC-195` / edits.
