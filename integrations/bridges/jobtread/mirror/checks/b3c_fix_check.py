#!/usr/bin/env python3
"""B3c check: address-dupe locations crosswalked, job numbers de-collided, no failed rows, staged jobs resolvable."""
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

f = q("select count(*) n from jt_mirror.pending_write where status='failed'")[0]["n"]
if int(f) > 0:
    fails.append(f"{f} failed rows remain")

# every location row that hit address-exists must now be skipped WITH a crosswalk mapping for its job's location
orphans = q("select count(*) n from jt_mirror.pending_write p where p.domain='locations' and p.status='skipped' "
            "and p.error ilike '%address%' and not exists (select 1 from jt_mirror.crosswalk x where x.jt_type='location' "
            "and x.source_id = split_part(p.source_ref,':',2))")[0]["n"]
if int(orphans) > 0:
    fails.append(f"{orphans} address-dupe locations skipped without a crosswalk mapping")

# job-number collisions: staged jobs must have unique numbers among themselves AND not collide with executed ones
dups = q("with nums as (select payload->>'number' num from jt_mirror.pending_write where domain='jobs' and status='staged' "
         "union all select payload->>'number' from jt_mirror.pending_write where domain='jobs' and status='executed') "
         "select count(*) n from (select num, count(*) c from nums where num is not null group by 1 having count(*)>1) d")[0]["n"]
if int(dups) > 0:
    fails.append(f"{dups} job numbers still collide across staged+executed")

# every staged job's locationId ref must resolve via crosswalk or a staged earlier-band location
unres = q("select count(*) n from jt_mirror.pending_write p where p.domain='jobs' and p.status='staged' "
          "and p.payload->'locationId'->>'$ref' is not null "
          "and not exists (select 1 from jt_mirror.crosswalk x where x.jt_type='location' and x.source_id=split_part(p.payload->'locationId'->>'$ref',':',2)) "
          "and not exists (select 1 from jt_mirror.pending_write l where l.domain='locations' and l.status='staged' and l.source_ref=p.payload->'locationId'->>'$ref')")[0]["n"]
if int(unres) > 0:
    fails.append(f"{unres} staged jobs have unresolvable location refs")

if fails:
    print("FAIL — B3c:")
    for x in fails:
        print(f"  - {x}")
    sys.exit(1)
print("PASS — locations crosswalked, job numbers unique, refs resolvable, zero failed rows")
