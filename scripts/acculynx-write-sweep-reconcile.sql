-- acculynx-write-sweep-reconcile.sql — Phase 4 write-sweep gate
--
-- Four committed assertions over the LATEST sandbox write-sweep batch. All four must
-- return ZERO for the phase to pass. Run via the Supabase MCP execute_sql or psql.
--
-- Secret-leak companion (run separately, expect no output):
--   grep -rIE 'ACCULYNX_[A-Z_]*KEY=[A-Za-z0-9]{12,}' schemas/ docs/ scripts/ \
--     skills/cleverwork-roofer/acculynx-api/reference/write-capability.md

with latest as (
  select probe_batch_id
  from public.acculynx_write_probe
  order by probed_at desc
  limit 1
),
batch as (
  select p.* from public.acculynx_write_probe p, latest l
  where p.probe_batch_id = l.probe_batch_id
)
-- (1) RECONCILIATION: every one of the 38 checklist write endpoints must appear in the
--     batch under SOME verdict. Expect 0 rows.
select 'unreconciled_op' as assertion, c.operation_id as detail
from public.acculynx_write_checklist c
where not exists (select 1 from batch b where b.probe_name = c.operation_id)

union all
-- (2) SHAPE-COMPLETENESS: no 2xx row may have a null result_summary. Generalized from the
--     read-sweep's bare `= 200` check — writes succeed on 200/201/202/204, not just 200.
--     Expect 0 rows.
select 'status2xx_null_summary', b.probe_name
from batch b
where b.http_status between 200 and 299 and b.result_summary is null

union all
-- (3) SANDBOX-ONLY: no row in the batch may be tagged a non-sandbox account. Expect 0 rows.
select 'non_sandbox_row', coalesce(b.source_account_key, '(null)')
from batch b
where b.source_account_key is distinct from 'sandbox'

union all
-- (4) BLOCKED-DEPENDENCY EVIDENCE: any catalog row verdicted blocked-by-dependency must
--     carry evidence in notes/guardrail_notes, not a bare verdict (RESEARCH.md
--     Anti-Patterns: "faking a dependency chain to force a smoke-test pass"). Expect 0 rows.
select 'blocked_dep_missing_evidence', c.endpoint_pattern
from public.acculynx_write_catalog c
where c.verdict = 'blocked-by-dependency'
  and coalesce(c.notes, '') = ''
  and coalesce(c.guardrail_notes, '') = '';
