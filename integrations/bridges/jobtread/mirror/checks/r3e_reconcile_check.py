#!/usr/bin/env python3
"""R3e check: existing-entity collisions crosswalked, no failed rows, all remaining staged refs resolvable."""
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
    ("zero failed rows remain",
     "select count(*)=0 ok, count(*)::text detail from jt_mirror.pending_write where status='failed'"),
    ("collision rows are skipped with crosswalk mappings (2 cost_types + 1 customer)",
     "select count(*)=3 ok, count(*)::text detail from jt_mirror.pending_write p where p.status='skipped' and p.error ilike '%exist%' and exists (select 1 from jt_mirror.crosswalk x where x.source_id = split_part(p.source_ref,':',2) or x.source_id = p.source_ref)"),
    ("every $ref in remaining staged rows resolves via crosswalk OR a staged row in an earlier band",
     "with refs as (select p.id, jsonb_path_query(p.payload, '$.**.\"$ref\"') #>> '{}' ref, (p.payload->>'__execution_order')::int ord from jt_mirror.pending_write p where p.status='staged') "
     "select count(*)=0 ok, count(*)::text detail from refs r where not exists (select 1 from jt_mirror.crosswalk x where x.source_id = split_part(r.ref,':',2) or (x.source_table||':'||x.source_id) = r.ref or x.source_id = r.ref) "
     "and not exists (select 1 from jt_mirror.pending_write q where q.status='staged' and q.source_ref = r.ref and (q.payload->>'__execution_order')::int < r.ord)"),
    ("staged remainder intact: locations=11, jobs=25, job_custom_values=25, documents=26, daily_logs=25",
     "select (select count(*) from jt_mirror.pending_write where domain='locations' and status='staged')=11 and (select count(*) from jt_mirror.pending_write where domain='jobs' and status='staged')=25 and (select count(*) from jt_mirror.pending_write where domain='job_custom_values' and status='staged')=25 and (select count(*) from jt_mirror.pending_write where domain='documents' and status='staged')=26 and (select count(*) from jt_mirror.pending_write where domain='daily_logs' and status='staged')=25 ok, 'see sql' detail"),
]
for desc, q in checks:
    rows = sql(q)
    if not rows or not isinstance(rows, list) or rows[0].get("ok") is not True:
        d = rows[0].get("detail") if rows and isinstance(rows, list) else str(rows)[:200]
        failures.append(f"{desc}: FAILED (detail={d})")

if failures:
    print("FAIL — R3e reconciliation:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print("PASS — collisions crosswalked, all staged refs resolvable, remainder intact")
