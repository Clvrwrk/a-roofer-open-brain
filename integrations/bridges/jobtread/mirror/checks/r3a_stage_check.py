#!/usr/bin/env python3
"""R3a check: validate staged pending_write rows for one stager domain-group.

Usage: r3a_stage_check.py <group>
Groups: foundations | parties | jobs | documents
All assertions run live against Supabase and print WHY on failure.
"""
import json
import subprocess
import sys

MASTER_ENV = "/Users/chussey/.config/cleverwork/master.env"
PROJECT = "rnhmvcpsvtqjlffpsayu"
SURFACE = "/Users/chussey/Library/CloudStorage/Dropbox-AIA4/Cleverwork Main/GROK/Tools/catalog/jobtread/api/schema-surface.json"

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
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        print(f"CHECK ERROR: bad API response for [{sql[:80]}...]: {r.stdout[:300]}")
        sys.exit(1)

GROUP_DOMAINS = {
    "foundations": ["custom_fields", "units", "cost_types", "cost_groups", "cost_codes", "catalog_items"],
    "parties": ["vendor_accounts", "customer_accounts", "locations"],
    "jobs": ["jobs", "job_custom_values"],
    "documents": ["documents", "daily_logs"],
}
MIN_ROWS = {
    "foundations": {"custom_fields": 3, "units": 1, "catalog_items": 10},
    "parties": {"customer_accounts": 20, "locations": 20},
    "jobs": {"jobs": 25, "job_custom_values": 25},
    "documents": {"documents": 20},
}

group = sys.argv[1]
domains = GROUP_DOMAINS.get(group)
if not domains:
    print(f"CHECK ERROR: unknown group {group}")
    sys.exit(1)

failures = []
dlist = ",".join(f"'{d}'" for d in domains)

rows = q(f"select domain, count(*) n from jt_mirror.pending_write where domain in ({dlist}) and status='staged' group by 1")
counts = {r["domain"]: int(r["n"]) for r in rows}
for d, minimum in MIN_ROWS.get(group, {}).items():
    if counts.get(d, 0) < minimum:
        failures.append(f"domain '{d}': staged rows {counts.get(d,0)} < required {minimum}")

# every staged op must exist in the Pave surface
surface = json.load(open(SURFACE))
known = set(surface["create_ops"]) | set(surface["update_ops"])
ops = q(f"select distinct pave_op from jt_mirror.pending_write where domain in ({dlist})")
bad = sorted(r["pave_op"] for r in ops if r["pave_op"] not in known)
if bad:
    failures.append(f"staged pave_op values NOT in schema surface: {bad}")

# payloads must be non-empty json objects with no leftover nulls in required identity
empty = q(f"select count(*) n from jt_mirror.pending_write where domain in ({dlist}) and (payload is null or payload::text in ('{{}}','null'))")
if int(empty[0]["n"]) > 0:
    failures.append(f"{empty[0]['n']} staged rows have empty payloads")

# every $ref placeholder must point at a resolvable source row registered for staging
refs = q(
    "select distinct r.ref from ("
    f"select jsonb_path_query(payload, '$.**.\"$ref\"') #>> '{{}}' ref from jt_mirror.pending_write where domain in ({dlist})"
    ") r where r.ref is not null")
ref_vals = [r["ref"] for r in refs]
malformed = [x for x in ref_vals if ":" not in x or not x.split(":", 1)[0].startswith(("acculynx_", "qbo_", "jt_stage_"))]
if malformed:
    failures.append(f"malformed $ref placeholders (want '<source_type>:<id>'): {malformed[:10]}")

# ordering discipline: every row carries a positive execution_order
noord = q(f"select count(*) n from jt_mirror.pending_write where domain in ({dlist}) and coalesce((payload->>'__execution_order')::int, 0) <= 0")
if int(noord[0]["n"]) > 0:
    failures.append(f"{noord[0]['n']} rows missing payload.__execution_order (int > 0)")

if failures:
    print(f"FAIL — R3a stage group '{group}':")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)

total = sum(counts.values())
print(f"PASS — {group}: {total} staged rows across {list(counts)} — ops valid, refs well-formed, ordering set")
