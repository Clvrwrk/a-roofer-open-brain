# Vendor pricing catalog + line-by-line agreement approval (design)

Status: design / partially built. The territory, agreement-currency, refresh, and
invoice-gate layers are live. This doc covers the **product catalog as single
source of truth** and the **line-by-line SKU price approval** workflow that sit
on top of them, plus the One Brain recording principle.

## Principles (from Chris)
- The **main product table (`public.products`) is the single source of truth.**
- Every invoice line must map to a catalog product — or that line item must be
  **added to the catalog** (nothing prices off-catalog).
- The same product across vendors carries **each vendor's SKU# / product ID#**.
- The catalog exposes **min / max / mean price per vendor and per territory**, and
  each vendor agreement's **expiry date**.
- When a new price list is loaded, **every SKU whose price changed must be
  approved on the dashboard, line by line**, before it becomes authoritative.
- Manual now (zero automation) as the fallback if agents fail. Once agents are
  live, **all work is also recorded in the One Brain (`public.thoughts`)** with
  provenance + trust_tier so historical context is never lost.

## What exists today
- `products` (530) — catalog: `internal_sku`, `manufacturer_sku`, manufacturer,
  taxonomy, base_uom, top-20 flags, trailing-12mo spend/volume.
- `product_vendor_price_observations` (1,970) — every price point (product ×
  vendor × branch × region × time). Basis for min/max/mean.
- `price_agreements` / `price_agreement_items` — agreement header + lines (lines
  empty until price sheets are parsed). Items already carry `needs_review`.
- `abc_price_change_log` — v1→v2 per-item deltas (basis for "what changed").

## Proposed additions (not yet applied — pending decisions below)
1. **`vendor_product_sku`** (cross-vendor SKU map): `product_id`, `vendor_id`,
   `vendor_sku`, `vendor_product_id`, `unique(vendor_id, vendor_sku)`. Lets one
   catalog product resolve to each vendor's SKU.
2. **`v_product_vendor_territory_price`** (view or matview): per product × vendor
   × region → `min / max / mean / latest` from observations, plus the current
   agreement price and `expiry_date`. This is the "catalog with min/max/mean".
3. **Line approval columns** on `price_agreement_items`: `prior_price`,
   `price_delta`, `pct_change`, `approval_status` (`pending|approved|rejected`),
   `approved_by`, `approved_at`. Only `approved` lines feed the authoritative
   catalog price.
4. **Invoice-line reconciliation**: flag `abc_line_items` whose SKU has no
   `product_id` → an "add to catalog" queue (enforces the off-catalog rule).
5. **Line-approval UI**: extend the Price Agreement Audit tab's change list with
   per-line Approve / Reject (records actor), feeding `approval_status`.

## Units of measure
- **Distances/measurements are US Standard (miles).** The territory UI shows
  miles; drive-time territories are time-based (2 hours).
- **Catalog UOM comes from the invoice** — the product's `base_uom`. During an
  audit a user may **switch a line to a different UOM only when a conversion
  factor exists** in `product_uom_conversions` (directional pairs); the factor is
  applied to recompute price/qty. **If no factor exists for that pair, the UOM
  cannot be changed** (the control is disabled). UOM is never free-text.

## One Brain recording
Manual actions are already audit-logged (`invoice_action_log`, agreement
`ceo_verified_by/at`, `price_refresh_request` status trail). When agents deploy,
each approval/override is **also** written to `public.thoughts` as an atom with
`trust_tier='instruction'` (human-confirmed), `property_id`/`job_id` where
relevant, and model-card provenance — so the dashboard fallback and the agent
record converge in the brain (CONVENTIONS §2/§3).

## Open questions (block the line-approval build)
1. **Price-sheet ingestion** — how do `price_agreement_items` get loaded: an
   agent/skill that parses the vendor PDF, a CSV import, or manual line entry on
   the dashboard? (Determines the "add agreement" flow and where diffs come from.)
2. **Approval trigger** — does *any* price change require line approval, or only
   changes beyond a threshold (e.g. > 2% or > $X)? Unchanged SKUs auto-carry.
3. **Min/max/mean window** — trailing 12 months, or all observations? Per branch
   or rolled up to territory/region?
4. **Approver role** — CEO approves the agreement header; who approves individual
   lines (purchasing? CEO for increases above a threshold)? Maps to WorkOS roles
   in `deployment/remote/dashboard/AUTH.md`.
