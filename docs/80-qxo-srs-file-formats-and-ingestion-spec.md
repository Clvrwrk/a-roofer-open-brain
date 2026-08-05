# 80 — QXO + SRS File Formats & Ingestion Spec (2026-08-04)

Companion to [docs/79](79-qxo-srs-vendor-invoice-onboarding-plan.md). That doc set the architecture with four open decision points; this doc closes **§2.1 (samples)** and **§2.4 (agreements)** from the first real files Chris delivered, and turns them into a concrete parsing spec. Samples archived under `integrations/bridges/{qxo,srs-roofhub}/samples/` (gitignored if they carry job PII; formats documented here).

## 1. What was delivered (2026-08-04)

| File | Vendor | What it actually is |
|---|---|---|
| `SRSICORP_S036198_20260804123518_0.csv` | SRS | **Invoice-detail export** (Billtrust-style), acct S036198, 1,209 data rows |
| `BEACONROOFINGSUPPLY_563898_20260804123011_0.csv` | QXO | **Invoice-detail export**, acct 563898, 122 rows |
| `BEACONROOFINGSUPPLY_563898_20260804122905_0.csv` | QXO | **AR statement export** — aging buckets + invoice register, **two accounts** (563898 remit Pasadena; 688882 remit Atlanta) |
| `srspricelistcurrent.zip` | SRS | MELESSA (TX) **Level 4 price sheet** (eff 2026-02-16) + 2 quotes (Wichita `DJWIC`) |
| `Quote0049828559.pdf` | SRS | Quote, acct S036198-0001, branch DJWIC — item code + qty + ship UOM + **price + pricing UOM** |
| `reabcpricesheets (1).zip` | **ABC** | 2 NEW price agreements: 2036874-16 Storm/Wichita (eff 6/15–7/31/26, desc-only) + 2036874-9 Denver (eff 6/23–12/31/26, item numbers, PA-90502-9AMTT6) |
| `011. Pro Exteriors (4) (1).pdf` | **ABC** | Price list 2036874-2 DFW, branch 011 Fort Worth (eff 7/23–8/19/26, item numbers) |
| `Pro Exteriors - Roof Load-POS-35943*.pdf` | **ABC** | Same Denver agreement (copy) |

**Three of the eight files are ABC price agreements** → route through the *existing* ABC price-list ingest (`ingest-price-list-pdf.mjs` + mig 139 staging), not the new-vendor track. The Wichita + DFW lists are newer than anything in `abc_price_agreements` (newest effective dates on file) — ingest promptly.

## 2. The shared export shape (both vendors)

Both portals emit the same Billtrust-style denormalized CSV: **every row repeats the full invoice header**; rows split into
- **line rows** — `QTY`/`UM`/price/amount populated, item code present;
- **continuation rows** — only the description column populated (wrapped text, pack-size notes, "Reference Invoice No.X" markers).

Loader contract (both vendors): group by invoice number → take header fields from first row → emit a line per qty-bearing row → append continuation text to the preceding line's description. This is the same one parser with two column maps.

## 3. SRS invoice CSV — column spec

Header: `RETURN_ADDRESS, DOC_TYPE, INVOICE_NUMBER, INVOICE_DATE, ACCOUNT_NUMBER, BRANCH_NUMBER, PHONE/FAX, REMIT_ADDRESS, SHIPPING_ADDRESS, SHIP_TO_ACCT_NUM, PO_NUMBER, JOB_NUMBER, ORDER_DATE, SHIP_DATE, SALESPERSON, AGENTS, ORDER_TYPE, SHIP_VIA, CREATED_BY, TOTAL_DUE, TERMS, … QTY_ORDER_COL, QTY_SHIP_COL, UM_ORDER_COL, DESC_COL, QTY_CONVERTED_COL, ITEM_UNIT_PRICE_COL, DISPLAY_DISCOUNT_COL, NET_AMOUNT_COL`

