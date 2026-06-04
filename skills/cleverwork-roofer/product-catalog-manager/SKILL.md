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
