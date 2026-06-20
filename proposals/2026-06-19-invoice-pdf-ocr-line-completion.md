# A3: Invoice PDF OCR line-completion ingest

Proposed by: Chris
Date: 2026-06-19
Status: pending
Affected clients: pro-exteriors (template-wide candidate once proven)
A3 file: proposals/2026-06-19-invoice-pdf-ocr-line-completion.md

---

## 1. The problem (measured)

- **Task being performed today:** recovering the full line-item set of ABC Supply invoices for line-level price / UOM auditing. The ABC invoice JSON API (`GET /api/invoice/v1/invoices/id/{invoiceId}`) **silently truncates line items at 10** (confirmed live 2026-06-19 — see `integrations/bridges/abc-supply/abc-invoice-line-truncation-bug-report.md`).
- **Frequency:** every invoice with >10 lines is incomplete via the API. Current snapshot: **145 of 560** synced invoices are truncated (~26%); the worst is missing 16 of 26 lines / **$4,191** of line value; ~**$42.8K** of line value missing across the open set alone.
- **Time per occurrence today:** the only complete-line source without OCR is a **manual** ABC open/closed report CSV export (human download, then ad-hoc reconcile). New/out-of-window invoices have no automated complete-line path at all.
- **Cost of error:** line-level price-agreement and UOM audits (migs 99–122) run against truncated data for 26% of invoices → missed overcharges / agreement violations go undetected. A single undetected mispriced high-volume line can be hundreds of dollars per invoice.

---

## 2. Root cause (5 Whys — brief)

1. Why is line detail incomplete? — The ABC JSON API caps `lines` at 10 with no pagination or total-count.
2. Why not just use the API? — No param recovers >10 lines (tested `itemsPerPage`/`pageSize`/`includeAllLines`/`lineItemsPerPage`/`pageNumber`).
3. Why not rely on the CSV? — It's a manual periodic export; it doesn't cover future invoices or anything outside a downloaded report.
4. Why not wait for ABC? — Bug is filed (docs/47) but has no ETA; auditing can't pause.
5. Why now? — We just quantified the gap (26% of invoices) and confirmed the PDF endpoint (`GET /invoices/pdf/{invoiceId}`) contains all lines and is automatable.

---

## 3. Proposed solution

- **Which agent receives this skill:** accounting (auditor path).
- **What the skill does:** for any invoice flagged `lines_truncated_by_api` (or where line-sum ≠ subtotal), fetch the invoice PDF via the already-built `backfill-invoice-pdfs.mjs` path, OCR/parse its line table, normalize to the `abc_invoice_lines` shape (incl. canonical pricing UOM, migs 119–122), and write the complete set to `abc_invoice_lines_full` with `line_source='abc_pdf'`. Reconcile the parsed line-sum against the invoice subtotal as an automatic accuracy gate; only accept a parse that reconciles to the penny.
- **Primitive it builds on:** the Phase-1 completion scaffold shipped 2026-06-19 — `abc_invoice_lines_full` table + `v_invoice_lines_complete` view + truncation flags (mig 124). PDF acquisition already exists (`backfill-invoice-pdfs.mjs`, `abc-invoice-pdf.server.ts`).
- **Trust tier of output:** `evidence` (machine-parsed). Promote to `instruction` only after the reconcile-to-subtotal gate passes.

---

## 4. The new state (projected)

- **Coverage:** 100% of invoices get a complete, reconciled line set automatically — no manual CSV export.
- **Accuracy gate:** parsed line-sum must equal invoice subtotal (penny-exact) or the invoice is queued for human review. The verified CSV line detail (Phase 1) is the **ground-truth oracle** to validate the OCR parser before trusting it.
- **Required human review:** only invoices whose PDF parse fails the subtotal reconcile.

---

## 5. The math

| Item | Value |
|---|---|
| Current state | 26% of invoices audited on truncated lines; manual CSV the only complete source |
| New state | automated, reconciled, 100% line coverage |
| One-time build | PDF text/table extraction + parser + reconcile gate + backfill run |

**Exempt from 10x gate?** Yes — **high-error-cost task** (financial line-level audit integrity). Undetected mispricing on 26% of invoices is the error this prevents.

---

## 6. Risks

- **What breaks if it misbehaves?** A bad parse could write wrong line detail. Mitigated by the penny-exact subtotal reconcile gate — a non-reconciling parse is never accepted, it's queued for review.
- **Rollback path:** `abc_invoice_lines_full` rows carry `line_source`; PDF-sourced rows can be filtered/removed without touching API atoms in `abc_invoice_lines`. The `v_invoice_lines_complete` view is the only consumer.
- **New consent flags:** none (own-account invoices).

---

## 7. Alternative considered

- **Leave it on the manual CSV:** works for the current batch (Phase 1 already did this), but doesn't scale to new/out-of-window invoices and depends on a human export each cycle.
- **Defer until ABC fixes the API:** preferred end state, but no ETA; revisit if ABC ships full lines or line pagination (docs/47 item #2).

---

## 8. Decision

- [ ] **Approve** — build by [TBD]; pilot client: pro-exteriors
- [ ] **Kill**
- [ ] **Defer** — revisit at: [after current task list / Phase 6 cleanup]

Approver: Chris
Approved / decided on: ____

---

## 9. Post-build tracking (completed after pilot)

*Fill in after pilot.*
