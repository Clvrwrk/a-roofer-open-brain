-- 320 — AccuLynx job documents: stored copies, job/property links, document types, coverage (docs/121).
--
-- AccuLynx's API has no GET for job documents (the 86 documented reads return none; only the
-- postJobDocument write exists), so documents arrive as browser collections: one inventory JSON
-- per job (job id, AccuLynx folder, source URL, SHA-256, file-check result) plus the files.
-- integrations/bridges/acculynx-documents/load.mjs loads a collection into these tables and the
-- private `acculynx-job-documents` bucket. Same shape as the CompanyCam mirror (318):
--
--   acculynx_job_documents            one row per document AccuLynx listed on a job: metadata, the
--                                     document type, the file-check result, and our stored copy.
--   acculynx_job_document_links       document → job (+ the job's property). One file may belong to
--                                     several jobs (a permit invoice naming three jobs).
--   job_document_type_map             AccuLynx folder name → document type (40 spellings → 11 types).
--   job_document_requirements         which types a job needs at each milestone (draft rules).
--   acculynx_document_collection_jobs which jobs a collection inspected, including empty ones, so a
--                                     job with no documents reads as a gap rather than as unknown.
--   acculynx_document_load_runs       one row per loader run.
--
-- Trust (hard rule 4): the listing link is a trusted import (AccuLynx's own job id), so it lands as
-- 'instruction'. Document types derived from folders or a classifier are 'evidence' until a person
-- confirms them. Loader upserts never carry type, link or storage-decision columns that a person
-- may have changed; the map and link functions below never touch a 'human' type or link.
--
-- Storage is content-addressed (sha256/<2>/<sha>.<ext>): duplicate copies collapse to one object
-- and an object is never overwritten with different bytes. Nothing here deletes (hard rule 1).
-- Additive + idempotent. Service-role only: RLS on, no policies, no anon/authenticated grants.
-- App access goes through the app's own reader contract (the CRM's, as for CompanyCam photos).

-- ── Document types ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_document_type_map (
  source_system      text NOT NULL DEFAULT 'acculynx',
  source_folder_key  text NOT NULL,                       -- lower(btrim(folder name))
  doc_type           text NOT NULL,
  note               text,
  PRIMARY KEY (source_system, source_folder_key),
  CONSTRAINT job_document_type_map_doc_type_check CHECK (doc_type IN (
    'contract', 'proposal', 'insurance', 'measurement', 'permit', 'work_order',
    'material', 'subcontractor', 'billing', 'closeout', 'unsorted'))
);

INSERT INTO public.job_document_type_map (source_folder_key, doc_type, note) VALUES
  ('contract agreement', 'contract', NULL),
  ('contract agreements', 'contract', NULL),
  ('atr form', 'contract', 'Assignment / authorization to repair'),
  ('job paperwork', 'contract', NULL),
  ('homeowner', 'contract', 'Homeowner-signed paperwork'),
  ('roofr proposal', 'proposal', NULL),
  ('roofr proposals', 'proposal', NULL),
  ('insurance estimate', 'insurance', NULL),
  ('insurance estimates', 'insurance', NULL),
  ('supplement', 'insurance', NULL),
  ('roof report', 'measurement', NULL),
  ('roof measurment report', 'measurement', 'Misspelled folder in AccuLynx'),
  ('roof measurement report', 'measurement', NULL),
  ('roof measurement reports', 'measurement', NULL),
  ('ventilation calculations', 'measurement', NULL),
  ('photo report', 'measurement', NULL),
  ('companycam checklists', 'measurement', NULL),
  ('appconnections', 'measurement', 'Integration exports, mostly CompanyCam checklists'),
  ('permit', 'permit', NULL),
  ('labor work orders/tickets', 'work_order', NULL),
  ('work orders', 'work_order', NULL),
  ('work order (s)', 'work_order', NULL),
  ('sow', 'work_order', 'Scope of work'),
  ('abc invoice', 'material', NULL),
  ('abc invoices', 'material', NULL),
  ('material po', 'material', NULL),
  ('material invoices/receipts', 'material', NULL),
  ('material estimate/invoices', 'material', NULL),
  ('subcontractor invoices', 'subcontractor', NULL),
  ('subcontractors invoices', 'subcontractor', NULL),
  ('subcontractor estimates', 'subcontractor', NULL),
  ('subcontractors estimates', 'subcontractor', NULL),
  ('customer invoice', 'billing', NULL),
  ('job expense receipts', 'billing', NULL),
  ('job receipts', 'billing', NULL),
  ('certificate of completion', 'closeout', NULL),
  ('warranty', 'closeout', NULL),
  ('warranty paperwork', 'closeout', NULL),
  ('email documents', 'unsorted', 'Mixed content: classify by reading the file'),
  ('other', 'unsorted', 'Mixed content: classify by reading the file')
ON CONFLICT (source_system, source_folder_key) DO NOTHING;

-- Draft stage rules for the "missing documents" signals (docs/121 §4). A NULL prefix applies to
-- every job; 'INS' applies to insurance-program jobs (job numbers INS-<n>).
CREATE TABLE IF NOT EXISTS public.job_document_requirements (
  milestone          text NOT NULL,
  doc_type           text NOT NULL,
  job_number_prefix  text NOT NULL DEFAULT '',            -- '' = all jobs
  status             text NOT NULL DEFAULT 'draft',
  PRIMARY KEY (milestone, doc_type, job_number_prefix),
  CONSTRAINT job_document_requirements_status_check CHECK (status IN ('draft', 'active', 'retired'))
);

INSERT INTO public.job_document_requirements (milestone, doc_type, job_number_prefix)
SELECT m, t, p
FROM (VALUES ('Approved'), ('Completed'), ('Invoiced')) ms(m)
CROSS JOIN (VALUES ('contract', ''), ('measurement', ''), ('permit', ''), ('work_order', ''), ('material', ''), ('insurance', 'INS')) ts(t, p)
UNION ALL SELECT 'Completed', 'closeout', ''
UNION ALL SELECT 'Invoiced',  'closeout', ''
UNION ALL SELECT 'Invoiced',  'billing',  ''
ON CONFLICT DO NOTHING;

-- ── Documents ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acculynx_job_documents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acculynx_job_id       text NOT NULL,                    -- the job AccuLynx listed it on
  acculynx_document_key text NOT NULL,                    -- source URL path after the company id
  display_name          text,
  source_folder         text,
  source_url            text,                             -- AccuLynx store URL (needs an AccuLynx login)
  source_ui_type        text,
  source_ui_size        text,
  -- type (never written by the loader's upsert)
  doc_type              text NOT NULL DEFAULT 'unsorted',
  doc_type_method       text NOT NULL DEFAULT 'folder_map',
  doc_type_confidence   numeric,
  doc_type_trust_tier   text NOT NULL DEFAULT 'evidence',
  doc_type_set_at       timestamptz,
  doc_type_set_by       text,
  -- file
  sha256                text,
  bytes                 bigint,
  mime_type             text,
  page_count            integer,
  check_status          text NOT NULL,
  check_issues          jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- our copy (bucket acculynx-job-documents)
  storage_status        text NOT NULL DEFAULT 'pending',
  storage_path          text,
  stored_at             timestamptz,
  store_error           text,
  -- text layer (pdftotext), for search and classification
  text_content          text,
  text_chars            integer,
  text_extracted_at     timestamptz,
  -- provenance
  collection_id         text NOT NULL,
  collected_at          timestamptz,
  load_run_id           text,
  loaded_at             timestamptz NOT NULL DEFAULT now(),
  removed_at            timestamptz,
  raw                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT acculynx_job_documents_job_key_unique UNIQUE (acculynx_job_id, acculynx_document_key),
  CONSTRAINT acculynx_job_documents_doc_type_check CHECK (doc_type IN (
    'contract', 'proposal', 'insurance', 'measurement', 'permit', 'work_order',
    'material', 'subcontractor', 'billing', 'closeout', 'unsorted')),
  CONSTRAINT acculynx_job_documents_doc_type_method_check CHECK (doc_type_method IN ('folder_map', 'classifier', 'human')),
  CONSTRAINT acculynx_job_documents_doc_type_trust_check CHECK (doc_type_trust_tier IN ('evidence', 'instruction')),
  CONSTRAINT acculynx_job_documents_check_status_check CHECK (check_status IN ('verified', 'failed', 'not_downloaded')),
  CONSTRAINT acculynx_job_documents_storage_status_check CHECK (storage_status IN ('pending', 'stored', 'missing_file', 'not_downloaded', 'failed'))
);
CREATE INDEX IF NOT EXISTS acculynx_job_documents_job_idx     ON public.acculynx_job_documents (acculynx_job_id);
CREATE INDEX IF NOT EXISTS acculynx_job_documents_sha_idx     ON public.acculynx_job_documents (sha256);
CREATE INDEX IF NOT EXISTS acculynx_job_documents_type_idx    ON public.acculynx_job_documents (doc_type) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS acculynx_job_documents_storage_idx ON public.acculynx_job_documents (storage_status) WHERE storage_status <> 'stored';

-- ── Links ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acculynx_job_document_links (
  document_id      uuid NOT NULL REFERENCES public.acculynx_job_documents (id),
  acculynx_job_id  text NOT NULL,
  property_id      uuid,                                   -- the job's property (refreshed by the link fn)
  link_method      text NOT NULL,
  link_confidence  numeric NOT NULL,
  link_trust_tier  text NOT NULL DEFAULT 'evidence',
  linked_at        timestamptz NOT NULL DEFAULT now(),
  linked_by        text,
  removed_at       timestamptz,
  PRIMARY KEY (document_id, acculynx_job_id),
  CONSTRAINT acculynx_job_document_links_method_check CHECK (link_method IN ('acculynx_listing', 'text_reference', 'human')),
  CONSTRAINT acculynx_job_document_links_trust_check CHECK (link_trust_tier IN ('evidence', 'instruction'))
);
CREATE INDEX IF NOT EXISTS acculynx_job_document_links_job_idx      ON public.acculynx_job_document_links (acculynx_job_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS acculynx_job_document_links_property_idx ON public.acculynx_job_document_links (property_id) WHERE removed_at IS NULL;

-- ── Collections and runs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acculynx_document_collection_jobs (
  collection_id      text NOT NULL,
  acculynx_job_id    text NOT NULL,
  outcome            text NOT NULL,                        -- complete | inspected_empty | exception
  documents_listed   integer NOT NULL DEFAULT 0,
  folders_checked    integer,
  coverage_method    text,
  priority           text,
  load_run_id        text,
  loaded_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, acculynx_job_id),
  CONSTRAINT acculynx_document_collection_jobs_outcome_check CHECK (outcome IN ('complete', 'inspected_empty', 'exception'))
);

CREATE TABLE IF NOT EXISTS public.acculynx_document_load_runs (
  run_id         text PRIMARY KEY,
  collection_id  text NOT NULL,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  stats          jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.job_document_type_map             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_document_requirements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acculynx_job_documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acculynx_job_document_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acculynx_document_collection_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acculynx_document_load_runs       ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_document_type_map, public.job_document_requirements, public.acculynx_job_documents,
  public.acculynx_job_document_links, public.acculynx_document_collection_jobs, public.acculynx_document_load_runs
  FROM anon, authenticated;
GRANT ALL ON public.job_document_type_map, public.job_document_requirements, public.acculynx_job_documents,
  public.acculynx_job_document_links, public.acculynx_document_collection_jobs, public.acculynx_document_load_runs
  TO service_role;

-- ── Type map ───────────────────────────────────────────────────────────────────────
-- Sets the type from the AccuLynx folder for rows still typed by the folder map. Rows a classifier
-- or a person typed are never touched. A mapped 'unsorted' carries no confidence.
CREATE OR REPLACE FUNCTION public.apply_job_document_type_map()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_changed int;
BEGIN
  UPDATE acculynx_job_documents d
     SET doc_type = m.doc_type,
         doc_type_confidence = CASE WHEN m.doc_type = 'unsorted' THEN NULL ELSE 0.9 END,
         doc_type_set_at = now(),
         doc_type_set_by = 'folder_map'
    FROM job_document_type_map m
   WHERE d.doc_type_method = 'folder_map'
     AND m.source_system = 'acculynx'
     AND m.source_folder_key = lower(btrim(d.source_folder))
     AND (d.doc_type IS DISTINCT FROM m.doc_type OR d.doc_type_set_at IS NULL);
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN jsonb_build_object(
    'changed', v_changed,
    'unmapped_folders', (SELECT coalesce(jsonb_agg(DISTINCT d.source_folder), '[]'::jsonb)
                           FROM acculynx_job_documents d
                          WHERE d.removed_at IS NULL AND d.source_folder IS NOT NULL
                            AND NOT EXISTS (SELECT 1 FROM job_document_type_map m
                                             WHERE m.source_system = 'acculynx'
                                               AND m.source_folder_key = lower(btrim(d.source_folder)))));
END;
$$;

-- ── Links ──────────────────────────────────────────────────────────────────────────
-- Every document gets a link to the job AccuLynx listed it on (trusted import → 'instruction'),
-- and every live link carries its job's current property (property-first, hard rule 7).
CREATE OR REPLACE FUNCTION public.link_acculynx_job_documents()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_new int; v_prop int;
BEGIN
  INSERT INTO acculynx_job_document_links (document_id, acculynx_job_id, link_method, link_confidence, link_trust_tier, linked_by)
  SELECT d.id, d.acculynx_job_id, 'acculynx_listing', 1.0, 'instruction', 'acculynx_listing'
    FROM acculynx_job_documents d
   WHERE d.removed_at IS NULL
     AND EXISTS (SELECT 1 FROM acculynx_jobs j WHERE j.id = d.acculynx_job_id)
  ON CONFLICT (document_id, acculynx_job_id) DO NOTHING;
  GET DIAGNOSTICS v_new = ROW_COUNT;

  UPDATE acculynx_job_document_links l
     SET property_id = j.property_id
    FROM acculynx_jobs j
   WHERE j.id = l.acculynx_job_id
     AND l.removed_at IS NULL
     AND l.property_id IS DISTINCT FROM j.property_id;
  GET DIAGNOSTICS v_prop = ROW_COUNT;

  RETURN jsonb_build_object(
    'links_added', v_new,
    'property_refreshed', v_prop,
    'documents_without_job', (SELECT count(*) FROM acculynx_job_documents d
                               WHERE d.removed_at IS NULL
                                 AND NOT EXISTS (SELECT 1 FROM acculynx_jobs j WHERE j.id = d.acculynx_job_id)),
    'links_without_property', (SELECT count(*) FROM acculynx_job_document_links l
                                WHERE l.removed_at IS NULL AND l.property_id IS NULL));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_job_document_type_map(), public.link_acculynx_job_documents() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_job_document_type_map(), public.link_acculynx_job_documents() TO service_role;

-- ── Views ──────────────────────────────────────────────────────────────────────────
-- One row per live link: what an app lists on a job or property page. Apps sign storage_path
-- server-side; a document that is not 'stored' has no file to show.
CREATE OR REPLACE VIEW public.v_job_document_feed AS
SELECT d.id AS document_id, l.acculynx_job_id, j.job_number, j.current_milestone, l.property_id,
       d.doc_type, d.doc_type_method, d.doc_type_trust_tier, d.display_name, d.source_folder,
       d.check_status, d.storage_status, d.storage_path, d.bytes, d.mime_type, d.page_count,
       d.collection_id, d.collected_at, l.link_method, l.link_trust_tier,
       (l.acculynx_job_id = d.acculynx_job_id) AS is_listing_job
FROM public.acculynx_job_document_links l
JOIN public.acculynx_job_documents d ON d.id = l.document_id
LEFT JOIN public.acculynx_jobs j ON j.id = l.acculynx_job_id
WHERE l.removed_at IS NULL AND d.removed_at IS NULL;

-- Per collected job: documents by type, check failures, and the files we hold.
CREATE OR REPLACE VIEW public.v_job_document_coverage AS
SELECT cj.acculynx_job_id, j.job_number, j.current_milestone, j.property_id,
       cj.collection_id, cj.outcome,
       s.documents, s.stored, s.not_verified, s.unsorted, s.by_type
FROM public.acculynx_document_collection_jobs cj
LEFT JOIN public.acculynx_jobs j ON j.id = cj.acculynx_job_id
LEFT JOIN LATERAL (
  SELECT count(*)                                            AS documents,
         count(*) FILTER (WHERE fe.storage_status = 'stored')  AS stored,
         count(*) FILTER (WHERE fe.check_status <> 'verified') AS not_verified,
         count(*) FILTER (WHERE fe.doc_type = 'unsorted')      AS unsorted,
         coalesce((SELECT jsonb_object_agg(t.doc_type, t.n)
                     FROM (SELECT f2.doc_type, count(*) AS n FROM public.v_job_document_feed f2
                            WHERE f2.acculynx_job_id = cj.acculynx_job_id GROUP BY f2.doc_type) t), '{}'::jsonb) AS by_type
    FROM public.v_job_document_feed fe
   WHERE fe.acculynx_job_id = cj.acculynx_job_id
) s ON true;

-- Required types missing for each collected job at its current milestone (draft and active rules).
-- 'unsorted_on_job' > 0 means a gap may still be sitting in an unclassified file.
CREATE OR REPLACE VIEW public.v_job_document_gaps AS
SELECT cj.acculynx_job_id, j.job_number, j.current_milestone, j.property_id, r.doc_type AS missing_doc_type,
       r.status AS rule_status,
       (SELECT count(*) FROM public.v_job_document_feed fe
         WHERE fe.acculynx_job_id = cj.acculynx_job_id AND fe.doc_type = 'unsorted') AS unsorted_on_job
FROM (SELECT DISTINCT acculynx_job_id FROM public.acculynx_document_collection_jobs) cj
JOIN public.acculynx_jobs j ON j.id = cj.acculynx_job_id
JOIN public.job_document_requirements r
  ON r.milestone = j.current_milestone AND r.status <> 'retired'
 AND (r.job_number_prefix = '' OR j.job_number LIKE r.job_number_prefix || '-%')
WHERE NOT EXISTS (SELECT 1 FROM public.v_job_document_feed fe
                   WHERE fe.acculynx_job_id = cj.acculynx_job_id AND fe.doc_type = r.doc_type);

REVOKE ALL ON public.v_job_document_feed, public.v_job_document_coverage, public.v_job_document_gaps FROM anon, authenticated;
GRANT SELECT ON public.v_job_document_feed, public.v_job_document_coverage, public.v_job_document_gaps TO service_role;

-- ── Storage bucket ─────────────────────────────────────────────────────────────────
-- Private: signed contracts, insurance claims, financing and invoices. Apps hand out short-lived
-- signed URLs server-side; nothing here is public. Largest file in the first collection ≈ 54 MB.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('acculynx-job-documents', 'acculynx-job-documents', false, 209715200,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp', 'video/mp4', 'video/quicktime',
              'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/xml', 'text/xml', 'application/zip'])
ON CONFLICT (id) DO NOTHING;

-- ── 320b: two folder names found by the first full load (applied as 320b_job_document_type_map_additions) ──
-- apply_job_document_type_map() reported them as unmapped on 2026-10-02.
INSERT INTO public.job_document_type_map (source_folder_key, doc_type, note) VALUES
  ('abc orders', 'material', NULL),
  ('homeowner invoice', 'billing', NULL)
ON CONFLICT (source_system, source_folder_key) DO NOTHING;

-- ── 320c: lookup by object key (applied as 320c_acculynx_job_documents_storage_path_idx) ──
-- The CRM's Storage predicate (CRM migration 20261010010000, crm_private.authorize_acculynx_document_object) checks
-- every signed key against storage_path; without this index each signature scans the table.
CREATE INDEX IF NOT EXISTS acculynx_job_documents_storage_path_idx
  ON public.acculynx_job_documents (storage_path) WHERE storage_status = 'stored' AND removed_at IS NULL;
