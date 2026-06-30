# Phase 1: Foundation — Account Registry & Read-Capability Discovery - Research

**Researched:** 2026-06-30
**Domain:** AccuLynx REST API V2 read-surface discovery · Supabase Edge Functions / pg_cron · multi-key secret management · knowledge-folder scaffolding
**Confidence:** HIGH (live DB introspected, OpenAPI spec parsed, repo docs read; sandbox-data volume is the one MEDIUM unknown)

## Summary

Phase 1 has three concrete deliverables, all groundable in infrastructure that **already exists in the live brain**: (1) an `acculynx_accounts` registry table — which does **NOT** yet exist and must be created [VERIFIED: REST introspection returned no table]; (2) an exhaustive **sandbox** sweep of the **86 documented GET operations** [VERIFIED: jq over openapi-index.json], recorded into the already-live `acculynx_api_catalog` (28 rows) and `acculynx_api_probe` (198 rows) tables [VERIFIED: REST count]; and (3) a Google Drive "AccuLynx" knowledge-folder skeleton plus a repo pointer.

The single most important reframing: the prior 198-probe history was **exploratory guessing** — 133 of 198 probes were 404s against invented paths (`/branches`, `/jobs/{id}/materials`, `/jobs/{id}/notes`, `/jobs/{id}/photos`) that are **not in the OpenAPI spec at all** [VERIFIED: probe table query]. Only 51 were GET 200s, and all ran against the **single production Kansas key**, not the sandbox. Phase 1's job is therefore a *systematic, spec-driven* sweep of the 86 real GETs against the **sandbox key only**, not more guessing. The existing probe schema is excellent and capture-complete — it already stores `result_summary.top_keys`/`item_keys`/`first_item_sample`, raw `payload_sample`, `reported_count`, `items_on_page`, `response_ms`, and per-batch grouping [VERIFIED: live row inspection]. **Extend it; do not rebuild it.**

The 86 GETs split cleanly into ID-free endpoints (~26: company-settings, contacts list, jobs list, supplements list, users, calendars, diagnostics) and ID-scoped endpoints requiring a seed chain (jobId → estimateId/financialsId/contactId/supplementId → leaf). The driver pattern is a list→detail walk anchored on the `_link` HATEOAS field every collection item carries [VERIFIED: jobs `first_item_sample` shows `_link` + `contacts[]._link`].

**Primary recommendation:** Build one idempotent sandbox-only probe driver (a new Edge Function `acculynx-read-sweep`, or an extension of `acculynx-endpoint-probe`) that reads the 86-GET checklist from a seed table, chains IDs via list calls, paces to ≤8 req/s on the sandbox key, and upserts real shapes + quirks into `acculynx_api_catalog`/`acculynx_api_probe`. Create `acculynx_accounts` as migration 165 (additive/idempotent, secret-name only — never the value). Scaffold the Drive folder via the existing Google Workspace OAuth bridge (no Google MCP is wired in this repo).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| AccuLynx GET probing (sandbox) | API / Backend (Supabase Edge Function, Deno) | DB (probe/catalog tables) | Per-key secret + 120s budget + pg_net already live here; no new infra |
| Probe scheduling/triggering | DB (pg_cron → pg_net) | Edge Function | Reuses the proven `trigger_acculynx_sync` path; sandbox runs are manual-trigger in Phase 1 |
| Account registry | DB (`acculynx_accounts` table) | — | Pure relational lookup; the sync function reads it to pick a key at runtime |
| Secret storage (9 keys) | Supabase project secrets (Edge runtime env) | — | Project-wide secrets, `Deno.env.get(name)`; registry stores the NAME, never the value |
| Read-capability matrix doc | Repo (`docs/`) + Drive | — | Markdown doc reconciled against `openapi-index.json` + live probe results |
| Knowledge folder | Google Drive (Workspace OAuth bridge) | Repo pointer file | Human-navigable asset; repo file routes agents to it |

## Standard Stack

### Core
| Library / Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase Edge Functions (Deno) | live (`acculynx-sync` v10, `acculynx-api-probe` v3, `acculynx-endpoint-probe` v1) | Run the sandbox GET sweep; per-key secret access via `Deno.env.get` | Already the integration of record [VERIFIED: PROJECT.md + probe tables live] |
| pg_cron + pg_net | live | Trigger/poll the function from inside Postgres | Proven path; `trigger_acculynx_sync('["users","jobs"]')` already exists [CITED: PROJECT.md] |
| Supabase project secrets | n/a | Hold all 9 AccuLynx keys by name | Set via `supabase secrets set` / dashboard, readable in any function, rotatable with no redeploy [CITED: supabase.com/docs/guides/functions/secrets] |
| `acculynx_api_catalog` | live, 15 cols, 28 rows | Per-endpoint canonical record (pattern, method, requires_param, response_keys, is_collection, target_table, sync_enabled, notes, last_probe_status) | Already the catalog of record [VERIFIED: REST introspection] |
| `acculynx_api_probe` | live, 13 cols, 198 rows | Per-call evidence (api_endpoint, method, http_status, response_ms, reported_count, items_on_page, result_summary, payload_sample, probe_batch_id, error) | Already stores real shapes + pagination [VERIFIED: row inspection] |

### Supporting
| Library / Tool | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Google Workspace OAuth bridge | least-scope OAuth, persona-owned | Create the Drive "AccuLynx" folder skeleton | REQ-01 folder creation [CITED: docs/18-platform-integrations.md §Google Workspace] |
| Slack / Sentry | live | (Phase 3) alerting — not required in Phase 1 | Out of scope here |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `acculynx-read-sweep` Edge Function | Extend `acculynx-endpoint-probe` v1 in place | Extending keeps one function but risks regressing the existing probe; a new dedicated sweep function is cleaner and the brief says "EXTEND these, not duplicate" — extend the *tables*, a new *driver* is fine |
| Google Workspace OAuth bridge | A Google Workspace MCP | **No Google MCP is wired in this repo** [VERIFIED: no `.mcp.json` google ref]; folder may need manual creation or the OAuth bridge — flag as a planning gate |
| Storing keys as 9 project secrets | One JSON secret blob | Per-key secrets rotate independently and match the `.env` names already in use — strongly preferred |

