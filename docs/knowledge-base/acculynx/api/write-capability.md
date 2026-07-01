---
type: Reference
title: AccuLynx Write Capability
description: The 38 documented write operations (19 POST / 15 PUT / 4 DELETE) and their live sandbox verdicts.
resource: https://apidocs.acculynx.com/reference
tags: [acculynx, api, write, post, put, delete, capability-matrix, guardrails]
timestamp: 2026-07-01T00:00:00Z
---

The AccuLynx API V2 write surface is **38 operations: 19 POST / 15 PUT / 4 DELETE** (of the full
124-operation surface: 86 GET / 19 POST / 15 PUT / 4 DELETE). This concept covers the writes. The
authoritative, per-endpoint matrix lives at
**[docs/37](../../../37-acculynx-write-capability-matrix.md)**, generated from the sandbox
[write sweep](../ingestion/write-sweep.md) batch `wsweep-2026-07-01T13-33-02-965Z` and reconciled
against `acculynx_write_checklist`. Reconcile gate: **PASS, zero rows** (38/38 endpoints reconciled).

> **Safety:** every write is production-impacting. POST/PUT/PATCH/DELETE require explicit human approval
> before ever running against a production account. This phase (4) tested all 38 writes in the
> **sandbox only** — no production write has occurred as part of this evidence.

## Regeneration

This doc — like docs/37 — is generated from `public.acculynx_write_catalog`, not hand-maintained:

```sql
select category, method, endpoint_pattern, verdict, tier, side_effect, guardrail_notes,
       red_team_dimensions_covered
from public.acculynx_write_catalog
order by category, method, endpoint_pattern;
```

## Verdict totals (38/38, batch `wsweep-2026-07-01T13-33-02-965Z`, 2026-07-01)

| Verdict | Count |
|---|---|
| writable | 12 |
| write-only | 5 |
| fragile-with-guardrail | 2 |
| read-shaped | 2 |
| blocked-by-dependency | 17 |
| unsupported | 0 |

# Writable (12) — confirmed by live sandbox probe

- `POST /contacts` — creates a contact (dependency-root seed)
- `POST /jobs` — creates a job (**creates an UNASSIGNED lead** — query `assignment=unassigned` to find it)
- `POST /jobs/{jobId}/payments/received`
- `POST /jobs/{jobId}/payments/expense`
- `PUT /jobs/{jobId}/address`
- `PUT /jobs/{jobId}/initial-appointment`
- `PUT /jobs/{jobId}/insurance`
- `PUT /jobs/{jobId}/insurance/insurance-company`
- `PUT /jobs/{jobId}/lead-source`
- `PUT /jobs/{jobId}/priority`
- `DELETE /jobs/{jobId}/representatives/ar-owner` (idempotent — succeeds even with no owner set)
- `DELETE /jobs/{jobId}/representatives/sales-owner` (idempotent)

# Write-only (5) — 2xx confirmed, no GET read-back path

- `POST /financials/{financialsId}/worksheet/items`
- `POST /jobs/{jobId}/messages` — job message/chat stream is write-only by design; no GET exists
- `POST /jobs/{jobId}/photos-videos` — multipart/form-data upload, 202 accepted
- `POST /jobs/{jobId}/representatives/company`
- `POST /jobs/external-references` — idempotency anchor

# Fragile-with-guardrail (2)

- `PUT /jobs/{jobId}/trade-types` — an empty body returns a bare `500` server error; **must** send
  `{items:[{id}]}`.
