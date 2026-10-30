-- 315 — Read indexes for the CRM profile pages (Property, Job, Staff).
--
-- The CRM (Clvrwrk/CRM_PWA, docs/delivery/PROFILE-PAGES.md) reads Command Center tables through
-- its restricted reader role. Two of those reads had no usable index on the live project
-- (EXPLAIN ANALYZE, 2026-10-01):
--   * Property weather: hail reports within 5 mi of a property, last 10 years. With only
--     noaa_hail_events_date_idx the planner walked 63,996 rows and filtered by lat/lon in
--     985 ms — too slow beside the other reads under the 8 s statement_timeout.
--     A btree on (begin_lat, begin_lon) turns the bounding box into an index range.
--   * Property → jobs: acculynx_jobs.property_id (6,073 of 7,038 linked) had no index.
--
-- Additive and idempotent (hard rule 1). No data changes; nothing else reads these indexes.
-- Rollback: DROP INDEX of either index is safe (only query plans change).

CREATE INDEX IF NOT EXISTS noaa_hail_events_lat_lon_idx
  ON public.noaa_hail_events (begin_lat, begin_lon);

CREATE INDEX IF NOT EXISTS idx_acculynx_jobs_property_id
  ON public.acculynx_jobs (property_id)
  WHERE property_id IS NOT NULL;
