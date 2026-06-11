-- cleverwork-roofer/91-kb-research-loop.sql
-- Autonomous industry research loop data foundation (docs/33 §6.7–6.10, §8.1).
-- Charter-steered daily research runs stage cited, era-tagged, evidence-tier
-- findings. Autonomous keep/discard operates ONLY inside staging; promotion to
-- instruction tier always records a human approver. The Researcher writes here
-- through the gated ingest path only — never directly into brain atoms.
-- Note: the spec's `kb_regulatory_snapshots` is realized as a staging table
-- whose promoted rows become public.regulatory_snapshot entries
-- (10-property-jurisdiction.sql) rather than a parallel snapshot store.
-- Live-DB binding (decision 2026-06-10): property FK targets public.properties;
-- jurisdiction/regulatory_snapshot are created by 89-jurisdiction-snapshot.sql.
-- ADDITIVE + IDEMPOTENT. service-role-only until WorkOS/RLS policies land.

BEGIN;

-- The program.md analog: humans steer the research org by editing the charter.
CREATE TABLE IF NOT EXISTS public.kb_research_charters (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version            int NOT NULL,
  charter_md         text NOT NULL,         -- domains, priorities, recurring scans
  domains            jsonb NOT NULL DEFAULT '[]'::jsonb,  -- code/products/rnd/compliance/safety × lanes
  jurisdictions      jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_allowlist   jsonb NOT NULL DEFAULT '[]'::jsonb,  -- only these may support kept findings
  run_budget         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- window, fetch volume, model cost
  status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','active','superseded','retired')),
  approved_by        text,                  -- Ops Manager per §7
  approved_at        timestamptz,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version)
);

