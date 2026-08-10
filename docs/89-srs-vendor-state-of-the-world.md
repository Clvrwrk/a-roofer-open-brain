# 89 · SRS — state of the world (2026-08-09)

**Read this before doing ANY SRS work.** Chris's directive: all SRS work must be
documented in one place so agents stop re-discovering it. This is that place —
update it whenever SRS state changes.

## Ingestion (manual weekly, Monday nights)

- SRS invoices arrive as **Billtrust CSV + one PDF per invoice, manually,
  weekly on Monday night**. SRS API access is requested but still queued at SRS
  — until it lands, ingestion stays manual. (QXO: same tables, 3 invoices.)
- Loader: `integrations/bridges/ingest-vendor-invoice-csv.mjs --vendor=srs`
  → `vendor_invoices` / `vendor_invoice_lines` / `vendor_invoice_uploads`
  (mig 192; vendor keyed by `vendors.id`, slug `srs`). CSV/PDF formats:
  docs/80. Original plan: docs/79.
- PDFs: `scripts/invoice-audit-v2/link-vendor-invoice-pdfs.mjs --vendor=srs`
  → `invoice_documents` (30 linked as of 2026-08-09).
- Branches: 448 SRS branches in `vendor_branches`
  (`integrations/bridges/load-vendor-branches.mjs`, srs-roofhub data 2026-08-04).
  RoofHub SIPS API bridge: `integrations/bridges/srs-roofhub/` — **planned, not built**.
- **The PE job number rides `vendor_invoices.po_number`** (e.g. `KS-198`) —
  28/30 SRS invoices join `acculynx_jobs.job_number` directly. No fuzzy matching
  needed (unlike ABC).

## Pricing & agreements

- **5 SRS agreements** live in the generic `price_agreements` /
  `price_agreement_items` (NOT `abc_price_agreements`), loaded 2026-08-04/05 from
  the Level-4 price sheet + Wichita quote
  (`integrations/bridges/ingest-agreement-pdfs-2026-08-04.mjs`; decision 13 in docs/81).
- The audit views (mig 221 + 217/222/223 silo rules) resolve SRS prices through
  the generic arm of `v_office_vendor_agreements` — as of 2026-08-09: 242 audit
  lines, **65 with negotiated price**, 177 No-Price (pending human review).
- Claims run **`srs_2026-08-05`**: 242 `invoice_line_reaudit` rows / 30 invoices /
  $3,329.54 variance. ⚠️ That run was generated **ad-hoc** — there is no committed
  SRS claim-generator script (gap; see Linear epic). It was also mis-stamped
  `abc-supply` by mig-223's default and **restamped `srs` on 2026-08-09**.
- 12 SRS `credit_memo_requests` exist, all `cancelled` ($0) after the office-silo
  claim retraction.

## Where SRS is at parity (verified 2026-08-09)

- Audit views (`v_invoice_audit_invoice/line/invoice_vendor`) include SRS.
- Multi-vendor CM pill + weekly email + weekly CSVs are vendor-scoped (docs/88).
- QB bank export covers SRS (mig 226; `/accounting/qb-bank-export`).
- `invoice_audit_reset` is vendor-scoped (mig 227) — SRS invoices reset correctly.
- Endpoint call paths (approve / pending / add-line / disposition / verify-paid /
  receipt-review / PDF) are vendor-scoped or fail closed on collisions.

## Known gaps (tracked in the Linear SRS-parity epic — check there first)

1. **No committed SRS claim generator** (`wave-b-reaudit.sql` is ABC-only).
   ⚠️ G1 REQUIREMENT (Chris 2026-08-09, learned the hard way): the generator MUST
   exclude `doc_type='credit'` — the ad-hoc srs_2026-08-05 run pulled 12 credit
   docs into the claims pipeline and drafted a CM request ON a credit memo
   (0050095528-001, cancelled). Credit docs reconcile against the original
   invoice / CM request (receipt flow), never through the standard price audit.
   Guards now enforce this (pendingLines=0 for CM docs, add-line 409 credit_doc).
2. **add-line agreement context** is ABC-keyed (`abc_price_agreements` by int id) —
   SRS CM lines say "negotiated price list on file" instead of naming the agreement.
3. **add-line office context**: `mv_invoice_pricing_office` is ABC-only → SRS claim
   rows carry no PE office. ⚠️ matview surgery — see ABC-breakage notes in the epic.
4. **Received-CM reconcile is ABC-only** (mig 220 reads the ABC mirror): an SRS
   credit that arrives never satisfies its request. `disposition.ts` refuses
   non-ABC received CMs with `vendor_not_supported` until this lands.
5. **No SRS AR feed**: `vendor_invoices.ar_status` exists but nothing populates it
   (SRS statement export never requested); paid state rides `invoice_documents`.
6. Benchmark cascade (`v_invoice_lines_complete`) is ABC-only — SRS detail shows
   "—" for API/Recent/Org-Inv tiers (api tier is by-design absent for SRS).
7. `generate-credit-memo-packet.mjs` is ABC-flavored (dates, salutation, run filter).
8. Repo hygiene: applied bodies of migs 220/221/222/223 exist only in Supabase
   migration history — the numbered repo files are `SELECT 1` markers.

## Invariants (same as ABC — docs/87)

- Price agreement = (vendor, PE office); unknown office ⇒ No-Price; fail closed.
- Every money row keys `(vendor_slug, invoice_number)`; slug vocabulary =
  `vendors.slug` (`srs`, never `SRS` or `srs-distribution`).
- `silo_assertions()` (nightly) must stay at 0 after any SRS change; verify
  through the live call path, never just the build.
