#!/usr/bin/env python3
"""R2.5 checks: per-task executed SQL assertions against Supabase.

Usage: r25_backfill_check.py <task_key>
Each assertion prints WHY it fails.
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
         "-H", f"Authorization: Bearer {tok}",
         "-H", "Content-Type: application/json",
         "-d", json.dumps({"query": sql})],
        capture_output=True, text=True, timeout=90)
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        print(f"CHECK ERROR: bad API response for [{sql[:80]}...]: {r.stdout[:300]}")
        sys.exit(1)

# assertion sets: (description, sql returning single row with column 'ok' boolean and 'detail')
ASSERTS = {
    "pilot-selection": [
        ("exactly 25 pilot jobs",
         "select count(*)=25 ok, count(*)::text detail from jt_mirror.pilot_jobs"),
        ("spans >=3 branches",
         "select count(distinct branch_key)>=3 ok, count(distinct branch_key)::text detail from jt_mirror.pilot_jobs"),
        ("spans >=3 milestones",
         "select count(distinct milestone)>=3 ok, count(distinct milestone)::text detail from jt_mirror.pilot_jobs"),
        (">=10 pilot jobs have estimates",
         "select count(*)>=10 ok, count(*)::text detail from jt_mirror.pilot_jobs p where exists (select 1 from public.acculynx_estimates e where e.job_id::text = p.acculynx_job_id::text)"),
        ("every pilot job exists in acculynx_jobs",
         "select count(*)=0 ok, count(*)::text detail from jt_mirror.pilot_jobs p where not exists (select 1 from public.acculynx_jobs j where j.id::text = p.acculynx_job_id::text)"),
    ],
    "estimate-items": [
        ("estimate_sections populated",
         "select count(*)>0 ok, count(*)::text detail from acculynx_backfill.estimate_sections"),
        ("estimate_items populated",
         "select count(*)>0 ok, count(*)::text detail from acculynx_backfill.estimate_items"),
        (">=80% of items carry a price",
         "select (count(*) filter (where price is not null))::float/greatest(count(*),1) >= 0.8 ok, (count(*) filter (where price is not null))::text||'/'||count(*)::text detail from acculynx_backfill.estimate_items"),
        ("items link to real sections",
         "select count(*)=0 ok, count(*)::text detail from acculynx_backfill.estimate_items i where i.section_id is not null and not exists (select 1 from acculynx_backfill.estimate_sections s where s.acculynx_id::text=i.section_id::text)"),
    ],
    "job-enrichment": [
        ("representatives for >=20 pilot jobs",
         "select count(distinct job_id)>=20 ok, count(distinct job_id)::text detail from acculynx_backfill.job_representatives r where r.job_id::text in (select acculynx_job_id::text from jt_mirror.pilot_jobs)"),
        ("contact emails backfilled beyond the old 1-row state",
         "select count(*)>=20 ok, count(*)::text detail from acculynx_backfill.contact_emails"),
        ("contact phones backfilled",
         "select count(*)>=25 ok, count(*)::text detail from acculynx_backfill.contact_phones"),
        ("worksheet lines for >=15 pilot jobs (some jobs legitimately lack worksheets)",
         "select count(distinct job_id)>=15 ok, count(distinct job_id)::text detail from acculynx_backfill.worksheet_lines w where w.job_id::text in (select acculynx_job_id::text from jt_mirror.pilot_jobs)"),
    ],
    "vendors-types": [
        ("contact_types populated",
         "select count(*)>0 ok, count(*)::text detail from acculynx_backfill.contact_types"),
        ("vendors populated",
         "select count(*)>0 ok, count(*)::text detail from acculynx_backfill.vendors"),
        ("vendors carry a name",
         "select count(*)=0 ok, count(*)::text detail from acculynx_backfill.vendors where coalesce(trim(company_name), trim(first_name||' '||last_name), '')=''"),
    ],
    "milestone-settings": [
        ("milestone settings populated",
         "select count(*)>0 ok, count(*)::text detail from acculynx_backfill.milestone_settings"),
        ("live job milestones all present in settings vocabulary",
         "select count(*)=0 ok, string_agg(distinct m,',') detail from (select j.current_milestone m from public.acculynx_jobs j where j.current_milestone is not null and not exists (select 1 from acculynx_backfill.milestone_settings s where s.name=j.current_milestone)) x"),
    ],
    "companycam-projects": [
        ("companycam projects table populated",
         "select count(*)>0 ok, count(*)::text detail from acculynx_backfill.companycam_projects"),
        (">=10 pilot jobs matched to a companycam project",
         "select count(*)>=10 ok, count(*)::text detail from jt_mirror.pilot_jobs p where exists (select 1 from acculynx_backfill.companycam_projects c where c.matched_acculynx_job_id::text = p.acculynx_job_id::text)"),
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
        failures.append(f"{desc}: query returned no rows / error: {str(rows)[:200]}")
        continue
    ok = rows[0].get("ok")
    detail = rows[0].get("detail")
    if ok is not True:
        failures.append(f"{desc}: FAILED (detail={detail})")

if failures:
    print(f"FAIL — {key}:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print(f"PASS — {key}: all {len(checks)} live assertions hold")
