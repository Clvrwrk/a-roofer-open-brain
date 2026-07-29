#!/usr/bin/env python3
"""Generate R2.5c retry manifest: estimate-items with per-branch keys, vendors with search whitelist + QBO fallback."""
import json

MIRROR = "/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/jobtread/mirror"
BRIDGE = "/Users/chussey/Documents/a-roofers-open-brain/integrations/bridges/acculynx"

KEYMAP = ("BRANCH KEY ROUTING (critical — the default ACCULYNX_API_KEY sees almost nothing; AccuLynx partitions data per branch key): "
          "map the row's account_key to its env var and use that key's Bearer token for every request about that row: "
          "colorado->PE_CC_COLORADO_ACCULYNX_API_KEY, florida->PE_CC_FLORIDA_ACCULYNX_API_KEY, georgia->PE_CC_GEORGIA_ACCULYNX_API_KEY, "
          "insurance_program->PE_CC_INSURANCE_PROGRAM_ACCULYNX_API_KEY, kansas_city->PE_CC_KANSAS_CITY_ACCULYNX_API_KEY, "
          "multi_family_commercial->PE_CC_MULTIFAMILY_COMMERCIAL_ACCULYNX_API_KEY, sandbox->PE_CC_SANDBOX_ACCULYNX_API_KEY, "
          "texas->PE_CC_TEXAS_ACCULYNX_API_KEY, wichita->PE_CC_WICHITA_ACCULYNX_API_KEY. "
          "Verify the exact env names exist after sourcing master.env (env | grep -o 'PE_CC[A-Z_]*' | sort) and adapt if a name differs slightly. "
          "EACH key has its own 10 req/s limit, but stay <=2 req/s per key anyway. ")

COMMON = (
    "You are a data-backfill worker for the jt-acculynx-mirror project (retry round — read the prior attempt's report at {PRIOR} first; it documents exactly what failed and why). "
    "BOUNDARY: READ-ONLY external API access as specified in your brief; INSERT/UPSERT/ALTER ONLY on the named acculynx_backfill tables in Supabase project rnhmvcpsvtqjlffpsayu; "
    "never call JobTread; never write any file except your deliverable; never copy credential values anywhere. "
    "CREDS: set -a; source /Users/chussey/.config/cleverwork/master.env; set +a. "
    "Supabase SQL: curl -s -X POST https://api.supabase.com/v1/projects/rnhmvcpsvtqjlffpsayu/database/query -H \"Authorization: Bearer $SUPABASE_ACCESS_TOKEN\" -H 'Content-Type: application/json' -d '{\"query\":\"<SQL>\"}'. "
    "AccuLynx base: https://api.acculynx.com/api/v2. Idempotent loads (ON CONFLICT or scoped delete-then-insert on your own tables only). Every row carries fetched_at and source_endpoint provenance. "
    f"REFERENCE: {BRIDGE}/API.md. "
    "DELIVERABLE {DELIV} sections: ## Endpoints Called, ## Rows Loaded (live before/after counts), ## Anomalies, ## Verdict. Honest partials beat invented rows. "
    "BRIEF: {brief}"
)

TASKS = [
    ("estimate-items-v2", 3600, f"{MIRROR}/estimate-items/backfill-report.md",
     KEYMAP +
     "GOAL: load sections+items for ALL 210 estimates in public.acculynx_estimates (columns id, job_id, account_key). Use each estimate's account_key-routed API key: "
     "GET /estimates/{estimateId}/sections?includes=items (fall back to per-section GET .../sections/{sectionId}/items). "
     "Target tables (exist, columns already normalized — inspect information_schema first): acculynx_backfill.estimate_sections (acculynx_id, estimate_id, job_id, account_key, name, section_type, sort_order, total_price, raw, ...) and "
     "acculynx_backfill.estimate_items (acculynx_id, section_id, estimate_id, job_id, account_key, name, quantity, estimate_unit, material_cost, labor_cost, price, total_price, raw, ...). "
     "First run a 3-estimate canary across 2 different branches and confirm 200s before the full sweep. If a branch's estimates still 404 with its own key, record it in ## Anomalies with the exact response and continue with the rest."),
    ("vendors-v2", 2400, f"{MIRROR}/vendors-types/backfill-report.md",
     "GOAL: populate acculynx_backfill.vendors with real vendor/supplier/subcontractor entities. The prior attempt proved: contact-types only has 'Customer' and 'General Contact', and typed discovery needs POST /contacts/search. "
     "POST WHITELIST: you may call EXACTLY ONE POST endpoint — POST /contacts/search on AccuLynx — because it is a read-shaped search (request body = filter). Every other POST/PUT/PATCH/DELETE anywhere remains forbidden. "
     + KEYMAP +
     "Strategy A (AccuLynx): use POST /contacts/search per branch key to enumerate contacts by type membership and inspect payloads for vendor-ish signals (company records, trade/supplier flags). Load qualifying rows into acculynx_backfill.vendors (company_name, first_name, last_name, contact_type_id/name, account_key, raw, provenance). "
     "Strategy B (QBO fallback — run it regardless, it is additive): inspect public.v_qbo_register_lines columns via information_schema; if it exposes payee/entity/name data, extract distinct vendor-like payees (exclude transfers, credit-card payments, payroll, and obvious non-vendors; record your exclusion rules) and load them into acculynx_backfill.vendors with source_endpoint='supabase:v_qbo_register_lines' and account_key='qbo'. "
     "In ## Verdict state which strategy produced the canonical vendor list and why. If BOTH produce zero true vendors, say so explicitly — but Strategy B on 29,883 register lines should surface real supplier names (e.g. building-material suppliers)."),
]

tasks = []
for key, timeout, prior, brief in TASKS:
    deliv = f"{MIRROR}/{key}/backfill-report.md"
    check_key = "estimate-items" if key.startswith("estimate") else "vendors-types"
    tasks.append({
        "key": key,
        "task_type": "data-pipeline",
        "spec": COMMON.replace("{PRIOR}", prior).replace("{DELIV}", deliv).replace("{brief}", brief),
        "check": f"python3 {MIRROR}/checks/r25_backfill_check.py {check_key}",
        "expect_files": [deliv],
        "timeout_s": timeout,
        "verified": "live SQL assertions on acculynx_backfill row counts and integrity pass",
    })

manifest = {"run_name": "jt-acculynx-mirror", "workdir": MIRROR, "max_parallel": 2, "tasks": tasks}
out = f"{MIRROR}/manifests/r25c-retry.json"
json.dump(manifest, open(out, "w"), indent=2)
print(f"wrote {out} ({len(tasks)} tasks)")
