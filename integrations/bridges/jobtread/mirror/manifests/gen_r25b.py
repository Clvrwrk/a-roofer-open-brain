#!/usr/bin/env python3
"""Generate R2.5b backfill-swarm manifest (5 tasks, AccuLynx/CompanyCam reads -> Supabase inserts)."""
import json

MIRROR = "/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/jobtread/mirror"
BRIDGE = "/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/acculynx"

COMMON = (
    "You are a data-backfill worker for the jt-acculynx-mirror project. "
    "BOUNDARY: you may make READ-ONLY (GET) calls to the external API named in your brief, and INSERT/UPSERT rows ONLY into the acculynx_backfill schema tables named in your brief in Supabase project rnhmvcpsvtqjlffpsayu. "
    "You must NEVER call the JobTread API, never POST/PUT/PATCH/DELETE to AccuLynx or CompanyCam, never modify tables outside acculynx_backfill, and never write any file except your single deliverable. "
    "NEVER copy credential values into files or logs — env var names only. "
    "THROTTLE: hard-limit yourself to at most 2 requests/second to the external API (the AccuLynx key allows 10 req/s SHARED across concurrent workers; sleep 0.5s between calls). On HTTP 429 back off with jitter and retry. "
    "CREDS + HOW TO CALL: set -a; source /Users/chussey/.config/cleverwork/master.env; set +a. "
    "AccuLynx: curl -s -H \"Authorization: Bearer $ACCULYNX_API_KEY\" 'https://api.acculynx.com/api/v2/<path>'. "
    "Supabase SQL: curl -s -X POST https://api.supabase.com/v1/projects/rnhmvcpsvtqjlffpsayu/database/query -H \"Authorization: Bearer $SUPABASE_ACCESS_TOKEN\" -H 'Content-Type: application/json' -d '{\"query\":\"<SQL>\"}'. Batch INSERTs (100+ rows per statement) and make them idempotent (ON CONFLICT DO UPDATE or delete-then-insert scoped to your own tables). "
    f"REFERENCE: read {BRIDGE}/API.md for endpoint families, pagination (pageSize/pageStartIndex), and gotchas; read the relevant mapping contract at {MIRROR}/<domain>/mapping.md named in your brief. "
    "The pilot cohort lives in jt_mirror.pilot_jobs (25 rows, column acculynx_job_id). "
    "If a target table is missing a column you need, you may ALTER TABLE ADD COLUMN on acculynx_backfill tables only. "
    "Every row you insert must carry fetched_at=now() and endpoint provenance. "
    "DELIVERABLE: write {DELIV} with sections: ## Endpoints Called (paths + call counts + status codes), ## Rows Loaded (per table, before/after counts from live SQL), ## Anomalies (429s, empty payloads, schema surprises), ## Verdict. "
    "HARD RULES: report reality — if an endpoint 404s or returns nothing, record it and move on; never fabricate rows; a partial backfill honestly reported beats an invented one. "
    "BRIEF: {brief}"
)

