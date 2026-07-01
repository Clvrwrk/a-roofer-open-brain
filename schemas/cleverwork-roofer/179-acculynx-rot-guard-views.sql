-- 179 — AccuLynx rot-guard monitoring views (Phase 3, REQ-07, plan 03-04, D-12)
--
-- Four "zero rows = healthy" views the alert layer (plan 03-03 check_acculynx_alerts) surfaces.
-- They detect the ways ingested data can silently rot/drift:
--   1. v_acculynx_duplicate_guids     — same AccuLynx GUID appearing twice (double-ingest)
--   2. v_acculynx_orphan_subresources — a live sub-resource whose parent job/contact/invoice is
--      missing or archived (torn/partial sweep). FKs are ON DELETE CASCADE so hard orphans can't
--      exist; this catches SOFT orphans (parent soft-archived while child still live).
--   3. v_acculynx_null_provenance     — live rows with NULL account_key (same class as the 8 legacy
--      rows mig 180 triaged; should stay empty now that mig 178 enforces NOT NULL)
--   4. v_acculynx_stale_tail          — live rows not re-seen by the API in ~7 days (markNotSeen
--      diff-detection gap: should have been archived but wasn't)
--
-- Additive + idempotent (CREATE OR REPLACE VIEW); no DROP TABLE/DROP COLUMN/TRUNCATE/DELETE (hard rule 1).

-- ── 1. Duplicate GUIDs (PK-enforced today; a monitor that proves zero dups) ──
create or replace view public.v_acculynx_duplicate_guids as
  select 'acculynx_jobs'          as table_name, id as guid, count(*) as dup_count from public.acculynx_jobs          where archived_at is null group by id having count(*) > 1
  union all
  select 'acculynx_contacts',      id, count(*) from public.acculynx_contacts      where archived_at is null group by id having count(*) > 1
  union all
  select 'acculynx_estimates',     id, count(*) from public.acculynx_estimates     where archived_at is null group by id having count(*) > 1
  union all
  select 'acculynx_invoices',      id, count(*) from public.acculynx_invoices      where archived_at is null group by id having count(*) > 1
  union all
  select 'acculynx_invoice_lines', id, count(*) from public.acculynx_invoice_lines where archived_at is null group by id having count(*) > 1
  union all
  select 'acculynx_job_contacts',  id, count(*) from public.acculynx_job_contacts  where archived_at is null group by id having count(*) > 1;
comment on view public.v_acculynx_duplicate_guids is 'Rot guard (D-12): live rows sharing an AccuLynx GUID (double-ingest). Zero rows = healthy.';
grant select on public.v_acculynx_duplicate_guids to authenticated, service_role;

-- ── 2. Orphan sub-resources (soft orphans: live child, parent missing or archived) ──
create or replace view public.v_acculynx_orphan_subresources as
  select 'acculynx_estimates'             as table_name, e.id::text as id, 'job'     as parent_kind, e.job_id::text     as parent_id from public.acculynx_estimates e             where e.archived_at is null and not exists (select 1 from public.acculynx_jobs j     where j.id = e.job_id     and j.archived_at is null)
  union all
  select 'acculynx_invoices',             i.id::text, 'job',     i.job_id::text     from public.acculynx_invoices i             where i.archived_at is null and not exists (select 1 from public.acculynx_jobs j     where j.id = i.job_id     and j.archived_at is null)
  union all
  select 'acculynx_invoice_lines',        il.id::text, 'invoice', il.invoice_id::text from public.acculynx_invoice_lines il      where il.archived_at is null and not exists (select 1 from public.acculynx_invoices iv where iv.id = il.invoice_id and iv.archived_at is null)
  union all
  select 'acculynx_job_contacts',         jc.id::text, 'job',     jc.job_id::text    from public.acculynx_job_contacts jc        where jc.archived_at is null and not exists (select 1 from public.acculynx_jobs j     where j.id = jc.job_id    and j.archived_at is null)
  union all
  select 'acculynx_job_financials',       f.job_id::text, 'job',   f.job_id::text     from public.acculynx_job_financials f       where f.archived_at is null and not exists (select 1 from public.acculynx_jobs j     where j.id = f.job_id     and j.archived_at is null)
  union all
  select 'acculynx_job_insurance',        ins.job_id::text, 'job', ins.job_id::text   from public.acculynx_job_insurance ins      where ins.archived_at is null and not exists (select 1 from public.acculynx_jobs j    where j.id = ins.job_id   and j.archived_at is null)
  union all
  select 'acculynx_job_milestone_history', m.id::text, 'job',     m.job_id::text     from public.acculynx_job_milestone_history m where m.archived_at is null and not exists (select 1 from public.acculynx_jobs j    where j.id = m.job_id     and j.archived_at is null);
comment on view public.v_acculynx_orphan_subresources is 'Rot guard (D-12): live sub-resource rows whose parent job/invoice is missing or archived (torn/partial sweep). Zero rows = healthy.';
grant select on public.v_acculynx_orphan_subresources to authenticated, service_role;

-- ── 3. NULL provenance (should stay empty post mig 178) ──
create or replace view public.v_acculynx_null_provenance as
  select 'acculynx_jobs'                  as table_name, id::text as id from public.acculynx_jobs                  where account_key is null and archived_at is null
  union all select 'acculynx_contacts',               id::text from public.acculynx_contacts               where account_key is null and archived_at is null
  union all select 'acculynx_job_contacts',           id::text from public.acculynx_job_contacts           where account_key is null and archived_at is null
  union all select 'acculynx_estimates',              id::text from public.acculynx_estimates              where account_key is null and archived_at is null
  union all select 'acculynx_invoices',               id::text from public.acculynx_invoices               where account_key is null and archived_at is null
  union all select 'acculynx_invoice_lines',          id::text from public.acculynx_invoice_lines          where account_key is null and archived_at is null
  union all select 'acculynx_job_financials',         job_id::text from public.acculynx_job_financials     where account_key is null and archived_at is null
  union all select 'acculynx_job_insurance',          job_id::text from public.acculynx_job_insurance      where account_key is null and archived_at is null
  union all select 'acculynx_job_milestone_history',  id::text from public.acculynx_job_milestone_history  where account_key is null and archived_at is null;
comment on view public.v_acculynx_null_provenance is 'Rot guard (D-12): live rows missing account_key provenance. Zero rows = healthy (mig 178 enforces NOT NULL).';
grant select on public.v_acculynx_null_provenance to authenticated, service_role;

-- ── 4. Stale tail (live rows not re-seen by the API in ~7 days = diff-detection gap) ──
create or replace view public.v_acculynx_stale_tail as
  select 'acculynx_jobs'                  as table_name, id::text as id, last_seen_by_api from public.acculynx_jobs                  where archived_at is null and last_seen_by_api < now() - interval '7 days'
  union all select 'acculynx_contacts',               id::text, last_seen_by_api from public.acculynx_contacts               where archived_at is null and last_seen_by_api < now() - interval '7 days'
  union all select 'acculynx_job_contacts',           id::text, last_seen_by_api from public.acculynx_job_contacts           where archived_at is null and last_seen_by_api < now() - interval '7 days'
  union all select 'acculynx_estimates',              id::text, last_seen_by_api from public.acculynx_estimates              where archived_at is null and last_seen_by_api < now() - interval '7 days'
  union all select 'acculynx_invoices',               id::text, last_seen_by_api from public.acculynx_invoices               where archived_at is null and last_seen_by_api < now() - interval '7 days'
  union all select 'acculynx_invoice_lines',          id::text, last_seen_by_api from public.acculynx_invoice_lines          where archived_at is null and last_seen_by_api < now() - interval '7 days'
  union all select 'acculynx_job_financials',         job_id::text, last_seen_by_api from public.acculynx_job_financials     where archived_at is null and last_seen_by_api < now() - interval '7 days'
  union all select 'acculynx_job_insurance',          job_id::text, last_seen_by_api from public.acculynx_job_insurance      where archived_at is null and last_seen_by_api < now() - interval '7 days'
  union all select 'acculynx_job_milestone_history',  id::text, last_seen_by_api from public.acculynx_job_milestone_history  where archived_at is null and last_seen_by_api < now() - interval '7 days';
comment on view public.v_acculynx_stale_tail is 'Rot guard (D-12): live rows not re-seen by the AccuLynx API in ~7 days (markNotSeen should have archived them). Zero rows = healthy.';
grant select on public.v_acculynx_stale_tail to authenticated, service_role;

-- Additive; no DROP TABLE/DROP COLUMN/TRUNCATE/DELETE (hard rule 1).
