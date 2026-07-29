#!/usr/bin/env python3
"""B3b check: suffixIfNecessary set, gap contacts staged, no failed rows remain."""
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

fails = []

n = q("select count(*) n from jt_mirror.pending_write where domain='customer_accounts' and status='staged' and (payload->>'suffixIfNecessary')::boolean is not true")[0]["n"]
if int(n) > 0:
    fails.append(f"{n} staged customer_accounts missing suffixIfNecessary=true")

f = q("select count(*) n from jt_mirror.pending_write where status='failed'")[0]["n"]
if int(f) > 0:
    fails.append(f"{f} failed rows remain")

gap = q("with refs as (select distinct p.payload->'accountId'->>'$ref' r from jt_mirror.pending_write p "
        "where p.domain='locations' and p.status='staged' and p.payload->'accountId'->>'$ref' is not null) "
        "select count(*) n from refs where not exists (select 1 from jt_mirror.crosswalk x where x.jt_type='account' and x.source_id=split_part(r,':',2)) "
        "and not exists (select 1 from jt_mirror.pending_write q2 where q2.domain='customer_accounts' and q2.status='staged' and q2.source_ref='acculynx_contact:'||split_part(r,':',2))")[0]["n"]
if int(gap) > 0:
    fails.append(f"{gap} location account refs still have no staged/crosswalked account")

nn = q("select count(*) n from jt_mirror.pending_write where domain='customer_accounts' and status='staged' and coalesce(trim(payload->>'name'),'')=''")[0]["n"]
if int(nn) > 0:
    fails.append(f"{nn} staged accounts with empty names")

if fails:
    print("FAIL — B3b:")
    for x in fails:
        print(f"  - {x}")
    sys.exit(1)
print("PASS — suffixIfNecessary set, gap contacts staged, zero failed rows, all location refs coverable")
