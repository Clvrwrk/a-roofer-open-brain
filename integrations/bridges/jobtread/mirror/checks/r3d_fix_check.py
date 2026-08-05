#!/usr/bin/env python3
"""R3d check: cost_types complete, every catalog item carries costCodeId, no notify=true, executed rows untouched."""
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
    ("4 cost_types staged, all with isTaxable AND isTimeTrackable booleans",
     "select count(*)=4 ok, count(*)::text detail from jt_mirror.pending_write where domain='cost_types' and status='staged' and jsonb_typeof(payload->'isTaxable')='boolean' and jsonb_typeof(payload->'isTimeTrackable')='boolean'"),
    ("123 catalog_items staged, zero missing costCodeId",
     "select count(*) filter (where payload->'costCodeId' is null)=0 and count(*)=123 ok, count(*) filter (where payload->'costCodeId' is null)::text||' missing of '||count(*)::text detail from jt_mirror.pending_write where domain='catalog_items' and status='staged'"),
    ("catalog costCodeId refs use source ids matching executed cost_codes source_refs",
     "select count(*)=0 ok, count(*)::text detail from jt_mirror.pending_write ci where ci.domain='catalog_items' and ci.status='staged' and ci.payload->'costCodeId'->>'$ref' is not null and not exists (select 1 from jt_mirror.pending_write cc where cc.domain='cost_codes' and cc.status='executed' and cc.source_ref = ci.payload->'costCodeId'->>'$ref')"),
    ("zero failed rows remain",
     "select count(*)=0 ok, count(*)::text detail from jt_mirror.pending_write where status='failed'"),
    ("no staged payload anywhere sets notify=true",
     "select count(*)=0 ok, count(*)::text detail from jt_mirror.pending_write where status='staged' and payload->>'notify'='true'"),
    ("executed rows untouched: units=10, cost_codes=13, custom_fields=5, customer_accounts>=1",
     "select (select count(*) from jt_mirror.pending_write where domain='units' and status='executed')=10 and (select count(*) from jt_mirror.pending_write where domain='cost_codes' and status='executed')=13 and (select count(*) from jt_mirror.pending_write where domain='custom_fields' and status='executed')=5 and (select count(*) from jt_mirror.pending_write where domain='customer_accounts' and status='executed')>=1 ok, 'see sql' detail"),
]
for desc, q in checks:
    rows = sql(q)
    if not rows or not isinstance(rows, list) or rows[0].get("ok") is not True:
        d = rows[0].get("detail") if rows and isinstance(rows, list) else str(rows)[:150]
        failures.append(f"{desc}: FAILED (detail={d})")

if failures:
    print("FAIL — R3d staging repair:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print("PASS — cost_types complete, catalog costCodeId refs valid, notify clean, executed rows untouched")
