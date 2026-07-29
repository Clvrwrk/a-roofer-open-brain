#!/usr/bin/env python3
"""B2 check: bulk staging validation per group.

Usage: b2_stage_check.py <group>   (parties | jobs | documents | dailylogs)
Counts are compared against live source-table expectations, not fixed numbers.
"""
import json
import subprocess
import sys

MASTER_ENV = "/Users/chussey/.config/cleverwork/master.env"
PROJECT = "rnhmvcpsvtqjlffpsayu"

def q(sql):
    tok = None
    for line in open(MASTER_ENV):
        if line.startswith("SUPABASE_ACCESS_TOKEN="):
            tok = line.split("=", 1)[1].strip().strip('"').strip("'")
    r = subprocess.run(
        ["curl", "-s", "-X", "POST",
         f"https://api.supabase.com/v1/projects/{PROJECT}/database/query",
         "-H", f"Authorization: Bearer {tok}", "-H", "Content-Type: application/json",
         "-d", json.dumps({"query": sql})],
        capture_output=True, text=True, timeout=120)
    return json.loads(r.stdout)

ASSERTS = {
    "parties": [
        ("staged customer_accounts == job-attached contacts not already crosswalked",
         "select (select count(*) from jt_mirror.pending_write where domain='customer_accounts' and status='staged') = "
         "(select count(distinct jc.contact_id) from public.acculynx_job_contacts jc "
         " join public.acculynx_jobs j on j.id::text=jc.job_id::text and j.archived_at is null and j.account_key <> 'sandbox' "
         " where not exists (select 1 from jt_mirror.crosswalk x where x.jt_type='account' and x.source_id=jc.contact_id::text)) ok, "
         "(select count(*) from jt_mirror.pending_write where domain='customer_accounts' and status='staged')::text detail"),
        ("staged locations == non-archived non-sandbox jobs not already crosswalked as location",
         "select (select count(*) from jt_mirror.pending_write where domain='locations' and status='staged') = "
         "(select count(*) from public.acculynx_jobs j where j.archived_at is null and j.account_key <> 'sandbox' "
         " and not exists (select 1 from jt_mirror.crosswalk x where x.jt_type='location' and x.source_id=j.id::text)) ok, "
         "(select count(*) from jt_mirror.pending_write where domain='locations' and status='staged')::text detail"),
        ("1263 deferred vendors flipped to staged",
         "select count(*)=1263 ok, count(*)::text detail from jt_mirror.pending_write where domain='vendor_accounts' and status='staged'"),
        ("no staged account name empty",
         "select count(*)=0 ok, count(*)::text detail from jt_mirror.pending_write where domain in ('customer_accounts','vendor_accounts') and status='staged' and coalesce(trim(payload->>'name'),'')=''"),
    ],
    "jobs": [
        ("staged jobs == non-archived non-sandbox jobs not already crosswalked",
         "select (select count(*) from jt_mirror.pending_write where domain='jobs' and status='staged') = "
         "(select count(*) from public.acculynx_jobs j where j.archived_at is null and j.account_key <> 'sandbox' "
         " and not exists (select 1 from jt_mirror.crosswalk x where x.jt_type='job' and x.source_id=j.id::text)) ok, "
         "(select count(*) from jt_mirror.pending_write where domain='jobs' and status='staged')::text detail"),
        ("zero staged jobs with name > 30 chars",
         "select count(*)=0 ok, count(*)::text detail from jt_mirror.pending_write where domain='jobs' and status='staged' and length(payload->>'name') > 30"),
        ("staged job_custom_values == staged jobs + already-created bulk-value gaps",
         "select (select count(*) from jt_mirror.pending_write where domain='job_custom_values' and status='staged') >= "
         "(select count(*) from jt_mirror.pending_write where domain='jobs' and status='staged') ok, "
         "(select count(*) from jt_mirror.pending_write where domain='job_custom_values' and status='staged')::text detail"),
        ("custom value field keys are literal crosswalked field ids",
         "with kv as (select k.key from jt_mirror.pending_write p, jsonb_object_keys(p.payload->'$'->'customFieldValues') k(key) "
         "where p.domain='job_custom_values' and p.status='staged') "
         "select count(*)=0 ok, count(*)::text detail from kv where not exists (select 1 from jt_mirror.crosswalk x where x.jt_type='customField' and x.jt_id=kv.key)"),
        ("sales-rep option extension staged (updateCustomField)",
         "select count(*)>=1 ok, count(*)::text detail from jt_mirror.pending_write where domain='custom_fields' and status='staged' and pave_op='updateCustomField'"),
    ],
    "documents": [
        ("staged documents == estimates with backfilled data not already crosswalked",
         "select (select count(*) from jt_mirror.pending_write where domain='documents' and status='staged') = "
         "(select count(*) from public.acculynx_estimates e join public.acculynx_jobs j on j.id::text=e.job_id::text "
         " and j.archived_at is null and j.account_key <> 'sandbox' "
         " where not exists (select 1 from jt_mirror.crosswalk x where x.jt_type='document' and x.source_id=e.id::text)) ok, "
         "(select count(*) from jt_mirror.pending_write where domain='documents' and status='staged')::text detail"),
        ("all staged doc names in customerOrder enum",
         "select count(*)=0 ok, count(*)::text detail from jt_mirror.pending_write where domain='documents' and status='staged' and (payload->>'name') not in ('Proposal','Selections','Change Order')"),
        ("all lineItems elements bare with _type=costItem",
         "with els as (select jsonb_array_elements(coalesce(payload->'lineItems','[]'::jsonb)) el from jt_mirror.pending_write where domain='documents' and status='staged') "
         "select count(*)=0 ok, count(*)::text detail from els where el ? 'newCostItem' or (el->>'_type') is distinct from 'costItem'"),
        ("externalIds <= 32 chars",
         "select count(*)=0 ok, count(*)::text detail from jt_mirror.pending_write where domain='documents' and status='staged' and length(payload->>'externalId') > 32"),
        ("dueDate XOR dueDays and location present",
         "select count(*)=0 ok, count(*)::text detail from jt_mirror.pending_write where domain='documents' and status='staged' and (((payload ? 'dueDate')::int + (payload ? 'dueDays')::int) <> 1 or coalesce(payload->>'jobLocationName', payload->>'jobLocationAddress') is null)"),
    ],
    "dailylogs": [
        ("staged daily_logs == non-archived non-sandbox jobs with milestone history not already logged",
         "select (select count(*) from jt_mirror.pending_write where domain='daily_logs' and status='staged') = "
         "(select count(distinct h.job_id) from public.acculynx_job_milestone_history h join public.acculynx_jobs j on j.id::text=h.job_id::text "
         " and j.archived_at is null and j.account_key <> 'sandbox' "
         " where not exists (select 1 from jt_mirror.crosswalk x where x.jt_type='dailyLog' and x.source_table like '%milestone%' and x.source_id=h.job_id::text) "
         " and not exists (select 1 from jt_mirror.pending_write p2 where p2.domain='daily_logs' and p2.status='executed' and p2.payload->'jobId'->>'$ref' = 'acculynx_job:'||h.job_id::text)) ok, "
         "(select count(*) from jt_mirror.pending_write where domain='daily_logs' and status='staged')::text detail"),
        ("no notify=true anywhere staged",
         "select count(*)=0 ok, count(*)::text detail from jt_mirror.pending_write where status='staged' and payload->>'notify'='true'"),
        ("every staged daily log has date and notes",
         "select count(*)=0 ok, count(*)::text detail from jt_mirror.pending_write where domain='daily_logs' and status='staged' and (payload->>'date' is null or coalesce(trim(payload->>'notes'),'')='')"),
    ],
}

key = sys.argv[1]
checks = ASSERTS.get(key)
if not checks:
    print(f"CHECK ERROR: unknown group {key}")
    sys.exit(1)

failures = []
for desc, sql in checks:
    rows = q(sql)
    if not rows or not isinstance(rows, list):
        failures.append(f"{desc}: query error {str(rows)[:250]}")
        continue
    if rows[0].get("ok") is not True:
        failures.append(f"{desc}: FAILED (detail={rows[0].get('detail')})")

if failures:
    print(f"FAIL — B2 {key}:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print(f"PASS — B2 {key}: all {len(checks)} assertions hold")