**Installation:** No new packages. All tooling is live Supabase infrastructure.

**Version verification:** No external package installs in this phase. The "stack" is live Supabase services already running in project `rnhmvcpsvtqjlffpsayu` [VERIFIED: SUPABASE_URL in .env].

## Package Legitimacy Audit

Not applicable — Phase 1 installs **no external packages**. All work runs on existing Supabase Edge Functions (Deno, std-lib `fetch` + `Deno.env`), pg_cron/pg_net, and additive SQL migrations. No npm/PyPI/crates dependency is introduced. If the planner later proposes a Deno import (e.g. a backoff helper from `deno.land/std`), run the legitimacy gate at that point; prefer the Deno standard library over third-party modules.

## The Definitive GET Probe Checklist (86 operations)

[VERIFIED: `jq` over `skills/cleverwork-roofer/acculynx-api/reference/openapi-index.json`, 2026-06-30]

Method totals across the 124-op surface: **86 GET · 19 POST · 15 PUT · 4 DELETE**. Phase 1 probes the 86 GETs only. Base URL is `https://api.acculynx.com/api/v2` for **83** of them; **3** webhook GETs use `https://api.acculynx.com/webhooks/v2` (`/subscriptions`, `/subscriptions/{subscriptionId}`, `/topics`).

### Tier A — ID-free (no path param; probe first, ~26 ops)
These need only the key. Probe these in batch 1; several seed IDs for Tier B.

| Category | Path | operationId | Notes |
|----------|------|-------------|-------|
| Common | `/acculynx/countries` | getAccuLynxCountries | `includes=states` |
| Common | `/acculynx/units-of-measure` | getAcculynxUnitsOfMeasure | |
| Diagnostics | `/diagnostics/ping` | getPing | health check, probe first |
| Calendar | `/calendars` | getCalendars | seeds `calendarId` |
| Company | `/company-settings` | getCompanySettings | |
| Company | `/company-settings/custom-fields` | getCompanySettingsCustomFields | |
| Company | `/company-settings/job-file-settings/document-folders` | getCompanyDocumentFolders | |
| Company | `/company-settings/job-file-settings/insurance-companies` | getInsuranceCompanies | |
| Company | `/company-settings/job-file-settings/job-categories` | getCompanySettingsJobSettingsJobCategories | |
| Company | `/company-settings/job-file-settings/photo-video-tags` | getPhotoVideoTags | |
| Company | `/company-settings/job-file-settings/trade-types` | getCompanySettingsJobSettingsTradeTypes | |
| Company | `/company-settings/job-file-settings/work-types` | getCompanySettingsJobSettingsWorkTypes | |
| Company | `/company-settings/job-file-settings/workflow-milestones` | getMilestones | seeds `{milestone}`; `includes` |
| Company | `/company-settings/leads/lead-sources` | getActiveLeadSources | seeds `leadSourceId` |
| Company | `/company-settings/location-settings/account-types` | getActiveAccountTypes | seeds `accountTypeId` |
| Company | `/company-settings/location-settings/countries` | getCompanySettingsLocationSettingsCountries | |
| Contacts | `/contacts` | getContacts | seeds `contactId`; `pageStartIndex` |
| Contacts | `/contacts/contact-types` | getContactTypes | |
| Estimates | `/estimates` | getEstimates | seeds `estimateId`; `pageStartIndex` |
| Jobs | `/jobs` | getJobs | **seeds `jobId` for all Tier B**; `recordStartIndex` |
| Jobs | `/jobs/external-references` | getJobExternalReferences | query `jobId`/`projectId`/`source` |
| Supplements | `/supplements` | getFinancialsSupplementsForCompany | seeds `supplementId`; query `jobId`; `recordStartIndex` |
| Users | `/users` | getUsers | seeds `userId`; `recordStartIndex` |
| Subscriptions | `/subscriptions` | getSubscriptions | webhooks base URL; tier-gated |
| Topics | `/topics` | getTopics | webhooks base URL; tier-gated |

### Tier B — single-ID, seeded from Tier A (job/contact/estimate/financials/supplement/user/calendar scoped, ~38 ops)

