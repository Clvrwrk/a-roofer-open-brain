-- 312 — Human decisions on the AccuLynx job→property review queue (docs/117).
--
-- The Command Center page /operations/property-review records a person's call on each open
-- row of acculynx_job_property_review (docs/116 §4). Four decisions:
--
--   link           link the job to a property (the suggested one, a nearby candidate, or one
--                  found by search). Human-confirmed → confidence 1.0, trust tier instruction
--                  (hard rule 4: instruction grade needs a human).
--   source_fix     the AccuLynx address is wrong or missing; record the corrected address and
--                  wait. Status 'awaiting_source_fix'. When the AccuLynx sync brings the fixed
--                  address and a link run matches it, the refresh closes the row.
--   dismiss        not a real property (test or placeholder job). Status 'dismissed'.
--   reopen         undo: back to 'open'. A human link is removed only if nothing else has
--                  re-linked the job since.
--
-- Every decision is written to dashboard_action_log (department operations, workflow
-- property-link-review). Additive (hard rule 1); service-role only — the page calls these
-- through the server-side client after its own WorkOS session check.

-- ── Queue columns + status ─────────────────────────────────────────────────────────
ALTER TABLE public.acculynx_job_property_review
  ADD COLUMN IF NOT EXISTS decision          text,
  ADD COLUMN IF NOT EXISTS corrected_address text,
  ADD COLUMN IF NOT EXISTS decided_by        text,
  ADD COLUMN IF NOT EXISTS decided_by_name   text,
  ADD COLUMN IF NOT EXISTS decided_at        timestamptz;

ALTER TABLE public.acculynx_job_property_review DROP CONSTRAINT IF EXISTS acculynx_job_property_review_status_check;
ALTER TABLE public.acculynx_job_property_review ADD CONSTRAINT acculynx_job_property_review_status_check
  CHECK (status IN ('open', 'awaiting_source_fix', 'resolved', 'dismissed'));
ALTER TABLE public.acculynx_job_property_review DROP CONSTRAINT IF EXISTS acculynx_job_property_review_decision_check;
ALTER TABLE public.acculynx_job_property_review ADD CONSTRAINT acculynx_job_property_review_decision_check
  CHECK (decision IS NULL OR decision IN ('link', 'source_fix', 'dismiss'));

ALTER TABLE public.acculynx_jobs
  ADD COLUMN IF NOT EXISTS property_link_trust_tier text;
ALTER TABLE public.acculynx_jobs DROP CONSTRAINT IF EXISTS acculynx_jobs_property_link_trust_tier_check;
ALTER TABLE public.acculynx_jobs ADD CONSTRAINT acculynx_jobs_property_link_trust_tier_check
  CHECK (property_link_trust_tier IS NULL OR property_link_trust_tier IN ('evidence', 'instruction'));

-- ── Queue read model ───────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_acculynx_job_property_review_queue AS
SELECT r.job_id, r.status, r.reason, r.recommended_action, r.submitted_address,
       r.geocoded_address, r.geocode_status, r.geocode_precision, r.geocode_latitude, r.geocode_longitude,
       r.suggested_property_id, sp.address_full AS suggested_address, r.suggestion_score, r.candidate_count,
       r.decision, r.corrected_address, r.decided_by, r.decided_by_name, r.decided_at, r.notes,
       r.resolved_property_id, rp.address_full AS resolved_address, r.updated_at,
       j.job_number, j.job_name, j.job_category_name, j.current_milestone, j.created_date AS job_created_date,
       j.location_city, j.location_state_abbrev
FROM public.acculynx_job_property_review r
JOIN public.acculynx_jobs j ON j.id = r.job_id
LEFT JOIN public.properties sp ON sp.id = r.suggested_property_id
LEFT JOIN public.properties rp ON rp.id = r.resolved_property_id;