CREATE TABLE IF NOT EXISTS public.kb_research_questions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charter_id         uuid REFERENCES public.kb_research_charters(id) ON DELETE SET NULL,
  question           text NOT NULL,
  domain             text,                  -- building_code | products | rnd | compliance | safety
  lane               text,                  -- residential | commercial | industrial
  jurisdiction_id    uuid REFERENCES public.jurisdiction(id) ON DELETE SET NULL,
  priority           int NOT NULL DEFAULT 100,
  origin             text NOT NULL DEFAULT 'charter'
                       CHECK (origin IN ('charter','recurring_scan','learning_event','conflict','human')),
  learning_event_id  uuid REFERENCES public.estimate_learning_events(id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open','in_progress','answered','parked','retired')),
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kb_research_questions_queue_idx
  ON public.kb_research_questions (status, priority, created_at);

-- The results.tsv analog: append-only run ledger. Every cycle logged,
-- including discards and failures. No UPDATE trigger — rows are immutable.
CREATE TABLE IF NOT EXISTS public.kb_research_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charter_id         uuid REFERENCES public.kb_research_charters(id) ON DELETE SET NULL,
  charter_version    int,
  started_at         timestamptz NOT NULL DEFAULT now(),
  ended_at           timestamptz,
  budget             jsonb NOT NULL DEFAULT '{}'::jsonb,
  cycles_attempted   int NOT NULL DEFAULT 0,
  findings_kept      int NOT NULL DEFAULT 0,
  findings_discarded int NOT NULL DEFAULT 0,
  failures           int NOT NULL DEFAULT 0,
  run_status         text NOT NULL DEFAULT 'running'
                       CHECK (run_status IN ('running','completed','budget_exhausted','failed','aborted')),
  ledger             jsonb NOT NULL DEFAULT '[]'::jsonb,  -- per-cycle entries
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kb_research_runs_started_idx
  ON public.kb_research_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS public.kb_research_findings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid NOT NULL REFERENCES public.kb_research_runs(id) ON DELETE CASCADE,
  question_id        uuid REFERENCES public.kb_research_questions(id) ON DELETE SET NULL,
  claim              text NOT NULL,
  domain             text,
  lane               text,
  jurisdiction_id    uuid REFERENCES public.jurisdiction(id) ON DELETE SET NULL,
  era_of_practice    text,                  -- era tag (e.g. '2026'); required for code/product/practice claims
  regulatory_snapshot_id uuid REFERENCES public.regulatory_snapshot(id) ON DELETE SET NULL,
  -- §6.10 finding quality score components
  score_total        numeric(6,3),
  score_components   jsonb NOT NULL DEFAULT '{}'::jsonb,  -- authority/corroboration/recency/citation/jurisdiction/conflict
  kept               boolean NOT NULL DEFAULT false,      -- staging keep/discard (evidence tier only)
  discard_reason     text,
  status             text NOT NULL DEFAULT 'staged'
                       CHECK (status IN ('staged','discarded','in_promotion_queue','promoted','rejected','superseded')),
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kb_research_findings_run_idx
  ON public.kb_research_findings (run_id, kept);
CREATE INDEX IF NOT EXISTS kb_research_findings_status_idx
  ON public.kb_research_findings (status, score_total DESC);

-- Citation integrity (§6.10): every kept claim traces to a stored excerpt.
CREATE TABLE IF NOT EXISTS public.kb_finding_sources (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id         uuid NOT NULL REFERENCES public.kb_research_findings(id) ON DELETE CASCADE,
  source_url         text NOT NULL,
  source_title       text,
  authority_tier     text NOT NULL
                       CHECK (authority_tier IN ('code_body_or_regulator','manufacturer_technical',
                              'trade_association','trade_press','community_forum')),
  excerpt            text,                  -- stored within license terms (§9.7)
  excerpt_license_note text,
  published_at       date,
  fetched_at         timestamptz NOT NULL DEFAULT now(),
  content_hash       text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kb_finding_sources_finding_idx
  ON public.kb_finding_sources (finding_id);

-- Staged atoms: evidence tier by default; promotion only via gated ingest
-- with the approver recorded (§8.1). Trust-tier discipline: only the gated
-- path writes promoted_*; no agent self-promotes.
CREATE TABLE IF NOT EXISTS public.kb_atoms_staging (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id         uuid REFERENCES public.kb_research_findings(id) ON DELETE SET NULL,
  content            text NOT NULL,
  trust_tier         text NOT NULL DEFAULT 'evidence'
                       CHECK (trust_tier IN ('evidence','instruction')),
  property_id        uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  jurisdiction_id    uuid REFERENCES public.jurisdiction(id) ON DELETE SET NULL,
  era_of_practice    text,
  regulatory_snapshot_id uuid REFERENCES public.regulatory_snapshot(id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'staged'
                       CHECK (status IN ('staged','promoted','rejected','archived')),
  promoted_thought_id uuid,                 -- brain atom id once ingested via gated path
  promoted_by        text,                  -- human approver; required for instruction tier
  promoted_at        timestamptz,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kb_atoms_staging_status_idx
  ON public.kb_atoms_staging (status, trust_tier);

-- Kept finding contradicts an active SOP/template/code assumption/pricing
-- rule → conflict record routed to Quality Control (§6.9).
CREATE TABLE IF NOT EXISTS public.kb_knowledge_conflicts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id         uuid NOT NULL REFERENCES public.kb_research_findings(id) ON DELETE CASCADE,
  conflicts_with_type text NOT NULL
                       CHECK (conflicts_with_type IN ('sop','template','pricing_rule',
                              'code_assumption','atom','other')),
  conflicts_with_ref text NOT NULL,         -- table/id or doc path of the active standard
  description        text NOT NULL,
  affects_in_flight  boolean NOT NULL DEFAULT false,
  flagged_run_ids    uuid[] NOT NULL DEFAULT '{}',        -- in-flight estimate runs flagged
  status             text NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open','qc_review','resolved_standard_updated',
                              'resolved_finding_rejected','dismissed')),
  qc_recommendation  text,
  resolved_by        text,                  -- Ops Manager approval per §7
  resolved_at        timestamptz,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kb_knowledge_conflicts_status_idx
  ON public.kb_knowledge_conflicts (status, created_at DESC);

-- Regulatory snapshot staging: research-loop-proposed snapshots; promotion
-- writes a public.regulatory_snapshot row and links it here.
CREATE TABLE IF NOT EXISTS public.kb_regulatory_snapshots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id         uuid REFERENCES public.kb_research_findings(id) ON DELETE SET NULL,
  jurisdiction_id    uuid REFERENCES public.jurisdiction(id) ON DELETE SET NULL,
  code_family        text NOT NULL,
  code_version       text NOT NULL,
  effective_from     date,
  effective_to       date,
  amendments         text,
  source_url         text,
  status             text NOT NULL DEFAULT 'staged'
                       CHECK (status IN ('staged','promoted','rejected','superseded')),
  promoted_snapshot_id uuid REFERENCES public.regulatory_snapshot(id) ON DELETE SET NULL,
  promoted_by        text,
  promoted_at        timestamptz,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kb_regulatory_snapshots_status_idx
  ON public.kb_regulatory_snapshots (status, jurisdiction_id);

-- Daily Conductor digest (§6.9): dashboard + internal Slack.
CREATE TABLE IF NOT EXISTS public.kb_research_digests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             uuid REFERENCES public.kb_research_runs(id) ON DELETE SET NULL,
  digest_date        date NOT NULL,
  digest_md          text NOT NULL,
  new_findings       int NOT NULL DEFAULT 0,
  open_conflicts     int NOT NULL DEFAULT 0,
  promotion_queue_size int NOT NULL DEFAULT 0,
  coverage_gaps      jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_dashboard boolean NOT NULL DEFAULT false,
  published_slack    boolean NOT NULL DEFAULT false,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (digest_date)
);

-- Human promotion queue, ordered by finding score; approver per §7
-- (Ops Manager; CEO where pricing, margin, or contract language is impacted).
CREATE TABLE IF NOT EXISTS public.kb_promotion_queue (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staging_atom_id    uuid NOT NULL REFERENCES public.kb_atoms_staging(id) ON DELETE CASCADE,
  finding_id         uuid REFERENCES public.kb_research_findings(id) ON DELETE SET NULL,
  target_tier        text NOT NULL DEFAULT 'instruction'
                       CHECK (target_tier IN ('evidence','instruction')),
  score_total        numeric(6,3),
  requires_ceo       boolean NOT NULL DEFAULT false,      -- pricing/margin/contract impact
  status             text NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued','approved','rejected','deferred','withdrawn')),
  decided_by         text,
  decided_at         timestamptz,
  notes              text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kb_promotion_queue_status_idx
  ON public.kb_promotion_queue (status, score_total DESC);

-- ---------------------------------------------------------------------------
-- updated_at triggers (kb_research_runs, kb_finding_sources, kb_research_digests
-- are append-only/immutable — no trigger)
-- ---------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'kb_research_charters','kb_research_questions','kb_research_findings',
    'kb_atoms_staging','kb_knowledge_conflicts','kb_regulatory_snapshots',
    'kb_promotion_queue'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.cw_set_updated_at()', t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- RLS + grants: service-role-only, matching 80-command-center-workflows.sql
-- ---------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'kb_research_charters','kb_research_questions','kb_research_runs',
    'kb_research_findings','kb_finding_sources','kb_atoms_staging',
    'kb_knowledge_conflicts','kb_regulatory_snapshots','kb_research_digests',
    'kb_promotion_queue'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
