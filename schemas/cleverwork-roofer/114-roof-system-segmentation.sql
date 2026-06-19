-- 114-roof-system-segmentation.sql
-- Roof-system component categories for line-item segmentation across invoices, price
-- agreements, and estimates — so the audit screens group into Decking / Underlayment /
-- Shingles / … instead of one overwhelming flat list.
--
-- 12 canonical categories + an "uncategorized" sentinel (currently catches metal/tile
-- roofing and siding — separate systems outside the steep-slope taxonomy, flagged for a
-- future taxonomy decision). Classification is keyword-driven (classify_roof_system),
-- validated to ~81% coverage of distinct invoiced items; manual corrections live in
-- item_roof_system_category and take precedence. Additive + idempotent.

CREATE TABLE IF NOT EXISTS public.roof_system_category (
  key text PRIMARY KEY,
  label text NOT NULL,
  sort_order int NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.roof_system_category (key, label, sort_order, description) VALUES
  ('decking', 'Decking', 10, 'Roof deck / sheathing: plywood, OSB, board, lumber'),
  ('underlayment', 'Underlayment', 20, 'Felt, synthetic underlayment, ice & water, house wrap'),
  ('shingles', 'Shingles', 30, 'Asphalt shingles, starter, hip & ridge'),
  ('flashing', 'Flashing', 40, 'Drip edge, valley, step/counter flashing, pipe boots, roof edge'),
  ('vents', 'Vents', 50, 'Ridge/static/exhaust/intake vents, soffit, turbines'),
  ('skylights', 'Skylights', 60, 'Skylights, sun tunnels'),
  ('low_slope_membrane', 'Low-Slope / Membrane', 70, 'TPO/PVC/EPDM/mod-bit, insulation, coatings, plates, drains'),
  ('gutters', 'Gutters & Downspouts', 80, 'Gutters, downspouts, elbows, miters, end caps, guards'),
  ('accessories', 'Accessories', 90, 'Fasteners, sealants, cement, caps, boots, misc materials'),
  ('tools_consumables', 'Tools & Consumables', 100, 'Blades, brushes, rollers, safety gear, rags'),
  ('labor', 'Labor', 110, 'Labor line items (labor catalog, future)'),
  ('service_fees', 'Service Fees', 120, 'Delivery, trip/fuel/pallet charges, credits, adjustments'),
  ('uncategorized', 'Uncategorized', 999, 'Not yet mapped (e.g. metal/tile roofing, siding) — refine via overrides')
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, description = EXCLUDED.description;

-- Curated overrides (manual or seeded). Takes precedence over the keyword classifier.
CREATE TABLE IF NOT EXISTS public.item_roof_system_category (
  item_number text PRIMARY KEY,
  category_key text NOT NULL REFERENCES public.roof_system_category(key),
  source text NOT NULL DEFAULT 'manual',  -- manual | rule | abc_product_category
  note text,
  set_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Keyword classifier. IMMUTABLE so it inlines in views. Order matters: specific → general.
CREATE OR REPLACE FUNCTION public.classify_roof_system(p_desc text, p_item text DEFAULT NULL)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN coalesce(p_desc, '') = '' THEN 'uncategorized'
    WHEN p_desc ~* 'delivery|trip charge|freight|\mfuel\M|surcharge|restock|pallet|loading charge|\mhaul|pickup|supplier credit|promotional credit|returns placeholder|misc(ellaneous)? .*credit' THEN 'service_fees'
    WHEN p_desc ~* '\mlabor\M|install(ation)?|tear ?off|\mcrew\M' THEN 'labor'
    WHEN p_desc ~* '\mblade\M|\mbrush\M|roller|\mrags\M|towel|spudder|core cutter|bungee|\mknife\M|chalk|\mdriver\M|pitch hopper|\mglove|safety kit|harness|\manchor|magnetic|\msweep\M|shears|trowel|warp bag|pick *& *roll|caddy|\mgun\M' THEN 'tools_consumables'
    WHEN p_desc ~* '\mtpo\M|\mpvc\M|\mepdm\M|sure-?flex|sure-?weld|sure-?seal|flintlastic|mod(ified)? bit|membrane|\miso\M|insulbase|isogard|insul (base|plate)|piranha plate|drill-?tec|term(ination)?( bar)?|bond adh|pourable seal|formflash|ultraflash|coverboard|coverpro|densdeck|dens deck|securock|elastoform|\mcant\M|fanfold|therma ?foam|elastomeric|silicone|\msil\M|eterna|roof coating|\mdrain\M|strainer|base sheet|polystick|polyglass|seam plate|aluminator|water cut-?off|cut-?off mastic' THEN 'low_slope_membrane'
    WHEN p_desc ~* 'downspout|\melbow\M|\mgutter|strip miter|\moutlet\M|leaf ?blaster|shur ?flo|end cap|\mmiter' THEN 'gutters'
    WHEN p_desc ~* 'starter|hip *& *ridge|\mh&r\M|h & r|ridge cap|ridgeflex|ridgeglass|seal-?a-?ridge|\ms-?a-?r\M|shingle|highlander|\mvista\M|laminate|3-?tab|architectural|dimensional|timberline|\mtimb\M|duration|landmark|\mpinn|prist|sovereign|\bsg\b|legacy|windsor|oak ?ridge|supreme|herit(age)?|\mtitan|stormfight|\melite\M|ez ridge|pro ?edge|impact ?ridge|rapid ridge|securestart|\moc \w' THEN 'shingles'
    WHEN p_desc ~* 'underlayment|underlay|underlymt|\mfelt\M|synthetic|ice *& *water|winterguard|weatherwatch|stormguard|tiger paw|rhino|deck-?armor|titanium|plybase|shingle-?mate|poly mat|house ?wrap|vshield|swiftguard|anchordeck|proarmor' THEN 'underlayment'
    WHEN p_desc ~* 'skylight|sun *tunnel|velux|solatube|solar tube' THEN 'skylights'
    WHEN p_desc ~* '\mvent\M|exhaust|intake|louver|turbine|soffit|roof cap|slant back|cobra|snow country|air vent|ventamatic|eave riser' THEN 'vents'
    WHEN p_desc ~* '\mdrip|flashing|valley|step flash|pipe (boot|flash|jack)|counter ?flash|edge metal|apron|roof jack|storm collar|dektite|versa cap|roof edge|\mrake\M|end ?wall|wakaflex' THEN 'flashing'
    WHEN p_desc ~* 'plywood|\mosb\M|sheathing|\mcdx\M|lumber|2x4|\mboard\M|batten' THEN 'decking'
    WHEN p_desc ~* '\mnail|\mcoil\M|staple|screw|fastener|sealan|sealn|\mseal\M|caulk|cement|adhesive|\mpaint|\mcaps?\M|\mboot|\mtape\M|primer|bracket|\mhook\M|granule|snow guard|sno cube|wind clip|mason fast|zamac|quad|solar seal' THEN 'accessories'
    ELSE 'uncategorized'
  END;
$$;
