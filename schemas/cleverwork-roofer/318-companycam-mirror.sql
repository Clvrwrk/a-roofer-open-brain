-- 318 — CompanyCam mirror: projects + photos, linked to AccuLynx jobs and properties (docs/120).
--
-- CompanyCam (company 915747, Pro Exteriors LLC) holds ~7k projects and ~311k job-site photos.
-- This migration lands a read-only mirror of that account in the brain:
--
--   companycam_projects   one row per CompanyCam project, with the AccuLynx job and property it
--                         belongs to (link method + confidence; evidence tier, hard rule 4).
--   companycam_photos     one row per photo: metadata, CompanyCam CDN URLs, and the state of our
--                         own copy of the image bytes in the private `companycam-photos` bucket.
--   companycam_sync_state watermarks + last-run stats per sync stream.
--
-- Serving rule (docs/120 §3): apps show OUR copy when storage_status = 'copied' and fall back to
-- the CompanyCam CDN URL until then. The copy queue drains by storage_priority — open AccuLynx
-- jobs first, then recent work, then the back library newest-first — until the mirror is a full
-- clone. CompanyCam is never written to (the bridge client is GET-only).
--
-- Additive + idempotent (hard rule 1). Service-role only, same as acculynx_jobs (docs/115):
-- RLS on, no policies, no anon/authenticated grants. Apps read through their server-side client.

-- ── Projects ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.companycam_projects (
  id                    text PRIMARY KEY,                 -- CompanyCam project id
  company_id            text,
  name                  text,
  status                text,
  archived              boolean NOT NULL DEFAULT false,
  is_public             boolean,
  street_address_1      text,
  street_address_2      text,
  city                  text,
  state                 text,
  postal_code           text,
  country               text,
  latitude              double precision,
  longitude             double precision,
  project_url           text,
  public_url            text,
  embedded_project_url  text,
  photo_count           integer,
  document_count        integer,
  creator_name          text,
  cc_created_at         timestamptz,
  cc_updated_at         timestamptz,
  raw                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at             timestamptz NOT NULL DEFAULT now(),
  last_seen_by_api      timestamptz,
  seen_run_id           text,                             -- last full sweep that saw it
  removed_at            timestamptz,                      -- gone from the API; never deleted here
  -- links
  acculynx_job_id       text,
  job_link_method       text,
  job_link_confidence   numeric,
  property_id           uuid,
  property_link_method  text,
  property_link_confidence numeric,
  linked_at             timestamptz,
  link_trust_tier       text NOT NULL DEFAULT 'evidence',
  CONSTRAINT companycam_projects_link_trust_tier_check CHECK (link_trust_tier IN ('evidence', 'instruction'))
);
CREATE INDEX IF NOT EXISTS companycam_projects_acculynx_job_idx ON public.companycam_projects (acculynx_job_id);
CREATE INDEX IF NOT EXISTS companycam_projects_property_idx     ON public.companycam_projects (property_id);
CREATE INDEX IF NOT EXISTS companycam_projects_updated_idx      ON public.companycam_projects (cc_updated_at DESC);

