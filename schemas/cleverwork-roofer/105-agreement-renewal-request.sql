-- 105-agreement-renewal-request.sql
-- Price-agreement RENEWAL requests reuse the existing price_refresh_request queue
-- with reason='agreement_renewal'. Add an agreement_id link. Additive + idempotent.
--
-- Flow (Item 3): Price Agreement Audit "Request renewal" -> POST
-- /api/price-agreement/request-renewal -> inserts a price_refresh_request row
-- (reason='agreement_renewal', status='awaiting_verification', drafted subject/body,
-- recipient = sales rep). NEVER auto-sends — a human approves + sends (HIL boundary).
-- The dashboard shows "Renewal requested" once an open request exists.
ALTER TABLE public.price_refresh_request
  ADD COLUMN IF NOT EXISTS agreement_id integer REFERENCES public.abc_price_agreements(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_price_refresh_request_agreement ON public.price_refresh_request(agreement_id);
