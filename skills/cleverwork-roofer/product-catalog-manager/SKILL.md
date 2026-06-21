---
name: product-catalog-manager
description: >
  Maintains the Pro Exteriors product file across vendor-specific SKUs by
  proposing best-match product equivalencies, checking UOM compatibility, and
  routing uncertain matches to a human reviewer before they can be used as
  instruction-grade catalog mappings.
when_to_use: >
  Trigger when a vendor price agreement item, invoice line item, catalog import,
  or retail benchmark item cannot be confidently linked to an approved product.
  Also trigger during vendor onboarding and six-month negotiated-pricing refresh.
inputs:
  - name: raw_vendor_item
    type: record
    required: true
    description: Vendor SKU, description, manufacturer, category, UOM, and source reference.
  - name: candidate_products
    type: record[]
    required: true
    description: Potential matches from products, product taxonomy, color variants, and prior approved mappings.
  - name: source_context
    type: record
    required: true
    description: Vendor, vendor branch, region/price zone, source document, and ingestion method.
outputs:
  - name: product_match_packet
    type: draft
    description: Candidate match with confidence, evidence, UOM notes, risks, and approve/reject/needs-info choices.
  - name: catalog_review_atom
    type: atom
    description: Evidence atom recording the proposed mapping and review status.
trust_tier_of_output: inference
bound_agents:
  - ob-ops
  - ob-accounting
  - auditor
provenance:
  origin: cleverwork
  author: Cleverwork
  source_url: null
  license: MIT
  a3_ref: proposals/2026-05-30-vendor-invoice-credit-memo-audit.md
---

# Product Catalog Manager

This skill proposes product equivalencies across vendor SKUs. It does not approve
its own mappings. A mapping becomes instruction-grade only after human approval
and an Auditor pass.

## Process

1. Normalize the vendor item description, manufacturer, category, size/profile,
   color, warranty/spec language, and UOM.
2. Retrieve candidate products using exact SKU, normalized description, taxonomy,
   manufacturer, color variant, and prior invoice-observation history.
3. Score candidates:
   - exact manufacturer SKU or approved vendor SKU mapping,
   - strong normalized name match,
   - same manufacturer/category/product type,
   - compatible UOM or approved conversion,
   - same color/profile when color affects price.
4. Classify the match:
   - `auto_accept_candidate` only when confidence is high and all required fields match;
   - `needs_human_approval` for close naming matches, UOM ambiguity, color ambiguity, or missing manufacturer fields;
   - `no_safe_match` when the item should become a new product candidate.
5. Build a Slack review packet for human approval when needed.

## Slack Review Packet

```text
PRODUCT MATCH REVIEW
Vendor: [vendor]    Branch/Zone: [branch / price zone]
Source: [price agreement PDF | invoice CSV | invoice PDF | retail benchmark]

Raw vendor item:
  SKU: [sku]
  Description: [description]
  UOM: [uom]
  Price context: [if available]

Recommended product:
  Internal SKU: [internal_sku]
  Name: [name]
  Manufacturer SKU: [manufacturer_sku]
  Base UOM: [base_uom]
  Confidence: [0-100]

Why this match:
  - [evidence bullet]
  - [evidence bullet]

Risks / review notes:
  - [ambiguity or none]

Approve | Reject | Needs Info
```

## Rules

- Never convert a proposed match to instruction-grade without human approval.
- Never use retail benchmark items as negotiated-price authority.
- If UOM conversion is missing or uncertain, mark `needs_human_approval`.
- If the product appears new, create a draft product candidate instead of forcing a match.
- Keep rejected mappings for audit; do not delete them.

## Promoting raw ABC catalog items into curated `products`

When an ABC item appears on a real invoice/order but has no `products` row (it lives only in
raw `abc_product_catalog`), it has no place to attach a per-branch API price and shows blank on
the audits. Promotion is identity-mapped (manufacturer_sku = ABC item_number), additive, and
idempotent. Verified procedure (migration 142, 2026-06-20):

- **`manufacturer_sku`** = `item_number`; **`name`** / `description_normalized` = `item_description`
  (upper for normalized).
- **`base_uom`** = the **stocking** UOM from `abc_product_catalog.uoms[]`
  (`uoms[] where description='stocking'`), NOT the costing UOM.
- **`manufacturer_id`** = explicit supplier→manufacturer **alias map** from `c.supplier_name`
  (ABC legal entity names) to `manufacturers.name` (curated brands) — e.g. `ACM SUPPLIER` →
  `AMERICAN CONSTRUCTION METALS`, `OWENS CORNING SALES LLC` → `OWENS CORNING`,
  `TAMKO BUILDING PRODUCTS INC` → `TAMKO ROOFING PRODUCTS`. Unmappable (`MUST ASSIGN A VALID
  SUPPLIER`, etc.) → fall back to the existing `MISCELLANEOUS VENDOR` (legacy_id 59); **don't
  invent new manufacturer rows** unless a real new brand.
- **`taxonomy_id`** = join the ABC hierarchy labels into `product_taxonomy`:
  `lower(major_group)=hierarchy.productGroup.label AND lower(category)=…category.label AND
  lower(product_type)=…productType.label`. A handful of `product_type` labels repeat — also
  match on major_group+category. Fallback for an unmatched type → a generic Other-Products row.
- **`internal_sku`** = `'M' || manufacturer.legacy_id || '-' || manufacturer_sku` (existing convention).
- **`is_active`** = true. NOT-NULL columns are: internal_sku, manufacturer_sku, name,
  manufacturer_id, taxonomy_id, base_uom. Idempotent guard: `WHERE NOT EXISTS (… manufacturer_sku)`.
- **Key nuance:** the invoice/order audits categorize by `category_key`, NOT `products.taxonomy_id`
  — so taxonomy_id is low-stakes for the audit display (still set it correctly).
- Items ABC **won't price** ("Cannot price item … Call for pricing" — `NS*` special-order metal)
  and transactional charges (freight/fuel/delivery/jurisdiction/credits) are intentionally NOT
  promoted; they have no API price by design.
