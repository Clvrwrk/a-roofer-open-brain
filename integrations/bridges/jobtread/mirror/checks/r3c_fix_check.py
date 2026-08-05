#!/usr/bin/env python3
"""R3c check: staged payload repairs are in place and nothing executed was disturbed."""
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
    ("no 'dropdown' type remains in staged custom_fields",
     "select count(*)=0 ok, count(*)::text detail from jt_mirror.pending_write where domain='custom_fields' and status='staged' and payload->>'type'='dropdown'"),
    ("3 repaired custom_fields rows staged with type='option'",
     "select count(*)=3 ok, count(*)::text detail from jt_mirror.pending_write where domain='custom_fields' and status='staged' and payload->>'type'='option'"),
    ("all staged cost_types carry boolean isTaxable",
     "select count(*)=0 ok, count(*)::text detail from jt_mirror.pending_write where domain='cost_types' and status='staged' and (payload->'isTaxable') is null"),
    ("4 cost_types rows back to staged",
     "select count(*)=4 ok, count(*)::text detail from jt_mirror.pending_write where domain='cost_types' and status='staged'"),
    ("zero failed rows remain anywhere",
     "select count(*)=0 ok, count(*)::text detail from jt_mirror.pending_write where status='failed'"),
    ("executed rows untouched: units=10, cost_codes=13, custom_fields=2, customer_accounts>=1",
     "select (select count(*) from jt_mirror.pending_write where domain='units' and status='executed')=10 and (select count(*) from jt_mirror.pending_write where domain='cost_codes' and status='executed')=13 and (select count(*) from jt_mirror.pending_write where domain='custom_fields' and status='executed')=2 and (select count(*) from jt_mirror.pending_write where domain='customer_accounts' and status='executed')>=1 ok, 'see sql' detail"),
    ("catalog_items cascade row restored to staged (123 staged)",
     "select count(*)=123 ok, count(*)::text detail from jt_mirror.pending_write where domain='catalog_items' and status='staged'"),
]

for desc, q in checks:
    rows = sql(q)
    if not rows or rows[0].get("ok") is not True:
        failures.append(f"{desc}: FAILED (detail={rows[0].get('detail') if rows else 'no rows'})")

if failures:
    print("FAIL — R3c staging repair:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print("PASS — staged payloads repaired; executed rows untouched; no failed rows remain")
