-- cleverwork-roofer/60-tighten-grants.sql
-- Harden the vendored OB1 grants to Cleverwork's least-privilege posture
-- (CONVENTIONS §4 / SECURITY.md): the internal MCP container reaches PostgREST as
-- service_role ONLY. OB1's enhanced-thoughts.sql grants three RPCs to
-- `authenticated` and `anon` as well; we revoke those so brain content is not
-- readable by any signed-in Supabase session. The dashboard reads through the
-- MCP container, not directly, so it does not need these grants.
-- Idempotent: REVOKE is safe to re-run; runs AFTER the ob1-base migrations.

BEGIN;

DO $$
DECLARE
  table_name TEXT;
  function_signature TEXT;
BEGIN
  -- Supabase's exposed schemas can carry broad default table grants for anon
  -- and authenticated. RLS still protects rows, but Cleverwork's intended
  -- posture is stricter: only the MCP container uses service_role directly.
  FOREACH table_name IN ARRAY ARRAY[
    'thoughts',
    'thought_edges',
    'agent_memories',
    'agent_memory_source_refs',
    'agent_memory_artifacts',
    'agent_memory_relations',
    'agent_memory_review_actions',
    'agent_memory_recall_traces',
    'agent_memory_recall_items',
    'agent_memory_audit_events',
    'jurisdiction',
    'regulatory_snapshot',
    'property',
    'inspector_notes',
    'client',
    'job',
    'crew',
    'insurance_claim',
    'manufacturer_warranty',
    'atom_access_log'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated, anon', table_name);
    END IF;
  END LOOP;

  IF to_regclass('public.thought_edges_id_seq') IS NOT NULL THEN
    REVOKE ALL ON SEQUENCE public.thought_edges_id_seq FROM authenticated, anon;
  END IF;

  FOREACH function_signature IN ARRAY ARRAY[
    'public.thoughts_set_updated_at()',
    'public.match_thoughts(vector,double precision,integer,jsonb)',
    'public.search_thoughts_text(text,integer,jsonb,integer)',
    'public.brain_stats_aggregate(integer,boolean)',
    'public.get_thought_connections(uuid,integer,boolean)',
    'public.upsert_thought(text,jsonb)',
    'public.trace_provenance(uuid,integer,integer)',
    'public.find_derivatives(uuid,integer)',
    'public.merge_thought_provenance_metadata(uuid,jsonb)',
    'public.merge_thought_eval_metadata(uuid,jsonb)',
    'public.thought_edges_set_updated_at()',
    'public.thought_edges_upsert(uuid,uuid,text,numeric,integer,text,timestamp with time zone,timestamp with time zone,jsonb)',
    'public.agent_memories_set_updated_at()',
    'public.agent_memory_hash_text(text)',
    'public.property_history_for(uuid,uuid,text,text,text,integer)'
  ]
  LOOP
    IF to_regprocedure(function_signature) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated, anon, PUBLIC', function_signature);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', function_signature);
    END IF;
  END LOOP;

END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
