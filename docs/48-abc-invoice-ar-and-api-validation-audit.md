# 48 — ABC invoice AR backfill + API-vs-download validation audit

**Date:** 2026-06-19 · **DB:** prod Supabase `rnhmvcpsvtqjlffpsayu` (live for dev + cc.proexteriorsus.net)
**Source files:** ABC open/closed invoice report downloads, account `2036874-0001`, 2026-06-19
**Migration:** `schemas/cleverwork-roofer/123-abc-invoice-ar-status.sql`

## Goal

1. Record AR status + a `date_paid` for closed invoices, using the report's `DUE_DATE`
   as the paid-date proxy (the ABC API has no real payment-clearing date).
2. Validate that our open-invoice data and our API-sourced numbers match the report.
3. Audit every mismatch and surface anything needing Chris's review.

## What was done

- Added additive AR columns to `abc_invoices` (mig 123): `ar_status`, `due_date`,
  `date_paid`, `date_paid_is_proxy`, `ar_total_due`, `ar_source`, `ar_synced_at`.
  The sync writer (`mirror-backfill.mjs`) does not set these, so they survive resync.
- Loaded the two report CSVs into staging tables `abc_invoice_ar_import` (971 invoices)
  and `abc_invoice_ar_line_import` (12,061 line rows) — kept as an import audit trail.
- Backfilled **556** invoices: **171 open**, **385 paid**.
  - `date_paid` = report `DUE_DATE`; for **184** closed docs with a blank `DUE_DATE`
    (credit memos, debit/finance-charge docs, "Due on Receipt") it falls back to
    `INVOICE_DATE` with `date_paid_is_proxy = true`.

## Report coverage vs. our data

| Set | Distinct invoices | Date range | Notes |
|---|---|---|---|
| Open report | 172 | 2026-04-20 → 2026-06-18 | unpaid AR |
| Closed report | 799 | 2025-04-13 → 2026-04-20 | paid |
| API (`abc_invoices`) | 560 | 2025-12-04 → 2026-06-17 | only source for line detail |

## Validation result (the headline)

**Invoice totals match exactly.** For all **171** open invoices present in the DB, API
`total_amount` equals report `TOTAL_DUE` — **0 variance**. AR dollars are trustworthy.

## Mismatches found & explained

### A. Open invoices in the report but not in the DB — 1 (sync lag, not an error)
`2010370311-002` (+ sibling `-001`), invoice date **2026-06-18**, $214.42. The last API
sync ran **2026-06-18 09:45 UTC**; this invoice post-dates it. Next sync will pick it up.

### B. DB invoices in neither report — 4 (expected, not an error)
`2005226317-001`, `2006965967-001`, `2008192309-001`, `2010805578-001` — all
**$0 total** (2 are credit memos). Zero-balance docs don't appear on ABC's AR reports.

### C. Line-sum mismatches — 56, dominated by an API defect
- **53 of 56**: the ABC API **truncates invoice lines at 10**. Header total stays
  correct; line detail beyond line 10 is silently dropped. Dataset-wide: no invoice has
  >10 lines, 152 sit at exactly 10. ~**$42.8K** of line value missing across the open
  set; worst single invoice missing **$4,191** of line detail (`2010874108-001`).
  → Tracked as item #2 in [`docs/47`](47-external-abc-api-open-conversations.md).
- **3 of 56** (minor, ~$244 total): API has *more* lines than the report
  (`2009483334-001` +$162, `2009262059-001` +$69, `2008342472-001` +$12.70) — API-side
  line splitting or report-side consolidation of identical items.

## ⚠️ For Chris's review

1. **API 10-line truncation (highest priority).** This is a real ABC API defect, not a
   sync bug. It caps line-level price/UOM auditing for the 152 maxed-out invoices. Do we
   (a) push ABC to fix/paginate, (b) drive line-level audits from the report CSVs or the
   invoice PDFs instead, or (c) both? Logged in docs/47 to raise with ABC.
2. **`date_paid` is a DUE_DATE proxy**, not a real settlement date — fine for aging
   buckets, not for exact cash-application timing. OK to keep as the standing definition?
3. **184 closed docs use the invoice_date fallback** for `date_paid` (blank DUE_DATE).
   Confirm that's acceptable for those doc types, or specify another rule.
4. **415 historical invoices (~$1.65M)** exist only in the reports, not the API. Want
   them imported into the brain, or left as report-only history?
