#!/usr/bin/env python3
"""R1 check: validate a domain mapping.md — sections present, cited Pave ops
exist in the schema surface, and cited source tables exist LIVE in Supabase
(or are explicitly declared MISSING IN MIRROR with a backfill plan).

Usage: r1_mapping_check.py <task_key>
"""
import json
import os
import re
import subprocess
import sys

MIRROR = "/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/jobtread/mirror"
SURFACE = "/Users/chussey/Library/CloudStorage/Dropbox-AIA4/Cleverwork Main/GROK/Tools/catalog/jobtread/api/schema-surface.json"
MASTER_ENV = "/Users/chussey/.config/cleverwork/master.env"
PROJECT = "rnhmvcpsvtqjlffpsayu"

task_key = sys.argv[1]
path = f"{MIRROR}/{task_key}/mapping.md"
failures = []

try:
    doc = open(path).read()
except FileNotFoundError:
    print(f"FAIL: missing deliverable {path}")
    sys.exit(1)

low = doc.lower()

# --- required sections (case-insensitive, flexible) ---
for section in ("source tables", "target pave ops", "field mapping", "gaps", "loader plan", "evidence"):
    if not re.search(r"^#+.*" + re.escape(section), low, re.M):
        failures.append(f"missing section heading containing '{section}'")

# --- secret-leak guard ---
for line in open(MASTER_ENV):
    m = re.match(r"^(JT_SUPABASE_MIRROR_GRANT_KEY|SUPABASE_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY|ACCULYNX_API_KEY)=(.+)$", line.strip())
    if m:
        val = m.group(2).strip().strip('"').strip("'")
        if len(val) > 8 and val in doc:
            failures.append(f"SECRET LEAK: value of {m.group(1)} appears in mapping.md")

# --- cited Pave mutation ops must exist in the schema surface ---
surface = json.load(open(SURFACE))
known = set(surface["create_ops"]) | set(surface["update_ops"]) | set(surface["delete_ops"])
cited_ops = set(re.findall(r"\b((?:create|update|delete)[A-Z]\w+)\b", doc))
fake = sorted(op for op in cited_ops if op not in known)
if fake:
    failures.append(f"cited Pave ops NOT in schema surface (invented?): {fake}")
if not cited_ops and "MISSING" not in doc:
    failures.append("no Pave mutation ops cited at all")

# --- cited source tables must exist live, or be declared missing ---
sec = re.split(r"^#+.*source tables.*$", doc, flags=re.M | re.I)
tables_cited = []
declared_missing = "missing in mirror" in low
if len(sec) > 1:
    body = re.split(r"^#+ ", sec[1], maxsplit=1, flags=re.M)[0]
    tables_cited = sorted(set(re.findall(r"\b((?:acculynx|qbo|jt)_[a-z0-9_]+)\b", body)))
if not tables_cited and not declared_missing:
    failures.append("Source Tables section cites no concrete tables and does not declare 'MISSING IN MIRROR'")

if tables_cited:
    env = {}
    for line in open(MASTER_ENV):
        if line.startswith("SUPABASE_ACCESS_TOKEN="):
            env["tok"] = line.split("=", 1)[1].strip().strip('"').strip("'")
    in_list = ",".join("'" + t + "'" for t in tables_cited)
    q = ("select table_name t from information_schema.tables where table_name in (" + in_list + ") "
         "union select schema_name t from information_schema.schemata where schema_name in (" + in_list + ")")
    r = subprocess.run(
        ["curl", "-s", "-X", "POST",
         f"https://api.supabase.com/v1/projects/{PROJECT}/database/query",
         "-H", f"Authorization: Bearer {env.get('tok','')}",
         "-H", "Content-Type: application/json",
         "-d", json.dumps({"query": q})],
        capture_output=True, text=True, timeout=60)
    try:
        rows = json.loads(r.stdout)
        live = {x["t"] for x in rows}
    except Exception:
        live = set()
        failures.append(f"could not verify tables live (API response: {r.stdout[:200]})")
    ghost = sorted(set(tables_cited) - live)
    if ghost and live is not None:
        failures.append(f"cited source tables NOT found live in Supabase: {ghost}")

# --- evidence must include live row counts ---
if not re.search(r"(rows?\s*[=:]\s*\d+|\d+\s+rows)", low):
    failures.append("Evidence section shows no live row counts (pattern 'rows = N')")

if failures:
    print(f"FAIL — {task_key} mapping.md:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)

print(f"PASS — {task_key}: sections ok, {len(cited_ops)} Pave ops valid, "
      f"{len(tables_cited)} source tables verified live{' (+declared gaps)' if declared_missing else ''}")
