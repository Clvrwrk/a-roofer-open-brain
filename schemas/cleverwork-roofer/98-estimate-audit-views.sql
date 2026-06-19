-- 98-estimate-audit-views.sql
-- Read-only views that shape the live estimate pipeline (schema 90) into the
-- Operations → Estimate Audit dashboard tree: PE Office → Job → Estimate → Line.
-- Additive and idempotent (CREATE OR REPLACE VIEW). No data is modified.
--
-- Office derivation chain (jobs carry no office_id): selected branch →
--   1. vendor_branches.pricing_territory_office_id → office.name
--   2. branch_office_candidate (isochrone containment) → office.name
--   3. "<branch city, ST> area" fallback, else "Unassigned".
-- Address comes from estimate_runs.metadata->>'source_csv' (Roofr export name).

-- Job level -----------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_estimate_audit_job AS
WITH sel AS (
  SELECT DISTINCT ON (be.run_id)
    be.run_id, be.branch_code, be.branch_name, be.drive_time_minutes
  FROM public.estimate_branch_evaluations be
  ORDER BY be.run_id, be.selected DESC, be.drive_time_minutes NULLS LAST
),
sel_opt AS (  -- client-selected scenario, else highest-price as the headline value
  SELECT DISTINCT ON (o.run_id)
    o.run_id, o.id AS option_id, o.total_price, o.gross_margin_pct, o.status, o.client_selected
  FROM public.estimate_scenario_options o
  ORDER BY o.run_id, o.client_selected DESC, o.total_price DESC NULLS LAST
)
SELECT
  r.id AS run_id,
  r.job_type,
  r.status,
  r.client_name,
  trim(regexp_replace(coalesce(r.metadata->>'source_csv', r.metadata->>'source_pdf', ''), '\.(csv|pdf)$', '')) AS address_full,
  trim(split_part(regexp_replace(coalesce(r.metadata->>'source_csv', ''), '\.(csv|pdf)$', ''), ',', 1)) AS street,
  r.acculynx_job_id,
  sel.branch_code,
  sel.branch_name,
  sel.drive_time_minutes,
  coalesce(
    (SELECT o2.name FROM public.vendor_branches vb JOIN public.office o2 ON o2.id = vb.pricing_territory_office_id
       WHERE vb.branch_number = sel.branch_code LIMIT 1),
    (SELECT o3.name FROM public.vendor_branches vb2 JOIN public.branch_office_candidate boc ON boc.vendor_branch_id = vb2.id
       JOIN public.office o3 ON o3.id = boc.office_id WHERE vb2.branch_number = sel.branch_code
       ORDER BY boc.is_suggested DESC, boc.drive_minutes NULLS LAST LIMIT 1),
    nullif(trim(split_part(sel.branch_name, ' - ', 2)), '') || ' area',
    'Unassigned'
  ) AS office,
  (SELECT vb.manager_name FROM public.vendor_branches vb WHERE vb.branch_number = sel.branch_code LIMIT 1) AS branch_manager_name,
  (SELECT vb.manager_email FROM public.vendor_branches vb WHERE vb.branch_number = sel.branch_code LIMIT 1) AS branch_manager_email,
  (SELECT vb.sales_rep_name FROM public.vendor_branches vb WHERE vb.branch_number = sel.branch_code LIMIT 1) AS branch_sales_rep,
  EXISTS (SELECT 1 FROM public.abc_price_agreement_branch_matches m WHERE m.branch_number = sel.branch_code) AS negotiated_pricing,
  (SELECT count(*) FROM public.estimate_scenario_options o WHERE o.run_id = r.id) AS scenario_count,
  EXISTS (SELECT 1 FROM public.estimate_measurements me WHERE me.run_id = r.id) AS has_measurement,
  EXISTS (SELECT 1 FROM public.estimate_proposals pr WHERE pr.run_id = r.id) AS has_proposal,
  so.total_price AS estimated_job_value,
  so.gross_margin_pct AS estimated_margin,
  (so.status = 'approved' AND so.client_selected) AS estimate_approved,
  (SELECT count(*) FROM public.estimate_scenario_options o WHERE o.run_id = r.id AND o.client_selected) AS selected_count,
  (SELECT pr.approved_by FROM public.estimate_proposals pr WHERE pr.run_id = r.id AND pr.approved_by IS NOT NULL
     ORDER BY pr.approved_at DESC NULLS LAST LIMIT 1) AS approved_by,
  (SELECT pr.approved_at FROM public.estimate_proposals pr WHERE pr.run_id = r.id AND pr.approved_at IS NOT NULL
     ORDER BY pr.approved_at DESC NULLS LAST LIMIT 1) AS approved_at,
  r.created_at
FROM public.estimate_runs r
LEFT JOIN sel ON sel.run_id = r.id
LEFT JOIN sel_opt so ON so.run_id = r.id;

-- Estimate (scenario option) level -----------------------------------------
CREATE OR REPLACE VIEW public.v_estimate_audit_estimate AS
SELECT
  o.id AS estimate_id,
  o.run_id,
  o.package_tier,
  o.metadata->>'name' AS custom_name,
  o.total_price,
  o.total_cost,
  o.gross_margin_pct,
  (o.total_price - o.total_cost) AS margin_revenue,
  o.client_selected,
  o.status,
  (o.status = 'approved') AS approved,
  coalesce((SELECT sum(c.amount) FROM public.estimate_cost_components c WHERE c.option_id = o.id AND c.component = 'materials'), 0) AS product_cost,
  coalesce((SELECT sum(c.amount) FROM public.estimate_cost_components c WHERE c.option_id = o.id AND c.component = 'labor'), 0) AS labor_cost,
  coalesce((SELECT sum(c.amount) FROM public.estimate_cost_components c WHERE c.option_id = o.id AND c.component NOT IN ('materials', 'labor')), 0) AS fee_cost,
  (SELECT count(*) FROM public.estimate_scenario_lines l WHERE l.option_id = o.id) AS line_count,
  o.created_at
FROM public.estimate_scenario_options o;

-- Line item level -----------------------------------------------------------
-- category_key (schema 114): roof-system segmentation, mirroring the Invoice
-- Audit line view. Estimate lines carry no vendor item_number (only UUID FKs),
-- so we classify on description alone and there is no item-keyed override join;
-- the column is appended LAST so CREATE OR REPLACE stays additive.
CREATE OR REPLACE VIEW public.v_estimate_audit_line AS
SELECT
  l.id AS line_id,
  l.option_id,
  l.description,
  l.rounded_quantity,
  l.required_quantity,
  l.sell_uom,
  l.unit_cost,
  l.line_cost,
  l.line_price,
  l.created_at,
  -- appended last so CREATE OR REPLACE stays additive
  public.classify_roof_system(l.description, NULL) AS category_key
FROM public.estimate_scenario_lines l;
