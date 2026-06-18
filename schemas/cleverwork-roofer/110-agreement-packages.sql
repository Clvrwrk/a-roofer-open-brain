-- 110-agreement-packages.sql
-- Price Agreement Builder (Item 3) slice 2: persistence + the PE-office prefill
-- fallback. Additive + idempotent.
--
-- PREFILL (confirmed w/ Chris 2026-06-18): per branch, each negotiable item's
-- starting price = (1) the branch's latest negotiated agreement price, else
-- (2) the most recent invoiced unit price for that item at the branch's ship-to
-- IF that invoice is < 60 days old, else (3) 0. No region/national fallback.
-- v_recent_invoice_price supplies tier (2).

CREATE OR REPLACE VIEW public.v_recent_invoice_price AS
SELECT DISTINCT ON (i.ship_to_number, l.item_number)
  i.ship_to_number,
  l.item_number,
  coalesce(l.effective_unit_price, l.unit_price)::numeric AS unit_price,
  i.invoice_date::date AS invoice_date
FROM public.abc_invoice_lines l
JOIN public.abc_invoices i ON i.invoice_number = l.invoice_number
WHERE i.invoice_date >= (current_date - 60)
  AND coalesce(l.effective_unit_price, l.unit_price) IS NOT NULL
ORDER BY i.ship_to_number, l.item_number, i.invoice_date DESC;

-- One agreement-builder package per branch (versioned). Vendor-agnostic by the
-- `vendor` + `branch_number` pair; recipient defaults to the ABC national account
-- manager (Justin Garza) for all PE offices.
CREATE TABLE IF NOT EXISTS public.agreement_packages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor          text NOT NULL DEFAULT 'ABC Supply Co.',
  branch_number   text NOT NULL,
  branch_name     text,
  office          text,
  package_version int  NOT NULL DEFAULT 1,
  status          text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_review','approved_to_send','sent','submitted','accepted','rejected','superseded','expired')),
  national_account_manager_name  text DEFAULT 'Justin Garza',
  national_account_manager_email text DEFAULT 'Justin.Garza@abcsupply.com',
  notes        text,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agreement_packages_branch_ver
  ON public.agreement_packages (vendor, branch_number, package_version);

-- One row per negotiable item in a package. Hierarchy via family_id; a price set
-- at the family (top) level cascades to non-overridden variations, a variation
-- edit sets is_override (the variation's price becomes primary).
CREATE TABLE IF NOT EXISTS public.agreement_package_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id    uuid NOT NULL REFERENCES public.agreement_packages(id) ON DELETE CASCADE,
  family_id     text,
  family_name   text,
  item_number   text NOT NULL,
  description   text,
  uom           text,
  review_class  text,
  prior_price        numeric,   -- prefill value (tier 1 or 2 above); null = none found
  prior_price_source text CHECK (prior_price_source IN ('agreement','invoice_60d')),
  proposed_price     numeric,   -- the negotiated target entered in the builder
  is_override   boolean NOT NULL DEFAULT false,  -- variation overrode the family-level price
  item_status   text NOT NULL DEFAULT 'included' CHECK (item_status IN ('included','excluded')),
  updated_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agreement_package_item ON public.agreement_package_items (package_id, item_number);
CREATE INDEX IF NOT EXISTS idx_agreement_package_items_fam ON public.agreement_package_items (package_id, family_id);