- `DELETE /jobs/{jobId}/initial-appointment` — the route exists, but an empty DELETE body returns `404`
  "A non-empty request body is required"; needs a non-empty `{note}` body. (This is a harness limitation
  in this sweep — DELETEs weren't body-seeded — documented as a real finding, not a bug.)

# Read-shaped (2) — POST-verb, no side effect

- `POST /contacts/search`
- `POST /jobs/search`

# Blocked-by-dependency (17) — route exists + reachable, sandbox lacks a required child id/config

Full detail with the reachable-evidence status code and the exact missing prerequisite lives in
[docs/37](../../../37-acculynx-write-capability-matrix.md#blocked-by-dependency-17--endpoint-exists--reachable-sandbox-lacks-a-required-child-idconfig).
Summary of blocking causes:

- Custom-fields writes (job + contact, both the bulk PUT and the single-field PUT) need a real
  `CustomFieldType` + field definition.
- `POST /contacts/{contactId}/logs` needs a log-entry body shape not captured in the reference index.
- `PUT /jobs/{jobId}/adjuster` needs adjuster/claim context that doesn't exist on a bare lead.
- `POST /jobs/{jobId}/documents` needs a `documentFolderId` — **the sandbox company has none configured.**
- `POST /jobs/{jobId}/payments/paid` needs an `accountTypeId` — **the sandbox company has none configured.**
- `PUT /jobs/{jobId}/job-categories` / `PUT /jobs/{jobId}/work-type` need a valid category/type id in the
  mutation body.
- `POST /jobs/{jobId}/representatives/ar-owner` / `.../sales-owner` need a **role-appropriate**
  `CompanyUserId` — the id harvested from `GET /users` works for the company-rep POST but not these roles.
- `POST /jobs/{jobId}/messages/{messageId}/replies` needs a `messageId` — the parent message POST is
  write-only and returns no id to seed a reply.
- The webhook subscription chain (`POST /subscriptions`, `PUT/DELETE /subscriptions/{id}`,
  `POST /subscriptions/{id}/test-event`) needs a valid webhook consumer URL (`POST /subscriptions` returns
  `412 precondition_failed` without one) — tier-gated.

**None of these are guesses.** Every blocked-by-dependency row carries the specific reachable status/error
that proves the route exists and names the exact missing prerequisite (the reconcile gate enforces this —
no bare `blocked-by-dependency` verdict is allowed).

# Unsupported (0)

No genuinely-absent route exists in the 38-endpoint write surface. See the correction below for the one
historically-claimed write endpoint that turned out not to exist.

# Correction: the phantom `measurements` endpoint

`POST /jobs/{id}/measurements` (+ `/measurements/files`) **does not exist** in the current
124-operation API V2 surface. It was listed as a WRITE endpoint in the pre-Phase-4 (2026-06-10) version of
docs/37 under the §4.10 "Measurement docs" handoff target — that entry was wrong and has been removed.
The closest existing analog for pushing visual documentation to a job file is
`POST /jobs/{jobId}/photos-videos` (write-only, listed above).

# Guardrail recipes (it-just-works preconditions + failure modes)

Every `writable` and `fragile-with-guardrail` endpoint below has a documented precondition set and known
failure mode, sourced from the live sandbox probe evidence (`acculynx_write_probe`, batch
`wsweep-2026-07-01T13-33-02-965Z`).

### `POST /contacts`

- **It just works when:** `contactTypeIds` is a **non-empty** array of valid contact-type ids;
  `mailingAddress`/`billingAddress` (if present) use **object-shaped** `state`/`country`
  (`{id, name, abbreviation}` — NOT strings).
- **Failure modes:**
  - `contactTypeIds: []` → `400` `"ContactTypeIds Must contain at least one item."`
  - `mailingAddress.state` sent as a string → `4xx` `.NET` type-conversion error
    ("could not be converted to ... State").
  - Messy/malformed strings (misspelled names, inconsistent phone formats) are **accepted, not
    validated** — the API does no format normalization; downstream data-quality handling is required.

### `POST /jobs`

- **It just works when:** `contact.id` references a contact that already exists (created via
  `POST /contacts` first); `locationAddress.state`/`country` use **STRING** abbreviations (the *opposite*
  shape from contact addresses); `jobCategory.id` is sent as a **number** (Int32), not a string;
  `priority` is exactly `"Low"`, `"Normal"`, or `"High"`.
- **Failure modes:**
  - `jobCategory.id` sent as a string (e.g. `"2"`) → `404` "could not be converted to System.Int32" — this
    is a durable AccuLynx quirk (`jobCategory.id` is Int32, unlike every other GUID-string id in the
    surface) and cascades the whole job-seed dependency chain if not coerced back to a number.
  - `locationAddress.state` sent as an object (contact-shape) → `4xx` type-conversion error.
  - `priority` set to any value outside the enum (e.g. `"Urgent"`) → `404`
    "could not be converted to ... JobPriority" (a `404`, not a `400` — the AccuLynx-specific tell for a
    failed strict-enum model bind).
  - **Side effect to expect, not a failure:** the created job is an **unassigned lead**, invisible to the
    default `GET /jobs` list — query `?assignment=unassigned` to find it.

### `POST /jobs/{jobId}/payments/received` and `POST /jobs/{jobId}/payments/expense`

- **It just works when:** `jobId` is a real job id; no other formally-required body fields observed.
- **Failure modes:** none observed beyond standard 400/404 on a malformed/foreign `jobId`.

### `PUT /jobs/{jobId}/address`

- **It just works when:** the body is flat — `street1`/`street2`/`city`/`state`/`country`/`zipCode` — all
  **STRINGS** (same convention as `POST /jobs`'s `locationAddress`, never the contact-address object
  shape).
- **Failure modes:** sending object-shaped `state`/`country` (contact convention) → `4xx` type-conversion
  error, matching Pitfall 1 in the write-sweep design (address-shape asymmetry).

### `PUT /jobs/{jobId}/initial-appointment`

- **It just works when:** `startDate`/`endDate`/`notes` are provided in a well-formed body against a real
  `jobId`.
- **Failure modes:** none observed on the PUT itself. **Note the asymmetry with its DELETE sibling below**
  — the PUT accepts an empty-ish body fine, but the DELETE does not.

### `PUT /jobs/{jobId}/insurance` and `PUT /jobs/{jobId}/insurance/insurance-company`

- **It just works when:** called against a real `jobId`; the OpenAPI index shows no strictly-required
  top-level properties for `insurance`, and `insuranceCompanyId`/`insuranceCompanyName` for the
  insurance-company variant.
- **Failure modes:** none observed beyond standard 400/404 on a malformed/foreign `jobId` or company id.

### `PUT /jobs/{jobId}/lead-source`

- **It just works when:** `id` references a valid lead-source id (from
  `GET /company-settings/leads/lead-sources`).
- **Failure modes:** a foreign/invalid `id` → standard 400/404.

### `PUT /jobs/{jobId}/priority`

- **It just works when:** `priority` is exactly `"Low"`, `"Normal"`, or `"High"` (case-sensitive strict
  enum).
- **Failure modes:** any other value (e.g. `"Urgent"`, `"Medium"`, `"None"`) → `404`
  "could not be converted to ... JobPriority" — a `404` for what looks like a validation error is the
  AccuLynx-specific tell.

### `DELETE /jobs/{jobId}/representatives/ar-owner` and `DELETE /jobs/{jobId}/representatives/sales-owner`

- **It just works when:** called against a real `jobId` — **idempotent**: the delete succeeds (`200`)
  even when no AR/sales owner is currently set on the job.
- **Failure modes:** none observed; safe to call repeatedly / defensively.

### `PUT /jobs/{jobId}/trade-types` (fragile-with-guardrail)

- **It just works when:** the body is shaped `{items:[{id}]}` with valid trade-type ids (from
  `GET /company-settings/job-file-settings/trade-types`).
- **Failure mode (guardrail):** an **empty or `None` body** returns a bare `500` server error, not a
  `400`. Any wrapper around this endpoint must guarantee a non-empty `items` array is always sent — never
  pass through an empty/absent body.

### `DELETE /jobs/{jobId}/initial-appointment` (fragile-with-guardrail)

- **It just works when:** a **non-empty body** with a `{note}` field is sent alongside the DELETE.
- **Failure mode (guardrail):** an empty DELETE body returns `404` "A non-empty request body is required"
  — the route exists (this is reachable-route evidence, not `unsupported`), it just requires a body most
  DELETE clients don't send by default. A wrapper must always attach `{note}` to this DELETE.

### Write-only endpoints (recipe note)

`POST /financials/{financialsId}/worksheet/items`, `POST /jobs/{jobId}/messages`,
`POST /jobs/{jobId}/photos-videos`, `POST /jobs/{jobId}/representatives/company`, and
`POST /jobs/external-references` all return a 2xx with no independent GET to confirm the write persisted
exactly as sent. **Guardrail:** treat the 2xx + any echoed response body as the only available evidence;
do not build a Phase-5 wrapper that assumes a follow-up GET can confirm these writes — log the request and
response at write time instead.

# Citations

[1] [Write-capability matrix (docs/37)](../../../37-acculynx-write-capability-matrix.md)
[2] [Read Capability](read-capability.md)
[3] [Write-sweep harness design](../ingestion/write-sweep.md)
[4] `scripts/seed-sandbox-from-wichita.mjs` (prior-art sandbox seeder; superseded as the evidence source by the write sweep)
