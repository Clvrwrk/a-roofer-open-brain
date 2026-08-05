#!/usr/bin/env python3
"""R3j check: 26 docs staged in verified bare _type shape with business rules satisfied."""
import json
import subprocess
import sys

MASTER_ENV = "/Users/chussey/.config/cleverwork/master.env"
PROJECT = "rnhmvcpsvtqjlffpsayu"
REPORT = "/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/jobtread/mirror/r3j-fix-documents-final/fix-report.md"

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

bad = q("with els as (select jsonb_array_elements(coalesce(payload->'lineItems','[]'::jsonb)) el "
        "from jt_mirror.pending_write where domain='documents' and status='staged') "
        "select count(*) n from els where el ? 'newCostItem' or el ? 'existingCostItem' or (el->>'_type') is distinct from 'costItem'")[0]["n"]
if int(bad) > 0:
    fails.append(f"{bad} lineItems elements not in bare _type=costItem shape")

nb = q("select count(*) n from jt_mirror.pending_write where domain='documents' and status='staged' "
       "and (payload->>'name') not in ('Proposal','Selections','Change Order')")[0]["n"]
if int(nb) > 0:
    fails.append(f"{nb} docs have names outside the customerOrder enum")

dd = q("select count(*) n from jt_mirror.pending_write where domain='documents' and status='staged' "
       "and ((payload ? 'dueDate')::int + (payload ? 'dueDays')::int) <> 1")[0]["n"]
if int(dd) > 0:
    fails.append(f"{dd} docs violate dueDate XOR dueDays")

loc = q("select count(*) n from jt_mirror.pending_write where domain='documents' and status='staged' "
        "and coalesce(payload->>'jobLocationName', payload->>'jobLocationAddress') is null")[0]["n"]
if int(loc) > 0:
    fails.append(f"{loc} docs missing jobLocationName/jobLocationAddress")

f = q("select count(*) n from jt_mirror.pending_write where status='failed'")[0]["n"]
if int(f) > 0:
    fails.append(f"{f} failed rows remain")

rep = open(REPORT).read().lower()
if "live verification" not in rep:
    fails.append("report missing Live Verification section")

if fails:
    print("FAIL — r3j:")
    for x in fails:
        print(f"  - {x}")
    sys.exit(1)
print("PASS — 26 docs staged: verified shape, enum names, XOR due rule, location present")
