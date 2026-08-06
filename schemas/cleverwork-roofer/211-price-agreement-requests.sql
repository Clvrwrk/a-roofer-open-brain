-- 211 — monthly price-agreement request tracker (docs/83 P2). Applied 2026-08-05.
-- One row per generated vendor packet: month-scoped snapshot of the gap +
-- renewal ask (payload jsonb), so the HTML/CSV/MD outputs render from a frozen
-- snapshot and the tracker shows exactly what was requested each month.
-- Generation marks the included price_agreement_proposals status='included'
-- with the month label. Auto-draft via Maya.Chen AgentMail lands with the
-- Phase 6 mail plumbing; until then the human forwards the generated email.
CREATE TABLE IF NOT EXISTS public.price_agreement_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL,
  month_label text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by text,
  gap_count int NOT NULL DEFAULT 0,
  renewal_count int NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'generated' CHECK (status IN ('generated','sent','superseded')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_par_vendor_month ON public.price_agreement_requests (vendor_id, month_label, generated_at DESC);
