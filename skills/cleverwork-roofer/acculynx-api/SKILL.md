---
name: acculynx-api
description: >
  Use the AccuLynx public API reference, generated OpenAPI index, and bridge
  conventions to plan, implement, audit, or safely execute AccuLynx API and
  webhook work for roofing clients.
when_to_use: >
  Invoke this skill whenever a task mentions AccuLynx, AccuLynx API, AccuLynx
  webhooks, jobs, leads, contacts, milestones, estimates, financials, invoices,
  supplements, insurance fields, custom fields, or the AccuLynx bridge. Do not
  use it for generic CRM work unless AccuLynx is the system of record.
inputs:
  - name: task_request
    type: string
    required: true
    description: The user's AccuLynx-related task or implementation goal.
  - name: client_context
    type: atom
    required: false
    description: Client/account details, milestone map, and integration status if already known.
  - name: api_credentials_available
    type: boolean
    required: false
    description: Whether the local environment already has AccuLynx credentials; never ask the user to paste secrets into chat.
outputs:
  - name: endpoint_plan
    type: draft
    description: Endpoint selection, request shape, safety notes, and expected response handling.
  - name: implementation_notes
    type: draft
    description: Code, bridge, or workflow changes needed for the task.
  - name: audit_notes
    type: evidence
    description: Source-backed constraints, gotchas, and verification steps.
trust_tier_of_output: evidence
bound_agents:
  - capture
  - conductor
  - auditor
  - ob-sales
  - ob-ops
  - ob-accounting
  - ob-acculynx
provenance:
  origin: cleverwork
  author: Cleverwork
  source_url: https://apidocs.acculynx.com/llms.txt
  license: MIT
  a3_ref: proposals/2026-06-09-acculynx-api.md
---

# AccuLynx API

Use this skill to turn AccuLynx API tasks into grounded endpoint plans and safe bridge changes.

---

## Brain data map (where AcuLynx data lives in OUR tables) — read before re-searching

| Data | Table | Notes (verified 2026-06-18) |
|---|---|---|
| Jobs/leads | `acculynx_jobs` (1,240) | `id` (uuid) = **immutable join key, assigned at lead creation, never changes — use it as the permanent link.** Has `job_name`, `job_category_name` (Residential/Commercial = job type), `trade_types`, `current_milestone`, `lead_source_name`, `location_street1/city/state`. |
| **PE job number + client name** | `acculynx_jobs.job_name` = `"KS-157: Kathy Mcmillen"` (`{job#}: {client}`) | The PE job number is in **`job_name`**, NOT the `job_number` column (mostly empty, 179/1240). Extract `split_part(job_name,':',1)` = job#, suffix = client. |
| Customer AR invoices (PE→customer) | `acculynx_invoices` | Schema exists (`job_id, invoice_number, due_date, current_invoice_state, total_price, balance_due`) but **EMPTY — pull not run.** This is PE's receivables, distinct from `abc_invoices` (PE's payables to ABC). |

**Matching rule (ABC order/invoice ↔ AcuLynx job):** match the normalized ABC PO
to the `job_name` prefix (`upper`, strip non-alnum, drop leading `PO`); store the
link on `acculynx_jobs.id`. See `v_invoice_acculynx_match` (schema 104). Coverage:
invoices 183/560, orders 349/3146 — ceiling = only 179 jobs carry a PE number.