- `INVOICE_NUMBER`: `0049707508-001` (order + `-seq`).
- `BRANCH_NUMBER`: **alpha code** (`AMDEN` = Denver, `DJWIC` = Wichita). Needs a crosswalk table to the 448-branch registry (`vendor_branches`, seeded 2026-08-04) — build it from `RETURN_ADDRESS` city/state on first sight of each code.
- `PO_NUMBER`: **PE job code** (`co-356`) → `normalizePeKey()` → AccuLynx match via mig 163. Case-insensitive.
- **UOM is solved natively**: line rows carry ship qty/UOM (`126 BD`) AND `QTY_CONVERTED_COL` = `42.00 /SQ` + `ITEM_UNIT_PRICE_COL` = `202.00 /SQ`. So `price_per_uom = 202.00`, `price_uom = SQ`, `price_qty = 42.00`, and `net_amount = 8,484.00 = 42 × 202` ✓. **Parse the `/UOM` suffix; never treat ITEM_UNIT_PRICE as a ship-UOM price.**
- Item code lives in the first `DESC_COL` of a line row (`MALVIARIRSBOK3`, `TOP1043274`); real description follows in continuation rows.
- `TERMS`: "NET 60 DAYS Due Date: 08/17/26" → parse due date.
- `DOC_TYPE`: INVOICE (credit memos presumably CREDIT — confirm on first sighting).

## 4. QXO invoice CSV — column spec

Header: `DOC_TYPE, WAREHOUSE_ADDRESS, REMIT_ADDRESS, SHIPPING_ADDRESS, INVOICE_NUMBER, DISPLAY_INVOICE_DATE, DISPLAY_DUE_DATE, ACCOUNT_NUMBER, SALESPERSON, SHIP_VIA, TERMS, PO_NUMBER, TAX_RATE, JOB_INFO, ORDERED_BY, DISPLAY_SUB_TOTAL, DISPLAY_SALES_TAX, DISPLAY_RESTOCK_FEE, DISPLAY_SHIP_COST, DISPLAY_TOTAL_DUE, PRODUCT_CODE_COL, DESC_COL, UM_COL, QTY_COL, NET_PRICE_COL, NET_AMOUNT_COL`

