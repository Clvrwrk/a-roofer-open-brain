# 47 — ABC Supply API: open conversations with the ABC API team

A running log of confirmed limitations / defects in the ABC Supply invoice & order
API that we need ABC's API team to fix or explain. Each item carries the evidence we
found, the business impact, and the ask. Update this file as items are raised and resolved.

- **Account:** Pro Exteriors LLC — ABC account `2036874-0001`
- **Maintained by:** Cleverwork / Open Brain
- **Status key:** 🔴 open · 🟡 raised, awaiting ABC · 🟢 resolved
- **Evidence baseline:** prod Supabase `rnhmvcpsvtqjlffpsayu`, ABC open/closed invoice
  report downloads dated 2026-06-19, last API sync 2026-06-18 09:45 UTC.

---

## 1. 🔴 No date-paid / payment-clearing date on invoices

**What we see.** The invoice detail payload (`raw`) contains only `lines` plus header
fields (`invoiceDate`, `orderDate`, `totalAmount`, `isCreditMemo`, …). There is **no
due date, no date-paid, and no open/closed (AR) status** anywhere in the API. We
confirmed by enumerating every key in `raw` and `raw->lines` across all 560 synced
invoices.

**Impact.** We cannot compute AR aging, paid vs. unpaid status, or cash-application
timing from the API alone. Today the only source of paid/closed truth is ABC's
**manually downloaded** open/closed invoice reports.

**Interim workaround (in our brain).** We ingest the open/closed report CSVs and store
AR fields on `abc_invoices` (`ar_status`, `due_date`, `date_paid`, `ar_total_due` —
migration 123). Because the report has no real payment-clearing date either, **we use
the report's `DUE_DATE` as a proxy `date_paid` for closed invoices** (falling back to
`INVOICE_DATE` when `DUE_DATE` is blank, flagged via `date_paid_is_proxy`). This is a
proxy, not the real settlement date.

**Ask to ABC.** Add a real payment/settlement field to the invoice API:
`paidDate` / `paymentClearedDate`, plus `dueDate` and an `arStatus` (open/closed). Even
exposing the same fields the downloadable report uses (DUE_DATE, TOTAL_PAYMENTS,
TOTAL_BEFORE_PAYMENT) would let us drop the manual CSV step.

---

## 2. 🔴 Invoice line items are truncated at 10 per invoice

**What we see — this is the important one.** The invoice detail endpoint returns **at
most 10 line items per invoice**. Verified dataset-wide:

- `max(jsonb_array_length(raw->'lines'))` across all 560 synced invoices = **10**.
- **152** invoices sit at exactly 10 lines; **zero** invoices have more than 10.
- The downloaded report proves the real invoices have **more** than 10 lines. Examples
  (open set, 2026-06-19 download):

  | Invoice | API lines (raw) | Real lines (report) | API line $ sum | Real line $ sum | Missing line $ |
  |---|---|---|---|---|---|
  | 2010452632-001 | 10 | 26 | 9,714.90 | 13,296.14 | 3,581.24 |
  | 2010874108-001 | 10 | 14 | 3,810.03 | 8,001.15 | 4,191.12 |
  | 2008816395-001 | 10 | 18 | 2,726.95 | 6,207.63 | 3,480.68 |
  | 2010333683-001 | 10 | 20 | 3,718.52 | 5,396.14 | 1,677.62 |

**Impact.** Invoice **header totals are still correct** (`totalAmount` is a header field
and matched the report on **all 171** in-window open invoices, $0 variance), so AR
dollars and totals are unaffected. But **line-level detail is silently lost** for every
invoice with >10 lines. That breaks line-by-line price-agreement auditing, UOM
normalization, and per-item spend analysis for those invoices — across the open set
alone, **~$42.8K of line value is missing** from the API vs. the report.

**Why it's dangerous.** The truncation is *silent* — no pagination cursor, no
`hasMore`, no total-line count. An invoice with 26 lines looks complete at 10.

**Ask to ABC.** Either (a) return all line items, or (b) provide pagination on invoice
lines (cursor / `page` / `pageSize`) with a `totalLineCount` so we can detect and fetch
the rest. Confirm whether the cap is 10 exactly and whether it applies to the order API
as well.

---

## 3. 🔴 No historical invoices before the API's available window

**What we see.** The API returned invoices from **2025-12-04** onward only (560
invoices). The downloaded reports contain invoices back to **2025-04-13** — **415
invoices (~$1.65M of closed activity)** that the API does not expose to us.

**Impact.** We cannot backfill pre-Dec-2025 invoices or their line detail from the API.
Any historical spend / price-trend analysis before Dec 2025 must come from the report
CSVs.

**Ask to ABC.** What is the retention / availability window of the invoice API? Is there
a date-ranged or archival endpoint to pull older invoices?

---

## Appendix — how we validated (reproducible)

1. Loaded the 2026-06-19 open/closed report CSVs into staging tables
   `abc_invoice_ar_import` (971 invoices) and `abc_invoice_ar_line_import` (12,061 rows).
2. Compared every in-window open invoice's API `total_amount` to report `TOTAL_DUE`
   (0 mismatches / 171) and API line-sum to report line-sum (56 mismatches → all
   explained by the 10-line cap, except 3 minor invoices ~$244 of API-side line
   splitting / report-side consolidation).
3. Confirmed `max(raw->'lines') = 10` dataset-wide.

Full audit record: [`docs/48-abc-invoice-ar-and-api-validation-audit.md`](48-abc-invoice-ar-and-api-validation-audit.md).
