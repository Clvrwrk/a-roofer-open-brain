# 50 — Monday invoice filter + ABC price-list ingest (prepared phases)

Two phases prepared 2026-06-19 from artifacts Chris provided. Data is **staged**, not yet
live. Plus a methodology-tightening recommendation.

## A. Monday invoice filter phase (validation) — `monday_invoice_queue` (mig 130)

Lucinda's "process Monday" list (27 invoices, from `Invoices to process on monday.pdf`).
Cross-referenced to our data:

- **All 27 are in our DB.** 24 are `ar_status='open'`; **3 are already paid** per the ABC
  report (worth a quick check with Lucinda — already-settled, or a timing gap).
- **Due-date window:** the open ones are due **2026-05-31 → 06-30** (invoice-dated Mar 20 –
  May 4). So the queue = **invoices coming due within ~30 days**. → filter signal = due date.
- **The gap:** **7 of 27 have no due date.** All 7 are **credit memos** (credits inherently
  carry no due date in ABC's report), and all 7 carry **terms** ("Net/1% 2nd End of Month",
  "End of Month") — which *derive* the due date.

### Proposed filter (to validate)
An `effective_due_date` = `COALESCE(due_date, derive_from_terms(invoice_date, terms))`, where:
- `Net/1% 2nd End of Month` → last day of (invoice month + 2)  [matches the 06/30 due dates]
- `End of Month` → last day of invoice month
Then the per-office queue = **open invoices with `effective_due_date` ≤ horizon (e.g. 30–45d)**,
grouped by PE office, with credit memos surfaced alongside their related invoices.

### Open items for validation
1. Confirm the horizon (30 vs 45 days) with Lucinda/Accounting.
2. We must **load `terms` into our data** — the API `raw` has no terms; the report CSV does.
   Backfill `terms` from the report so the derivation works.
3. Decide handling for the 3 already-paid invoices in the queue.

## B. ABC price-list ingest phase — `abc_price_list_pdf_import` (mig 131)

Two scanned PDFs from Justin (no text layer; partial transcription loaded):

- **`PA_2036874-16`** — new SKU-level **Customer Price Agreement** "Storm/wichita" (Justin
  Garza, eff 6/4–6/30/2026). Has item#/description/price/UOM. **Page 1 loaded (56 items).**
  Cross-check vs our current catalog: **19 prices DROPPED** (e.g. Highlander Nex AR 242
  **$147.17 → $126.00/SQ**, Vista AR 252 → $139.50). 29 are new items. → our current
  agreements are stale-high; PA-16 is a real improvement to adopt.
- **`wichita_branch_113_list`** — Customer **Price List** (branch 113, eff 6/16–6/30). Brand-
  grouped, **family-level** (descriptions only, no item#), in SQ/BD/RL. Not yet loaded.

### OCR pipeline — VALIDATED (Unstructured.io, 2026-06-19)
The recurring vendor-format problem is solved with **Unstructured.io** as the OCR engine
(key in `.env`, placeholder in `config/.env.example`). Proven end-to-end on both scanned PDFs:
- `POST https://api.unstructuredapp.io/general/v0/general` (`strategy=hi_res`) → Table
  elements with `text_as_html` (prices, descriptions, UOM extracted cleanly).
- **Normalization layer** (the key step): match OCR'd item# to `abc_product_catalog`.
  On the PA agreement, **66/73 exact (90%)**; 4 of the 7 misses auto-corrected via
  `pg_trgm` similarity (`02MLVIASHE→02MLVIA3HE`, `141P81716→14IP81716`); 3 ambiguous →
  human review queue. This is the ingest loop for every vendor going forward.

### Remaining (the deferred phase)
- Re-run both PDFs through the validated OCR loop and promote to a live agreement after
  the exec confirms the ~3 review-queue items per doc.
- Match the family-level branch list → our families → SKUs.
- After review, **promote PA-16 to a live agreement** (new `abc_price_agreements` +
  `abc_price_list_items`), superseding the stale prices. (The "price-list submission" review
  Chris flagged for later.)

## C. Methodology tightening (recommendation)

The 99 unique frequently-ordered items roll up to **53 product families / 177 SKU variations**
(avg 3.3 colors-sizes each). ABC's own price agreement/list is **family-level** (~70 lines),
not per-SKU. Our A/B/C/D catalog is ~1,300–1,500 items — granular because it carries the long
tail. **Recommendation:** treat the **~53 families / 177 SKUs** as the active review universe
(Class A is the same intent), and classify/negotiate at the **family** level (one price per
family, as ABC does), with per-SKU only where colors actually price differently. This cuts the
human review surface ~7× without losing the items that matter.