| Category | Path | operationId | Seed source |
|----------|------|-------------|-------------|
| Common | `/acculynx/countries/{countryId}` | getAccuLynxCountry | countries list (use `1`=US) |
| Common | `/acculynx/countries/{countryId}/states` | getAccuLynxStates | countries list |
| Company | `/company-settings/job-file-settings/workflow-milestones/{milestone}/statuses` | getStatusesForMilestone | milestones list |
| Company | `/company-settings/leads/lead-sources/{leadSourceId}` | getLeadSourceById | lead-sources list |
| Company | `/company-settings/location-settings/account-types/{accountTypeId}` | getAccountTypeById | account-types list |
| Company | `/company-settings/location-settings/countries/{countryId}/states` | getcompanySettingsLocationSettingsCountriesCountryIdStates | countries list |
| Calendar | `/calendars/{calendarId}/appointments` | getAppointments | calendars list; `pageStartIndex`, `startDate`/`endDate` |
| Contacts | `/contacts/{contactId}` | getContact | contacts list; `includes` |
| Contacts | `/contacts/{contactId}/custom-fields` | getContactCustomFields | contacts list |
| Contacts | `/contacts/{contactId}/email-addresses` | getContactEmailAddresses | contacts list (seeds `emailId`) |
| Contacts | `/contacts/{contactId}/phone-numbers` | getContactPhoneNumber | contacts list (seeds `phoneId`) |
| Estimates | `/estimates/{estimateId}` | getEstimateById | estimates list; `includes` |
| Estimates | `/estimates/{estimateId}/sections` | getEstimateSections | estimates list (seeds `estimateSectionId`) |
| Estimates | `/estimates/{estimateId}/sections/{estimateSectionId}/items` | getEstimateSectionItems | sections list (seeds `estimateItemId`) |
| Financials | `/financials/{financialsId}` | getFinancialsByFinancialId | **from `getFinancialsForJob`** (returns the financials object/id) |
| Financials | `/financials/{financialsId}/amendments` | getWorksheetAmendmentsById | financials id; `pageStartIndex` (seeds amendment id) |
| Financials | `/financials/{financialsId}/worksheet` | getWorksheetById | financials id |
| Invoices | `/invoices/{invoiceId}` | getInvoiceById | from `getInvoicesForJob` |
| Jobs | `/jobs/{jobId}` | getJob | jobs list; `includes` |
| Jobs | `/jobs/{jobId}/accounting/integration-status` | getAccountingIntegrationsSyncChangesForJob | jobs list |
| Jobs | `/jobs/{jobId}/adjuster` | getAdjusterForJob | jobs list (insurance jobs only) |
| Jobs | `/jobs/{jobId}/contacts` | getJobContacts | jobs list (seeds `jobContactId`); `includes` |
| Jobs | `/jobs/{jobId}/custom-fields` | GetJobCustomFields | jobs list (seeds `customFieldId`) |
| Jobs | `/jobs/{jobId}/estimates` | getEstimatesForJob | jobs list |
| Jobs | `/jobs/{jobId}/financials` | getFinancialsForJob | jobs list → **financialsId** |
| Jobs | `/jobs/{jobId}/history` | getJobHistory | jobs list; `recordStartIndex`, `startDate`/`endDate` |
| Jobs | `/jobs/{jobId}/initial-appointment` | getInitialAppointmentForJob | jobs list |
| Jobs | `/jobs/{jobId}/insurance` | getInsuranceForJob | jobs list (insurance jobs only) |
| Jobs | `/jobs/{jobId}/invoices` | getInvoicesForJob | jobs list (seeds `invoiceId`); `pageStartIndex` |
| Jobs | `/jobs/{jobId}/milestone-history` | getMilestonesForJob | jobs list (correct path; see quirk) |
| Jobs | `/jobs/{jobId}/milestones/current` | getCurrentJobMilestone | jobs list (seeds `milestoneId`); `includes` |
| Jobs | `/jobs/{jobId}/payments` | getPayments | jobs list |
| Jobs | `/jobs/{jobId}/payments/overview` | getPaymentsOverviewForJob | jobs list |
| Jobs | `/jobs/{jobId}/representatives` | getRepresentativesForJob | jobs list; `recordStartIndex` |
| Jobs | `/jobs/{jobId}/representatives/ar-owner` | getAROwnerForJob | jobs list |
| Jobs | `/jobs/{jobId}/representatives/company` | getCompanyRepresentativeForJob | jobs list |
| Jobs | `/jobs/{jobId}/representatives/sales-owner` | getSalesOwnerForJob | jobs list |
| Leads | `/leads/{leadId}/history` | getLeadHistory | a job in Lead milestone; `includes` |
| Supplements | `/supplements/{supplementId}` | getSupplementById | supplements list |
| Supplements | `/supplements/{supplementId}/items` | getFinancialsSupplementItemCollection | supplements list; `recordStartIndex` |
| Supplements | `/supplements/{supplementId}/notations` | getFinancialsSupplementNotationCollection | supplements list; `recordStartIndex` |
| Subscriptions | `/subscriptions/{subscriptionId}` | getSubscription | subscriptions list (webhooks base) |
| Users | `/users/{userId}` | getUser | users list |

### Tier C — two/three-ID deep (seed from Tier B, ~10 ops)

| Path | operationId | Seed chain |
|------|-------------|-----------|
| `/acculynx/countries/{countryId}/states/{stateId}` | getAccuLynxState | countries → states |
| `/calendars/{calendarId}/appointments/{appointmentId}` | getAppointmentById | calendars → appointments |
| `/company-settings/leads/lead-sources/{leadSourceParentId}/children/{leadSourceId}` | getLeadSourceChildById | parent lead-source with children |
| `/contacts/{contactId}/custom-fields/{customFieldId}` | getContactCustomFieldById | contact → custom-fields |
| `/contacts/{contactId}/email-addresses/{emailId}` | getContactEmailAddressById | contact → emails |
| `/contacts/{contactId}/phone-numbers/{phoneId}` | getContactPhoneNumberById | contact → phones |
| `/estimates/{estimateId}/sections/{estimateSectionId}` | getEstimateSectionById | estimate → sections |
| `/estimates/{estimateId}/sections/{estimateSectionId}/items/{estimateItemId}` | getEstimateSectionItem | estimate → section → items |
| `/financials/{financialsId}/amendments/{financialsAmendmentId}` | getWorksheetAmendmentById | financials → amendments |
| `/jobs/{jobId}/contacts/{jobContactId}` | getJobContact | job → contacts; `includes` |
| `/jobs/{jobId}/custom-fields/{customFieldId}` | getJobCustomFieldById | job → custom-fields |
| `/jobs/{jobId}/milestones/{milestoneId}` | getJobMilestoneById | job → current milestone; `includes` |
| `/jobs/{jobId}/milestones/{milestoneId}/status/{statusId}` | getJobStatusById | job → milestone → status |
| `/reports/scheduled-reports/{scheduledReportId}/runs` | getReportsByInstanceInstanceRunsByScheduleId | needs a scheduled-report id (no list GET — see Open Q) |
| `/reports/scheduled-reports/{scheduledReportId}/runs/latest` | getReportLatestInstance | scheduled-report id |
| `/reports/scheduled-reports/{scheduledReportId}/runs/{instanceRunId}` | getReportByInstanceId | report → run |
| `/reports/scheduled-reports/{scheduledReportId}/runs/{instanceRunId}/recipients` | getReportsRecipientsByInstanceId | report → run |
| `/reports/scheduled-reports/{scheduledReportId}/runs/{instanceRunId}/recipients/{recipientId}` | getReportInstaceRecipientById | report → run → recipient |

> **Reports caveat:** all 5 Reports GETs require a `scheduledReportId`, but **there is no GET to list scheduled-report IDs** in the 86-op surface [VERIFIED: jq]. These cannot be probed without an externally-supplied report id from the AccuLynx UI. Plan a `checkpoint:human-verify` to obtain a sandbox `scheduledReportId`, or record these as "unprobeable without seed id" in the matrix.

