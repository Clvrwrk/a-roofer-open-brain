# 51 — Global Price Agreement: best-vendor-price + OCR ingest loop

Build record, 2026-06-19. Advances the vendor-agnostic catalog vision in
[`docs/14`](14-vendor-pricing-catalog-and-line-approval.md) and the OCR pipeline validated in
[`docs/50` §B](50-monday-invoice-filter-and-price-list-phases.md). UOM rules per
[`docs/46`](46-uom-pricing-normalization.md).

## Decision (Chris, 2026-06-19)

The "Global Price Agreement" the prior handoff proposed building net-new
(`global_catalog_item` / `vendor_item_xref` / `vendor_price` / `v_best_vendor_price`)
**already exists** under different names, ABC-seeded 2026-06-04..08. Chris chose to
**extend the existing layer, not reinvent it** (avoids duplicating data + orphaning
`estimate_product_mappings`). The handoff's proposed tables map 1:1 onto live ones:

| Handoff name | Existing table/view | Rows |
| --- | --- | --- |
| `global_catalog_item` | `products` (internal_sku, manufacturer_sku, manufacturer_id, taxonomy, base_uom, bd_per_sq, impact_class, is_top20, 12mo spend) | 682 |
| variations | `product_color_variants` | 220 |
| `vendor_item_xref` | `products.manufacturer_sku` = vendor item#; `price_agreement_items.product_id` | — |
| `vendor_price` | `product_vendor_price_observations` (vendor × product × time, `price_in_base_uom`) | 2,205 |
| `v_best_vendor_price` | **added this pass** (mig 132) | — |
| vendors | `vendors`: ABC, Home Depot, Lowes, QXO, SRS (only ABC has data yet) | 5 |

The catalog↔vendor key: **`products.manufacturer_sku` = the ABC item_number**.

## What this pass added

### 1. Best-vendor-price selection (migration 132)
- **`v_vendor_price_normalized`** — one row per (product, vendor): the vendor's representative
  price normalized to `products.base_uom`. **Prefers the negotiated price**
  (`v_current_negotiated_pricing`) when its `price_uom = base_uom`; otherwise falls back to the
  **latest observed** price (`product_vendor_price_observations.price_in_base_uom`). Negotiated
  rows priced in a different UOM with no known factor are flagged `negotiated_uom_mismatch` and
  left **unnormalized** — never converted blind (docs/46). Today: 20 such rows (all SQ-priced /
  BD-base, no `bd_per_sq`); they fall back to observed instead of polluting the comparison.
- **`v_best_vendor_price`** — estimate-time selection: the single **lowest** base_uom price per
  canonical product, the **winning vendor**, and **`vendors_priced`** (competition depth).
  Negotiated beats observed on a price tie.
- Verified: 682 products priced (196 negotiated / 486 observed), 20 UOM-mismatch flagged,
  `vendors_priced = 1` everywhere (ABC-only). The view is **structurally multi-vendor** — it
  becomes a real cross-vendor comparison the moment non-ABC observations land.

### 2. OCR price-list ingest loop (migration 133)
The recurring multi-vendor ingest path. EXTRACTION (vendor PDF → Unstructured.io `hi_res` →
Table HTML → staged rows) is the script step (validated docs/50 §B; key in gitignored `.env`).
This migration adds the durable **normalize + load** step:
- **`ingest_price_list_observations(source_doc, vendor_slug)`** — matches each staged
  `abc_price_list_pdf_import` row to a canonical product by `manufacturer_sku` and **upserts** a
  price observation (idempotent via unique idx `pvpo_unique_source`). Normalizes to `base_uom`
  only on exact UOM match; flags the rest `needs_review`. Returns
  `matched / normalized / needs_review / unmatched` counts. Writes evidence-tier observations
  (`source='price_list'`, `observer_type='agent'`) — promoting a price list to an authoritative
  `price_agreements` row stays the separate, exec-gated step (docs/50 §B).
- **`v_price_list_ingest_review`** — the human queue: each staged item tagged
  `matched_clean | matched_uom_review | no_canonical_product`. `no_canonical_product` rows are
  candidate new canonical products / color variants for that vendor.

**Proven end-to-end** on the real staged ABC payload `PA_2036874-16` (Justin Garza, eff
6/4–6/30): **37 matched** (20 normalized, 17 UOM-review), **19 unmatched** new SKUs. Idempotent
(re-run = identical counts, 37 observations, no dupes). **13 products** now take their best
price from the freshly-ingested price list — the loop demonstrably moves best-vendor selection.

## Open threads (next session)
- **Exec surface in the builder**: select best vendor at estimate time off `v_best_vendor_price`;
  add new canonical items for the `no_canonical_product` review rows.
- **UOM-review queue** (17 PA-16 rows + 20 negotiated): confirm SQ↔BD conversions so those prices
  enter the comparison (or keep family-level per SQ — the docs/46 stance).
- **Promote PA-16** to a live `price_agreements` row after exec review (supersedes stale prices —
  19 of its lines dropped, e.g. Highlander 147→126/SQ).
- **Other vendors**: ingest Home Depot / Lowes / QXO / SRS price lists to make `vendors_priced > 1`
  and the best-vendor comparison real.
- **44 Class A gap items** uncovered by canonical products — mostly color variants of seeded
  families (top 4 by spend: Tamko Heritage 30, OC Oakridge, Tarco MS300, Air Vent Airhawk SLA) +
  a low-spend gutter-accessory tail. Seed as `product_color_variants` if Class-A-complete coverage
  is wanted; not required for the best-price spine.
