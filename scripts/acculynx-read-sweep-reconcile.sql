-- acculynx-read-sweep-reconcile.sql — Phase 1 (plan 01-03) read-sweep gate
--
-- Three committed assertions over the LATEST sandbox sweep batch. All three must return
-- ZERO for the phase to pass. Run via the Supabase MCP execute_sql or psql.
--
-- Secret-leak companion (run separately, expect no output):
--   grep -rIE 'ACCULYNX_[A-Z_]*KEY=[A-Za-z0-9]{12,}' schemas/ docs/ scripts/ \
--     skills/cleverwork-roofer/acculynx-api/reference/knowledge-folder.md

with latest as (
  select probe_batch_id
  from public.acculynx_api_probe
  order by probed_at desc
  limit 1
),
batch as (
  select p.* from public.acculynx_api_probe p, latest l
  where p.probe_batch_id = l.probe_batch_id
)
-- (1) RECONCILIATION: every one of the 86 checklist GETs must appear in the batch
--     under SOME verdict. Expect 0 rows.
select 'unreconciled_op' as assertion, c.operation_id as detail
from public.acculynx_get_checklist c
where not exists (select 1 from batch b where b.probe_name = c.operation_id)

union all
-- (2) SHAPE-COMPLETENESS: no HTTP 200 row may have a null result_summary. Expect 0 rows.
select 'status200_null_summary', b.probe_name
from batch b
where b.http_status = 200 and b.result_summary is null

union all
-- (3) SANDBOX-ONLY: no row in the batch may be tagged a non-sandbox account. Expect 0 rows.
select 'non_sandbox_row', coalesce(b.source_account_key, '(null)')
from batch b
where b.source_account_key is distinct from 'sandbox';
