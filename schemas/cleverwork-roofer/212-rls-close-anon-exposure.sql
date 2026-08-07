-- 212-rls-close-anon-exposure.sql
-- Security fix: SECURITY.md §3 and schemas/README.md ("RLS everywhere") claim every
-- Cleverwork table enables Row Level Security with a service_role-only policy. An audit of
-- schemas/cleverwork-roofer found ~70 public tables created since then WITHOUT it —
-- agreement_packages / agreement_package_items / agreement_package_submissions (which stores
-- the single-claim vendor magic tokens), every qbo_* mirror table (invoices, bills, payments,
-- customers, vendors, journal entries), every estimate_* table, kb_*, labor_*, monday_invoice_queue,
-- price_agreement_requests, invoice_* exports, service_warranty_audit_queue, cp_*.
-- Supabase's default grants make every public table reachable by the anon and authenticated
-- roles, so with RLS off each of those is readable AND writable by anyone holding the anon key
-- (which is public by design — it ships to the browser). Same class as 96-rls-abc-change-log.sql,
-- generalized so the gap cannot silently reopen for the next table.
--
-- Nothing in this repo reads Supabase with the anon key: the Command Center, the Edge
-- Functions, the MCP containers, and every bridge use SUPABASE_SERVICE_ROLE_KEY, and the
-- dashboard reads through the Command Center. So service_role-only policies + revoking the
-- inherited anon/authenticated grants is the intended posture (CONVENTIONS §4), not a
-- functional change.
--
-- Additive + idempotent (safe to re-run). Set-based, so it also covers tables added later.
-- PROPOSED / NOT YET APPLIED — apply on a Supabase branch first, confirm the Command Center
-- and the nightly bridges still read/write, then promote.

BEGIN;

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity IS FALSE
      AND pg_catalog.pg_get_userbyid(c.relowner) = current_user
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rec.table_name);

    -- service_role (MCP containers, Edge Functions, Command Center) keeps full access;
    -- anon and authenticated get NO policy, so RLS denies them every row.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rec.table_name || '_service_all', rec.table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      rec.table_name || '_service_all',
      rec.table_name
    );
  END LOOP;
END $$;

-- Second barrier (defense in depth, mirrors 60-tighten-grants.sql): drop the inherited
-- table/view grants so a future table created with RLS off is not exposed the moment it
-- lands, and so views — which run with their owner's rights and would otherwise read
-- straight through RLS — are not anon-readable either.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT c.relname AS rel_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'v', 'm', 'p')
      AND pg_catalog.pg_get_userbyid(c.relowner) = current_user
    ORDER BY c.relname
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', rec.rel_name);
  END LOOP;
END $$;

-- Stop the same grants from being re-attached to future objects this role creates
-- (default privileges are per-creating-role, so run this migration as the role that owns
-- the migrations — the same one used for every file in this directory).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- jt_mirror / runtime_auth tables are not covered here: those schemas are not in the
-- PostgREST exposed list (supabase/config.toml [api].schemas = public, graphql_public),
-- so they are unreachable with the anon key. Keep it that way.

NOTIFY pgrst, 'reload schema';

COMMIT;
