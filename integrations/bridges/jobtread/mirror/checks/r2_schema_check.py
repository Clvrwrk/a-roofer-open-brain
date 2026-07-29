#!/usr/bin/env python3
"""R2 check: verify the jt_mirror + acculynx_backfill schemas exist LIVE with
the required core tables, that the pending-write pattern is present, and that
no pre-existing public tables were dropped.
"""
import json
import re
import subprocess
import sys

MIRROR = "/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/jobtread/mirror"
MASTER_ENV = "/Users/chussey/.config/cleverwork/master.env"
PROJECT = "rnhmvcpsvtqjlffpsayu"
SCHEMA_SQL = f"{MIRROR}/r2-schema/schema.sql"

REQUIRED = {
    "jt_mirror": ["crosswalk", "pending_write", "write_action_log",
                  "accounts", "locations", "jobs", "documents"],
    "acculynx_backfill": ["estimate_sections", "estimate_items", "job_representatives",
                          "vendors", "contact_types", "contact_emails", "contact_phones"],
}
PENDING_WRITE_COLS = {"pave_op", "payload", "status"}

failures = []

def q(sql):
    tok = None
    for line in open(MASTER_ENV):
        if line.startswith("SUPABASE_ACCESS_TOKEN="):
            tok = line.split("=", 1)[1].strip().strip('"').strip("'")
    r = subprocess.run(
        ["curl", "-s", "-X", "POST",
         f"https://api.supabase.com/v1/projects/{PROJECT}/database/query",
         "-H", f"Authorization: Bearer {tok}",
         "-H", "Content-Type: application/json",
         "-d", json.dumps({"query": sql})],
        capture_output=True, text=True, timeout=60)
    return json.loads(r.stdout)

try:
    sql_text = open(SCHEMA_SQL).read()
except FileNotFoundError:
    print(f"FAIL: missing deliverable {SCHEMA_SQL}")
    sys.exit(1)

if re.search(r"\bdrop\s+(table|schema)\s+(?!if\s+exists\s+(jt_mirror|acculynx_backfill))", sql_text, re.I):
    failures.append("schema.sql contains DROP statements targeting objects outside jt_mirror/acculynx_backfill")

live = q("select table_schema, table_name from information_schema.tables "
         "where table_schema in ('jt_mirror','acculynx_backfill')")
have = {(r["table_schema"], r["table_name"]) for r in live}
for schema, tables in REQUIRED.items():
    for t in tables:
        if (schema, t) not in have:
            failures.append(f"required table {schema}.{t} NOT live")

cols = q("select column_name from information_schema.columns "
         "where table_schema='jt_mirror' and table_name='pending_write'")
colset = {r["column_name"] for r in cols}
missing = PENDING_WRITE_COLS - colset
if missing:
    failures.append(f"jt_mirror.pending_write missing columns {sorted(missing)}; has {sorted(colset)}")

# sanity: acculynx source tables untouched
count = q("select count(*) n from information_schema.tables where table_schema='public' and table_name like 'acculynx%'")
if int(count[0]["n"]) < 30:
    failures.append(f"public acculynx_* table count dropped to {count[0]['n']} — pre-existing objects may have been damaged")

if failures:
    print("FAIL — R2 schema build:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)

print(f"PASS — {len(have)} tables live across jt_mirror + acculynx_backfill; pending_write pattern ok; source tables intact")