-- ── Candidate properties for one job ───────────────────────────────────────────────
-- The suggested property, properties sharing the zip + house number, and properties within
-- 150 m of the job's geocoded point — ranked, at most 8.
CREATE OR REPLACE FUNCTION public.acculynx_job_property_candidates(p_job_id text)
RETURNS TABLE (property_id uuid, address_full text, unit text, property_type text, geoid text,
               distance_m numeric, why text)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH r AS (
    SELECT rv.suggested_property_id,
           CASE WHEN rv.geocode_latitude IS NOT NULL
                THEN ST_SetSRID(ST_MakePoint(rv.geocode_longitude, rv.geocode_latitude), 4326)::geography END AS pt,
           normalize_street_address(acculynx_job_street(j.location_street1, j.raw->'locationAddress'->>'street2')) AS sk,
           nullif(left(regexp_replace(coalesce(j.location_zip, ''), '[^0-9]', '', 'g'), 5), '') AS zip5
    FROM acculynx_job_property_review rv JOIN acculynx_jobs j ON j.id = rv.job_id
    WHERE rv.job_id = p_job_id
  ), c AS (
    SELECT p.id, 0 AS rank, 'suggested' AS why FROM r JOIN properties p ON p.id = r.suggested_property_id
    UNION ALL
    SELECT p.id, 1, 'same zip + house number' FROM r JOIN properties p ON p.status = 'active'
      AND split_part(p.address_key, '|', 3) = r.zip5
      AND split_part(split_part(p.address_key, '|', 1), ' ', 1) = split_part(r.sk, ' ', 1)
      WHERE r.sk ~ '^\d'
    UNION ALL
    SELECT p.id, 2, 'within 150 m' FROM r JOIN properties p ON p.status = 'active' AND p.geom IS NOT NULL
      AND r.pt IS NOT NULL AND ST_DWithin(p.geom, r.pt, 150)
  ), best AS (
    SELECT DISTINCT ON (id) id, rank, why FROM c ORDER BY id, rank
  )
  SELECT p.id, p.address_full, p.unit, p.property_type, p.geoid,
         round(ST_Distance(p.geom, r.pt)::numeric, 0) AS distance_m, b.why
  FROM best b JOIN properties p ON p.id = b.id CROSS JOIN r
  ORDER BY b.rank, ST_Distance(p.geom, r.pt) NULLS LAST, p.address_full
  LIMIT 8
$$;

