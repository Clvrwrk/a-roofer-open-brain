# 83 — Price Agreement Management: consolidation plan & line-review contract

**Date:** 2026-08-05 · **Status:** APPROVED (4 decisions, Chris via AskUserQuestion) · **Predecessors:** docs/81 (v2 process), docs/82 (remediation, map cutover, migration 205)

## 1. The goal (Chris, verbatim intent)

> Everything we buy more than one time gets a negotiated price. Every "no price" invoice
> line item should be added to the price agreement builder for that vendor and PE office
> with the historical purchase count, qty count, lifetime invoice value, and the min, max,
> average, current API, latest price listed. At the end of the month we request a price
> agreement update including all no-price items and all currently negotiated items with the
> human-updated price request.

## 2. What exists today — four fragments of one loop

| Route | Title on page | Function | Fate |
|---|---|---|---|
| `/abc-price-agreement-gaps` | Price Agreement Audit | ABC-only coverage scorecard over static `frequently_ordered_import` GPA list; renewal requests | retire → redirect |
| `/accounting/price-list/review` | Global Price List | per-office price reality (lowest open inv / API / neg min-mean-max) + branch drill | retire → redirect |
| `/accounting/price-agreement/builder` | Agreement Builder | negotiation worksheet over ABC class-A+B master × 36-mo spend; drafts, no send | retire → redirect |
| `/accounting/price-agreement/review` | Price List Review | staged family-level lists → description match QA → promote to agreement | retire → redirect |

Failure modes: none are fed by actual invoice-audit findings (3,946 No-Price lines go
nowhere); three are ABC-only and predate office-inherited pricing (mig 205); overlapping
review-checkbox systems; two pages share one name; no monthly cadence.

## 3. Decisions (Chris 2026-08-05)

1. **Full consolidation.** One "Price Agreement Management" surface; the four routes above
   redirect to it and their code retires.
2. **Gap rule: ≥2 purchases lifetime.** An item enrolls in the Gap Worksheet when bought on
   2+ invoices ever (per vendor + PE office) with no in-force negotiated price. Stats
   columns carry recency so stale history is visible.
3. **Monthly send: auto-draft on the 1st.** Cron builds each vendor's packet — all gap
   items + all currently negotiated items with human-updated target prices — as an
   AgentMail draft via Maya.Chen to Chris & Lucinda to forward (same pattern as the weekly
   CM email). HTML + CSV + MD outputs, month-scoped tracker, "date generated".
4. **Line review: discrepancy lines only + block agents.** Review checkboxes on every
   discrepancy / No-Price / UOM-mismatch line in the invoice-audit tree (synced with the
   weekly CM page checkboxes). Agents may only classify lines at-or-under agreement price
   as valid; the classify endpoint rejects agent passes on positive-variance lines. Legacy
   agent passes on variance lines are re-opened (append-only re-pend).

## 4. The consolidated surface — `/accounting/price-agreements`

Office → Vendor scoped, four sections mirroring the loop:

1. **Coverage** — in-force / PAEXP-expired / missing per office × vendor, from
   `v_office_vendor_agreements` (mig 205; same source as the territory map).
2. **Gap Worksheet** — auto-enrolled no-price + UOM items per decision 2, columns:
   purchase count · qty · lifetime invoice value · min / max / avg paid · current API ·
   latest paid · proposed price (input). Prefill = latest paid.
3. **Renewal Worksheet** — currently negotiated items: agreement price vs avg/latest paid,
   variance, proposed update (input, prefill = current negotiated).
4. **Request & Ingest** — monthly packet generation + tracker (decision 3) and the staged
   returned-list QA (description match → confirm → promote), absorbed from
   `/accounting/price-agreement/review`.

Data plumbing: a `v_vendor_office_item_history` view (all-vendor invoice lines rolled up
per office+vendor+item: count, qty, lifetime value, min/max/avg/latest `price_per_uom` —
UOM contract docs/46) joined against mig-205 coverage for the no-price test; proposals
persist in a `price_agreement_proposals` table (draft → included-in-packet → superseded).

## 5. Build phases

- **P0 (this session): invoice-audit line review** — tree checkboxes on discrepancy lines
  wired to the same review marks as the weekly page; classify endpoint variance guard;
  legacy re-open sweep (migration 206).
- **P1: history view + Gap/Renewal worksheets** (read-only first, then proposal inputs).
- **P2: monthly packet producer + cron + tracker; Request & Ingest absorbs staged-list QA.**
- **P3: retire the four routes (redirects), delete dead libs, nav update.**
