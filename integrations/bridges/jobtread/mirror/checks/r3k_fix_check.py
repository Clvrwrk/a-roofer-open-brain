#!/usr/bin/env python3
"""R3k check: no staged document carries an externalId over 32 chars; 26 staged, none failed."""
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
        capture_output=True, text=True, timeout=90)
    return json.loads(r.stdout)

fails = []
n = q("select count(*) n from jt_mirror.pending_write where domain='documents' and status='staged'")[0]["n"]
if int(n) != 26:
    fails.append(f"documents staged {n} != 26")
long_ids = q("select count(*) n from jt_mirror.pending_write where domain='documents' and status='staged' and length(payload->>'externalId') > 32")[0]["n"]
if int(long_ids) > 0:
    fails.append(f"{long_ids} staged docs still have externalId > 32 chars")
f = q("select count(*) n from jt_mirror.pending_write where status='failed'")[0]["n"]
if int(f) > 0:
    fails.append(f"{f} failed rows remain")
# uniqueness preserved after hyphen strip
dup = q("select count(*) n from (select payload->>'externalId' e, count(*) c from jt_mirror.pending_write where domain='documents' and status='staged' and payload->>'externalId' is not null group by 1 having count(*)>1) x")[0]["n"]
if int(dup) > 0:
    fails.append(f"{dup} duplicate externalId values after transformation")

if fails:
    print("FAIL — r3k:")
    for x in fails:
        print(f"  - {x}")
    sys.exit(1)
print("PASS — externalIds fit 32 chars, unique, 26 staged, none failed")