TASKS = [
    ("estimate-items", 3600,
     "AccuLynx estimate sections + items for ALL 210 estimates (ids in public.acculynx_estimates.id). "
     "For each estimate: GET /estimates/{estimateId}/sections (try ?includes=items first; fall back to GET /estimates/{estimateId}/sections/{sectionId}/items per section). "
     "Load acculynx_backfill.estimate_sections (id, estimate_id, name/title, sort order, raw, fetched_at, endpoint) and acculynx_backfill.estimate_items "
     "(id, section_id, estimate_id, item_name, description, quantity, unit, unit_price, price, total_price, cost fields if present, raw, fetched_at, endpoint). "
     f"Read {MIRROR}/estimates/mapping.md and {MIRROR}/pricing-catalog/mapping.md first — this backfill feeds BOTH domains."),
    ("job-enrichment", 3600,
     "Per-job enrichment for the 25 pilot jobs ONLY (jt_mirror.pilot_jobs.acculynx_job_id): "
     "(a) GET /jobs/{jobId}/representatives (fall back to /representatives/company and /representatives/sales-owner) -> acculynx_backfill.job_representatives (job_id, rep_kind, user_id, user_name, raw, fetched_at, endpoint). "
     "(b) For every contact of those jobs (public.acculynx_job_contacts -> contact ids): GET /contacts/{contactId}?includes=emailAddress,phoneNumber, falling back to /contacts/{contactId}/email-addresses and /phone-numbers -> acculynx_backfill.contact_emails (id, contact_id, email, kind, raw, fetched_at, endpoint) and acculynx_backfill.contact_phones (id, contact_id, phone, kind, raw, fetched_at, endpoint). "
     "(c) GET /jobs/{jobId}/financials then GET /financials/{financialsId}/worksheet -> acculynx_backfill.worksheet_lines (job_id, financials_id, line identity, item_name, quantity, unit, unit_cost, total, raw, fetched_at, endpoint). "
     f"Read {MIRROR}/jobs-core/mapping.md, {MIRROR}/branches-salesreps/mapping.md, {MIRROR}/cost-accounting/mapping.md first."),
    ("vendors-types", 1800,
     "AccuLynx vendor discovery: GET /contacts/contact-types (paged) -> acculynx_backfill.contact_types (id, name, raw, fetched_at, endpoint). "
     "Identify vendor-like types (subcontractor/supplier/vendor semantics — judge from real names, record your reasoning in the deliverable). "
     "Then page GET /contacts filtered/typed per API.md guidance to pull contacts of those types -> acculynx_backfill.vendors (id, name, contact_type_id, contact_type_name, email, phone, address fields if present, raw, fetched_at, endpoint). "
     f"Read {MIRROR}/vendors/mapping.md first."),
    ("milestone-settings", 1800,
     "AccuLynx milestone vocabulary: GET /company-settings/job-file-settings/workflow-milestones and per-milestone /statuses "
     "-> acculynx_backfill.milestone_settings (name EXACTLY as returned — case-sensitive, sort_order, statuses jsonb, raw, fetched_at, endpoint). "
     "Cross-check against select distinct current_milestone from public.acculynx_jobs and report any live milestone value absent from settings in ## Anomalies. "
     f"Read {MIRROR}/stages-milestones/mapping.md first."),
    ("companycam-projects", 3600,
     "CompanyCam project links: authenticate with $COMPANYCAM_API_KEY (Bearer) against the CompanyCam public API (base https://api.companycam.com/v2 — confirm exact paths from https://docs.companycam.com if reachable; the standard surface is GET /v2/projects, paged). "
     "Pull ALL projects -> acculynx_backfill.companycam_projects (id, name, address fields, status, project_url/public link, coordinates, raw, matched_acculynx_job_id, match_method, match_confidence, fetched_at, endpoint). "
     "Then match projects to public.acculynx_jobs (priority: for the 25 pilot jobs) by street+zip normalization first, then name similarity, then lat/lon proximity <150m; set matched_acculynx_job_id, match_method, match_confidence (high/medium/low). Leave unmatched rows with null match. "
     f"Read {MIRROR}/companycam-links/mapping.md first; it documents that AccuLynx holds no CompanyCam reference — matching is address-based by design."),
]

tasks = []
for key, timeout, brief in TASKS:
    deliv = f"{MIRROR}/{key}/backfill-report.md"
    tasks.append({
        "key": key,
        "task_type": "data-pipeline",
        "spec": COMMON.replace("{DELIV}", deliv).replace("{brief}", brief),
        "check": f"python3 {MIRROR}/checks/r25_backfill_check.py {key}",
        "expect_files": [deliv],
        "timeout_s": timeout,
        "verified": "live SQL assertions on acculynx_backfill row counts and integrity pass",
    })

manifest = {
    "run_name": "jt-acculynx-mirror",
    "workdir": MIRROR,
    "max_parallel": 4,
    "tasks": tasks,
}
out = f"{MIRROR}/manifests/r25b-backfill-swarm.json"
json.dump(manifest, open(out, "w"), indent=2)
print(f"wrote {out} ({len(tasks)} tasks)")
