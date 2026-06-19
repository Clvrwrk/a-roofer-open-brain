# 46 — UOM & pricing normalization (the canonical pricing contract)

**TL;DR for future us:** Compare invoice/order prices to a price agreement **in one
unit only**. That unit is **ABC's pricing UOM** (`priceQty.uom`, e.g. `SQ`), which is the
unit agreements are quoted in. The one canonical effective price is
**`extendedPriceAmount ÷ priceQty.value`**. Everything else (the `quantity`/`uom`/
`unit_price`/`pricePerUnitAmount`/`effective_unit_price` columns, the ordered/shipped UOM)
is unreliable for comparison. Migrations **119–122** (2026-06-19) make this the contract.

## The bug we killed

ABC ships every line in two units at once:

```
                shippedQty            priceQty                 extendedPriceAmount
 shingles  →    { 99 BD }   ←3 BD/SQ→ { 33 SQ, factor 3 }      $4,603.50
 (3 BD/SQ)      stocking unit         PRICING unit  ───────────────┐
                                      agreements are quoted here ◄──┘  ($153.91 / SQ)
```

`abc_invoice_lines.quantity`/`.uom` were ingested **inconsistently** — usually from
`priceQty` (SQ), but for ~8.5% of lines from `shippedQty` (BD). So the SAME shingle SKU
stored a unit price of **$46.50** (per bundle) on some invoices and **$132** (per square)
on others, while agreements are always per SQ. `effective_unit_price` is a generated
column `= extended_price / quantity`, so it inherited the inconsistency. Orders were worse:
they carry price only in the ordered UOM (BD) with no conversion factor, and the order-audit
views did **no** UOM handling at all → live variances of −80% to −100% that were pure
artifacts. Migration 117 had patched ONE view by dividing the agreement price by the
conversion factor, but fragile (per-line, per-view, depended on qty/uom staying in sync).

Canonical sample item: `02MLVIA3SG` (Mal Vista AR 252 Storm Grey, 3 BD/SQ).

## The fix

### Single source of truth — raw-derived generated columns (migration 119)

`abc_invoice_lines` gains columns computed straight from `raw` (100% coverage, immune to
how any ingest writer fills the legacy columns, self-backfilling for all history):

| column | = | meaning |
|---|---|---|
| `ship_uom` / `ship_qty` | `raw.shippedQty.{uom,value}` | stocking unit (e.g. BD) |
| `price_uom` / `price_qty` | `raw.priceQty.{uom,value}` | **pricing unit (e.g. SQ) — agreements are in this** |
| `price_conversion_factor` | `raw.priceQty.priceConversionFactor` | ship units per priced unit (e.g. 3 BD/SQ) |
| **`price_per_uom`** | `raw.extendedPriceAmount ÷ raw.priceQty.value` | **THE canonical effective price, in `price_uom`** |

### The keystone — `v_item_uom_map`

Per-item UOM identity learned from the invoice feed: `item_number → ship_uom, price_uom,
units_per_price_uom`. This is how any surface answers "what UOM is this item priced in, and
how do I convert?" — used to align **orders** (which lack `priceQty`) to the agreement unit.

### Comparison rule (all dashboards)

```
effective price (invoice) = price_per_uom                         -- already in price_uom
effective price (order)   = unit_price × units_per_price_uom      -- BD→SQ via v_item_uom_map
compare to agreement.unit_price  ONLY when units line up
  (price_uom == abc_price_list_items.unit) ;  otherwise → uom_mismatch flag, variance NULL
```

We never fabricate a variance across mismatched units. System-wide that's 1 invoice line +
~14 order lines (e.g. `02GASTNSWW`, `03CTPRIRWW` — agreement says SQ, ABC invoices BD),
surfaced as **"UOM mismatch / Review (UOM)"** badges instead of fake numbers.

## Where it lives

| Layer | Object | Migration / file |
|---|---|---|
| Canonical columns + item map | `abc_invoice_lines.price_*`, `v_item_uom_map` | `schemas/cleverwork-roofer/119-canonical-uom-columns.sql` |
| Invoice audit | `v_invoice_audit_line`, `v_invoice_audit_invoice` | `120-invoice-audit-canonical-uom.sql` |
| Order audit | `v_order_audit_line`, `v_order_audit_order` | `121-order-audit-canonical-uom.sql` |
| Downstream | `v_recent_invoice_price`, `v_branch_item_spend`, `v_invoice_line_audit_eval` (auto-pass gate), `v_abc_invoice_lines_with_pdf` | `122-downstream-pricing-views-canonical-uom.sql` |
| App display | `scripts/invoice-audit-tree.ts`, `scripts/order-audit-tree.ts` (price `/UOM` suffix + mismatch badge) | command-center |
| App readers fixed | `lib/abc-price-gaps.ts`, `lib/credit-memo.ts` (were reading the inconsistent `pricePerUnitAmount`/`unit_price`) | command-center |

Views expose extra trailing columns `negotiated_uom` + `uom_mismatch`.

## Rules for future changes

1. **Never compare a price without checking the unit.** Use `price_per_uom` (invoices) and
   `v_item_uom_map` to convert orders. Do not use `quantity`, `uom`, `unit_price`,
   `effective_unit_price`, or `raw.pricePerUnitAmount` for cross-price comparison — they are
   per-stocking-unit or inconsistent.
2. **Agreement match must align units.** `price_uom == abc_price_list_items.unit` or flag.
3. **New pricing dashboard?** Read `price_per_uom` / `v_item_uom_map`, not the legacy columns.
4. Migrations stay additive + idempotent (CREATE OR REPLACE, ADD COLUMN IF NOT EXISTS).
   Generated columns derive from `raw`, so the ingest writer needs no change for pricing.

## Adjacent issues (NOT fixed here — separate work)

- Agreement match ignores the agreement **effective/expiry date** vs invoice date (a June
  agreement is compared to December invoices). `v_invoice_line_audit_eval` does window
  correctly; the audit views do not.
- Some ship-to branches have **no agreement match** (e.g. ship-to `…-21`) → `negotiated_price`
  null (a branch-coverage gap, not a UOM issue).
