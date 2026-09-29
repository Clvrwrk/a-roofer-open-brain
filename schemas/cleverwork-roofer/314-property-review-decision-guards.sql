-- 314 — Guards on record_acculynx_job_property_decision() (review of PR #22, docs/117).
--
-- (313 left free: open PR #23 also took 312 and will renumber.) Two gaps in 312, both about a job that gained a link while its review row was still open
-- (an automated link run, or the AccuLynx sync bringing a fixed address):
--   * link to the SAME property overwrote the automated link's method/confidence with
--     human_confirmed / instruction — silently rewriting provenance. Now the existing link is
--     left exactly as it is and the review row records the human confirmation
--     (resolution 'linked:confirmed_existing').
--   * dismiss and source_fix accepted a job that already has a property, leaving a
--     "not a property" row beside a live link. Now both refuse with job_already_linked.
--
-- CREATE OR REPLACE of one function; same signature, same grants. Additive (hard rule 1).

CREATE OR REPLACE FUNCTION public.record_acculynx_job_property_decision(
  p_job_id text, p_decision text, p_property_id uuid, p_corrected_address text,
  p_note text, p_actor_id text, p_actor_name text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  r acculynx_job_property_review%ROWTYPE;
  j acculynx_jobs%ROWTYPE;
  v_status text; v_log_decision text; v_resolution text;
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
    ELSIF r.status = 'resolved' AND r.decision IS DISTINCT FROM 'link' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'resolved_by_automation');
    ELSIF r.status = 'resolved' AND j.property_id IS NOT NULL THEN
      -- a confirmation of an automated link: reopening would contradict a link we did not make
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
      IF j.property_id IS NULL THEN
        UPDATE acculynx_jobs SET property_id = p_property_id, property_link_method = 'human_confirmed',
               property_link_confidence = 1.0, property_link_trust_tier = 'instruction', property_linked_at = now()
         WHERE id = p_job_id;
        v_resolution := 'linked:human_confirmed';
      ELSE
        -- already linked to this property by automation: keep that link's provenance untouched
        v_resolution := 'linked:confirmed_existing';
      END IF;
      UPDATE acculynx_job_property_review SET status = 'resolved', decision = 'link',
             resolution = v_resolution, resolved_property_id = p_property_id,
             resolved_by = p_actor_id, resolved_at = now(),
             decided_by = p_actor_id, decided_by_name = p_actor_name, decided_at = now(),
             notes = coalesce(nullif(btrim(p_note), ''), notes), updated_at = now()
       WHERE job_id = p_job_id;
      v_status := 'resolved'; v_log_decision := 'approve';

    ELSE
      -- source_fix and dismiss describe a job with no property; refuse one that has gained a link
      IF j.property_id IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'job_already_linked', 'property_id', j.property_id);
      END IF;

      IF p_decision = 'source_fix' THEN
        IF (p_corrected_address IS NULL OR btrim(p_corrected_address) = '') AND (p_note IS NULL OR btrim(p_note) = '') THEN
          RETURN jsonb_build_object('ok', false, 'error', 'corrected_address_or_note_required');
        END IF;
        UPDATE acculynx_job_property_review SET status = 'awaiting_source_fix', decision = 'source_fix',
               corrected_address = nullif(btrim(p_corrected_address), ''),
               decided_by = p_actor_id, decided_by_name = p_actor_name, decided_at = now(),
               notes = coalesce(nullif(btrim(p_note), ''), notes), updated_at = now()
         WHERE job_id = p_job_id;
        v_status := 'awaiting_source_fix'; v_log_decision := 'needs_more_evidence';
      ELSE
        UPDATE acculynx_job_property_review SET status = 'dismissed', decision = 'dismiss',
               resolution = 'not_a_property', resolved_by = p_actor_id, resolved_at = now(),
               decided_by = p_actor_id, decided_by_name = p_actor_name, decided_at = now(),
               notes = coalesce(nullif(btrim(p_note), ''), notes), updated_at = now()
         WHERE job_id = p_job_id;
        v_status := 'dismissed'; v_log_decision := 'reject';
      END IF;
    END IF;
  END IF;

  INSERT INTO dashboard_action_log (department, workflow, action_type, decision, actor_id, actor_type,
                                    actor_display_name, note, payload, source_table, source_pk, work_key)
  VALUES ('operations', 'property-link-review', p_decision, v_log_decision, p_actor_id, 'human',
          p_actor_name, nullif(btrim(p_note), ''),
          jsonb_build_object('property_id', p_property_id, 'corrected_address', nullif(btrim(p_corrected_address), ''),
                             'reason', r.reason, 'previous_status', r.status, 'job_number', j.job_number,
                             'resolution', v_resolution),
          'acculynx_job_property_review', p_job_id, 'acculynx_job:' || p_job_id);

  RETURN jsonb_build_object('ok', true, 'job_id', p_job_id, 'status', v_status, 'decision', p_decision,
                            'resolution', v_resolution);
END $$;

REVOKE ALL ON FUNCTION public.record_acculynx_job_property_decision(text, text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_acculynx_job_property_decision(text, text, uuid, text, text, text, text) TO service_role;
