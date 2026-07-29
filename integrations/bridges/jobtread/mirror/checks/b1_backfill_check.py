#!/usr/bin/env python3
"""B1 check: bulk backfill coverage for representatives and contact enrichment.

Usage: b1_backfill_check.py <task_key>   (reps-all | contacts-all)
Thresholds are floors with honest-anomaly headroom; each failure prints WHY.
"""
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

ASSERTS = {
    "reps-all": [
        ("representatives cover >= 3000 distinct non-archived jobs",
         "select count(distinct job_id) >= 3000 ok, count(distinct job_id)::text detail from acculynx_backfill.job_representatives"),
        ("every rep row has a user name or user id",
         "select count(*)=0 ok, count(*)::text detail from acculynx_backfill.job_representatives where coalesce(user_display_name, acculynx_id, '') = ''"),
        ("rep rows carry provenance",
         "select count(*)=0 ok, count(*)::text detail from acculynx_backfill.job_representatives where source_endpoint is null"),
        ("rep job_ids exist in acculynx_jobs",
         "select count(*)=0 ok, count(*)::text detail from acculynx_backfill.job_representatives r where not exists (select 1 from public.acculynx_jobs j where j.id::text = r.job_id::text)"),
    ],
    "contacts-all": [
        ("contact emails >= 2000",
         "select count(*) >= 2000 ok, count(*)::text detail from acculynx_backfill.contact_emails"),
        ("contact phones >= 3000",
         "select count(*) >= 3000 ok, count(*)::text detail from acculynx_backfill.contact_phones"),
        ("email rows are well-formed",
         "select count(*)=0 ok, count(*)::text detail from acculynx_backfill.contact_emails where email_address is not null and email_address not like '%@%'"),
        ("enrichment covers >= 60% of job-attached contacts that have any email/phone child refs",
         "with attached as (select distinct jc.contact_id from public.acculynx_job_contacts jc), "
         "enriched as (select distinct contact_id from acculynx_backfill.contact_emails union select distinct contact_id from acculynx_backfill.contact_phones) "
         "select (select count(*) from attached a where exists (select 1 from enriched e where e.contact_id::text=a.contact_id::text))::float / greatest((select count(*) from attached),1) >= 0.60 ok, "
         "(select count(*) from attached a where exists (select 1 from enriched e where e.contact_id::text=a.contact_id::text))::text || '/' || (select count(*) from attached)::text detail"),
    ],
}

key = sys.argv[1]
checks = ASSERTS.get(key)
if not checks:
    print(f"CHECK ERROR: unknown task key {key}")
    sys.exit(1)

failures = []
for desc, sql in checks:
    rows = q(sql)
    if not rows or not isinstance(rows, list):
        failures.append(f"{desc}: query error {str(rows)[:200]}")
        continue
    if rows[0].get("ok") is not True:
        failures.append(f"{desc}: FAILED (detail={rows[0].get('detail')})")

if failures:
    print(f"FAIL — {key}:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print(f"PASS — {key}: all {len(checks)} coverage assertions hold")