-- ── Photos ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.companycam_photos (
  id                    text PRIMARY KEY,                 -- CompanyCam photo id
  project_id            text NOT NULL,
  company_id            text,
  creator_id            text,
  creator_name          text,
  captured_at           timestamptz,
  cc_created_at         timestamptz,
  cc_updated_at         timestamptz,
  latitude              double precision,
  longitude             double precision,
  status                text,
  processing_status     text,
  internal              boolean,
  origin                text,
  description           text,
  tags                  text[] NOT NULL DEFAULT '{}',
  has_annotations       boolean NOT NULL DEFAULT false,
  thumbnail_url         text,                             -- CompanyCam CDN (unsigned, public)
  web_url               text,
  original_url          text,
  raw                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at             timestamptz NOT NULL DEFAULT now(),
  seen_run_id           text,
  removed_at            timestamptz,
  -- our copy of the bytes (bucket companycam-photos)
  storage_priority      smallint NOT NULL DEFAULT 9,      -- 1 = open job … 9 = back library
  storage_status        text NOT NULL DEFAULT 'pending',
  storage_paths         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {"thumbnail": "...", "web": "...", "original": "..."}
  storage_bytes         bigint,
  copy_attempts         smallint NOT NULL DEFAULT 0,
  copy_claimed_at       timestamptz,
  copy_error            text,
  copied_at             timestamptz,
  CONSTRAINT companycam_photos_storage_status_check
    CHECK (storage_status IN ('pending', 'copying', 'copied', 'failed', 'skipped'))
);
CREATE INDEX IF NOT EXISTS companycam_photos_project_idx  ON public.companycam_photos (project_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS companycam_photos_created_idx  ON public.companycam_photos (cc_created_at DESC);
CREATE INDEX IF NOT EXISTS companycam_photos_copy_queue_idx
  ON public.companycam_photos (storage_priority, captured_at DESC)
  WHERE storage_status IN ('pending', 'failed') AND removed_at IS NULL;

-- ── Sync state ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.companycam_sync_state (
  stream          text PRIMARY KEY,                       -- 'projects' | 'photos' | 'copy'
  watermark       timestamptz,
  last_run_at     timestamptz,
  last_run_stats  jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.companycam_projects   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companycam_photos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companycam_sync_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companycam_projects, public.companycam_photos, public.companycam_sync_state FROM anon, authenticated;
GRANT ALL ON public.companycam_projects, public.companycam_photos, public.companycam_sync_state TO service_role;

-- ── Linking ────────────────────────────────────────────────────────────────────────
-- Projects → AccuLynx jobs → properties. Never overwrites an 'instruction' (human) link.
--   job:      carried over from the July AccuLynx backfill matcher
--             (acculynx_backfill.companycam_projects; street+zip exact/disambiguated = 0.95,
--              unique name similarity = 0.8, coordinates under 150 m = 0.6).
--   property: the linked job's property (0.95 × job confidence, capped 0.95); else a unique
--             street+zip match on properties.address_key (0.95); else a unique active property
--             within 30 m of the project pin (0.7).
-- SECURITY DEFINER: the July matcher output lives in acculynx_backfill, which service_role
-- cannot read. Execute is granted to service_role only (below).
CREATE OR REPLACE FUNCTION public.link_companycam_projects()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_job int := 0; v_job_prop int := 0; v_prop_job int := 0; v_prop_addr int := 0; v_prop_geo int := 0; v_open int;
BEGIN
  UPDATE companycam_projects p
     SET acculynx_job_id = b.matched_acculynx_job_id,
         job_link_method = 'acculynx_backfill:' || b.match_method,
         job_link_confidence = CASE b.match_confidence WHEN 'high' THEN 0.95 WHEN 'medium' THEN 0.8 ELSE 0.6 END,
         linked_at = now()
    FROM acculynx_backfill.companycam_projects b
   WHERE b.id = p.id AND b.matched_acculynx_job_id IS NOT NULL
     AND p.acculynx_job_id IS NULL AND p.link_trust_tier = 'evidence'
     AND EXISTS (SELECT 1 FROM acculynx_jobs j WHERE j.id = b.matched_acculynx_job_id);
  GET DIAGNOSTICS v_job = ROW_COUNT;

  UPDATE companycam_projects p
     SET property_id = j.property_id, property_link_method = 'via_acculynx_job',
         property_link_confidence = least(0.95, round(0.95 * coalesce(p.job_link_confidence, 0.6), 2)),
         linked_at = now()
    FROM acculynx_jobs j
   WHERE j.id = p.acculynx_job_id AND j.property_id IS NOT NULL
     AND p.property_id IS NULL AND p.link_trust_tier = 'evidence';
  GET DIAGNOSTICS v_prop_job = ROW_COUNT;

  WITH k AS (
    SELECT p.id,
           normalize_street_address(concat_ws(' ', p.street_address_1, nullif(p.street_address_2, ''))) AS street_key,
           nullif(left(regexp_replace(coalesce(p.postal_code, ''), '[^0-9]', '', 'g'), 5), '') AS zip5
    FROM companycam_projects p WHERE p.property_id IS NULL AND p.link_trust_tier = 'evidence'
  ), cand AS (
    SELECT k.id, min(pr.id::text)::uuid AS property_id, count(DISTINCT pr.id) AS n
    FROM k JOIN properties pr ON pr.status = 'active'
     AND split_part(pr.address_key, '|', 1) = k.street_key
     AND split_part(pr.address_key, '|', 3) = k.zip5
    WHERE k.street_key IS NOT NULL AND k.zip5 IS NOT NULL
    GROUP BY k.id
  )
  UPDATE companycam_projects p SET property_id = c.property_id, property_link_method = 'address_zip',
         property_link_confidence = 0.95, linked_at = now()
    FROM cand c WHERE p.id = c.id AND c.n = 1;
  GET DIAGNOSTICS v_prop_addr = ROW_COUNT;

  WITH cand AS (
    SELECT p.id, min(pr.id::text)::uuid AS property_id, count(*) AS n
    FROM companycam_projects p
    JOIN properties pr ON pr.status = 'active' AND pr.geom IS NOT NULL
     AND ST_DWithin(pr.geom, ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326)::geography, 30)
    WHERE p.property_id IS NULL AND p.link_trust_tier = 'evidence'
      AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
      AND NOT (p.latitude = 0 AND p.longitude = 0)
    GROUP BY p.id
  )
  UPDATE companycam_projects p SET property_id = c.property_id, property_link_method = 'pin_within_30m',
         property_link_confidence = 0.7, linked_at = now()
    FROM cand c WHERE p.id = c.id AND c.n = 1;
  GET DIAGNOSTICS v_prop_geo = ROW_COUNT;

  -- Projects the July matcher never saw: the AccuLynx job on the same property. One job there →
  -- 0.85. Several → the job created nearest the project (within 120 days) → 0.75.
  WITH c AS (
    SELECT p.id, j.id AS job_id,
           count(*) OVER (PARTITION BY p.id) AS n,
           row_number() OVER (PARTITION BY p.id ORDER BY abs(extract(epoch FROM j.created_date - p.cc_created_at))) AS rk,
           abs(extract(epoch FROM j.created_date - p.cc_created_at)) / 86400 AS days_apart
    FROM companycam_projects p
    JOIN acculynx_jobs j ON j.property_id = p.property_id
    WHERE p.acculynx_job_id IS NULL AND p.property_id IS NOT NULL AND p.link_trust_tier = 'evidence'
  )
  UPDATE companycam_projects p
     SET acculynx_job_id = c.job_id,
         job_link_method = CASE WHEN c.n = 1 THEN 'same_property_single_job' ELSE 'same_property_nearest_job' END,
         job_link_confidence = CASE WHEN c.n = 1 THEN 0.85 ELSE 0.75 END, linked_at = now()
    FROM c WHERE c.id = p.id AND c.rk = 1 AND (c.n = 1 OR c.days_apart <= 120);
  GET DIAGNOSTICS v_job_prop = ROW_COUNT;

  SELECT count(*) INTO v_open FROM companycam_projects WHERE property_id IS NULL AND removed_at IS NULL;
  RETURN jsonb_build_object('jobs_linked', v_job, 'jobs_linked_via_property', v_job_prop,
                            'property_via_job', v_prop_job,
                            'property_by_address', v_prop_addr, 'property_by_pin', v_prop_geo,
                            'projects_without_property', v_open);
END $$;

-- ── Copy priority ──────────────────────────────────────────────────────────────────
-- 1 open/working AccuLynx job (Lead, Prospect, Approved, Completed, Invoiced)
-- 2 any photo captured in the last 90 days
-- 3 closed job, captured in the last 2 years
-- 5 linked to a property, older
-- 9 everything else (back library)
-- Recomputed after every sync; only touches rows whose priority changed.
CREATE OR REPLACE FUNCTION public.refresh_companycam_copy_priority()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_changed int;
BEGIN
  WITH pr AS (
    SELECT ph.id,
           CASE
             WHEN j.current_milestone IN ('Lead', 'Prospect', 'Approved', 'Completed', 'Invoiced')
                  AND j.archived_at IS NULL                                   THEN 1
             WHEN ph.captured_at >= now() - interval '90 days'                THEN 2
             WHEN j.id IS NOT NULL AND ph.captured_at >= now() - interval '2 years' THEN 3
             WHEN p.property_id IS NOT NULL                                   THEN 5
             ELSE 9
           END::smallint AS prio
    FROM companycam_photos ph
    JOIN companycam_projects p ON p.id = ph.project_id
    LEFT JOIN acculynx_jobs j ON j.id = p.acculynx_job_id
  )
  UPDATE companycam_photos ph SET storage_priority = pr.prio
    FROM pr WHERE pr.id = ph.id AND ph.storage_priority IS DISTINCT FROM pr.prio;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN jsonb_build_object('priority_changed', v_changed);
END $$;

-- Atomically claim the next batch for a copy worker (safe with several workers).
CREATE OR REPLACE FUNCTION public.claim_companycam_copy_batch(p_limit int DEFAULT 50, p_max_priority smallint DEFAULT 9)
RETURNS SETOF public.companycam_photos
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE companycam_photos ph SET storage_status = 'copying', copy_attempts = ph.copy_attempts + 1, copy_claimed_at = now()
   WHERE ph.id IN (
     SELECT id FROM companycam_photos
      WHERE storage_status IN ('pending', 'failed') AND removed_at IS NULL
        AND copy_attempts < 5 AND storage_priority <= p_max_priority
      ORDER BY storage_priority, captured_at DESC NULLS LAST
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED)
  RETURNING ph.*;
$$;

-- A worker that died mid-batch leaves rows in 'copying'; return them to the queue.
CREATE OR REPLACE FUNCTION public.release_stale_companycam_copies(p_older_than interval DEFAULT interval '30 minutes')
RETURNS int
LANGUAGE sql
SET search_path = public
AS $$
  WITH r AS (
    UPDATE companycam_photos SET storage_status = 'pending'
     WHERE storage_status = 'copying' AND copy_claimed_at < now() - p_older_than
    RETURNING 1)
  SELECT count(*)::int FROM r;
$$;

-- Full-sweep retirement: anything a complete sweep (run id) did not see is marked removed.
-- By run id, never by timestamp (plpgsql now() is transaction time).
CREATE OR REPLACE FUNCTION public.mark_companycam_projects_removed(p_run_id text)
RETURNS int
LANGUAGE sql
SET search_path = public
AS $$
  WITH r AS (
    UPDATE companycam_projects SET removed_at = clock_timestamp()
     WHERE removed_at IS NULL AND seen_run_id IS DISTINCT FROM p_run_id
    RETURNING 1)
  SELECT count(*)::int FROM r;
$$;

CREATE OR REPLACE FUNCTION public.mark_companycam_photos_removed(p_run_id text)
RETURNS int
LANGUAGE sql
SET search_path = public
AS $$
  WITH r AS (
    UPDATE companycam_photos SET removed_at = clock_timestamp()
     WHERE removed_at IS NULL AND seen_run_id IS DISTINCT FROM p_run_id
    RETURNING 1)
  SELECT count(*)::int FROM r;
$$;

REVOKE ALL ON FUNCTION public.link_companycam_projects(), public.refresh_companycam_copy_priority(),
  public.claim_companycam_copy_batch(int, smallint), public.release_stale_companycam_copies(interval),
  public.mark_companycam_projects_removed(text), public.mark_companycam_photos_removed(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_companycam_projects(), public.refresh_companycam_copy_priority(),
  public.claim_companycam_copy_batch(int, smallint), public.release_stale_companycam_copies(interval),
  public.mark_companycam_projects_removed(text), public.mark_companycam_photos_removed(text)
  TO service_role;

-- ── App read model ─────────────────────────────────────────────────────────────────
-- One row per live photo with everything a gallery needs. `source` tells the app whether to
-- sign a storage path ('brain') or use the CompanyCam CDN URL ('companycam').
CREATE OR REPLACE VIEW public.v_companycam_photo_feed AS
SELECT ph.id AS photo_id, ph.project_id, p.name AS project_name,
       p.property_id, p.acculynx_job_id, j.job_number, j.job_name, j.current_milestone,
       ph.captured_at, ph.creator_name, ph.tags, ph.description, ph.has_annotations,
       ph.latitude, ph.longitude,
       CASE WHEN ph.storage_status = 'copied' THEN 'brain' ELSE 'companycam' END AS source,
       ph.storage_paths->>'thumbnail' AS thumbnail_path,
       ph.storage_paths->>'web'       AS web_path,
       ph.storage_paths->>'original'  AS original_path,
       ph.thumbnail_url, ph.web_url, ph.original_url,
       p.project_url
FROM public.companycam_photos ph
JOIN public.companycam_projects p ON p.id = ph.project_id
LEFT JOIN public.acculynx_jobs j ON j.id = p.acculynx_job_id
WHERE ph.removed_at IS NULL AND p.removed_at IS NULL;

-- Per-property rollup for list/badge surfaces (photo count, last capture, cover photo).
CREATE OR REPLACE VIEW public.v_companycam_property_summary AS
SELECT p.property_id,
       count(ph.*)                     AS photo_count,
       count(DISTINCT p.id)            AS project_count,
       max(ph.captured_at)             AS last_captured_at,
       (array_agg(ph.id ORDER BY ph.captured_at DESC NULLS LAST))[1] AS cover_photo_id,
       count(ph.*) FILTER (WHERE ph.storage_status = 'copied') AS photos_copied
FROM public.companycam_projects p
JOIN public.companycam_photos ph ON ph.project_id = p.id AND ph.removed_at IS NULL
WHERE p.property_id IS NOT NULL AND p.removed_at IS NULL
GROUP BY p.property_id;

-- Clone progress for the integration health row and the docs/120 runbook.
CREATE OR REPLACE VIEW public.v_companycam_clone_progress AS
SELECT storage_priority, storage_status, count(*) AS photos, sum(storage_bytes) AS bytes
FROM public.companycam_photos WHERE removed_at IS NULL
GROUP BY storage_priority, storage_status;

REVOKE ALL ON public.v_companycam_photo_feed, public.v_companycam_property_summary,
  public.v_companycam_clone_progress FROM anon, authenticated;
GRANT SELECT ON public.v_companycam_photo_feed, public.v_companycam_property_summary,
  public.v_companycam_clone_progress TO service_role;

-- ── Storage bucket ─────────────────────────────────────────────────────────────────
-- Private: homes, interiors, receipts and insurance documents. Apps hand out short-lived
-- signed URLs server-side; nothing in this bucket is public.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('companycam-photos', 'companycam-photos', false, 52428800,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime'])
ON CONFLICT (id) DO NOTHING;

-- ── 318b: originals backfill queue (applied as 318b_companycam_original_backfill_queue) ──
-- The copy worker's display pass stores thumbnail + web (~50 KB/photo, what apps show) and marks
-- the row 'copied'. A second pass adds the ~420 KB original to copied rows, in the same
-- priority order, so open jobs are fully viewable long before the archive clone finishes.
CREATE INDEX IF NOT EXISTS companycam_photos_original_queue_idx
  ON public.companycam_photos (storage_priority, captured_at DESC)
  WHERE storage_status = 'copied' AND NOT (storage_paths ? 'original') AND removed_at IS NULL;

CREATE OR REPLACE FUNCTION public.claim_companycam_original_batch(p_limit int DEFAULT 50, p_max_priority smallint DEFAULT 9)
RETURNS SETOF public.companycam_photos LANGUAGE sql SET search_path = public AS $$
  UPDATE companycam_photos ph SET copy_claimed_at = now()
   WHERE ph.id IN (SELECT id FROM companycam_photos
                    WHERE storage_status = 'copied' AND NOT (storage_paths ? 'original') AND removed_at IS NULL
                      AND storage_priority <= p_max_priority
                      AND (copy_claimed_at IS NULL OR copy_claimed_at < now() - interval '30 minutes')
                    ORDER BY storage_priority, captured_at DESC NULLS LAST
                    LIMIT p_limit FOR UPDATE SKIP LOCKED)
  RETURNING ph.*;
$$;
REVOKE ALL ON FUNCTION public.claim_companycam_original_batch(int, smallint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_companycam_original_batch(int, smallint) TO service_role;

-- ── 318c: videos, webhook receiver support, per-project priority (applied as 318c_companycam_videos_webhook) ──
-- Chris 2026-10-01: register the CompanyCam webhook and copy videos too.
--
-- Videos: 557 on the account, avg ~79 MB (max seen 241 MB) → ~45 GB. playback_url is a
-- presigned S3 URL that expires (~5 h), so the copy worker re-reads each video from the API
-- right before copying it; the stored URL is never trusted later.
CREATE TABLE IF NOT EXISTS public.companycam_videos (
  id                text PRIMARY KEY,
  project_id        text NOT NULL,
  company_id        text,
  creator_id        text,
  creator_name      text,
  captured_at       timestamptz,
  cc_created_at     timestamptz,
  cc_updated_at     timestamptz,
  latitude          double precision,
  longitude         double precision,
  status            text,
  internal          boolean,
  format            text,
  duration_s        integer,
  transcript        text,
  thumbnail_url     text,                 -- CompanyCam CDN (large); public
  raw               jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at         timestamptz NOT NULL DEFAULT now(),
  seen_run_id       text,
  removed_at        timestamptz,
  storage_status    text NOT NULL DEFAULT 'pending',
  storage_paths     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {"video": "...", "thumbnail": "..."}
  storage_bytes     bigint,
  copy_attempts     smallint NOT NULL DEFAULT 0,
  copy_claimed_at   timestamptz,
  copy_error        text,
  copied_at         timestamptz,
  CONSTRAINT companycam_videos_storage_status_check
    CHECK (storage_status IN ('pending', 'copying', 'copied', 'failed', 'skipped'))
);
CREATE INDEX IF NOT EXISTS companycam_videos_project_idx ON public.companycam_videos (project_id, captured_at DESC);
ALTER TABLE public.companycam_videos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companycam_videos FROM anon, authenticated;
GRANT ALL ON public.companycam_videos TO service_role;

-- Next videos to copy: open-job videos first, then newest. Claimed like photos.
CREATE OR REPLACE FUNCTION public.claim_companycam_video_batch(p_limit int DEFAULT 4)
RETURNS SETOF public.companycam_videos LANGUAGE sql SET search_path = public AS $$
  UPDATE companycam_videos v SET storage_status = 'copying', copy_attempts = v.copy_attempts + 1, copy_claimed_at = now()
   WHERE v.id IN (
     SELECT x.id FROM companycam_videos x
       JOIN companycam_projects p ON p.id = x.project_id
       LEFT JOIN acculynx_jobs j ON j.id = p.acculynx_job_id
      WHERE x.storage_status IN ('pending', 'failed') AND x.removed_at IS NULL AND x.copy_attempts < 5
      ORDER BY (j.current_milestone IN ('Lead', 'Prospect', 'Approved', 'Completed', 'Invoiced') AND j.archived_at IS NULL) DESC NULLS LAST,
               x.captured_at DESC NULLS LAST
      LIMIT p_limit
      FOR UPDATE OF x SKIP LOCKED)
  RETURNING v.*;
$$;

CREATE OR REPLACE FUNCTION public.release_stale_companycam_video_copies(p_older_than interval DEFAULT interval '45 minutes')
RETURNS int LANGUAGE sql SET search_path = public AS $$
  WITH r AS (UPDATE companycam_videos SET storage_status = 'pending'
     WHERE storage_status = 'copying' AND copy_claimed_at < now() - p_older_than RETURNING 1)
  SELECT count(*)::int FROM r;
$$;

CREATE OR REPLACE FUNCTION public.mark_companycam_videos_removed(p_run_id text)
RETURNS int LANGUAGE sql SET search_path = public AS $$
  WITH r AS (UPDATE companycam_videos SET removed_at = clock_timestamp()
     WHERE removed_at IS NULL AND seen_run_id IS DISTINCT FROM p_run_id RETURNING 1)
  SELECT count(*)::int FROM r;
$$;

-- One copy-priority rule, shared by the full refresh and the per-project refresh the webhook uses.
CREATE OR REPLACE FUNCTION public.companycam_copy_priority(p_milestone text, p_job_archived_at timestamptz,
  p_job_id text, p_property_id uuid, p_captured_at timestamptz)
RETURNS smallint LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (CASE
    WHEN p_milestone IN ('Lead', 'Prospect', 'Approved', 'Completed', 'Invoiced') AND p_job_archived_at IS NULL THEN 1
    WHEN p_captured_at >= now() - interval '90 days' THEN 2
    WHEN p_job_id IS NOT NULL AND p_captured_at >= now() - interval '2 years' THEN 3
    WHEN p_property_id IS NOT NULL THEN 5
    ELSE 9 END)::smallint;
$$;

CREATE OR REPLACE FUNCTION public.refresh_companycam_copy_priority()
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_changed int;
BEGIN
  WITH pr AS (
    SELECT ph.id, companycam_copy_priority(j.current_milestone, j.archived_at, j.id, p.property_id, ph.captured_at) AS prio
    FROM companycam_photos ph JOIN companycam_projects p ON p.id = ph.project_id
    LEFT JOIN acculynx_jobs j ON j.id = p.acculynx_job_id)
  UPDATE companycam_photos ph SET storage_priority = pr.prio FROM pr WHERE pr.id = ph.id AND ph.storage_priority IS DISTINCT FROM pr.prio;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN jsonb_build_object('priority_changed', v_changed);
END $$;

CREATE OR REPLACE FUNCTION public.refresh_companycam_project_priority(p_project_id text)
RETURNS int LANGUAGE sql SET search_path = public AS $$
  WITH pr AS (
    SELECT ph.id, companycam_copy_priority(j.current_milestone, j.archived_at, j.id, p.property_id, ph.captured_at) AS prio
    FROM companycam_photos ph JOIN companycam_projects p ON p.id = ph.project_id
    LEFT JOIN acculynx_jobs j ON j.id = p.acculynx_job_id
    WHERE ph.project_id = p_project_id),
  u AS (UPDATE companycam_photos ph SET storage_priority = pr.prio FROM pr
         WHERE pr.id = ph.id AND ph.storage_priority IS DISTINCT FROM pr.prio RETURNING 1)
  SELECT count(*)::int FROM u;
$$;

-- Webhook receiver audit log: every delivery, verified or not (edge function companycam-webhook).
CREATE TABLE IF NOT EXISTS public.companycam_webhook_events (
  id             bigserial PRIMARY KEY,
  received_at    timestamptz NOT NULL DEFAULT now(),
  webhook_id     text,
  event_type     text,
  resource_type  text,
  resource_id    text,
  signature_ok   boolean NOT NULL,
  payload        jsonb,
  processed_at   timestamptz,
  process_result text,
  process_error  text
);
CREATE INDEX IF NOT EXISTS companycam_webhook_events_received_idx ON public.companycam_webhook_events (received_at DESC);
CREATE INDEX IF NOT EXISTS companycam_webhook_events_unprocessed_idx ON public.companycam_webhook_events (received_at)
  WHERE processed_at IS NULL AND signature_ok;
ALTER TABLE public.companycam_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companycam_webhook_events FROM anon, authenticated;
GRANT ALL ON public.companycam_webhook_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.companycam_webhook_events_id_seq TO service_role;

-- Secrets for the receiver live in Supabase Vault (names companycam_*): the webhook signing
-- token (we generate it and hand it to CompanyCam at registration) and the API token the
-- receiver uses to re-read the resource an event names. Service-role only; never logged.
CREATE OR REPLACE FUNCTION public.companycam_secret(p_name text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, vault AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = p_name AND p_name LIKE 'companycam\_%' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.companycam_put_secret(p_name text, p_secret text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
DECLARE v_id uuid;
BEGIN
  IF p_name NOT LIKE 'companycam\_%' THEN RAISE EXCEPTION 'companycam_put_secret only manages companycam_* names'; END IF;
  IF coalesce(length(p_secret), 0) < 16 THEN RAISE EXCEPTION 'secret too short'; END IF;
  SELECT id INTO v_id FROM vault.secrets WHERE name = p_name;
  IF v_id IS NULL THEN PERFORM vault.create_secret(p_secret, p_name, 'CompanyCam integration (docs/120)');
  ELSE PERFORM vault.update_secret(v_id, p_secret); END IF;
END $$;

REVOKE ALL ON FUNCTION public.claim_companycam_video_batch(int), public.release_stale_companycam_video_copies(interval),
  public.mark_companycam_videos_removed(text), public.companycam_copy_priority(text, timestamptz, text, uuid, timestamptz),
  public.refresh_companycam_project_priority(text), public.companycam_secret(text), public.companycam_put_secret(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_companycam_video_batch(int), public.release_stale_companycam_video_copies(interval),
  public.mark_companycam_videos_removed(text), public.companycam_copy_priority(text, timestamptz, text, uuid, timestamptz),
  public.refresh_companycam_project_priority(text), public.companycam_secret(text), public.companycam_put_secret(text, text)
  TO service_role;

-- Videos up to ~250 MB observed; allow 1 GB per object in this bucket.
UPDATE storage.buckets SET file_size_limit = 1073741824 WHERE id = 'companycam-photos';

-- ── 318d: retry caps from the PR #26 review (applied as 318d_companycam_copy_retry_caps) ──
-- (a) The originals pass had no attempt limit: a missing/failing original was retried forever.
ALTER TABLE public.companycam_photos ADD COLUMN IF NOT EXISTS original_attempts smallint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.claim_companycam_original_batch(p_limit int DEFAULT 50, p_max_priority smallint DEFAULT 9)
RETURNS SETOF public.companycam_photos LANGUAGE sql SET search_path = public AS $$
  UPDATE companycam_photos ph SET copy_claimed_at = now(), original_attempts = ph.original_attempts + 1
   WHERE ph.id IN (SELECT id FROM companycam_photos
                    WHERE storage_status = 'copied' AND NOT (storage_paths ? 'original') AND removed_at IS NULL
                      AND storage_priority <= p_max_priority AND original_attempts < 5
                      AND (copy_claimed_at IS NULL OR copy_claimed_at < now() - interval '30 minutes')
                    ORDER BY storage_priority, captured_at DESC NULLS LAST
                    LIMIT p_limit FOR UPDATE SKIP LOCKED)
  RETURNING ph.*;
$$;

-- (b) Releasing a stale claim on a row that already used its 5 attempts parked it as 'pending'
--     forever (the claim filter excludes it). Exhausted rows now land in 'failed', visibly.
CREATE OR REPLACE FUNCTION public.release_stale_companycam_copies(p_older_than interval DEFAULT interval '30 minutes')
RETURNS int LANGUAGE sql SET search_path = public AS $$
  WITH r AS (UPDATE companycam_photos
                SET storage_status = CASE WHEN copy_attempts >= 5 THEN 'failed' ELSE 'pending' END,
                    copy_error = CASE WHEN copy_attempts >= 5 THEN coalesce(copy_error, 'attempts exhausted (claim went stale)') ELSE copy_error END
              WHERE storage_status = 'copying' AND copy_claimed_at < now() - p_older_than RETURNING 1)
  SELECT count(*)::int FROM r;
$$;

CREATE OR REPLACE FUNCTION public.release_stale_companycam_video_copies(p_older_than interval DEFAULT interval '45 minutes')
RETURNS int LANGUAGE sql SET search_path = public AS $$
  WITH r AS (UPDATE companycam_videos
                SET storage_status = CASE WHEN copy_attempts >= 5 THEN 'failed' ELSE 'pending' END,
                    copy_error = CASE WHEN copy_attempts >= 5 THEN coalesce(copy_error, 'attempts exhausted (claim went stale)') ELSE copy_error END
              WHERE storage_status = 'copying' AND copy_claimed_at < now() - p_older_than RETURNING 1)
  SELECT count(*)::int FROM r;
$$;

CREATE INDEX IF NOT EXISTS companycam_photos_original_queue_v2_idx
  ON public.companycam_photos (storage_priority, captured_at DESC)
  WHERE storage_status = 'copied' AND NOT (storage_paths ? 'original') AND removed_at IS NULL AND original_attempts < 5;

-- ── 318e: removal guard (applied as 318e_companycam_removal_guard) ─────────────────
-- A full sweep retires only rows last synced BEFORE the sweep began. Rows the webhook writes
-- mid-sweep carry no seen_run_id but a newer synced_at; they must not be marked removed.
-- Run start = earliest synced_at stamped with this run id; a run that saw nothing retires nothing.
CREATE OR REPLACE FUNCTION public.mark_companycam_projects_removed(p_run_id text)
RETURNS int LANGUAGE sql SET search_path = public AS $$
  WITH s AS (SELECT min(synced_at) AS started FROM companycam_projects WHERE seen_run_id = p_run_id),
  r AS (UPDATE companycam_projects SET removed_at = clock_timestamp()
         WHERE removed_at IS NULL AND seen_run_id IS DISTINCT FROM p_run_id
           AND synced_at < (SELECT started FROM s) RETURNING 1)
  SELECT count(*)::int FROM r;
$$;

CREATE OR REPLACE FUNCTION public.mark_companycam_photos_removed(p_run_id text)
RETURNS int LANGUAGE sql SET search_path = public AS $$
  WITH s AS (SELECT min(synced_at) AS started FROM companycam_photos WHERE seen_run_id = p_run_id),
  r AS (UPDATE companycam_photos SET removed_at = clock_timestamp()
         WHERE removed_at IS NULL AND seen_run_id IS DISTINCT FROM p_run_id
           AND synced_at < (SELECT started FROM s) RETURNING 1)
  SELECT count(*)::int FROM r;
$$;

CREATE OR REPLACE FUNCTION public.mark_companycam_videos_removed(p_run_id text)
RETURNS int LANGUAGE sql SET search_path = public AS $$
  WITH s AS (SELECT min(synced_at) AS started FROM companycam_videos WHERE seen_run_id = p_run_id),
  r AS (UPDATE companycam_videos SET removed_at = clock_timestamp()
         WHERE removed_at IS NULL AND seen_run_id IS DISTINCT FROM p_run_id
           AND synced_at < (SELECT started FROM s) RETURNING 1)
  SELECT count(*)::int FROM r;
$$;

-- ── 318f: priority refresh in project batches (applied as 318f_companycam_priority_batches) ──
-- The one-statement refresh over 311k photos exceeds service_role's 8 s statement_timeout via
-- PostgREST (playbook 9); sync.mjs walks projects in id order, one bounded statement per call.
CREATE OR REPLACE FUNCTION public.refresh_companycam_copy_priority_batch(p_after text DEFAULT '', p_projects int DEFAULT 300)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_last text; v_changed int;
BEGIN
  SELECT max(id) INTO v_last FROM (SELECT id FROM companycam_projects WHERE id > coalesce(p_after, '') ORDER BY id LIMIT p_projects) b;
  IF v_last IS NULL THEN RETURN jsonb_build_object('done', true, 'changed', 0); END IF;
  WITH pr AS (
    SELECT ph.id, companycam_copy_priority(j.current_milestone, j.archived_at, j.id, p.property_id, ph.captured_at) AS prio
    FROM companycam_projects p
    JOIN companycam_photos ph ON ph.project_id = p.id
    LEFT JOIN acculynx_jobs j ON j.id = p.acculynx_job_id
    WHERE p.id > coalesce(p_after, '') AND p.id <= v_last),
  u AS (UPDATE companycam_photos ph SET storage_priority = pr.prio FROM pr
         WHERE pr.id = ph.id AND ph.storage_priority IS DISTINCT FROM pr.prio RETURNING 1)
  SELECT count(*) INTO v_changed FROM u;
  RETURN jsonb_build_object('done', false, 'last', v_last, 'changed', v_changed);
END $$;
REVOKE ALL ON FUNCTION public.refresh_companycam_copy_priority_batch(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_companycam_copy_priority_batch(text, int) TO service_role;

-- ── 318g + 318h: indexes for the PostgREST-timeout paths (heap ≈ 1.2 GB of raw jsonb) ──
CREATE INDEX IF NOT EXISTS companycam_photos_copying_idx ON public.companycam_photos (copy_claimed_at) WHERE storage_status = 'copying';
CREATE INDEX IF NOT EXISTS companycam_photos_seen_run_idx ON public.companycam_photos (seen_run_id);
CREATE INDEX IF NOT EXISTS companycam_photos_removed_scan_idx ON public.companycam_photos (synced_at) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS companycam_photos_progress_idx
  ON public.companycam_photos (storage_priority, storage_status) INCLUDE (storage_bytes) WHERE removed_at IS NULL;
