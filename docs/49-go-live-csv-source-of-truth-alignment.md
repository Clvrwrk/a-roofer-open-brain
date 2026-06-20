# 49 — Go-live alignment: ABC open/closed report as source of truth (the assumptions ledger)

**Date:** 2026-06-19 · **DB:** prod Supabase `rnhmvcpsvtqjlffpsayu` (live for dev + cc.proexteriorsus.net)
**Goal:** a "moment of truth" baseline for Monday go-live — Invoice Audit, Price Agreement
Audit, and Agreement Builder all in lockstep, with the **ABC open/closed invoice report
CSV** (account `2036874-0001`, pulled 2026-06-19) as the source of truth for open vs paid.

## Go-live baseline (verified 2026-06-19)

| Metric | Value | Source |
|---|---|---|
| **Open invoices** | **172** | = the open report CSV exactly |
| Paid / closed invoices | 803 | closed report + reconciled gate + imported history |
| Total invoices | 975 | 560 from ABC API + 415 imported from report |
| Actionable $ at-risk (open only) | $4,437.05 | un-passed overcharge vs negotiated, open invoices |
| Active to-audit lines (open only) | 1,110 | auditable, un-passed, open invoices |

## Lockstep (single canonical line source)

All three audit surfaces now read **`v_invoice_lines_complete`** (API lines for
un-truncated invoices + full CSV lines for the rest — migs 124–127):

- **Invoice Audit** → `v_invoice_audit_line/invoice` (built on the complete view)
- **Price Agreement Audit** → `v_invoice_lines_complete` directly (`abc-price-gaps.ts`)
- **Agreement Builder** → `v_branch_item_spend` (built on the complete view) + `v_negotiable_items`

Verified: `v_invoice_lines_complete` = `v_invoice_audit_line` = 5,803 lines; a sample
invoice shows 26 lines identically across surfaces. Open/paid everywhere keys off
`abc_invoices.ar_status` (the report), not the internal payment gate.

## What we did (reproducible)

1. **Open/paid = ABC AR report.** `invoice-audit.ts` now derives `paid` from
   `abc_invoices.ar_status` (falls back to the `invoice_documents` gate only when an
   invoice has no report coverage). "Open Invoices" KPI → 172, not 227.
2. **Reconciled the internal payment gate.** 56 invoices ABC marked paid but our
   `invoice_documents` gate hadn't cleared were marked paid via the sanctioned
   `gate_override` path, stamped `gate_override_by = 'AR reconcile 2026-06-19 (ABC
   open/closed report = source of truth)'`. 0 reverse conflicts.
3. **Imported 415 invoices** present in the report CSVs but not the API (414 historical
   paid, Apr 2025–Apr 2026 + 1 open sync-lag invoice `2010370311-002` dated 06-18) into
   `abc_invoices` + `abc_invoice_lines_full`, `ar_source='abc_csv_history'`,
   `lines_truncated_by_api=true` so `v_invoice_lines_complete` serves them. Lines
   reconcile to subtotal (0 mismatches). Historical paid lines marked `passed`
   (settled record) so they don't flood the active queue; the open sync-lag invoice
   stays active.
4. **Retired 3 dashboards from nav** (pages kept): Price Foundation, Negotiated Catalog,
   Price List Coverage (`lib/nav.ts`).

## Assumptions made (due to data limits)

- **`date_paid` is a proxy** = report `DUE_DATE` (ABC has no real payment-clearing date —
  docs/47 #1). Blank due dates (credit memos, finance charges, Due-on-Receipt) fall back
  to `invoice_date` (`date_paid_is_proxy=true`).
- **Truncated invoice line detail comes from the report CSV**, not the API, for 145
  invoices (ABC API caps lines at 10 — docs/47 #2). Full sets reconcile to subtotal.
- **Historical (pre-Dec-2025) invoices** exist only in the report; imported header+lines
  from CSV (`abc_csv_history`). Their `ship_to_number` is best-effort (`2036874-<suffix>`
  from the report's ship-to acct) and branch is from the report `BRANCH_NUMBER`; **1
  historical invoice has a blank branch** (report gap) and won't map to an office.
- **4 zero-$ documents** (in neither report) are tagged `ar_status='paid'`
  (`ar_source='zero_dollar_doc'`) — settled, not open AR.
- **`pricePerUnitAmount` (legacy `unit_price`) for CSV lines** is derived as
  `price_per_uom × price_conversion_factor` (matched the API on 1,440/1,490 overlapping
  lines; only `v_credit_memo_audit` reads it — everything else uses canonical
  `price_per_uom`).

## Dashboard obsolescence verdicts

- **Price Foundation** — retired. One-time data-quality migration tool;
  `price_foundation_review_actions` is empty (cleanup complete).
- **Negotiated Catalog** — retired from go-live nav. Reference catalog superseded by
  Agreement Builder's item drill-down; page kept for re-enable.
- **Price List Coverage** — retired from go-live nav. Distinct "request a price list at a
  branch" workflow; candidate to fold into Agreement Builder post-launch. Page kept.

## Not done / follow-ups

- The historical 415 are header+line from CSV only (no API enrichment). If ABC ever
  exposes older invoices (docs/47 #3), reconcile then.
- Re-running the ABC sync will pick up `2010370311-002`; the CSV-imported version is
  flagged `abc_csv_history` and the upsert will enrich it without clobbering AR fields.
