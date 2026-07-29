#!/usr/bin/env python3
"""R3g check: all 26 documents staged with tagged-union lineItems (newCostItem wrapped, literal cost ids)."""
import json
import subprocess
import sys

MASTER_ENV = "/Users/chussey/.config/cleverwork/master.env"
PROJECT = "rnhmvcpsvtqjlffpsayu"
TAGS = ("newCostItem", "existingCostItem", "newCostGroup", "existingCostGroup")

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

rows = sql("select count(*) n from jt_mirror.pending_write where domain='documents' and status='staged'")
if int(rows[0]["n"]) != 26:
    failures.append(f"documents staged {rows[0]['n']} != 26")

bad = sql(
    "with els as (select p.id pid, jsonb_array_elements(coalesce(p.payload->'lineItems','[]'::jsonb)) el "
    "from jt_mirror.pending_write p where p.domain='documents' and p.status='staged') "
    "select count(*) n from els where not (" +
    " or ".join(f"el ? '{t}'" for t in TAGS) + ")")
if int(bad[0]["n"]) > 0:
    failures.append(f"{bad[0]['n']} lineItems elements are not tagged-union wrapped")

noids = sql(
    "with els as (select jsonb_array_elements(coalesce(p.payload->'lineItems','[]'::jsonb)) el "
    "from jt_mirror.pending_write p where p.domain='documents' and p.status='staged') "
    "select count(*) n from els where el ? 'newCostItem' and ((el->'newCostItem'->>'costCodeId') is null or (el->'newCostItem'->>'costTypeId') is null)")
if int(noids[0]["n"]) > 0:
    failures.append(f"{noids[0]['n']} newCostItem elements missing literal costCodeId/costTypeId")

fake = sql(
    "with els as (select jsonb_array_elements(coalesce(p.payload->'lineItems','[]'::jsonb)) el "
    "from jt_mirror.pending_write p where p.domain='documents' and p.status='staged') "
    "select count(*) n from els where el ? 'newCostItem' and not exists "
    "(select 1 from jt_mirror.crosswalk x where x.jt_type='costCode' and x.jt_id = el->'newCostItem'->>'costCodeId')")
if int(fake[0]["n"]) > 0:
    failures.append(f"{fake[0]['n']} newCostItem costCodeId values not found in crosswalk (invented ids?)")

f = sql("select count(*) n from jt_mirror.pending_write where status='failed'")
if int(f[0]["n"]) > 0:
    failures.append(f"{f[0]['n']} rows still failed")

ex = sql("select count(*) n from jt_mirror.pending_write where domain='job_custom_values' and status='executed'")
if int(ex[0]["n"]) != 25:
    failures.append(f"executed job_custom_values disturbed: {ex[0]['n']} != 25")

if failures:
    print("FAIL — R3g staging repair:")
    for x in failures:
        print(f"  - {x}")
    sys.exit(1)
print("PASS — 26 documents staged with tagged-union lineItems and crosswalk-verified cost ids")
