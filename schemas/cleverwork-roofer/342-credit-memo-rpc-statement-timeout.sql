-- 342 · credit-memo sync and reconcile callable over the API (2026-11-10)
--
-- STATUS: NOT APPLIED as of 2026-11-10. The apply was held for Chris as a production
-- change. Verify against supabase_migrations.schema_migrations before assuming it is live.
--
-- PostgREST hands service_role an 8 s statement_timeout. credit_memo_claims_sync_all()
-- and credit_memo_reconcile() both run longer than that, so every REST call returned
-- 57014 "canceling statement due to statement timeout". Until now they only worked from
-- a direct SQL session, which is why the manual SRS intake needed a person with database
-- access for its last two steps.
--
-- alex_no_price_triage() already solves this with a function-level setting (mig 229b).
-- Give these two the same. No body changes; idempotent; nothing is dropped.

ALTER FUNCTION public.credit_memo_claims_sync_all() SET statement_timeout TO '300s';
ALTER FUNCTION public.credit_memo_claims_sync_all() SET lock_timeout TO '240s';
ALTER FUNCTION public.credit_memo_reconcile() SET statement_timeout TO '300s';
ALTER FUNCTION public.credit_memo_reconcile() SET lock_timeout TO '240s';
