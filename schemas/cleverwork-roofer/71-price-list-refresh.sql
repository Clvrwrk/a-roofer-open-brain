-- cleverwork-roofer/71-price-list-refresh.sql
-- Link price lists to territories and drive the refresh workflow.
--   * v_price_list_currency: per office × contractor-supply vendor, the latest
--     active agreement classified current / expiring (30-day warning) / expired /
--     unverified / missing. "current" = active + ceo_verified + in-date.
--   * price_refresh_request: outbox/queue for refresh emails that Lucinda verifies
--     before they are sent to the vendor rep / branch manager.
-- ADDITIVE + IDEMPOTENT. Service-role-only (CONVENTIONS §4).

BEGIN;

CREATE OR REPLACE VIEW public.v_price_list_currency AS
WITH latest AS (
  SELECT DISTINCT ON (pa.vendor_id, pa.region_id) pa.*
  FROM public.price_agreements pa
  WHERE pa.is_active IS TRUE
  ORDER BY pa.vendor_id, pa.region_id, pa.effective_date DESC NULLS LAST
)
SELECT
  o.id        AS office_id,
  o.name      AS office_name,
  o.region_id,
  r.region_code,
  ven.id      AS vendor_id,
  ven.name    AS vendor_name,
  la.id       AS agreement_id,
  la.version_label,
  la.account_number,
  la.sales_rep,
  la.effective_date,
  la.expiry_date,
  la.ceo_verified,
  CASE
    WHEN la.id IS NULL THEN 'missing'
    WHEN la.ceo_verified IS NOT TRUE THEN 'unverified'
    WHEN current_date > la.expiry_date THEN 'expired'
    WHEN current_date > (la.expiry_date - INTERVAL '30 days') THEN 'expiring'
    WHEN la.effective_date IS NOT NULL AND current_date < la.effective_date THEN 'future'
    ELSE 'current'
  END AS currency_status
FROM public.office o
JOIN public.regions r ON r.id = o.region_id
CROSS JOIN public.vendors ven
LEFT JOIN latest la ON la.vendor_id = ven.id AND la.region_id = o.region_id
WHERE ven.vendor_type = 'contractor_supply' AND ven.is_active IS NOT FALSE;

COMMENT ON VIEW public.v_price_list_currency IS
  'Per office × contractor-supply vendor: latest active price agreement and its currency. needs_refresh = currency_status <> ''current''.';

CREATE TABLE IF NOT EXISTS public.price_refresh_request (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id        uuid REFERENCES public.vendors(id),
  recipient_name   text,
  recipient_email  text,
  subject          text,
  body             text,
  reason           text,           -- expired | expiring | unverified | missing | mixed
  regions          text[],         -- region codes covered by this request
  status           text NOT NULL DEFAULT 'awaiting_verification'
                     CHECK (status IN ('draft','awaiting_verification','approved','ready_to_send','sent','declined')),
  verified_by      text,
  verified_at      timestamptz,
  sent_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.price_refresh_request IS
  'Queue of price-list refresh emails. Generated when a territory has no current price list; Lucinda verifies (status awaiting_verification -> approved -> ready_to_send) before send.';

CREATE INDEX IF NOT EXISTS prr_vendor_idx ON public.price_refresh_request (vendor_id);
CREATE INDEX IF NOT EXISTS prr_status_idx ON public.price_refresh_request (status);

DROP TRIGGER IF EXISTS prr_set_updated_at ON public.price_refresh_request;
CREATE TRIGGER prr_set_updated_at BEFORE UPDATE ON public.price_refresh_request
  FOR EACH ROW EXECUTE FUNCTION public.cw_set_updated_at();

ALTER TABLE public.price_refresh_request ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.price_refresh_request FROM anon, authenticated;
GRANT  ALL ON public.price_refresh_request TO service_role;
GRANT  SELECT ON public.v_price_list_currency TO service_role;
REVOKE ALL ON public.v_price_list_currency FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
