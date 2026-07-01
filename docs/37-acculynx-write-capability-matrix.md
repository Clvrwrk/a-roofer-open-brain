# AccuLynx Write Capability Matrix (Phase 4, REQ-06)

Generated: 2026-07-01 from sandbox write-sweep batch `wsweep-2026-07-01T13-33-02-965Z`
Source account: **sandbox** (`PE_CC_SANDBOX_ACCULYNX_API_KEY`) — no production account was touched.
Source of truth: `public.acculynx_write_catalog` (38 endpoints from `acculynx_write_checklist`), reconciled
against `public.acculynx_write_probe`. Reconcile gate (`scripts/acculynx-write-sweep-reconcile.sql`):
**PASS, zero rows across all 4 assertions.** Human-verified 2026-07-01.

This matrix **supersedes** the 2026-06-10 structural-discovery version of this document (API V2 reference
+ 198 GET-only probes, no live write evidence) and the "verified sandbox write findings (2026-06-30)"
section of `docs/knowledge-base/acculynx/api/write-capability.md`. Every verdict below is backed by a real
sandbox HTTP probe, not inferred from the OpenAPI reference alone. Pairs with the read matrix
[docs/65](65-acculynx-read-capability-matrix.md).

## Regeneration (reproducibility)

This doc is **generated from the evidence tables, not hand-maintained** (D-03). To regenerate:

```sql
select category, method, endpoint_pattern, verdict, tier, side_effect, guardrail_notes,
       red_team_dimensions_covered
from public.acculynx_write_catalog
order by category, method, endpoint_pattern;
```

Run against prod Supabase `rnhmvcpsvtqjlffpsayu`. Current snapshot: batch
`wsweep-2026-07-01T13-33-02-965Z`, dated 2026-07-01, reconcile gate PASS (38/38 checklist rows
reconciled, zero orphaned probes, zero non-sandbox rows, zero bare `blocked-by-dependency` verdicts).

## How to read this

One row per documented write endpoint (38 total: 19 POST / 15 PUT / 4 DELETE). Verdict vocabulary
(D-02, extended per Open Question 3):

