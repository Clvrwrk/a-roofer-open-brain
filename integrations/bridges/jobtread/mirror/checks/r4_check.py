#!/usr/bin/env python3
"""R4 checks.

Usage: r4_check.py reconciliation | scorecard
"""
import json
import re
import subprocess
import sys

MASTER_ENV = "/Users/chussey/.config/cleverwork/master.env"
PROJECT = "rnhmvcpsvtqjlffpsayu"
MIRROR = "/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/jobtread/mirror"

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

mode = sys.argv[1]
failures = []

if mode == "reconciliation":
    views = q("select table_name from information_schema.views where table_schema='jt_mirror' and table_name like 'v_recon%'")
    names = {r["table_name"] for r in views}
    if len(names) < 4:
        failures.append(f"expected >=4 v_recon* views in jt_mirror, found {sorted(names)}")
    summary = q("select * from jt_mirror.v_recon_summary") if "v_recon_summary" in names else []
    if not summary:
        failures.append("jt_mirror.v_recon_summary missing or empty")
    else:
        blob = json.dumps(summary).lower()
        for d in ("job", "account", "location", "document", "daily"):
            if d not in blob:
                failures.append(f"v_recon_summary has no row mentioning '{d}'")
        jobs_rows = [r for r in summary if 'job' in json.dumps(r).lower() and 'daily' not in json.dumps(r).lower()]
        ok_match = False
        for r in jobs_rows:
            nums = [int(v) for v in r.values() if isinstance(v, (int, float)) and int(v) > 6000]
            if len(nums) >= 2 and max(nums) - min(nums) <= 100:
                ok_match = True
        if not ok_match:
            failures.append(f"jobs parity row missing or source/target counts diverge >100: {jobs_rows[:2]}")
elif mode == "scorecard":
    try:
        doc = open(f"{MIRROR}/r4-scorecard/agent-friendliness-scorecard.md").read()
    except FileNotFoundError:
        print("FAIL: scorecard deliverable missing")
        sys.exit(1)
    low = doc.lower()
    for section in ("executive", "schema", "write path", "error", "identity", "acculynx", "scorecard", "recommendation"):
        if section not in low:
            failures.append(f"scorecard missing content on '{section}'")
    cites = len(re.findall(r"(integrations/bridges/jobtread/mirror/[\w\-./]+|pave-schema\.json)", doc))
    if cites < 8:
        failures.append(f"only {cites} artifact citations (<8) — verdicts must cite the evidence files")
    for figure in ("34,433", "6,574", "187"):
        if figure.replace(",", "") not in doc.replace(",", ""):
            failures.append(f"key verified figure {figure} absent")
    for finding in ("suffixIfNecessary", "_type", "closed"):
        if finding.lower() not in low:
            failures.append(f"hard-won platform finding '{finding}' absent")
    # secret-leak guard
    for line in open(MASTER_ENV):
        m = re.match(r"^(JT_SUPABASE_MIRROR_GRANT_KEY|SUPABASE_ACCESS_TOKEN|ACCULYNX_API_KEY)=(.+)$", line.strip())
        if m and m.group(2).strip().strip('"').strip("'") in doc:
            failures.append(f"SECRET LEAK: {m.group(1)} value in scorecard")
else:
    print(f"CHECK ERROR: unknown mode {mode}")
    sys.exit(1)

if failures:
    print(f"FAIL — R4 {mode}:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print(f"PASS — R4 {mode}")
