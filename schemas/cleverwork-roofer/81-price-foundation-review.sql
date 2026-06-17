-- cleverwork-roofer/81-price-foundation-review.sql
-- Human/agent review state for the Phase 1 price-foundation migration.
--
-- The three review queues (SKU, Branch, Business Rule) are DERIVED LIVE from the
-- source tables (abc_price_list_items, abc_price_agreement_branch_matches) by the
-- command-center surface. This table is the resolution OVERLAY only: it stores the
-- human/agent review state (status, resolution, note, reviewer) keyed to a source
-- row, so the dashboard can show queue status and filter by it without copying or
-- mutating the canonical source rows.
--
-- Property-first / era note: pricing atoms remain canonical in their source tables;
-- this overlay records review decisions, never re-homes the pricing data.
--
-- ADDITIVE + IDEMPOTENT. service-role-only until WorkOS/RLS policies land.

BEGIN;

CREATE TABLE IF NOT EXISTS public.price_foundation_review_actions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Deterministic overlay key: '{queue_type}:{source_table}:{source_pk}'.
  review_key         text NOT NULL UNIQUE,
  queue_type         text NOT NULL CHECK (queue_type IN ('sku','branch','business_rule')),
  source_table       text NOT NULL,
  source_pk          text NOT NULL,
  problem_category   text,
  resolution_status  text NOT NULL DEFAULT 'open'
                       CHECK (resolution_status IN ('open','resolved','rejected','deferred')),
  -- Proposed/applied resolution or a pointer to the canonical record it maps to.
  resolution         text,
  note               text,
  defer_until        date,
  -- Proposed-by-agent flag reserved for Phase 2 (agent suggests, human confirms).
  proposed_by_agent  boolean NOT NULL DEFAULT false,
  reviewed_by        text,
  reviewed_at        timestamptz,
  action_log_id      uuid REFERENCES public.dashboard_action_log(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.price_foundation_review_actions IS
  'Resolution overlay for the price-foundation review queues. Queues are derived live from abc_price_list_items and abc_price_agreement_branch_matches; the source row stays canonical and this table stores only human/agent review state. Additive and reversible.';

CREATE INDEX IF NOT EXISTS price_foundation_review_actions_queue_status_idx
  ON public.price_foundation_review_actions (queue_type, resolution_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS price_foundation_review_actions_source_idx
  ON public.price_foundation_review_actions (source_table, source_pk);

DROP TRIGGER IF EXISTS price_foundation_review_actions_set_updated_at ON public.price_foundation_review_actions;
CREATE TRIGGER price_foundation_review_actions_set_updated_at BEFORE UPDATE ON public.price_foundation_review_actions
  FOR EACH ROW EXECUTE FUNCTION public.cw_set_updated_at();

ALTER TABLE public.price_foundation_review_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.price_foundation_review_actions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.price_foundation_review_actions TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
