#!/usr/bin/env python3
"""Generate the R1 mapping-swarm manifest (9 domains)."""
import json

MIRROR = "/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/jobtread/mirror"
KB = "/Users/chussey/Library/CloudStorage/Dropbox-AIA4/Cleverwork Main/GROK/Tools/catalog/jobtread"
BRIDGE = "/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/acculynx"

COMMON = (
    "You are a read-only research worker producing a data-mapping contract for mirroring AccuLynx into JobTread. "
    "BOUNDARY: you may read any file on disk and run READ-ONLY (SELECT / information_schema) queries against Supabase; "
    "you must NEVER call the JobTread API, never run INSERT/UPDATE/DELETE/DDL SQL, and never write any file except your single deliverable. "
    "NEVER copy any credential value into your deliverable — refer to env vars by name only. "
    f"You own exactly one file: {MIRROR}/{{key}}/mapping.md. "
    "CONTEXT: Supabase project rnhmvcpsvtqjlffpsayu holds a live AccuLynx mirror (tables prefixed acculynx_, plus schema qbo_registers). "
    "Target: JobTread org 'Pro Exteriors' id 22PazeRM5FCH, single seat, NO new users may ever be created (sales reps / assignees become custom-field values). "
    "HOW TO QUERY SUPABASE (read-only): set -a; source /Users/chussey/.config/cleverwork/master.env; set +a; then "
    "curl -s -X POST https://api.supabase.com/v1/projects/rnhmvcpsvtqjlffpsayu/database/query "
    "-H \"Authorization: Bearer $SUPABASE_ACCESS_TOKEN\" -H 'Content-Type: application/json' "
    "-d '{\"query\":\"<SQL>\"}'. Inspect information_schema.columns for table shapes and run COUNT(*) checks. "
    f"REFERENCE FILES (read them): {KB}/api/schema-surface.json (the ONLY authoritative list of Pave create/update/delete ops — never cite an op not in it), "
    f"{KB}/api/README.md (Pave query language), {BRIDGE}/mapping.md and {BRIDGE}/API.md (how AccuLynx entities were understood on ingest). "
    "DELIVERABLE mapping.md MUST contain these markdown sections: "
    "'## Source Tables' (bullet list of exact table names you verified live; if the mirror lacks this domain write 'MISSING IN MIRROR:' plus what AccuLynx API endpoints would backfill it, citing " + BRIDGE + "/API.md), "
    "'## Target Pave Ops' (exact op names from the schema surface), "
    "'## Field Mapping' (table: source column -> Pave input field, with type notes and transforms), "
    "'## Gaps & Risks' (fidelity losses, unknowns, rate-limit concerns), "
    "'## Loader Plan' (idempotent upsert strategy, dependency order, batch size, crosswalk keys acculynx guid <-> jt id), "
    "'## Evidence' (the actual SQL you ran with live row counts formatted 'rows = N'). "
    "HARD RULES: every table you cite must have been verified via a live query; every Pave op must exist in schema-surface.json; "
    "state unknowns as unknowns — an honest gap beats an invented mapping. "
    "DOMAIN BRIEF: {brief}"
)