- `INVOICE_NUMBER`: alphanumeric (`SQ93192`, `SW26483`, `UV94655`).
- `WAREHOUSE_ADDRESS`: branch name + street + phone ("DALLAS BRANCH QXO 2251 STEMMONS TRAIL … 214-358-2600") → resolve to `vendor_branches.branch_number` (QXO numeric key) by **phone**, fallback address. The 566-store registry has phone for 100%.
- `JOB_INFO`: `2505001|SPEEDWAY CLUB-T` (QXO job#|job name). `SHIPPING_ADDRESS` embeds the PE job code (`… SPEEDWAY CLUB-T MC-15/MC-15 FORT WORTH`).
- **PE job code source of truth is the statement's `REF_NUM_COL`** (`MC-15`, `CO-5`, `KS182`, `CP-25-1010`, `TX-400`) — join detail↔statement on invoice number.
- **Single UOM only** (`BDL`, `RL`, `EA`): `NET_PRICE_COL` is per ship UOM. QXO needs the ABC-order treatment: a learned `vendor_item_uom_map` (units-per-pricing-UOM from price sheets/quotes) before SQ-normalized comparison. Until then, benchmark in ship UOM only where the benchmark shares the UOM (docs/46 rule: no cross-UOM variance, flag `uom_mismatch`).
- **Sales tax + restock + shipping are invoice-level** (`DISPLAY_*`) — ABC's pipeline has no tax column; `vendor_invoices` must carry `sub_total, sales_tax, restock_fee, ship_cost, total_due`.
- `PRODUCT_CODE_COL`: vendor SKU (`GAFSARIRMOBW`, `CARPSEUCF6100TW`).

## 5. QXO AR statement CSV — the AR reconciliation source

Header: `DISPLAY_STATEMENT_DATE, ACCOUNT_NUMBER, REMIT_ADDRESS/CONTACT, DISPLAY_CURRENT, DISPLAY_BAL_1_30, DISPLAY_BAL_31_60, DISPLAY_BAL_OVER_61, DISPLAY_UNAPPLIED_CASH, DISPLAY_TOTAL_DUE, INV_NUM_COL, REF_NUM_COL, JOB_DESC/NAME, INV_DATE_COL, DUE_DATE_COL, TYPE_COL (I=invoice, C=credit, S=service charge), INV_AMT_COL, AMOUNT_DUE_COL, RUN_BAL_COL, DISC_DATE_COL`

- One block per monthly statement; invoices repeat across statements while unpaid → **an invoice absent from the next statement = paid** (paid-date proxy = statement gap, same `date_paid_is_proxy` pattern as ABC AR import, mig 123).
- Feeds `vendor_invoices.ar_status/due_date/date_paid/ar_total_due` → the reconcile flow that ABC gets from its AR report. **This closes the docs/79 "no AR truth source" gap for QXO.** Ask SRS for the equivalent statement export.
- Two QXO accounts confirmed: **563898** and **688882** (separate remit addresses/phones) — `vendor_invoices` keys must include account.

## 6. SRS price sheets & quotes

- **Price sheet** (MELESSA Level 4): brand-sectioned `description + price + UOM` — same shape as ABC's desc-only price pages → reuse mig 139 staging + trigram match with an SRS parser; vendor param already exists (`ingest_price_list_observations(p_vendor_slug := 'srs')`).
- **Quotes** (`Quote0049828559`): item code + description + qty + ship UOM + **price + pricing UOM** (`92.00 /SQ` for a `BD` line) — quotes are the richest SRS UOM-map source; ingest them as price observations AND as `vendor_item_uom_map` evidence (BD→SQ conversion is derivable from "3 BD/SQ" in descriptions).
- "Level 4" is SRS's customer pricing tier — record on the agreement row (`version_label`).

## 7. What this changes in the docs/79 plan

1. **One parser, two column maps** (§Phase 2 gets cheaper): both vendors' portal CSVs share the Billtrust shape. Build `integrations/bridges/lib/billtrust-csv.mjs` once.
2. **SRS ships price_per_uom natively** — no UOM-map dependency for SRS invoice validation. QXO needs `vendor_item_uom_map` (seed from SRS-style descriptions + price sheets) or ship-UOM-scoped benchmarks initially.
3. **AR reconciliation is solved for QXO** via the statement export (§5); request the SRS statement export from the branch/portal.
4. **`vendor_invoices` schema additions** vs the 79 sketch: `account_number` (multi-account per vendor), `sales_tax`, `restock_fee`, `ship_cost`, `terms`, `salesperson`, `branch_key` (SRS alpha code / QXO numeric), `qxo_job_number`.
5. **PE job matching works day one** for both vendors (`PO_NUMBER` / `REF_NUM_COL` carry `{OFFICE}-{num}`) — mig 163 views generalize as predicted.
6. **Branch registries are loaded** (2026-08-04): 566 QXO + 448 SRS rows in `vendor_branches` (`integrations/bridges/load-vendor-branches.mjs`), territory containment computed (covered / overlap_pending / out_of_boundary). SRS invoice branch codes (AMDEN…) still need the §3 crosswalk table.
7. **ABC**: the three new agreements (Wichita 2036874-16, Denver 2036874-9 PA-90502-9AMTT6, DFW 2036874-2) go through the existing ABC ingest now — independent of QXO/SRS work.

## 8. Remaining open items (from docs/79 §2)

- **§2.2 table shape** — still recommending generic `vendor_invoices`/`vendor_invoice_lines`; nothing in the samples argues for per-vendor tables (confirmed: one shared CSV shape).
- **§2.3 intake front door** — these files arrived as manual downloads; the portal exports look schedulable/emailable. Confirm whether Lucinda can set the QXO (Billtrust) and SRS portals to email these exports monthly → AgentMail intake.
- Invoice **PDFs** for QXO/SRS (the CSVs carry everything the audit needs, so PDFs are evidence-attachment nice-to-have, not blocking).