-- ── Record a decision ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_acculynx_job_property_decision(
  p_job_id text, p_decision text, p_property_id uuid, p_corrected_address text,
  p_note text, p_actor_id text, p_actor_name text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  r acculynx_job_property_review%ROWTYPE;
  j acculynx_jobs%ROWTYPE;
  v_status text; v_log_decision text;
BEGIN
  IF p_actor_id IS NULL OR btrim(p_actor_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'actor_required');
  END IF;
  IF p_decision NOT IN ('link', 'source_fix', 'dismiss', 'reopen') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_decision');
  END IF;

  SELECT * INTO r FROM acculynx_job_property_review WHERE job_id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'review_row_not_found'); END IF;
  SELECT * INTO j FROM acculynx_jobs WHERE id = p_job_id FOR UPDATE;

  IF p_decision = 'reopen' THEN
    IF r.status = 'open' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_open'); END IF;
    -- undo a human link only if the job still carries that exact link
    IF r.decision = 'link' AND j.property_link_method = 'human_confirmed' AND j.property_id = r.resolved_property_id THEN
      UPDATE acculynx_jobs SET property_id = NULL, property_link_method = NULL, property_link_confidence = NULL,
             property_link_trust_tier = NULL, property_linked_at = NULL
       WHERE id = p_job_id;
    ELSIF r.status = 'resolved' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'resolved_by_automation');
    END IF;
    UPDATE acculynx_job_property_review SET status = 'open', decision = NULL, corrected_address = NULL,
           resolution = NULL, resolved_property_id = NULL, resolved_by = NULL, resolved_at = NULL,
           decided_by = p_actor_id, decided_by_name = p_actor_name, decided_at = now(),
           notes = coalesce(nullif(btrim(p_note), ''), notes), updated_at = now()
     WHERE job_id = p_job_id;
    v_status := 'open'; v_log_decision := 'resume_agent';
  ELSE
    IF r.status NOT IN ('open', 'awaiting_source_fix') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_open', 'status', r.status);
    END IF;

    IF p_decision = 'link' THEN
      IF p_property_id IS NULL OR NOT EXISTS (SELECT 1 FROM properties WHERE id = p_property_id AND status = 'active') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'property_not_found');
      END IF;
      IF j.property_id IS NOT NULL AND j.property_id <> p_property_id THEN
        RETURN jsonb_build_object('ok', false, 'error', 'job_already_linked', 'property_id', j.property_id);
      END IF;
      UPDATE acculynx_jobs SET property_id = p_property_id, property_link_method = 'human_confirmed',
             property_link_confidence = 1.0, property_link_trust_tier = 'instruction', property_linked_at = now()
       WHERE id = p_job_id;
      UPDATE acculynx_job_property_review SET status = 'resolved', decision = 'link',
             resolution = 'linked:human_confirmed', resolved_property_id = p_property_id,
             resolved_by = p_actor_id, resolved_at = now(),
             decided_by = p_actor_id, decided_by_name = p_actor_name, decided_at = now(),
             notes = coalesce(nullif(btrim(p_note), ''), notes), updated_at = now()
       WHERE job_id = p_job_id;
      v_status := 'resolved'; v_log_decision := 'approve';

    ELSIF p_decision = 'source_fix' THEN
      IF p_corrected_address IS NULL OR btrim(p_corrected_address) = '' THEN
        IF p_note IS NULL OR btrim(p_note) = '' THEN
          RETURN jsonb_build_object('ok', false, 'error', 'corrected_address_or_note_required');
        END IF;
      END IF;
      UPDATE acculynx_job_property_review SET status = 'awaiting_source_fix', decision = 'source_fix',
             corrected_address = nullif(btrim(p_corrected_address), ''),
             decided_by = p_actor_id, decided_by_name = p_actor_name, decided_at = now(),
             notes = coalesce(nullif(btrim(p_note), ''), notes), updated_at = now()
       WHERE job_id = p_job_id;
      v_status := 'awaiting_source_fix'; v_log_decision := 'needs_more_evidence';

    ELSE -- dismiss
      UPDATE acculynx_job_property_review SET status = 'dismissed', decision = 'dismiss',
             resolution = 'not_a_property', resolved_by = p_actor_id, resolved_at = now(),
             decided_by = p_actor_id, decided_by_name = p_actor_name, decided_at = now(),
             notes = coalesce(nullif(btrim(p_note), ''), notes), updated_at = now()
       WHERE job_id = p_job_id;
      v_status := 'dismissed'; v_log_decision := 'reject';
    END IF;
  END IF;

  INSERT INTO dashboard_action_log (department, workflow, action_type, decision, actor_id, actor_type,
                                    actor_display_name, note, payload, source_table, source_pk, work_key)
  VALUES ('operations', 'property-link-review', p_decision, v_log_decision, p_actor_id, 'human',
          p_actor_name, nullif(btrim(p_note), ''),
          jsonb_build_object('property_id', p_property_id, 'corrected_address', nullif(btrim(p_corrected_address), ''),
                             'reason', r.reason, 'previous_status', r.status, 'job_number', j.job_number),
          'acculynx_job_property_review', p_job_id, 'acculynx_job:' || p_job_id);

  RETURN jsonb_build_object('ok', true, 'job_id', p_job_id, 'status', v_status, 'decision', p_decision);
END $$;