DOMAINS = [
    ("cost-accounting",
     "AccuLynx Chart of Accounts -> JobTread job costing. Investigate what accounting/cost structures exist in the mirror: "
     "acculynx_job_financials, acculynx_invoice_lines cost columns, AND the qbo_registers schema (56 tables — enumerate it; "
     "it may hold the true chart of accounts). Map to createCostGroup/createCostCode/createCostType/createUnit and the "
     "createCostCodeMapping/createCostTypeMapping/createUnitMapping import helpers. Decide the canonical CoA source and defend it."),
    ("jobs-core",
     "AccuLynx jobs (6,571 rows) -> JT customer Account -> Location -> Job chain. Sources: acculynx_jobs (35 cols), acculynx_contacts, "
     "acculynx_job_contacts, acculynx_contact_emails/phones. Define the 3-level dependency creation order, dedupe strategy for contacts->accounts, "
     "address handling for locations, and which acculynx_jobs columns become JT custom fields vs native fields."),
    ("branches-salesreps",
     "PE branches (acculynx_accounts, 9 rows) and sales people (acculynx_users, 406 rows) -> JT custom-field dropdowns (NO real users — seat rule). "
     "Identify which acculynx_jobs columns carry branch and sales-rep assignment. Spec createCustomField definitions (entity targets, dropdown options) "
     "and how job records get their values set on create."),
    ("pricing-catalog",
     "AccuLynx pricing catalog -> JT Catalog (createCostItem/createUnit). SUSPECTED MISSING IN MIRROR — verify by searching information_schema for "
     "catalog/price/item tables. If absent, consult the acculynx bridge API.md and acculynx_api_catalog table for which AccuLynx API endpoints expose "
     "the pricing catalog, and spec the backfill fetch (auth: ACCULYNX_API_KEY env name only) plus target mirror table DDL sketch."),
    ("vendors",
     "AccuLynx vendors -> JT vendor Accounts (createAccount with vendor type). SUSPECTED MISSING IN MIRROR — verify live. If absent, identify AccuLynx API "
     "endpoints from acculynx_api_catalog / bridge API.md that expose vendors/subcontractors and spec the backfill plus target mirror table sketch."),
    ("companycam-links",
     "CompanyCam photo links per job -> JT. Search for companycam-related tables live (any schema). Native CompanyCam integration will be connected MANUALLY "
     "by the human later, so spec the interim: a job-level custom field (createCustomField, URL/text) holding the CompanyCam project link, and how the loader "
     "resolves an AccuLynx job to its CompanyCam project (COMPANYCAM_API_KEY exists in master.env — cite by name; check acculynx_jobs columns for any companycam reference)."),
    ("estimates",
     "AccuLynx estimates (210 rows) + invoices (1,660) + invoice lines -> JT Documents (createDocument). Read acculynx_estimates/acculynx_invoices/acculynx_invoice_lines "
     "shapes live. Determine JT document types (estimate vs customerInvoice), line-item structure in the createDocument input, status mapping, and totals reconciliation strategy."),
    ("stages-milestones",
     "AccuLynx milestones -> JT job stages. Sources: acculynx_jobs milestone columns + acculynx_job_milestone_history (verify shape live). Determine how JT models job "
     "stages/pipeline in Pave ops (check the surface for stage-related ops and job update inputs), map the AccuLynx milestone vocabulary, and spec how history is preserved "
     "(createComment timeline entries vs custom fields with dates)."),
    ("production",
     "AccuLynx production artifacts -> JT. Inventory what production data the mirror holds: acculynx_get_checklist, acculynx_job_walk_errors, milestone-derived production "
     "state. Map to createDailyLog/createTask/createTaskType/createTasksFromBudget. Be honest about how thin the source is; spec only what the data supports."),
]

tasks = []
for key, brief in DOMAINS:
    t = {
        "key": key,
        "task_type": "research",
        "spec": COMMON.replace("{key}", key).replace("{brief}", brief),
        "check": f"python3 {MIRROR}/checks/r1_mapping_check.py {key}",
        "expect_files": [f"{MIRROR}/{key}/mapping.md"],
        "timeout_s": 1800,
        "verified": "mapping.md sections present, cited tables verified live in Supabase, cited Pave ops exist in schema surface",
    }
    if key == "companycam-links":
        t["model"] = "gpt-5.6-sol"  # exploration lane (research: 1.00 pass on scoreboard, low-stakes domain)
    tasks.append(t)

manifest = {
    "run_name": "jt-acculynx-mirror",
    "workdir": MIRROR,
    "max_parallel": 5,
    "tasks": tasks,
}
out = f"{MIRROR}/manifests/r1-mapping-swarm.json"
json.dump(manifest, open(out, "w"), indent=2)
print(f"wrote {out} ({len(tasks)} tasks)")
