#!/usr/bin/env python3
"""Generate B2 bulk-staging manifest (4 stagers, crosswalk-aware, full scope)."""
import json

MIRROR = "/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/jobtread/mirror"

CONVENTION = (
    "STAGING CONVENTION (identical to the proven pilot rounds — the executor depends on it): one pending_write row per JT write; "
    "domain, pave_op (exact schema-surface name), status='staged', source_ref='<table>:<id>', payload = complete Pave input with "
    "\"__execution_order\" int using bands: custom_fields=15 (updateCustomField option extension only), vendor_accounts=60, customer_accounts=70, locations=80, jobs=90, "
    "job_custom_values=100, documents=110, daily_logs=120. References to entities created earlier use {\"$ref\": \"<type>:<id>\"} "
    "resolved by the executor via jt_mirror.crosswalk TYPED BY TARGET FIELD (jobId->jt_type job, unitId->unit, accountId->account, locationId->location); "
    "entities that ALREADY exist (pilot) must use their literal jt_id from crosswalk directly where known at staging time — prefer literal ids over $ref whenever crosswalk already has the mapping. "
    "CROSSWALK-AWARE SCOPE: NEVER stage a row whose source entity already has a crosswalk mapping of the target jt_type (the pilot created 353 entities — re-creating any of them is a defect). "
    "SCOPE FILTERS: only non-archived jobs (archived_at is null) and exclude account_key='sandbox' everywhere (test-branch noise; note the exclusion in your report). "
    "TRUNCATION RULES (JT hard limits, learned in pilot): job name <= 30 chars (word-boundary + ellipsis, full name prepended to description as 'AccuLynx name: <full>'); externalId <= 32 (strip GUID hyphens); "
    "custom field text values fine. notify must never be true anywhere. SEAT RULE: no user invites/memberships/assignees ever — people are custom-field values. "
    "Idempotent staging: before inserting, delete YOUR domains' existing rows with status='staged' only. Never touch executed/skipped/failed rows of any domain. "
    "Supabase SQL access: set -a; source /Users/chussey/.config/cleverwork/master.env; set +a; curl -s -X POST https://api.supabase.com/v1/projects/rnhmvcpsvtqjlffpsayu/database/query "
    "-H \"Authorization: Bearer $SUPABASE_ACCESS_TOKEN\" -H 'Content-Type: application/json' -d '{\"query\":\"<SQL>\"}'. No external APIs — this round is pure SQL compilation. "
    "Do the compilation with set-based SQL INSERT..SELECT statements wherever possible (tens of thousands of rows — no per-row loops in python against the API). "
)

COMMON = (
    "You are a BULK staging compiler for jt-acculynx-mirror (full-scope: ~6.5k jobs; the 25-job pilot is already live and crosswalked). "
    "BOUNDARY: read-only on sources; INSERT/DELETE only your own domains' staged rows in jt_mirror.pending_write; one deliverable file; no credential values. "
    + CONVENTION +
    "Study the executed pilot rows in pending_write for your domains FIRST — they are the proven payload templates; replicate their exact key structure. "
    "DELIVERABLE {DELIV} sections: ## Scope (source counts, exclusions applied), ## Domains Staged (live counts), ## Truncations Applied (counts), ## Assumptions, ## Verdict. "
    "BRIEF: {brief}"
)

