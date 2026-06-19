-- 111-agreement-submissions.sql
-- Price Agreement Builder (Item 3) slice 5: magic-link submission. Additive + idempotent.
--
-- The branch's national account manager (Justin Garza) receives a single-claim
-- magic link (issued ONLY when a human approves the send — agents never issue/send
-- automatically), opens an unauthenticated page, enters the vendor's final price per
-- line, and submits. The token is the auth: a random uuid, single-use, expiring 7
-- working days out at ~06:00 Central. No agent ever sends the link — a human emails
-- it from Hermes / Google Workspace.

-- Vendor's returned values, captured per item.
ALTER TABLE public.agreement_package_items ADD COLUMN IF NOT EXISTS vendor_final_price numeric;
ALTER TABLE public.agreement_package_items ADD COLUMN IF NOT EXISTS vendor_note text;

CREATE TABLE IF NOT EXISTS public.agreement_package_submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id    uuid NOT NULL REFERENCES public.agreement_packages(id) ON DELETE CASCADE,
  price_refresh_request_id uuid,  -- loose link to the drafted-handoff row
  magic_token   uuid NOT NULL DEFAULT gen_random_uuid(),
  token_expires_at timestamptz NOT NULL,
  delivery_status text NOT NULL DEFAULT 'approved'
    CHECK (delivery_status IN ('draft','approved','sent','claimed','expired','revoked')),
  response_action text CHECK (response_action IN ('approved','revise','rejected')),
  recipient_name  text,
  recipient_email text,
  claimed_by    text,        -- name/email the vendor enters on submit (single-claim)
  claimed_at    timestamptz, -- set once; presence = consumed
  response_note text,
  issued_by     text,        -- the internal operator who approved issuance
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agreement_submission_token ON public.agreement_package_submissions (magic_token);
CREATE INDEX IF NOT EXISTS idx_agreement_submission_pkg ON public.agreement_package_submissions (package_id, created_at DESC);
