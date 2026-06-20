-- 138-agreement-version-comparison.sql
-- Price-list → price-list comparison engine (Chris, 2026-06-20). When a new price agreement is
-- ingested (builder / PDF / CSV / rep email), the prior version is archived and a version-to-
-- version comparison is produced. Per item, the increase vs the prior version is classified:
--   0–3%  → accept (auto)
--   3–6%  → flag for Accounting + Operational review
--   >6%   → critical (later: Slack all items to Accounting — queued)
-- Decreases, unchanged, and brand-new items are non-actionable. Additive + idempotent.

-- 1. Version lineage per agreement_number (latest effective = current; older = superseded/archived).
CREATE OR REPLACE VIEW public.v_agreement_version AS
SELECT
  a.id AS agreement_id,
  a.agreement_number,
  a.effective_date,
  a.expiry_date,
  a.ceo_verified,
  row_number() OVER (PARTITION BY a.agreement_number ORDER BY a.effective_date DESC NULLS LAST) = 1 AS is_current_version,
  lag(a.id) OVER (PARTITION BY a.agreement_number ORDER BY a.effective_date) AS prior_agreement_id,
  lag(a.effective_date) OVER (PARTITION BY a.agreement_number ORDER BY a.effective_date) AS prior_effective_date
FROM public.abc_price_agreements a
WHERE a.agreement_number NOT ILIKE 'API-%';

COMMENT ON VIEW public.v_agreement_version IS
  'Version lineage per agreement_number: is_current_version (latest effective) vs superseded/archived, plus the prior version id for delta comparison.';

-- 2. Per-item delta vs the prior version + tier classification.
-- DISTINCT ON (agreement, item) + scalar prior lookup so duplicate item rows in either version
-- never fan out the comparison.
CREATE OR REPLACE VIEW public.v_agreement_version_delta AS
SELECT DISTINCT ON (v.agreement_id, cur.item_number)
  v.agreement_id,
  v.agreement_number,
  v.effective_date,
  v.is_current_version,
  v.prior_agreement_id,
  cur.item_number,
  cur.description,
  cur.unit AS uom,
  cur.unit_price AS new_price,
  prior.unit_price AS prior_price,
  CASE WHEN prior.unit_price IS NULL OR prior.unit_price = 0 THEN NULL
       ELSE round((cur.unit_price - prior.unit_price) / prior.unit_price * 100, 2) END AS pct_change,
  CASE
    WHEN v.prior_agreement_id IS NULL THEN 'no_prior'        -- first version, nothing to compare
    WHEN prior.unit_price IS NULL THEN 'new_item'            -- item added this version
    WHEN cur.unit_price = prior.unit_price THEN 'unchanged'
    WHEN cur.unit_price < prior.unit_price THEN 'decrease'   -- price dropped (good)
    WHEN (cur.unit_price - prior.unit_price) / prior.unit_price * 100 <= 3 THEN 'accept'    -- 0–3%
    WHEN (cur.unit_price - prior.unit_price) / prior.unit_price * 100 <= 6 THEN 'review'    -- 3–6%
    ELSE 'critical'                                          -- >6%
  END AS tier
FROM public.v_agreement_version v
JOIN public.abc_price_list_items cur ON cur.agreement_id = v.agreement_id
LEFT JOIN LATERAL (
  SELECT p.unit_price FROM public.abc_price_list_items p
  WHERE p.agreement_id = v.prior_agreement_id AND p.item_number = cur.item_number
  ORDER BY p.unit_price LIMIT 1
) prior ON true
ORDER BY v.agreement_id, cur.item_number, cur.unit_price;

COMMENT ON VIEW public.v_agreement_version_delta IS
  'Per-item price change of each agreement version vs its prior version, classified: accept(0–3%) | review(3–6%) | critical(>6%) | decrease | unchanged | new_item | no_prior.';

-- 3. Persisted review dispositions for actionable price increases.
CREATE TABLE IF NOT EXISTS public.agreement_version_review (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id integer NOT NULL,
  item_number text NOT NULL,
  tier        text NOT NULL,                 -- accept | review | critical
  pct_change  numeric,
  prior_price numeric,
  new_price   numeric,
  status      text NOT NULL DEFAULT 'pending', -- pending | accepted | reviewed | escalated
  slack_queued boolean NOT NULL DEFAULT false, -- >6% critical → queued for the Accounting Slack (sent later)
  reviewed_by text,
  reviewed_at timestamptz,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agreement_id, item_number)
);
ALTER TABLE public.agreement_version_review ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS avr_service_all ON public.agreement_version_review;
CREATE POLICY avr_service_all ON public.agreement_version_review FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS avr_auth_read ON public.agreement_version_review;
CREATE POLICY avr_auth_read ON public.agreement_version_review FOR SELECT TO authenticated, anon USING (true);

-- 4. Refresh the review queue from the delta view: auto-accept 0–3% (and decrease/unchanged/new),
--    queue 3–6% and >6% as pending; mark >6% for the Accounting Slack. Idempotent upsert; never
--    overwrites a human disposition once it has moved off 'pending'.
CREATE OR REPLACE FUNCTION public.refresh_agreement_version_review()
RETURNS TABLE (accepted int, review int, critical int) LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.agreement_version_review (agreement_id, item_number, tier, pct_change, prior_price, new_price, status, slack_queued)
  SELECT d.agreement_id, d.item_number, d.tier, d.pct_change, d.prior_price, d.new_price,
    CASE WHEN d.tier IN ('accept','decrease','unchanged','new_item') THEN 'accepted' ELSE 'pending' END,
    d.tier = 'critical'
  FROM public.v_agreement_version_delta d
  WHERE d.item_number IS NOT NULL
    AND d.tier IN ('accept','review','critical','decrease','unchanged','new_item')
  ON CONFLICT (agreement_id, item_number) DO UPDATE SET
    tier = EXCLUDED.tier, pct_change = EXCLUDED.pct_change, prior_price = EXCLUDED.prior_price,
    new_price = EXCLUDED.new_price, slack_queued = EXCLUDED.slack_queued, updated_at = now(),
    -- only refresh the auto-status while still pending/auto-accepted; preserve human decisions
    status = CASE WHEN public.agreement_version_review.status IN ('pending','accepted')
                  THEN (CASE WHEN EXCLUDED.tier IN ('accept','decrease','unchanged','new_item') THEN 'accepted' ELSE 'pending' END)
                  ELSE public.agreement_version_review.status END;

  RETURN QUERY
  SELECT
    count(*) FILTER (WHERE tier IN ('accept','decrease','unchanged','new_item'))::int,
    count(*) FILTER (WHERE tier = 'review')::int,
    count(*) FILTER (WHERE tier = 'critical')::int
  FROM public.agreement_version_review;
END;
$$;

GRANT SELECT ON public.v_agreement_version, public.v_agreement_version_delta TO anon, authenticated, service_role;
GRANT SELECT ON public.agreement_version_review TO anon, authenticated, service_role;