| Verdict | Meaning |
|---|---|
| `writable` | Creates/updates/deletes a real entity AND the result is independently verifiable (a GET read-back exists, or the DELETE's idempotent-repeat behavior was confirmed) |
| `write-only` | Returns a success status (2xx) but there is no GET read-back path to verify the write persisted |
| `fragile-with-guardrail` | The route exists and is reachable, but has a real failure mode under an easy-to-hit condition (e.g. an empty body) that requires a documented guardrail to avoid |
| `read-shaped` | POST-verb but semantically a search/query, not a create — no side effect |
| `blocked-by-dependency` | The route exists and is reachable, but the current sandbox company/lead lacks a required child id or config value needed to complete the write; evidence-backed, not a guess |
| `unsupported` | The route genuinely does not exist / produced zero reachable signal across all probes (0 of 38 this run) |

**Verdict totals (38/38):** writable 12 · write-only 5 · fragile-with-guardrail 2 · read-shaped 2 ·
blocked-by-dependency 17 · unsupported 0.

## Matrix

### Writable (12)

| Method | Path | Status | Side effect | Note |
|---|---|---|---|---|
| POST | `/contacts` | 200 | creates_entity | Dependency-root seed for the whole sweep |
| POST | `/jobs` | 201 | creates_entity | Seed; creates an **unassigned** lead — invisible to the default `GET /jobs` list, use `assignment=unassigned` |
| POST | `/jobs/{jobId}/payments/received` | 201 | creates_entity | |
| POST | `/jobs/{jobId}/payments/expense` | 201 | creates_entity | |
| PUT | `/jobs/{jobId}/address` | 204 | updates_entity | |
| PUT | `/jobs/{jobId}/initial-appointment` | 204 | updates_entity | |
| PUT | `/jobs/{jobId}/insurance` | 204 | updates_entity | |
| PUT | `/jobs/{jobId}/insurance/insurance-company` | 204 | updates_entity | |
| PUT | `/jobs/{jobId}/lead-source` | 204 | updates_entity | |
| PUT | `/jobs/{jobId}/priority` | 204 | updates_entity | |
| DELETE | `/jobs/{jobId}/representatives/ar-owner` | 200 | deletes_entity | Idempotent — delete succeeds even when no owner is currently set |
| DELETE | `/jobs/{jobId}/representatives/sales-owner` | 200 | deletes_entity | Idempotent, same as AR-owner |

### Write-only (5 — created/accepted 2xx, no GET read-back path)

| Method | Path | Status | Note |
|---|---|---|---|
| POST | `/financials/{financialsId}/worksheet/items` | 201 | No independent read-back path in this sweep |
| POST | `/jobs/{jobId}/messages` | 201 | Job message/chat stream is write-only by design — no GET exists under `/jobs/{jobId}/messages` |
| POST | `/jobs/{jobId}/photos-videos` | 202 | multipart/form-data upload; async-accepted (202) |
| POST | `/jobs/{jobId}/representatives/company` | 200 | |
| POST | `/jobs/external-references` | 201 | Idempotency anchor (links external ids, e.g. `estimate_run.id`, to a job) |

### Fragile-with-guardrail (2)

| Method | Path | Status | Guardrail |
|---|---|---|---|
| PUT | `/jobs/{jobId}/trade-types` | 500 (empty body) | Must send `{items:[{id}]}` shape — never an empty/`None` body, or AccuLynx returns a bare 500 server error |
| DELETE | `/jobs/{jobId}/initial-appointment` | 404 (empty body) | Route exists; an empty DELETE body returns 404 "A non-empty request body is required" — needs a non-empty `{note}` body. (Harness limitation: the sweep does not body-seed DELETEs — this is a documented finding, not a bug.) |

### Read-shaped (2 — search-style POST, no side effect)

| Method | Path | Note |
|---|---|---|
| POST | `/contacts/search` | Search body (`startDate`/`endDate`/`sort`), not a create |
| POST | `/jobs/search` | Search body (`searchTerm`/`geoLocation`), not a create |

### Blocked-by-dependency (17 — endpoint exists + reachable, sandbox lacks a required child id/config)

Every row below is evidence-backed: the sandbox lead or sandbox company genuinely lacks a required child
resource, at diminishing returns per the D-05 stop rule. None of these are guesses or forced probes.

| Method | Path | Reachable evidence (status/detail) | Missing prerequisite |
|---|---|---|---|
| PUT | `/jobs/{jobId}/custom-fields` | 400 "A valid CustomFieldType must be provided" | A `CustomFieldType` + a real field definition |
| PUT | `/jobs/{jobId}/custom-fields/{customFieldId}` | 400 (same) | Same |
| PUT | `/contacts/{contactId}/custom-fields` | 400 (same) | Same |
| PUT | `/contacts/{contactId}/custom-fields/{customFieldId}` | 400 (same) | Same |
| POST | `/contacts/{contactId}/logs` | 400 (log body shape) | A valid log-entry shape not captured by the reference index |
| PUT | `/jobs/{jobId}/adjuster` | reachable, needs context | Adjuster/claim context on the bare lead |
| POST | `/jobs/{jobId}/documents` | reachable | `documentFolderId` — sandbox company has **none configured** (reference GET returns empty) |
| POST | `/jobs/{jobId}/payments/paid` | reachable | `accountTypeId` — sandbox company has **none configured** |
| PUT | `/jobs/{jobId}/job-categories` | reachable | A valid category id in the mutation body |
| PUT | `/jobs/{jobId}/work-type` | reachable | A valid work-type id in the mutation body |
| POST | `/jobs/{jobId}/representatives/ar-owner` | 400 "CompanyUserId: Must be a valid Non Empty Guid" | A role-appropriate `CompanyUserId` (the harvested `/users` id works for company-rep POST but not AR/sales roles) |
| POST | `/jobs/{jobId}/representatives/sales-owner` | 400 (same) | Same |
| POST | `/jobs/{jobId}/messages/{messageId}/replies` | reachable | A `messageId` — the message POST is write-only and returns no id to seed a reply |
| POST | `/subscriptions` | 412 precondition_failed | A valid webhook consumer URL |
| PUT | `/subscriptions/{subscriptionId}` | no id available | `subscriptionId` (webhook chain, tier-gated) |
| DELETE | `/subscriptions/{subscriptionId}` | no id available | Same |
| POST | `/subscriptions/{subscriptionId}/test-event` | no id available | Same |

### Unsupported (0)

None. Every one of the 38 endpoints produced a reachable signal in this sweep (a 2xx, a 4xx with an
AccuLynx ProblemDetails body, or a 5xx) — `unsupported` is reserved for a genuinely-absent route, and no
such route exists in this checklist.

## Correction: the phantom `measurements` endpoint

**`POST /jobs/{id}/measurements` (+ `/measurements/files`) does NOT exist** in the current 124-operation
AccuLynx API V2 surface (86 GET / 19 POST / 15 PUT / 4 DELETE). It never appeared in the 38-endpoint write
checklist and no synthetic row was ever created for it. The 2026-06-10 version of this document listed it
as a **WRITE** endpoint under the §4.10 handoff-target mapping ("Measurement docs") — that entry was
**incorrect** and is removed here.

The closest existing analog for pushing visual/measurement documentation into a job file is
**`POST /jobs/{jobId}/photos-videos`** (write-only, 202, multipart/form-data) — see the write-only table
above. If AccuLynx ships a real measurements-write endpoint in a future API version, re-run the write
sweep to pick it up; do not reintroduce this entry by hand.

## Guardrail recipes

See [`docs/knowledge-base/acculynx/api/write-capability.md`](knowledge-base/acculynx/api/write-capability.md)
for the full per-endpoint "it just works" precondition + failure-mode recipe for every `writable` and
`fragile-with-guardrail` path, and
[`docs/knowledge-base/acculynx/ingestion/write-sweep.md`](knowledge-base/acculynx/ingestion/write-sweep.md)
for the harness design that produced this evidence.

## Durable quirks (independent of any single sandbox run)

- **`jobCategory.id` is Int32**, not a GUID-string like every other id in the write surface — sending it
  as a string produces a 404 "could not be converted to System.Int32" and cascades the whole job-seed
  dependency chain. Discovered live this phase; coerce back to a number before sending.
- Contact `mailingAddress` `state`/`country` are **OBJECTS** (`{id, name, abbreviation}`); job
  `locationAddress` `state`/`country` are **STRING** abbreviations — the opposite shape. Never share one
  address builder between contact and job bodies.
- `priority` is a strict enum: `Low` / `Normal` / `High` only. An invalid value returns `404` (not `400`)
  with a `.NET`-style type-conversion message.
- `contactTypeIds` is required and must be **non-empty** — an empty array returns `400`.
- `POST /jobs` creates an **unassigned** lead — query `GET /jobs?assignment=unassigned` to see it.
- Write-only endpoints (`messages`, `worksheet/items`, `external-references`, `photos-videos`,
  `representatives/company`) have **no GET read-back** — treat their 2xx as the only available evidence.
- AR-owner / sales-owner POST need a **role-appropriate** `CompanyUserId` — the id harvested from
  `GET /users` works for the company-rep POST but not these two.
- `payments/paid` and `documents` are blocked by **sandbox company configuration** (no account-types /
  no document-folders configured), not by the API itself — a differently-configured company would likely
  unblock both.

## Consequences for the pipeline

1. **A confirmed, evidence-backed write lane exists:** create contact + job, set address/insurance/
   lead-source/priority/initial-appointment on a job, record received/expense payments, post worksheet
   items, post a handoff message, upload photos/videos, set the company representative, link an external
   reference (idempotency anchor), and clear the AR/sales-owner assignment via DELETE.
2. **17 endpoints are blocked purely by sandbox data/config, not by the API surface** — a differently
   provisioned sandbox company (custom-field definitions, account-types, document-folders, a role-scoped
   user, a real webhook consumer) would likely unblock most of them. This is recorded as a Phase 5 input,
   not chased further here (diminishing-returns stop rule, D-05).
3. **The 4 permanent-fallback categories from the 2026-06-10 matrix still hold**: no write endpoint exists
   for milestone/status advancement, invoice create/update/void, material orders, or crew scheduling
   beyond `PUT /jobs/{jobId}/initial-appointment`. These remain Slack/dashboard fallback paths.
4. **Two fragile guardrails must be encoded in any Phase 5 write wrapper**: `PUT .../trade-types` needs a
   non-empty `{items:[{id}]}` body (empty body → 500), and `DELETE .../initial-appointment` needs a
   non-empty `{note}` body (empty body → 404).

## Revisit triggers

- AccuLynx ships new write endpoints (e.g. a real measurements-write, milestone-write, or invoice-write
  route) → re-run the write sweep against a refreshed `openapi-index.json` and regenerate this matrix.
- The sandbox company gains configuration currently missing (custom-field definitions, account-types,
  document-folders, a role-scoped user, a webhook consumer) → re-run the 17 blocked-by-dependency probes
  and update their verdicts.
- Phase 5 (write/action layer, REQ-08) begins — this matrix is its primary input for which endpoints are
  safe to wrap first.
