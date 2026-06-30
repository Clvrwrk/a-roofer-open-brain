---
type: Reference
title: AccuLynx Write Capability
description: What can be written back to AccuLynx via API V2, and what is permanently human-only.
resource: https://apidocs.acculynx.com/reference
tags: [acculynx, api, write, post, put, capability-matrix]
timestamp: 2026-06-30T00:00:00Z
---

The write surface is **19 POST / 15 PUT / 4 DELETE**. The capability verdicts below are
from prior discovery (198 GET/OPTIONS probes + the V2 reference); they will be
**re-verified against the sandbox in Phase 4** (write red-team) and superseded by an
evidence-based matrix. Authoritative reference today:
**[docs/37](../../../37-acculynx-write-capability-matrix.md)**.

> **Safety:** every write is production-impacting. POST/PUT/PATCH/DELETE require
> explicit human approval. Phase 4 tests all writes in the **sandbox** only.

# Writable (once a write-scoped key is wired)

- Create contact + job (`POST /contacts`, `POST /jobs`)
- Job custom fields (`PUT /jobs/{id}/custom-fields`, bulk)
- External reference (`POST /jobs/external-references`) — idempotency anchor
- Worksheet items (`POST /financials/{id}/worksheet/items`)
- Payments (`POST /jobs/{id}/payments/received|paid|expense`)
- Documents / photos (`POST /jobs/{id}/documents`, `/photos-videos`)
- Job message (`POST /jobs/{id}/messages` — **write-only**, GET returns 404+Allow:POST)
- Sales owner / company rep (`POST /jobs/{id}/representatives/...`)

# NOT writable (permanent human/Slack fallback)

- **Milestone / status** moves — no write endpoint exists
- **Invoice** create/update/void — read-only
- **Material orders** — no endpoint exists
- **Crew scheduling** — only `PUT /jobs/{id}/initial-appointment`

# Verified sandbox write findings (2026-06-30)

First live writes against the **sandbox** account (seeding 51 anonymized Wichita records):

- **`POST /contacts` → `200`** works. Body: `contactTypeIds:[<id>]`, `firstName`, `lastName`,
  `phoneNumbers:[{number, type, primary}]`, `emailAddresses:[{address, type, primary}]`,
  `mailingAddress` where **`state` and `country` are OBJECTS** (`{id, name, abbreviation}`).
- **`POST /jobs` → `201`** works. Required `contact:{id}`; plus `locationAddress`, `jobCategory:{id}`,
  `tradeTypes:[{id}]`, `leadSource:{id}`, `priority`. **Quirk:** job `locationAddress.state`/`country`
  must be **STRINGS** (abbreviation) — the *opposite* of contact `mailingAddress` (objects). Sending
  the wrong shape returns a precise 4xx ("could not be converted to … State" / "to System.String").
- **Quirk:** `POST /jobs` creates an **unassigned lead** — excluded from the default `GET /jobs` list;
  use `assignment=unassigned` to see newly-created jobs.
- **`POST /jobs/{id}/messages` → `200`** works — the job message/"chat" stream IS writable (write-only;
  no read GET). Body `{message}`.
- **Implication:** API-created jobs are bare leads (no financials/estimates/invoices), and milestone
  advancement has **no write endpoint** — so financial/estimate read endpoints can't be deepened by
  seeding alone. Phase 4 red-teams the full write surface and supersedes docs/37.

## Validation behavior (error-handling review, 2026-06-30)

From a "messy" seed (varied/misspelled/inconsistent inputs) of ~50 records:

- **`priority` is a strict enum** — valid: `Low`, `Normal`, `High`. Invalid values (e.g. `Urgent`,
  `Medium`, `None`) return `404` with a precise `"could not be converted to … JobPriority"` body.
- **`contactTypeIds` is required** — an empty array returns `400` `"ContactTypeIds Must contain at
  least one item."`
- **Messy strings are ACCEPTED, not validated** — inconsistent phone formats (`(316) 555-0142`,
  `316.555.0143`, `3165550144`, `+1 …`), mixed-case / misspelled cities (`WICHITA`, `wichta`),
  misspelled names, and typo'd notes all persist as-is. The API does **no** format normalization on
  name/phone/note/address strings → **dashboard data quality must handle human inconsistency** (this
  is exactly why normalization + webhook-driven validation matter for the executive dashboard).
- Webhook tier IS available in the sandbox (`/topics` → 200); `POST /jobs` fires `job_created`.

# Citations

[1] [Write-capability matrix (docs/37)](../../../37-acculynx-write-capability-matrix.md)
[2] [Read Capability](read-capability.md)
[3] `scripts/seed-sandbox-from-wichita.mjs` (sandbox seeder)
