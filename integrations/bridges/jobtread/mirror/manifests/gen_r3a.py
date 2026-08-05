#!/usr/bin/env python3
"""Generate R3a staging manifest: 4 stagers compile Pave writes into jt_mirror.pending_write."""
import json

MIRROR = "/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/jobtread/mirror"
KB = "/Users/chussey/Library/CloudStorage/Dropbox-AIA4/Cleverwork Main/GROK/Tools/catalog/jobtread"

CONVENTION = (
    "STAGING CONVENTION (shared by all stagers — deviations break the executor): each JobTread write becomes ONE row in jt_mirror.pending_write with "
    "domain=<your assigned domain string>, pave_op=<exact op name from schema-surface.json>, status='staged', source_ref='<source_table>:<source_id>', "
    "payload = the COMPLETE Pave input object for that op, EXCEPT: (a) any reference to an entity created by an earlier staged row uses {\"$ref\": \"<source_type>:<source_id>\"} "
    "(e.g. {\"$ref\": \"acculynx_contact:abc123\"} where a JT accountId belongs) — the executor resolves these through jt_mirror.crosswalk at run time; "
    "(b) payload must include \"__execution_order\": <int> using these bands: custom_fields=10, units=20, cost_types=30, cost_groups=40, cost_codes=45, catalog_items=50, "
    "vendor_accounts=60, customer_accounts=70, locations=80, jobs=90, job_custom_values=100, documents=110, daily_logs=120; "
    "(c) organizationId (22PazeRM5FCH) may be written literally where an op requires it. "
    "Idempotency: before inserting, delete your own domain's existing staged rows (delete from jt_mirror.pending_write where domain in (<your domains>) and status='staged'). "
    "NEVER touch rows of other domains, never set any status other than 'staged', never call JobTread or AccuLynx APIs — this round is pure compilation. "
    "SEAT RULE: nothing may stage a user invite, membership, or assignee referencing a real JT user other than the existing single seat; people become custom-field VALUES. "
)

COMMON = (
    "You are a staging compiler for the jt-acculynx-mirror pilot (25 jobs in jt_mirror.pilot_jobs). "
    "BOUNDARY: read-only on all source tables; INSERT/DELETE only on jt_mirror.pending_write rows in YOUR domains; one deliverable file. No external API calls. No credential values in files. "
    "Supabase SQL: set -a; source /Users/chussey/.config/cleverwork/master.env; set +a; curl -s -X POST https://api.supabase.com/v1/projects/rnhmvcpsvtqjlffpsayu/database/query "
    "-H \"Authorization: Bearer $SUPABASE_ACCESS_TOKEN\" -H 'Content-Type: application/json' -d '{\"query\":\"<SQL>\"}'. "
    + CONVENTION +
    f"PAVE INPUT SHAPES: consult the scraped official docs in {KB}/api/docs/ and {KB}/api/README.md; the mapping contracts in " + MIRROR + "/<domain>/mapping.md are the field-mapping authority. "
    "Do not invent input fields — where a field name is uncertain, choose the documented one and note the uncertainty in your deliverable's ## Assumptions section. "
    "DELIVERABLE {DELIV} sections: ## Domains Staged (row counts per domain from live SQL), ## Ref Graph (which $ref types you emit and which earlier band satisfies them), ## Assumptions, ## Verdict. "
    "BRIEF: {brief}"
)