### Pagination param split (a real quirk — get this right)
[VERIFIED: jq over openapi-index.json]
- **`recordStartIndex`** (21 GETs): `/jobs`, `/users`, `/calendars`, `/supplements`, all `/company-settings/*` collections, `/jobs/{jobId}/estimates`, `/jobs/{jobId}/history`, `/jobs/{jobId}/representatives`, `/jobs/{jobId}/custom-fields`, `/contacts/{contactId}/custom-fields`, `/supplements/{supplementId}/items|notations`.
- **`pageStartIndex`** (10 GETs): `/contacts`, `/contacts/contact-types`, `/estimates`, `/calendars/{calendarId}/appointments`, `/financials/{financialsId}/amendments`, `/jobs/{jobId}/invoices`, `/subscriptions`, `/topics`, both Reports `/runs` + `/recipients`.
- The driver must select the correct param per endpoint from the OpenAPI `parameters` list — do not assume one global pagination param. (The repo docs note jobs=`recordStartIndex`, contacts=`pageStartIndex`; the spec confirms and extends this.)

## Probe Harness Design

### Existing infra (the thing you EXTEND) [VERIFIED: live REST introspection 2026-06-30]

**`acculynx_api_catalog`** (15 cols, 28 rows) — the canonical per-endpoint record:
`id, endpoint_pattern, method, category, subcategory, requires_param, is_collection, response_keys (jsonb array), target_table, sync_enabled, last_probe_status, last_probed_at, notes, created_at, updated_at`.
Sample row (`/jobs`): `response_keys=["count","pageSize","pageStartIndex","items"]`, `is_collection=true`, `notes="Paginated. Supports dateFilterType, milestones, assignment, sortBy, sortOrder params."`, `sync_enabled=true`, `target_table="acculynx_jobs"`.

**`acculynx_api_probe`** (13 cols, 198 rows) — per-call evidence:
`id, probe_name, probe_batch_id, api_endpoint, method, http_status, response_ms, reported_count, items_on_page, result_summary (jsonb), payload_sample (text/jsonb), error, probed_at`.
`result_summary` already stores `{top_keys, item_keys, first_item_sample}` — exactly the "real shape" the success criteria require [VERIFIED: row inspection: jobs probe captured 15 item_keys + a full first_item_sample].

**Existing data caveats (drive the design):**
- 198 historical probes = **51 GET 200 · 133 GET 404 · 2 GET 400 · 9 OPTIONS 404 · 3 BURST 200** [VERIFIED]. The 404s are mostly **invented paths** (`/branches`, `/jobs/{id}/materials`, `/notes`, `/photos`, `/tasks`, `/timeline`, `/work-orders`) that don't exist in the OpenAPI spec — prior exploration, not a documented-endpoint sweep.
- All historical probes ran against the **production Kansas key** (`reported_count: 1014` jobs) — **NOT** the sandbox. Phase 1 must re-probe against `PE_CC_SANDBOX_ACCULYNX_API_KEY` and tag rows with the source account.
- `endpoint_pattern` uses snake_case params (`{job_id}`) while the OpenAPI uses camelCase (`{jobId}`) — **reconcile to one convention** (recommend canonical = OpenAPI camelCase path; keep a normalized `endpoint_pattern` for the catalog PK).

### Recommended driver (sandbox-only)

```
acculynx-read-sweep (new Edge Function, Deno)   [sandbox key only]
  │
  ├─ load checklist: 86 GET ops (from a seed table `acculynx_get_checklist`,
  │     populated once from openapi-index.json: path, operationId, category,
  │     tier A/B/C, path_params[], pagination_param, includes[])
  │
  ├─ resolve key: Deno.env.get('PE_CC_SANDBOX_ACCULYNX_API_KEY')
  │     (HARD GATE: refuse to run if env name != sandbox)
  │
  ├─ Tier A sweep → for each: GET, record probe row, extract seed IDs
  │     from result_summary.first_item_sample.id and ._link
  │
  ├─ Tier B sweep → for each ID-scoped op, take 1–3 seed IDs from a
  │     `probe_seed_ids` working set; chain financials via getFinancialsForJob
  │
  ├─ Tier C sweep → deepest leaves from Tier B seeds
  │
  └─ upsert acculynx_api_catalog (status, response_keys, is_collection,
        requires_param, notes/quirks) + insert acculynx_api_probe
        (one row per call, same probe_batch_id)
```

**Pacing:** sandbox key limit is 10 req/s; pace to **≤8 req/s** (≈125ms gap) to stay under with margin. 86 GETs × a handful of seed IDs each ≈ 200–400 calls → ~30–60s wall clock, comfortably inside the 120s Edge budget. If it ever exceeds budget, resume via `probe_batch_id` + a `swept` flag on the checklist (same watermark-resume pattern as `acculynx-sync`).

**429 handling:** reuse the existing `acculynxFetch` backoff (Retry-After + exponential + jitter). Note: AccuLynx does **not** document a `Retry-After` header, and the ban is "30s to a few minutes" [CITED: apidocs.acculynx.com/docs/rate-limits + WebSearch], so backoff-with-jitter is the safe default; treat a missing `Retry-After` as a fixed initial backoff.