-- ── Refresh v2: a source fix waits; it closes once the job links ───────────────────
CREATE OR REPLACE FUNCTION public.refresh_acculynx_job_property_review()
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_closed int; v_open int;
BEGIN
  UPDATE acculynx_job_property_review r
     SET status = 'resolved', resolution = coalesce(r.resolution, 'linked:' || j.property_link_method),
         resolved_property_id = j.property_id, resolved_by = coalesce(r.resolved_by, 'link_acculynx_jobs_to_properties'),
         resolved_at = now(), updated_at = now()
    FROM acculynx_jobs j
   WHERE j.id = r.job_id AND r.status IN ('open', 'awaiting_source_fix') AND j.property_id IS NOT NULL;
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  WITH jb AS (
    SELECT j.id,
           concat_ws(', ', nullif(btrim(concat_ws(' ', j.location_street1, j.raw->'locationAddress'->>'street2')), ''),
                     nullif(j.location_city, ''), btrim(concat_ws(' ', j.location_state_abbrev, j.location_zip))) AS submitted,
           acculynx_job_street(j.location_street1, j.raw->'locationAddress'->>'street2')                     AS street,
           normalize_street_address(acculynx_job_street(j.location_street1, j.raw->'locationAddress'->>'street2')) AS sk,
           nullif(left(regexp_replace(coalesce(j.location_zip, ''), '[^0-9]', '', 'g'), 5), '')              AS zip5
    FROM acculynx_jobs j
    WHERE j.property_id IS NULL
  ), exact AS (
    SELECT jb.id, count(DISTINCT p.id) AS n, min(p.id::text)::uuid AS pid
    FROM jb JOIN properties p ON p.status = 'active'
     AND split_part(p.address_key, '|', 1) = jb.sk AND split_part(p.address_key, '|', 3) = jb.zip5
    GROUP BY jb.id
  ), fz AS (
    SELECT DISTINCT ON (jb.id) jb.id, p.id AS pid,
           similarity(regexp_replace(jb.sk, '^\S+\s', ''), regexp_replace(split_part(p.address_key, '|', 1), '^\S+\s', '')) AS sim
    FROM jb JOIN properties p ON p.status = 'active'
     AND split_part(p.address_key, '|', 3) = jb.zip5
     AND split_part(split_part(p.address_key, '|', 1), ' ', 1) = split_part(jb.sk, ' ', 1)
    WHERE jb.sk ~ '^\d'
    ORDER BY jb.id, 3 DESC
  ), cls AS (
    SELECT jb.id, jb.submitted,
           CASE WHEN jb.street IS NULL                                   THEN 'no_street'
                WHEN jb.street ~* '^p\.?\s*o\.?\s*box'                   THEN 'po_box'
                WHEN jb.sk !~ '^\d'                                      THEN 'no_house_number'
                WHEN jb.zip5 IS NULL                                     THEN 'no_zip'
                WHEN e.n > 1                                             THEN 'ambiguous_multiple_properties'
                WHEN fz.sim >= 0.35                                      THEN 'weak_match'
                ELSE 'not_enriched' END                                  AS reason,
           CASE WHEN e.n > 1 THEN e.pid WHEN fz.sim >= 0.35 THEN fz.pid END AS suggested,
           CASE WHEN fz.sim >= 0.35 AND coalesce(e.n, 0) <= 1 THEN round(fz.sim::numeric, 2) END AS score,
           e.n AS candidates
    FROM jb LEFT JOIN exact e ON e.id = jb.id LEFT JOIN fz ON fz.id = jb.id
  )
  INSERT INTO acculynx_job_property_review AS r
         (job_id, reason, submitted_address, suggested_property_id, suggestion_score, candidate_count, recommended_action)
  SELECT id, reason, submitted, suggested, score, candidates,
         CASE reason
           WHEN 'ambiguous_multiple_properties' THEN 'choose_property'
           WHEN 'weak_match'                    THEN 'confirm_suggested_match'
           WHEN 'not_enriched'                  THEN 'resubmit_for_enrichment'
           ELSE 'fix_address_in_acculynx' END
  FROM cls
  ON CONFLICT (job_id) DO UPDATE SET
    reason = EXCLUDED.reason, submitted_address = EXCLUDED.submitted_address,
    suggested_property_id = EXCLUDED.suggested_property_id, suggestion_score = EXCLUDED.suggestion_score,
    candidate_count = EXCLUDED.candidate_count,
    recommended_action = CASE WHEN r.geocode_status IS NOT NULL AND EXCLUDED.reason = 'not_enriched'
                              THEN r.recommended_action ELSE EXCLUDED.recommended_action END,
    -- a human decision stands: only an automation-resolved row whose job lost its link reopens
    status = CASE WHEN r.status = 'resolved' AND r.decision IS NULL THEN 'open' ELSE r.status END,
    updated_at = now()
  WHERE r.status NOT IN ('dismissed');

  SELECT count(*) INTO v_open FROM acculynx_job_property_review WHERE status = 'open';
  RETURN jsonb_build_object('closed_now_linked', v_closed, 'open', v_open,
    'by_reason', (SELECT jsonb_object_agg(reason, n) FROM
                   (SELECT reason, count(*) n FROM acculynx_job_property_review WHERE status = 'open' GROUP BY 1) x));
END $$;

-- ── Access: service role only ──────────────────────────────────────────────────────
REVOKE ALL ON public.v_acculynx_job_property_review_queue FROM anon, authenticated;
GRANT SELECT ON public.v_acculynx_job_property_review_queue TO service_role;
REVOKE ALL ON FUNCTION public.acculynx_job_property_candidates(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_acculynx_job_property_decision(text, text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_acculynx_job_property_review() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acculynx_job_property_candidates(text),
                          public.record_acculynx_job_property_decision(text, text, uuid, text, text, text, text),
                          public.refresh_acculynx_job_property_review() TO service_role;