TASKS = [
    ("foundations-stage", "foundations",
     "Domains: custom_fields, units, cost_types, cost_groups, cost_codes, catalog_items. "
     "(1) custom_fields: per branches-salesreps + stages-milestones + companycam-links mapping.md — Job-level dropdowns 'AccuLynx Branch' (9 options from public.acculynx_accounts), 'Sales Rep' (options = the distinct user_display_name values in acculynx_backfill.job_representatives, plus 'Unassigned'), 'AccuLynx Milestone' (options from acculynx_backfill.milestone_settings.name preserving exact spelling/order), text field 'AccuLynx Job #', text/url field 'CompanyCam Link'. "
     "(2) units: distinct estimate_unit values from acculynx_backfill.estimate_items (createUnit). "
     "(3) cost_types + cost_groups/cost_codes: per cost-accounting mapping.md, from public.qbo_accounts (211 rows) — respect its canonical-CoA decision and hierarchy guidance. "
     "(4) catalog_items: per pricing-catalog mapping.md, dedupe estimate_items by (name, estimate_unit) into createCostItem payloads with material_cost/labor_cost/price where present."),
    ("parties-stage", "parties",
     "Domains: vendor_accounts, customer_accounts, locations. "
     "(1) vendor_accounts: createAccount (vendor type) rows from acculynx_backfill.vendors — dedupe by company_name; if the vendors table is still empty when you run, stage zero vendor rows and record that honestly. "
     "(2) customer_accounts: for each pilot job (jt_mirror.pilot_jobs -> public.acculynx_job_contacts -> public.acculynx_contacts), stage createAccount (customer) with name/email/phone enriched from acculynx_backfill.contact_emails/contact_phones; dedupe contacts shared across pilot jobs (one account per distinct contact, source_ref = acculynx_contact:<id>). "
     "(3) locations: createLocation per pilot job under its customer account ($ref to the contact), address from public.acculynx_jobs location_* columns per jobs-core mapping.md."),
    ("jobs-stage", "jobs",
     "Domains: jobs, job_custom_values. "
     "(1) jobs: createJob per pilot job — name, number ('AccuLynx Job #'), location $ref (acculynx_job:<id> location), per jobs-core mapping.md. "
     "(2) job_custom_values: the update op(s) that set each pilot job's custom-field values: branch (from pilot_jobs.branch_key mapped to the 'AccuLynx Branch' option label), sales rep (from acculynx_backfill.job_representatives rep_kind sales-owner, else 'Unassigned'), milestone (pilot_jobs.milestone exact spelling), AccuLynx Job #, and CompanyCam Link (from acculynx_backfill.companycam_projects.matched_acculynx_job_id where match_confidence in ('high','medium')). "
     "Custom-field references use {\"$ref\": \"jt_stage_custom_field:<field name>\"} so the executor resolves the JT field id created in band 10."),
    ("documents-stage", "documents",
     "Domains: documents, daily_logs. "
     "(1) documents: per estimates mapping.md — for every pilot job's estimates (public.acculynx_estimates joined to pilot), stage createDocument (estimate-type) with line items built from acculynx_backfill.estimate_sections/estimate_items for that estimate (name, quantity, unit, unit price, total), totals from the estimate header; job reference as $ref acculynx_job:<id>. If the backfill lacks items for an estimate, stage the document with header totals only and note it. "
     "(2) daily_logs: per production mapping.md — one createDailyLog per pilot job summarizing its AccuLynx milestone history (public.acculynx_job_milestone_history rows for that job, chronological narrative, dates preserved in the text)."),
]

tasks = []
for key, group, brief in TASKS:
    deliv = f"{MIRROR}/{key}/stage-report.md"
    tasks.append({
        "key": key,
        "task_type": "code-feature",
        "spec": COMMON.replace("{DELIV}", deliv).replace("{brief}", brief),
        "check": f"python3 {MIRROR}/checks/r3a_stage_check.py {group}",
        "expect_files": [deliv],
        "timeout_s": 2400,
        "verified": "live pending_write assertions: counts, valid ops, well-formed refs, execution ordering",
    })

manifest = {"run_name": "jt-acculynx-mirror", "workdir": MIRROR, "max_parallel": 4, "tasks": tasks}
out = f"{MIRROR}/manifests/r3a-stage.json"
json.dump(manifest, open(out, "w"), indent=2)
print(f"wrote {out} ({len(tasks)} tasks)")