TASKS = [
    ("bulk-parties-stage", "parties",
     "Domains: vendor_accounts, customer_accounts, locations. "
     "(1) vendor_accounts: UPDATE the 1,263 rows with status='skipped' and error='deferred-to-bulk' back to status='staged', error=null, attempt=0 (do NOT re-stage new rows; do not touch the 50 executed). "
     "(2) customer_accounts: one createAccount (customer) per distinct contact attached to in-scope jobs (public.acculynx_job_contacts joined to non-archived non-sandbox acculynx_jobs), excluding contacts already crosswalked as accounts. "
     "Names per pilot convention (first+last, else company, else 'Unknown Customer — AccuLynx <id>'); enrich email/phone from acculynx_backfill.contact_emails/contact_phones (primary first). "
     "(3) locations: one createLocation per in-scope job not already crosswalked as location; accountId = literal crosswalked account jt_id when the contact was created in the pilot, else {\"$ref\": \"acculynx_contact:<id>\"}; address from acculynx_jobs location_* columns per the pilot payload template."),
    ("bulk-jobs-stage", "jobs",
     "Domains: jobs, job_custom_values, custom_fields (option extension only). "
     "(1) jobs: createJob per in-scope job not already crosswalked; name truncation rule applies; number=job_number; locationId $ref acculynx_job:<id>; description carries AccuLynx metadata per pilot template. "
     "(2) custom_fields: ONE updateCustomField row (band 15) extending the 'Sales Rep' dropdown options to the FULL distinct set of user_display_name values in acculynx_backfill.job_representatives plus 'Unassigned' (keep existing options; updateCustomField takes id + options — use the literal field jt_id from crosswalk; signature: updateCustomField({defaultValue, id, maxValuesAllowed, minValuesRequired, name, options, ...})). If the distinct rep set exceeds 300 names, cap to reps actually assigned to in-scope jobs and note it. "
     "(3) job_custom_values: one updateJob per staged bulk job (canonical proven shape: {\"$\": {\"id\": <ref-or-literal>, \"customFieldValues\": {<literal field jt_id>: value}}, \"job\": {\"$\": {\"id\": <same>}, \"id\": {}}}): AccuLynx Branch (from account_key mapped to the 9 option labels), Sales Rep (sales-owner rep from acculynx_backfill.job_representatives, else 'Unassigned'), AccuLynx Milestone (current_milestone exact spelling), AccuLynx Job # (job_number), CompanyCam Link (from acculynx_backfill.companycam_projects where matched_acculynx_job_id matches with match_confidence in ('high','medium'))."),
    ("bulk-documents-stage", "documents",
     "Domain: documents. One createDocument per estimate of an in-scope job not already crosswalked as document (~184 remaining of 210). "
     "COPY THE EXECUTED PILOT DOCUMENT PAYLOADS' EXACT STRUCTURE (query a few: domain='documents' and status='executed'): type customerOrder, name='Proposal', original estimate title in subject, description with AccuLynx estimate metadata, jobLocationName from the job address, dueDays=30, taxRate 0, fromName 'Pro Exteriors', toName from the customer, externalId = hyphen-stripped estimate GUID (<=32), showQuantity true, lineItems = BARE objects with _type='costItem' built from acculynx_backfill.estimate_sections/estimate_items (name, unitId as literal crosswalked unit jt_id or $ref acculynx_unit:<unit>, quantity, unitCost from material+labor costs, unitPrice, costCodeId/costTypeId literal ids via the same catalog semantics mapping the pilot used, description with section provenance). Estimates with no backfilled items get header-only documents (empty lineItems) with the gap noted."),
    ("bulk-dailylogs-stage", "dailylogs",
     "Domain: daily_logs. One createDailyLog per in-scope job that has rows in public.acculynx_job_milestone_history and no existing daily log (executed pilot rows or crosswalk). "
     "COPY THE PILOT PAYLOAD TEMPLATE: date = latest milestone event date (YYYY-MM-DD), notes = chronological milestone narrative with the '[ALX-MILESTONE-HISTORY:<job_id>]' marker, notify=false, jobId = literal crosswalked jt_id when available else $ref acculynx_job:<id>. Build notes with set-based SQL string aggregation."),
]

tasks = []
for key, group, brief in TASKS:
    deliv = f"{MIRROR}/{key}/stage-report.md"
    tasks.append({
        "key": key,
        "task_type": "code-feature",
        "spec": COMMON.replace("{DELIV}", deliv).replace("{brief}", brief),
        "check": f"python3 {MIRROR}/checks/b2_stage_check.py {group}",
        "expect_files": [deliv],
        "timeout_s": 3600,
        "verified": "live SQL: staged counts equal crosswalk-aware source expectations; truncation, notify, and payload-shape rules hold",
    })

manifest = {"run_name": "jt-acculynx-mirror", "workdir": MIRROR, "max_parallel": 4, "tasks": tasks}
out = f"{MIRROR}/manifests/b2-bulk-stage.json"
json.dump(manifest, open(out, "w"), indent=2)
print(f"wrote {out} ({len(tasks)} tasks)")
