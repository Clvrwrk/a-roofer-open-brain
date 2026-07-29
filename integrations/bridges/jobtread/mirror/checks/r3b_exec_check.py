#!/usr/bin/env python3
"""R3b check: verify pilot execution against BOTH Supabase bookkeeping and live JobTread.

- no rows left 'staged'; 'skipped' only allowed for vendor_accounts (deferred-to-bulk)
- failure rate <= 5% and every failed row carries an error
- crosswalk holds >= 25 job mappings
- LIVE Pave read-back: sampled crosswalk ids must echo back from JobTread
- write_action_log rows >= executed rows
"""
import json
import subprocess
import sys

MASTER_ENV = "/Users/chussey/.config/cleverwork/master.env"
PROJECT = "rnhmvcpsvtqjlffpsayu"
ORG = "22PazeRM5FCH"

env = {}
for line in open(MASTER_ENV):
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")

def sql(q):
    r = subprocess.run(
        ["curl", "-s", "-X", "POST",
         f"https://api.supabase.com/v1/projects/{PROJECT}/database/query",
         "-H", f"Authorization: Bearer {env['SUPABASE_ACCESS_TOKEN']}",
         "-H", "Content-Type: application/json",
         "-d", json.dumps({"query": q})],
        capture_output=True, text=True, timeout=90)
    return json.loads(r.stdout)

def pave(query_obj):
    body = {"query": {"$": {"grantKey": env["JT_SUPABASE_MIRROR_GRANT_KEY"]}, **query_obj}}
    r = subprocess.run(
        ["curl", "-s", "-X", "POST", "https://api.jobtread.com/pave",
         "-H", "Content-Type: application/json", "-d", json.dumps(body)],
        capture_output=True, text=True, timeout=60)
    return json.loads(r.stdout)

failures = []

# 1. status accounting
rows = sql("select domain, status, count(*) n from jt_mirror.pending_write group by 1,2 order by 1,2")
staged_left = [r for r in rows if r["status"] == "staged"]
if staged_left:
    failures.append(f"rows still 'staged': {[(r['domain'], r['n']) for r in staged_left]}")
skip_ok = sql("select domain, count(*) n from jt_mirror.pending_write where status='skipped' and domain <> 'vendor_accounts' and coalesce(error,'') not ilike '%exist%' group by 1")
if skip_ok:
    failures.append(f"'skipped' rows that are neither deferred vendors nor already-exists reconciliations: {[(r['domain'], r['n']) for r in skip_ok]}")

exec_n = sum(int(r["n"]) for r in rows if r["status"] == "executed")
fail_n = sum(int(r["n"]) for r in rows if r["status"] == "failed")
if exec_n == 0:
    failures.append("zero executed rows")
elif fail_n / max(exec_n + fail_n, 1) > 0.05:
    failures.append(f"failure rate {fail_n}/{exec_n+fail_n} exceeds 5%: " + str([(r['domain'], r['n']) for r in rows if r['status']=='failed']))

noerr = sql("select count(*) n from jt_mirror.pending_write where status='failed' and coalesce(trim(error),'')=''")
if int(noerr[0]["n"]) > 0:
    failures.append(f"{noerr[0]['n']} failed rows have no error recorded")

# 2. crosswalk
xj = sql("select count(*) n from jt_mirror.crosswalk where jt_type='job'")
if int(xj[0]["n"]) < 25:
    failures.append(f"crosswalk job mappings {xj[0]['n']} < 25")

# 3. live JobTread read-back (sampled)
samples = sql("select jt_type, jt_id from jt_mirror.crosswalk where jt_type in ('job','account') and jt_id is not null order by random() limit 6")
if not samples:
    failures.append("no crosswalk rows to sample for read-back")
for s in samples:
    root = "job" if s["jt_type"] == "job" else "account"
    try:
        resp = pave({root: {"$": {"id": s["jt_id"]}, "id": {}, "name": {}}})
        node = resp.get(root) or {}
        if node.get("id") != s["jt_id"]:
            failures.append(f"live read-back MISS: {root} {s['jt_id']} -> {str(resp)[:150]}")
    except Exception as e:
        failures.append(f"read-back error for {root} {s['jt_id']}: {e}")

# 4. action log
log = sql("select count(*) n from jt_mirror.write_action_log")
if int(log[0]["n"]) < exec_n:
    failures.append(f"write_action_log rows {log[0]['n']} < executed {exec_n}")

if failures:
    print("FAIL — R3b execution:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)

print(f"PASS — {exec_n} writes executed, {fail_n} failed (<=5%), {xj[0]['n']} jobs in crosswalk, live read-back {len(samples)}/{len(samples)} ok")
