-- 140-estimate-audit-line-abc-item.sql
-- Expose the mapped ABC item number on estimate audit lines so the branch-tied API Price column
-- can render (Chris, 2026-06-20). Estimate lines carry no item code; the resolution chain is
-- estimate_scenario_lines.product_mapping_id → estimate_product_mappings.vendor_item_id (vendor
-- 'abc_supply'). The loader then joins (abc_item_number × the estimate's branch) → v_branch_item_api_price.
-- Additive: CREATE OR REPLACE of the view (adds one column).

CREATE OR REPLACE VIEW public.v_estimate_audit_line AS
SELECT l.id AS line_id,
  l.option_id,
  l.description,
  l.rounded_quantity,
  l.required_quantity,
  l.sell_uom,
  l.unit_cost,
  l.line_cost,
  l.line_price,
  l.created_at,
  classify_roof_system(l.description, NULL::text) AS category_key,
  m.vendor_item_id AS abc_item_number
FROM public.estimate_scenario_lines l
LEFT JOIN public.estimate_product_mappings m ON m.id = l.product_mapping_id AND m.vendor = 'abc_supply';
