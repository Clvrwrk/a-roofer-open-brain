-- 128-office-ground-price-anchor.sql
-- "Frequently Ordered" ground-level pricing block per PE office (Chris, 2026-06-19).
-- Each PE office's closest ABC branch has a scraped Frequently-Ordered list (current
-- branch/account price + stocking UOM). That becomes the office's ANCHOR price layer:
--   anchor (current shelf) -> negotiated (agreement) -> actual (recent invoice price_per_uom).
-- The anchor is the ground level each office confirms; the rest of the methodology catalog
-- is the gap analysis. Additive + idempotent.
--
-- Data is loaded into frequently_ordered_import (one row per source_label/item) from the
-- scrape files; this migration adds the office mapping + the canonical comparison view.

CREATE TABLE IF NOT EXISTS frequently_ordered_office_map (
  source_label text PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES office(id),
  is_primary boolean DEFAULT true,   -- false = alternate branch for the same office (e.g. Aurora vs Englewood)
  note text
);

-- Mapping (2026-06-19): 6 scrapes -> 5 PE offices (Denver has Englewood primary + Aurora alt).
INSERT INTO frequently_ordered_office_map (source_label, office_id, is_primary, note) VALUES
  ('Fort Worth',       'bd3016cc-4b21-4fd0-be65-31aa18b9fdbd', true,  'Richardson, TX office'),
  ('Wichita',          'f731ec9a-9753-48af-80cf-076e56f3edd7', true,  'Wichita, KS office'),
  ('Kansas City',      '2df13782-e58d-458c-a37b-570b90872b43', true,  'Kansas City, MO office'),
  ('Englewood CO',     '042126e8-1a08-4498-beb3-b79443b21dd9', true,  'Denver office (closest to Greenwood Village)'),
  ('Aurora CO',        '042126e8-1a08-4498-beb3-b79443b21dd9', false, 'Denver office — alternate branch'),
  ('Wichita Falls TX', '6ff737d3-a3dd-4cba-a120-89091cac8cf2', true,  'Euless, TX office')
ON CONFLICT (source_label) DO UPDATE SET office_id=EXCLUDED.office_id, is_primary=EXCLUDED.is_primary, note=EXCLUDED.note;

CREATE OR REPLACE VIEW public.v_office_ground_price AS
SELECT
  m.office_id, o.name AS office_name, m.source_label, m.is_primary,
  s.item_number, s.description AS scrape_description,
  s.anchor_price, s.anchor_uom,
  um.price_uom AS canonical_uom, um.ship_uom, um.units_per_price_uom,
  CASE
    WHEN um.price_uom IS NULL THEN s.anchor_price
    WHEN s.anchor_uom = um.price_uom THEN s.anchor_price
    WHEN s.anchor_uom = um.ship_uom AND um.units_per_price_uom IS NOT NULL THEN round(s.anchor_price * um.units_per_price_uom, 4)
    ELSE s.anchor_price
  END AS anchor_price_canonical,
  neg.negotiated_price,
  act.recent_actual_price
FROM frequently_ordered_import s
JOIN frequently_ordered_office_map m ON m.source_label = s.source_label
JOIN office o ON o.id = m.office_id
LEFT JOIN v_item_uom_map um ON um.item_number = s.item_number
LEFT JOIN LATERAL (
  SELECT min(pli.unit_price) AS negotiated_price
  FROM abc_price_agreement_branch_matches bm
  JOIN abc_price_list_items pli ON pli.agreement_id = bm.abc_price_agreement_id AND pli.item_number = s.item_number
  JOIN vendor_branches vb ON ltrim(vb.branch_number,'0') = ltrim(bm.branch_number,'0')
  WHERE vb.pricing_territory_office_id = m.office_id
) neg ON true
LEFT JOIN LATERAL (
  SELECT l.price_per_uom AS recent_actual_price
  FROM v_invoice_lines_complete l JOIN abc_invoices i ON i.invoice_number=l.invoice_number
  WHERE l.item_number = s.item_number AND l.price_per_uom IS NOT NULL
  ORDER BY i.invoice_date DESC NULLS LAST LIMIT 1
) act ON true;

COMMENT ON VIEW public.v_office_ground_price IS
  'Per-PE-office ground-level pricing: scraped Frequently-Ordered anchor (current branch price, normalized to canonical pricing UOM) vs negotiated agreement vs recent actual. Surfaces stale agreements (negotiated > anchor) and coverage gaps (no negotiated).';