**Job-number lifecycle (Chris's TEMP design):** lead/prospect has no sequence
number until Approved. Permanent key = AcuLynx `id`; pre-approval display label =
`{Region}-TEMP-{short id}`; on Approved, swap to real `{Region}-{Sequence}`. Links
ride on `id` so nothing breaks. Don't match estimates by address (~1/5);
`estimate_runs` aren't linked to AcuLynx (only `metadata.source_csv` address).

---

## Required Local References

Load these before choosing endpoints:

- `integrations/bridges/acculynx/API.md` — operating guide and source scope.
- `skills/cleverwork-roofer/acculynx-api/reference/openapi-index.json` — machine-readable endpoint index.
- `skills/cleverwork-roofer/acculynx-api/reference/full-endpoint-reference.md` — human-readable endpoint details.
- `skills/cleverwork-roofer/acculynx-api/reference/source-index.md` — fetched source inventory.
- `integrations/bridges/acculynx/README.md` and `mapping.md` — bridge-specific behavior and brain schema mapping.
- `skills/cleverwork-roofer/acculynx-api/reference/knowledge-folder.md` — **Knowledge Folder** pointer: routes agents to the Google Drive "AccuLynx" folder (who/what/how/why/where/when) and the read/write capability matrices (`docs/65`, `docs/37`).
- `docs/knowledge-base/acculynx/index.md` — the complete in-repo [Open Knowledge Format](../../../docs/knowledge-base/OKF/SPEC.md) "AccuLynx" bundle (who/what/how/why/where/when, the full read + write capability matrices, ingestion + write-action runbooks, and security posture) — the cited source of truth for AccuLynx work.

If the user asks for the latest AccuLynx API behavior, refresh the generated reference first:

```bash
ACCULYNX_DOCS_REFRESH=1 node integrations/bridges/acculynx/scripts/refresh-api-docs.mjs
```

Use the Web Intel plugin for fresh source verification when refreshing or when a referenced URL is not already present in `source-index.md`.

---

## Process

### Step 1 - Classify the Work

Classify the request as one of:

- read-only lookup or backfill
- write operation
- webhook subscription management
- bridge implementation or schema mapping
- troubleshooting/error handling
- documentation refresh

For write operations, name the exact method/path and require explicit human approval before touching production data unless the user has already authorized that exact action.

### Step 2 - Select Endpoints

Search `openapi-index.json` first by path, operation ID, title, category, and description. Confirm the chosen endpoint in `full-endpoint-reference.md`.

Prefer specific AccuLynx endpoints over generic assumptions:

- Jobs/leads: `GET /jobs`, `GET /jobs/{jobId}`, `POST /jobs`, `POST /jobs/search`.
- Unassigned/dead leads: `GET /jobs?assignment=unassigned` in a separate pull.
- Milestones/statuses: company settings endpoints, then job current/history endpoints.
- Insurance: `GET/PUT /jobs/{jobId}/insurance`, `PUT /jobs/{jobId}/insurance/insurance-company`, `GET/PUT /jobs/{jobId}/adjuster`.
- Financials: job financials, estimates, invoices, payments, worksheet, amendments, and top-level `/supplements`.
- Webhooks: `GET /topics`, subscription CRUD under `https://api.acculynx.com/webhooks/v2`.

### Step 3 - Apply Safety Rules

- Never expose or commit `ACCULYNX_API_KEY` or webhook secrets.
- Treat `POST`, `PUT`, `PATCH`, and `DELETE` as production-impacting.
- Do not store raw homeowner/customer exports in curated memory.
- Respect public rate limits: 30 requests/sec per IP and 10 requests/sec per API key.
- On HTTP `429`, back off with jitter; retry idempotent reads only unless a human approves a write retry.
- For webhooks, call `GET /topics` in the target account before creating/updating subscriptions. Event-page slugs are only topic hints.

### Step 4 - Build the Request Plan

For every call, produce:

- base URL
- method and path
- required path/query parameters
- optional includes/filters/sort fields
- request body schema name and required fields when applicable
- expected success status and response schema
- error statuses that matter
- idempotency and retry guidance

### Step 5 - Map to the Brain

When implementation touches the bridge, map API fields through `integrations/bridges/acculynx/mapping.md`. Preserve these defaults:

- AccuLynx leads are job files differentiated by milestone/assignment state.
- Milestone names are customer-configurable and case-sensitive.
- Supplements are top-level `/supplements` resources, not nested under jobs.
- Bridge atoms default to `trust_tier = "evidence"` unless a human-confirmed or system-approved state justifies `instruction`.

### Step 6 - Verify

Before declaring a task complete:

- Run the local docs generator if source behavior was updated.
- Validate `openapi-index.json` parses as JSON.
- For code changes, run the relevant repo checks or targeted smoke tests.
- For live API work, record the endpoint, status code, redacted request/response shape, and any follow-up risk.

---

## Output Format

```text
Endpoint plan
- Goal:
- Endpoint:
- Base URL:
- Auth:
- Parameters:
- Body:
- Success response:
- Failure handling:
- Safety gate:

Implementation notes
- Files:
- Mapping:
- Tests:
- Open questions:
```

---

## Judgment Rules

- If the docs and existing bridge disagree, trust the freshly generated docs and update bridge docs in the same change.
- If an endpoint page lacks enough detail, use Web Intel to re-fetch the source page and say what remains unknown.
- Do not invent AccuLynx custom milestone names, lead sources, trade types, work types, or webhook topics. Pull them from the account.
- Prefer polling fallback when webhook access is not available or the account tier is unclear.
- Keep customer/account-specific mappings in config, not in this skill.

---

## Works Well With

- `storm-claim-supplement` — when AccuLynx insurance/supplement data is needed for a claim packet.
- `vendor-invoice-credit-memo-audit` — when invoices or financials feed accounting QA.
- `post-op-debrief-atomizer` — when AccuLynx job close/warranty events trigger debrief capture.
- `auditor` — for write operations, webhook subscriptions, and bridge changes before production use.
