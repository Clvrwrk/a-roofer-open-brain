#!/usr/bin/env python3
"""R3f check: job name truncated, all 25 job_custom_values rebuilt to canonical updateJob shape with literal field ids."""
import json
import subprocess
import sys

MASTER_ENV = "/Users/chussey/.config/cleverwork/master.env"
PROJECT = "rnhmvcpsvtqjlffpsayu"

def sql(q):
    tok = None
    for line in open(MASTER_ENV):
        if line.startswith("SUPABASE_ACCESS_TOKEN="):
            tok = line.split("=", 1)[1].strip().strip('"').strip("'")
    r = subprocess.run(
        ["curl", "-s", "-X", "POST",
         f"https://api.supabase.com/v1/projects/{PROJECT}/database/query",
         "-H", f"Authorization: Bearer {tok}", "-H", "Content-Type: application/json",
         "-d", json.dumps({"query": q})],
        capture_output=True, text=True, timeout=90)
    return json.loads(r.stdout)

failures = []
checks = [
    ("1 job staged with name <= 30 chars",
     "select count(*)=1 ok, count(*)::text detail from jt_mirror.pending_write where domain='jobs' and status='staged' and length(payload->>'name') <= 30"),
    ("zero jobs staged with name > 30 chars",
     "select count(*)=0 ok, count(*)::text detail from jt_mirror.pending_write where domain='jobs' and status='staged' and length(payload->>'name') > 30"),
    ("25 job_custom_values staged in canonical shape: input under '$' with id and customFieldValues object",
     "select count(*)=25 ok, count(*)::text detail from jt_mirror.pending_write where domain='job_custom_values' and status='staged' and payload->'$' is not null and (payload->'$'->'id') is not null and jsonb_typeof(payload->'$'->'customFieldValues')='object'"),
    ("customFieldValues keys are literal JT field ids from crosswalk (no $ref keys, no unresolved names)",
     "with kv as (select p.id pid, k.key from jt_mirror.pending_write p, jsonb_object_keys(p.payload->'$'->'customFieldValues') k(key) where p.domain='job_custom_values' and p.status='staged') "
     "select count(*)=0 ok, count(*)::text detail from kv where key like '%$ref%' or key like 'jt_stage%' or not exists (select 1 from jt_mirror.crosswalk x where x.jt_type='customField' and x.jt_id=kv.key)"),
    ("zero failed rows remain",
     "select count(*)=0 ok, count(*)::text detail from jt_mirror.pending_write where status='failed'"),
    ("executed rows untouched: jobs=24, locations=25, catalog_items=123",
     "select (select count(*) from jt_mirror.pending_write where domain='jobs' and status='executed')=24 and (select count(*) from jt_mirror.pending_write where domain='locations' and status='executed')=25 and (select count(*) from jt_mirror.pending_write where domain='catalog_items' and status='executed')=123 ok, 'see sql' detail"),
]
for desc, q in checks:
    rows = sql(q)
    if not rows or not isinstance(rows, list) or rows[0].get("ok") is not True:
        d = rows[0].get("detail") if rows and isinstance(rows, list) else str(rows)[:200]
        failures.append(f"{desc}: FAILED (detail={d})")

if failures:
    print("FAIL — R3f staging repair:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print("PASS — job name fixed, 25 canonical updateJob payloads with literal field ids, no failed rows")
