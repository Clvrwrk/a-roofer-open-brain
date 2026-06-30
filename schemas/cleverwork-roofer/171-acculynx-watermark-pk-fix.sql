-- 171 — acculynx_sync_watermark primary key fix (Phase 2 gap-closure, 2026-06-30)
--
-- PROBLEM: Migration 168 added UNIQUE(account_key, resource_type) for multi-account
-- watermarking, but the original PRIMARY KEY on resource_type alone was NOT removed.
-- The table can only hold ONE row per resource_type value, regardless of account_key.
-- When wichita tries to upsert (wichita, jobs), it conflicts on the PK because
-- (kansas_city, jobs) already exists with resource_type='jobs'.
-- advanceWatermark silently swallows the error → wichita watermark never created.
--
-- FIX: Promote the UNIQUE(account_key, resource_type) constraint to be the PRIMARY KEY.
-- The old single-column PK is dropped; the UNIQUE constraint becomes the identity.
-- This is safe because:
--   1. The UNIQUE constraint already exists (migration 168) and enforces the same
--      (account_key, resource_type) uniqueness we need for the PK.
--   2. All downstream code upserts on onConflict "account_key,resource_type" — correct.
--   3. The existing kansas_city row (resource_type='jobs') is preserved exactly; no data
--      is touched. Additive + idempotent under hard rule 1.
--   4. The wichita/contacts, wichita/estimates etc. rows (resource_type varies) are also
--      preserved since their UNIQUE(account_key, resource_type) combos are distinct.
--
-- After this migration, the table can hold multiple rows with the same resource_type
-- as long as account_key differs — which is the correct multi-account behaviour.
--
-- Additive; no DROP TABLE/DROP COLUMN/TRUNCATE/DELETE (hard rule 1).

-- Step 1: Drop the original single-column PK.
-- IF EXISTS guards: safe to re-run (idempotent).
alter table public.acculynx_sync_watermark
  drop constraint if exists acculynx_sync_watermark_pkey;

-- Step 2: Drop the existing UNIQUE constraint so we can recreate it as the PK.
-- This constraint was added by migration 168. Dropping it here before adding the PK
-- avoids "multiple primary keys for table" or duplicate index errors.
alter table public.acculynx_sync_watermark
  drop constraint if exists acculynx_sync_watermark_account_resource;

-- Step 3: Add the composite PRIMARY KEY on (account_key, resource_type).
-- This replaces both the old PK and the UNIQUE constraint.
-- IF NOT EXISTS is not supported for ADD PRIMARY KEY in PostgreSQL < 15 — use
-- "DROP CONSTRAINT IF EXISTS" first (done above) to make this idempotent.
alter table public.acculynx_sync_watermark
  add primary key (account_key, resource_type);

comment on table public.acculynx_sync_watermark is
  'Per-(account_key, resource_type) incremental sync watermark for the AccuLynx fan-out. Migration 171 promoted the PK to (account_key, resource_type) to support multiple accounts with the same resource_type (was blocked by single-column resource_type PK from pre-Phase-2 schema).';
