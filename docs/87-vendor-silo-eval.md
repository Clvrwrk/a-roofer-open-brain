# 87 — End-to-end vendor/office silo evaluation (2026-08-07)

**Trigger:** Chris caught the Price List drill-down showing ABC agreements for an SRS
invoice, then mandated: *"end to end eval of the legacy system… we can't have a single
error, this is money."*
**Method:** two exhaustive code sweeps (59 links/routes + every write/decision path)
plus live-data verification of every priced generic line.
**Related:** migs 208 (vendor silo), 217 (office silo), 221–222 (SRS/QXO light-up), 223 (re-key).

## The doctrine

A price agreement is specific to **(vendor, PE office)**. An invoice line may be
priced/challenged only by an agreement matching BOTH. Every table that keys money
by invoice number must carry a vendor discriminator, because invoice numbers are
NOT globally unique across vendors. Unknown office ⇒ No-Price. Fail closed.

## What the eval found and fixed (all deployed 2026-08-07)

| # | Finding | Fix |
|---|---|---|
| 1 | **mig-222's vendor fix landed in dead code** — the live tree/detail loaders never stamped `Invoice.vendor`, so every drill-down link still said `vendor=abc-supply` (the exact bug Chris recorded) | Vendor stamped in the LIVE loaders (`loadFreshInvoiceAuditSummary`, `loadInvoiceAuditInvoiceDetail`) from `v_invoice_audit_invoice_vendor` |
| 2 | AR/paid state from `abc_invoices` applied to any vendor's row | `paid` gated on `vendor === 'abc-supply'` |
| 3 | 📋 button gate read the ABC-only matview — wrong for SRS both ways | Coverage per (vendor, office) via `v_office_vendor_agreements` |
| 4 | `invoice_line_audit` writers omitted `vendor_slug` — every SRS/QXO decision filed as ABC; no line↔invoice ownership check | `classify`, `review-line`, `add-line` stamp the real vendor; classify refuses lines not belonging to the named invoice |
| 5 | `credit_memo_requests`: global `UNIQUE(invoice_number)`, vendor only in packet JSON, "ABC Supply" defaulted in 3 readers | Mig 223: `vendor_slug` column, `UNIQUE(vendor_slug, invoice_number, request_kind)`; writers stamp it; weekly/pending/CSV label from the column |
| 6 | `invoice_payment_processed`: global `UNIQUE(invoice_number)` — collision would verify both vendors as paid | Mig 223 re-key; `verify-paid` + `vendor_payment_memo_apply` vendor-scoped |
| 7 | `credit_memo_claims_sync` (unattended, 15-min cron) read lines by bare invoice number over the UNIONed view | 223b: loops per-vendor CM rows; line reads ownership-tested against `vendor_invoice_lines`; claim rows stamp `vendor_slug` |
| 8 | Invoice PDF route fell back to the ABC API for any number | Fallback gated to ABC invoices |
| 9 | `mark-paid` hard-wired to ABC tables | Explicitly refuses non-ABC (`vendor_not_supported`) |
| 10 | Order Audit price-list link carried no vendor | Explicit `vendor=abc-supply` (order data is ABC-only) |
| 11 | Detail loader `maybeSingle()` on the UNIONed view — collision would 500 both invoices | `limit(2)` + vendor disambiguation |

**Data correction:** the first `silo_assertions()` run caught 12 CM requests on SRS
invoice numbers stamped `abc-supply` (Aug-5 artifacts; all cancelled/$0 — no money
moved). Corrected to `srs` with packet provenance. Post-correction: **0 violations**.

## Standing guard

`silo_assertions()` recomputes every priced generic line's winning agreement nightly
(pg_cron 09:30 UTC) and flags: any vendor crossing, any office crossing, any audit-ledger
or CM row whose vendor stamp disagrees with the invoice's true vendor. Violations land in
`dashboard_action_log` (`workflow='silo-assertions'`). Zero rows = clean.

## Verified clean (no action)

- Pricing engine: all 65 priced SRS lines — 0 vendor, 0 office violations; the decisive
  case (TOPTSLB1236) chose Denver's $69.25 over Wichita's cheaper $65.00 because the
  office wall correctly hid the cheaper agreement.
- `branch-price-list.ts` (the reference silo implementation), price-agreements
  propose/coverage (vendor+office IDs end-to-end), review-line/receipt-review (surrogate
  keys), `invoice_documents` (already `UNIQUE(vendor_id, invoice_number)`),
  `invoice_pipeline_status` (already `UNIQUE(vendor_slug, invoice_number)`).
- All 7 real vendor/branch drill-downs render their own vendor's agreements only.

## Deferred — fail-closed today, do before SRS goes deeper

1. `invoice_audit_reset` vendor scoping (today it 404s for non-ABC — safe; a number
   collision would cross before scoping is added).
2. Agreement Builder is silently ABC-hardcoded (`"ABC Supply Co."` literals, ship-to
   prefix `2036874%` in promote) — label it ABC-only or vendor-parameterize.
3. `invoice_pipeline_status.vendor_slug` uses legacy `'abc'` — normalize to vendors.slug.
4. Dead code carrying old defaults: `invoice-payment.ts` orphans (batch routes deleted in
   `6e95230`), `loadInvoiceAudit`/`loadFreshInvoiceAudit`, `loadDecisionDetailCsv` —
   delete so they can't be revived with `?? "abc-supply"` semantics.
5. `add-line` office/agreement context is ABC-keyed — generic arm needed before SRS CMs open.
6. No typechecker in `check` (missing required fields ship silently) — add `astro check`/tsc.
7. Dead `?invoice=` deep-link param on the tree (CM detail links silently drop scope).