**Idempotent re-run:** the sweep is a pure read; re-running overwrites the catalog row (upsert on `endpoint_pattern+method`) and appends a fresh probe batch. Safe to run repeatedly (Chris's "test → red-team → retest" loop).

**ID chaining (HATEOAS):** every collection item carries `_link` (a fully-qualified URL) and `id` [VERIFIED: jobs first_item_sample]. The cleanest chain is: list call → take `items[].id` → substitute into the Tier-B path. `getFinancialsForJob` is the only indirect hop (job → financials object → `financialsId` → `/financials/{financialsId}/*`).

### Where real shapes are stored
- **Catalog** (`response_keys`, `is_collection`, `requires_param`, `notes`): the durable, deduped "what this endpoint is" record. One row per endpoint.
- **Probe** (`result_summary`, `payload_sample`, `reported_count`, `items_on_page`, `http_status`, `response_ms`, `error`): the per-call evidence, one row per call per batch. Redact PII before storing `payload_sample` (homeowner names/addresses appear — `jobName: "KS-8: Daniel Nagel"`); store key SHAPES, truncate or hash values (hard rule 2 / SKILL safety).

## Account Registry Design (`acculynx_accounts`)

**Status: table does NOT exist** [VERIFIED: REST returned empty content-range]. Create as migration **165** (next after 164) in `schemas/cleverwork-roofer/`. Additive, idempotent.

```sql
-- schemas/cleverwork-roofer/165-acculynx-accounts-registry.sql
-- Additive + idempotent (hard rule 1). Stores secret NAMES only — never values (hard rule 2).
CREATE TABLE IF NOT EXISTS public.acculynx_accounts (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_key       text NOT NULL UNIQUE,          -- stable slug, e.g. 'kansas_city', 'sandbox'
  env_secret_name   text NOT NULL UNIQUE,          -- e.g. 'PE_CC_KANSAS_CITY_ACCULYNX_API_KEY' (NAME, not value)
  label             text NOT NULL,                 -- 'Kansas City', 'Multi-Family / Commercial'
  program           text,                          -- 'Insurance Program' / 'Multi-Family Commercial' / NULL for geo
  market            text,                          -- metro/region
  state             text,                          -- 'KS', 'TX', ... (NULL for sandbox/programs)
  environment       text NOT NULL CHECK (environment IN ('production','sandbox')),
  is_active         boolean NOT NULL DEFAULT true,
  acculynx_company_id uuid,                         -- filled in once probed (see note)
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.acculynx_accounts.env_secret_name IS
  'Supabase project secret NAME holding this account''s AccuLynx API key. The value never lands in the DB or repo.';
```

**Seed rows (9):** the 8 production keys + sandbox, names confirmed from `.env` [VERIFIED: grep, values not read]:
`PE_CC_FLORIDA_*`, `PE_CC_COLORADO_*`, `PE_CC_GEORGIA_*`, `PE_CC_KANSAS_CITY_*`, `PE_CC_TEXAS_*`, `PE_CC_WICHITA_*`, `PE_CC_INSURANCE_PROGRAM_*`, `PE_CC_MULTI-FAMILY_COMMERCIAL_*` (all `environment='production'`), and `PE_CC_SANDBOX_*` (`environment='sandbox'`).

> **Watch:** `PE_CC_MULTI-FAMILY_COMMERCIAL_ACCULYNX_API_KEY` contains a hyphen — valid as a shell/env var name with care, but confirm Supabase secret naming accepts it (Supabase secret names are typically `[A-Z0-9_]`). **Likely must be renamed** to `PE_CC_MULTI_FAMILY_COMMERCIAL_ACCULYNX_API_KEY` when set as a Supabase secret. Record the canonical secret name in `env_secret_name` and flag this rename in the plan.

**Runtime key selection:** the sync/sweep function looks up `acculynx_accounts` by `account_key` (or iterates `is_active=true`), reads `env_secret_name`, then `Deno.env.get(env_secret_name)`. The registry is the fan-out driver (Phase 2 reads it to loop all 8 prod keys); Phase 1 only exercises the `sandbox` row.

**`acculynx_company_id`:** AccuLynx `GET /company-settings` returns the account's company identity; after the sandbox probe, backfill this so each registry row is verifiably bound to its real AccuLynx account (answers STATE.md blocker "verify each key's account binding"). For prod keys this binding is verified in Phase 2, not Phase 1.

## Secure Multi-Key Storage

[CITED: supabase.com/docs/guides/functions/secrets · WebSearch verified]

- **Store 9 keys as 9 Supabase project secrets**, one per account, named to match `.env` (sandbox first for Phase 1). Set via `supabase secrets set --env-file <local .env>` or the dashboard. Secrets are **project-wide** (available to every Edge Function), readable via `Deno.env.get(name)`, and **available immediately with no redeploy** → rotatable with zero downtime.
- **The DB stores only the secret NAME** (`acculynx_accounts.env_secret_name`), never the value (hard rule 2). The repo stores only placeholder names in `config/.env.example`.
- **Rotation:** rotate one account's key by `supabase secrets set PE_CC_X_...=<new>`; no code/DB change, no redeploy. The registry row is unchanged because it references the name.
- **`.env` discipline:** `.env` (the 9 real keys) is already untracked [VERIFIED: not in `.env.example`, present as mode-600 `.env`]. Confirm `.gitignore` covers it before any commit (handoff rule 2).
- **Sandbox hard gate:** the sweep function should `throw` if the resolved env name is not the sandbox secret, so a misconfiguration cannot accidentally probe production (enforces Chris's 2026-06-30 mandate in code, not just convention).

## Google Drive Knowledge Folder

**Existing integration:** Google Workspace is wired as a **least-scope OAuth bridge owned by named personas** (Maya Chen, Alex Rivers, Casey Morgan, Jordan Price, Sam Torres, Rowan Vale, Lena Brooks) — secret = Google OAuth client/refresh [CITED: docs/18-platform-integrations.md §Google Workspace; persona roster `reference/pro-exteriors-google-workspace-agent-personas.md`]. **No Google Workspace MCP is configured in this repo** [VERIFIED: no `.mcp.json` google reference]. Folder creation therefore goes through the OAuth bridge or is done manually by a Workspace-enabled persona — **flag as a planning gate / `checkpoint:human-verify`**.

**Recommended folder skeleton** (who/what/how/why/where/when, matching success criterion 4 and Phase 6's eventual full build):
```
AccuLynx/                          (Drive folder)
├── 00-README.md                   # what this folder is; points back to the repo skill
├── WHO.md                         # accounts, owners, the AccuLynx Agent (Phase 6), personas
├── WHAT.md                        # data surface: jobs, contacts, estimates, financials, supplements, milestones
├── HOW.md                         # ingestion arch (acculynx-sync + pg_cron), registry, sweep harness
├── WHY.md                         # OKR / core value: complete hourly-current multi-location data
├── WHERE.md                       # tables (acculynx_jobs, crm_pipeline, catalog/probe), Supabase project
├── WHEN.md                        # schedule (daily→hourly), watermarks, era-awareness
├── matrices/
│   ├── read-capability-matrix.md  # Phase 1 deliverable (see format below)
│   └── write-capability-matrix.md # placeholder → Phase 4 supersedes docs/37
├── account-registry.md            # human-readable mirror of acculynx_accounts (no secrets)
└── runbooks/                      # placeholder → Phase 3
```

**Repo pointer:** add a reference file the `acculynx-api` skill links to — e.g. `skills/cleverwork-roofer/acculynx-api/reference/knowledge-folder.md` containing the Drive folder URL/ID and a one-line index — and add a "Knowledge Folder" line to `SKILL.md`'s Required Local References. This satisfies "a repo reference points agents to it" without putting any secret in the repo.

## Capability Matrix Doc Format

Recommended location: `docs/65-acculynx-read-capability-matrix.md` (next doc number; pairs with docs/37 write matrix) + mirrored into Drive `matrices/read-capability-matrix.md`. One row per documented GET, reconciled against `openapi-index.json`:

| operationId | Path | Tier | Sandbox status | Real top-level keys | Item keys (collections) | Pagination param | `includes` honored | Reported count | Quirks / delta-from-docs |
|---|---|---|---|---|---|---|---|---|---|
| getJobs | /jobs | A | 200 | count,pageSize,pageStartIndex,items | id,_link,jobName,jobNumber,contacts,currentMilestone,... | recordStartIndex | contact/contacts, initial-appt | 1014 (prod) / TBD (sandbox) | milestone filter case-sensitive; `assignment=unassigned` needed for dead leads |
| getMilestonesForJob | /jobs/{jobId}/milestone-history | B | TBD | … | … | none | — | — | doc path is `/milestone-history`; `/jobs/{id}/milestones/history` 404s (prior probe) |

Status vocabulary: `200` (works) · `404` (path wrong / not on tier) · `400` (bad/missing param) · `401` (key scope) · `empty` (200 but zero items in sandbox) · `unprobeable` (no seed id). Each row's evidence links to a `probe_batch_id`.

## Common Pitfalls

### Pitfall 1: Re-running the prior guessing sweep
**What goes wrong:** Treating the 198-row probe history as "endpoints to re-test" reproduces 133 known 404s against invented paths.
**Why:** prior probing pre-dated a spec-driven checklist.
**Avoid:** drive the sweep from the 86 GETs in `openapi-index.json`, not from historical `acculynx_api_probe` rows. Mark the invented-path rows `deprecated` in the catalog rather than re-probing them.

### Pitfall 2: Probing production by accident
**What goes wrong:** the existing functions default to the production key; a copy-paste runs the sweep against Kansas.
**Avoid:** hard-code a sandbox-only gate in the sweep function (`throw` unless env name == sandbox). Tag every probe row with the source account.

### Pitfall 3: Sparse sandbox data breaks ID chaining
**What goes wrong:** sandbox account may have few/zero jobs, contacts, estimates, or supplements → Tier B/C endpoints return empty or can't be seeded, producing false "unprobeable"/"empty" verdicts.
**Avoid:** record `empty` distinctly from `404`/error; if a Tier-A list returns zero items, note "no seed data in sandbox" in the matrix and (optionally) create disposable sandbox seed records — but seed-creation is a WRITE (defer to Phase 4 unless a minimal read-seed is pre-existing). Confirm sandbox data volume as the first sweep step.

### Pitfall 4: Pagination param mismatch
**What goes wrong:** sending `pageStartIndex` to a `recordStartIndex` endpoint (or vice-versa) silently ignores paging → only page 1 seen, undercounting.
**Avoid:** the driver picks the param per-endpoint from the spec (split documented above).

### Pitfall 5: Write-only paths read as 404
**What goes wrong:** `/jobs/{jobId}/messages` and `/contacts/{contactId}/logs` return 404+`Allow: POST` on GET [CITED: README.md, docs/37]; recording them as "broken read" is wrong — they're write-only by design.
**Avoid:** capture the `Allow` response header; classify `404 + Allow: POST` as `write-only`, not `not-found`. (These are not in the 86 GETs anyway — they appear only as POSTs — so they should not be in the read sweep; note them in the matrix as "no read path exists.")

### Pitfall 6: Milestone filter case-sensitivity & milestone-history path
**What goes wrong:** `GET /jobs?milestones=Approved` is case-sensitive and returns empty silently on mismatch; and the correct history path is `/jobs/{jobId}/milestone-history`, not `/milestones/history` (which 404s) [CITED: README.md + prior probe].
**Avoid:** normalize milestone names against `getMilestones` before filtering; use the spec path verbatim.

### Pitfall 7: Webhook GETs are tier-gated
**What goes wrong:** `/subscriptions` and `/topics` (webhooks base URL) may return non-JSON 404 if the sandbox account lacks webhook tier [CITED: README.md].
**Avoid:** probe them, capture the raw response, and classify `tier-gated` distinctly. Don't block the sweep on them.

## Code Examples

### Per-endpoint pagination param selection (driver core)
```ts
// Source pattern: openapi-index.json parameters list (VERIFIED split)
function paginationParam(op: GetOp): "recordStartIndex" | "pageStartIndex" | null {
  const names = op.parameters.map(p => p.name);
  if (names.includes("recordStartIndex")) return "recordStartIndex";
  if (names.includes("pageStartIndex"))   return "pageStartIndex";
  return null; // unpaginated detail endpoint
}
```

### Sandbox hard gate (enforce Chris's mandate in code)
```ts
const SECRET = "PE_CC_SANDBOX_ACCULYNX_API_KEY";
const key = Deno.env.get(SECRET);
if (!key) throw new Error(`Phase-1 sweep requires ${SECRET}; refusing to run.`);
// never resolve a production PE_CC_* secret in this function
```

### ID chaining via _link / id
```ts
// Source: live jobs probe result_summary.first_item_sample (VERIFIED)
const list = await getJson(`/jobs?pageSize=25&recordStartIndex=0`, key);
const seedJobIds = list.items.slice(0, 3).map((j: any) => j.id); // uuid
// then: GET /jobs/{jobId}/financials -> body.id is the financialsId
const fin = await getJson(`/jobs/${seedJobIds[0]}/financials`, key);
const financialsId = fin.id; // -> /financials/{financialsId}/worksheet
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Repo webhook bridge (`handler.ts`) targeting `public.job`/`public.property` template schema | Live `acculynx-sync` Edge Function → `acculynx_jobs` + `crm_pipeline` | pre-Phase-1 | Plan against the live function; the stub is unused [CITED: PROJECT.md, handler.ts header] |
| Exploratory 198-probe guessing (prod Kansas key, GET+OPTIONS) | Spec-driven 86-GET sandbox sweep with ID chaining | this phase | Replaces guessing with a deterministic checklist |
| Single-key sync (Kansas only) | Registry-driven multi-key fan-out | this phase (registry) + Phase 2 (fan-out) | `acculynx_accounts` is the new driver |

**Deprecated/outdated:**
- Invented probe paths in `acculynx_api_probe` (`/branches`, `/jobs/{id}/materials|notes|photos|tasks|timeline|work-orders`, `/contacts/{id}/communications`): not in OpenAPI V2 — mark deprecated, don't re-probe.
- `endpoint_pattern` snake_case `{job_id}`: reconcile to OpenAPI camelCase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Sandbox account has enough seed data (jobs/contacts/estimates/supplements) to chain Tier B/C | Pitfalls / Harness | If sparse, many endpoints record `empty` not `200` — matrix completeness reduced; may need Phase-4 write-seeding. Verify first sweep step. |
| A2 | Supabase secret names must be `[A-Z0-9_]` → the hyphenated `MULTI-FAMILY_COMMERCIAL` key must be renamed when set as a secret | Registry / Secrets | If hyphen is allowed, no rename needed; if not and unhandled, that key can't be resolved at runtime. Confirm against Supabase secret-name rules. |
| A3 | The probe should be a NEW `acculynx-read-sweep` function (vs. editing `acculynx-endpoint-probe` v1) | Harness | If the team prefers extending v1, adjust; either way the *tables* are extended, not rebuilt. |
| A4 | Reports GETs are unprobeable in Phase 1 (no list endpoint for scheduledReportId) | Checklist Tier C | If a sandbox report id can be supplied, they become probeable — needs a human-provided id. |
| A5 | Google Drive folder creation requires the OAuth bridge / a Workspace persona (no MCP) | Knowledge Folder | If a Google MCP is added to the session/repo, creation is direct. Confirm available tools at plan time. |
| A6 | `acculynx_jobs` etc. were created directly in the live DB (no repo DDL) so probe-table DDL is also absent from `schemas/` | Harness | If DDL exists elsewhere, capturing it into a migration is still good hygiene; doesn't change the plan. |

## Open Questions

1. **Sandbox data volume** — How many jobs/contacts/estimates/supplements does `PE_CC_SANDBOX_ACCULYNX_API_KEY` see? Recommendation: make "Tier A sweep + count seed data" the very first task; branch the plan on the result (rich → full chain; sparse → record `empty` + note for Phase 4 seeding).
2. **Supplements via `jobId` vs company-wide** — `/supplements?jobId={jobId}` vs `/supplements` (company): probe both; record whether the `jobId` filter works in sandbox.
3. **Webhook tier in sandbox** — does `/topics` return JSON? Determines whether `/subscriptions` GETs are probeable.
4. **Should probe-table DDL be captured into a migration?** The live tables have no repo DDL. Recommendation: add a migration (165-companion) that `CREATE TABLE IF NOT EXISTS` matches the live schema, so the repo is the source of truth (idempotent, safe on the already-existing tables).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase project `rnhmvcpsvtqjlffpsayu` | sweep, registry, secrets | ✓ | live | — |
| `supabase` CLI | secrets set, function deploy | ✓ | 2.105.0 | dashboard |
| Edge Functions `acculynx-sync`/`acculynx-api-probe`/`acculynx-endpoint-probe` | harness extension | ✓ | v10/v3/v1 | — |
| `acculynx_api_catalog` / `acculynx_api_probe` | shape capture | ✓ | 28/198 rows | — |
| `acculynx_accounts` table | registry | ✗ | — | **create as migration 165 (this phase)** |
| 9 AccuLynx keys as Supabase secrets | runtime resolution | ✗ (only the sync's single key is set) | — | `supabase secrets set` from `.env`; Phase 1 needs only the sandbox secret |
| Google Workspace MCP | Drive folder creation | ✗ | — | OAuth bridge / Workspace persona / manual (flag as checkpoint) |
| `psql` locally | direct DB introspection | ✗ | — | Supabase REST + service-role key (used for this research) / Supabase MCP |

**Missing with no fallback:** none blocks the phase.
**Missing with fallback:** `acculynx_accounts` (create it), Supabase secrets (set sandbox key), Drive folder (OAuth bridge/manual).

## Validation Architecture

Nyquist validation is **enabled** (no `.planning/config.json` present → default on).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None formal for Edge Functions in-repo. Validation is **assertion-via-DB-query** (REST/SQL against the live probe + catalog tables) plus a TypeScript smoke harness for the driver |
| Config file | none — see Wave 0 |
| Quick run command | REST count query, e.g. `curl .../acculynx_api_catalog?...&Prefer:count=exact` (covered-endpoint count) |
| Full suite command | A SQL/REST reconciliation script: compare distinct probed `endpoint_pattern` against the 86-op checklist |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-02 | `acculynx_accounts` has 9 rows, env-name-only, valid `environment` CHECK | integration (SQL) | `select count(*), array_agg(distinct environment) from acculynx_accounts` → 9 rows, {production,sandbox} | ❌ Wave 0 (table + seed) |
| REQ-02 | No secret value stored in DB or repo | security smoke | `grep -rE 'acculynx.*=.{20,}' schemas/ .planning/` returns nothing; column comment asserts name-only | ❌ Wave 0 |
| REQ-05 | All 86 documented GETs probed against sandbox | integration (reconciliation) | distinct `endpoint_pattern` in probe batch ⊇ 86-op checklist (allowing `empty`/`unprobeable` verdicts) | ❌ Wave 0 (checklist seed + reconciliation query) |
| REQ-05 | Each probe stored real shape (`result_summary` non-null on 200) + pagination evidence | integration (SQL) | `select count(*) from acculynx_api_probe where probe_batch_id=$B and http_status=200 and result_summary is null` = 0 | ✅ (probe table live) |
| REQ-05 | Probe ran against sandbox key only (no prod call) | security smoke | sweep function has the sandbox hard-gate; assert no probe row in batch is tagged a prod account | ❌ Wave 0 (account tagging) |
| REQ-01 | Drive "AccuLynx" folder skeleton exists + repo pointer file resolves | manual + repo smoke | manual: folder URL opens; repo: `test -f skills/cleverwork-roofer/acculynx-api/reference/knowledge-folder.md` and it contains the folder id | ❌ Wave 0 |
| REQ-05 | Read-capability matrix doc exists, reconciled vs spec | repo smoke | `test -f docs/65-acculynx-read-capability-matrix.md`; row count ≈ 86 | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the relevant single-requirement query above (e.g. registry row count after the migration task).
- **Per wave merge:** full reconciliation — probed-endpoints-vs-checklist + matrix-row-count + secret-leak grep.
- **Phase gate:** all four success criteria provably TRUE via SQL/REST + the two manual checks (Drive folder, matrix doc) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `acculynx_get_checklist` seed table (or static checklist file) populated from `openapi-index.json` — the 86 GETs with tier + pagination param + path params.
- [ ] `acculynx_accounts` migration (165) + 9 seed rows.
- [ ] (Recommended) companion `CREATE TABLE IF NOT EXISTS` migration capturing the live `acculynx_api_catalog`/`acculynx_api_probe` DDL into the repo.
- [ ] Reconciliation query/script: distinct probed endpoints vs 86-op checklist.
- [ ] Secret-leak grep as a committed check.
- [ ] No formal Edge-Function unit framework exists; a lightweight Deno smoke test for the driver (pagination-param selection, sandbox gate) is the practical unit-test layer.

## Security Domain

`security_enforcement` is not explicitly false (no config.json) → include.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | AccuLynx Bearer key per account; Supabase service-role for DB; WorkOS for human surfaces (not touched here) |
| V3 Session Management | no | no sessions in this phase |
| V4 Access Control | yes | RLS on `acculynx_accounts`/probe tables; service-role only writes; sandbox-only hard gate in the sweep function |
| V5 Input Validation | yes | path params are server-generated UUIDs from list calls (not user input); `environment` CHECK constraint on registry |
| V6 Cryptography | yes | secrets stay in Supabase secret store (encrypted at rest); never in DB/repo; never logged (truncate-only per Supabase guidance) |
| V7 Logging | yes | probe rows must redact homeowner PII in `payload_sample` (names/addresses present); store shapes not values |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Accidental production probe (mandate breach) | Tampering | Sandbox-only hard gate in function; account-tagged probe rows; verify in CI query |
| Secret leakage into DB/repo/logs | Information Disclosure | Name-only registry column + comment; `.env` gitignored; truncated logging; secret-leak grep |
| PII (homeowner name/address) captured in probe samples | Information Disclosure | Redact/hash values in `payload_sample`; store key shapes only (hard rule 2, SKILL safety) |
| Cross-account key bleed (wrong key for an account) | Spoofing/Tampering | `acculynx_company_id` binding check after probe; Phase-1 touches sandbox only |
| Rate-limit ban from over-fanned probing | DoS (self) | ≤8 req/s pacing, 429 backoff+jitter, single sandbox key in Phase 1 |

## Sources

### Primary (HIGH confidence)
- Live Supabase project `rnhmvcpsvtqjlffpsayu` — REST introspection of `acculynx_api_catalog` (15 cols/28 rows), `acculynx_api_probe` (13 cols/198 rows, method+status distribution, a full 200-row sample), `acculynx_sync_watermark`, and confirmation that `acculynx_accounts` does not exist (2026-06-30).
- `skills/cleverwork-roofer/acculynx-api/reference/openapi-index.json` — parsed via jq: 124 ops (86 GET/19 POST/15 PUT/4 DELETE), per-op path/query params, pagination split, base URLs.
- `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` — phase scope, constraints, live reality.
- `integrations/bridges/acculynx/README.md`, `API.md`, `SOURCES.md`; `skills/cleverwork-roofer/acculynx-api/SKILL.md`; `docs/37-acculynx-write-capability-matrix.md`; `source-index.md` — quirks, pagination, write-only paths, supplements path.
- `docs/18-platform-integrations.md` — Google Workspace OAuth bridge / persona roster; no Google MCP.
- `.env` (key NAMES only, values never read) — 9 confirmed `PE_CC_*_ACCULYNX_API_KEY` names.
- `CLAUDE.md` / repo conventions — hard rules 1/2, migration numbering ceiling (164 → next 165).

### Secondary (MEDIUM confidence)
- apidocs.acculynx.com/docs/rate-limits — 30/s IP, 10/s key, 30s–few-min ban; `Retry-After` not documented (WebSearch-verified against official docs).
- supabase.com/docs/guides/functions/secrets — project-wide secrets, `Deno.env.get`, immediate-availability/rotation (WebSearch-verified against official docs).

### Tertiary (LOW confidence)
- None relied upon.

## Metadata

**Confidence breakdown:**
- GET inventory & checklist: HIGH — parsed directly from the spec.
- Probe/catalog harness: HIGH — live schemas + sample rows introspected.
- Registry & secrets design: HIGH — Supabase docs + confirmed key names; the hyphen-rename is the one MEDIUM detail (A2).
- Sandbox data sufficiency: MEDIUM — not yet measured (A1); first sweep step resolves it.
- Drive folder mechanism: MEDIUM — OAuth bridge confirmed, exact creation tool/path is a planning gate (A5).

**Research date:** 2026-06-30
**Valid until:** 2026-07-30 (AccuLynx V2 surface is stable; re-run the docs refresh if the changelog advances past 2.2611.0).
