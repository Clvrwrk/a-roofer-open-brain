# Bridge Layer — Cleverwork Roofer Brain

The bridge layer is how external operational systems feed the brain. Every bridge is an **adapter**: it
ingests data from a source system and produces **atoms** conforming to `public.thoughts` (plus the
property-first extension columns in `schemas/cleverwork-roofer/`) along with resolved or created rows in
`public.property`, `public.job`, `public.insurance_claim`, and `public.manufacturer_warranty`.

The brain does **not** replace source systems. AccuLynx remains the operational truth for job management.
QuickBooks remains the financial truth. The brain is the persistent memory layer that runs alongside them,
atomizing knowledge as it is created.

Supplier API planning references now live alongside operational bridge specs:

- [ABC Supply](abc-supply/README.md) - public endpoint docs for account, branch, product, pricing,
  order, notification, and invoice APIs.
- [SRS / RoofHub SIPS](srs-roofhub/README.md) - public endpoint docs for SRS/RoofHub ordering,
  product, pricing, branch, delivery, and invoice APIs.
- [QXO](qxo/README.md) - public capability map plus gated-doc questions; endpoint-level docs are not
  public.
- [AccuLynx source provenance](acculynx/SOURCES.md) - source-linked endpoint assumptions for the
  existing AccuLynx bridge.

---

## 1. The Four-Tier Taxonomy

| Tier | Description | Implementation Pattern | Examples |
|------|-------------|------------------------|---------|
| **Tier 1** — Modern SaaS with API | Webhook receiver + scheduled REST pull | Deno MCP container; subscribe to webhook topics, pull missing records on schedule | AccuLynx, CompanyCam, QuickBooks Online, StartInfinity, EagleView |
| **Tier 2** — Modern SaaS without API | Chrome MCP automation | Headless browser session via `Claude in Chrome`; scheduled scrape with client consent | Niche regional PM tools; older CRM tiers behind enterprise paywalls |
| **Tier 3** — On-prem with API | REST or ODBC client on client network | Small on-prem service pushes change payloads to a brain MCP container endpoint | QuickBooks Desktop (QBFC/IIF), Sage 100, Sage 300 |
| **Tier 4** — On-prem without API | Flat-file CLI + optional OCR pre-step | Windows-compatible binary reads `.dbf`/fixed-width files; exports canonical JSON; pushes via authenticated endpoint | DOS job tracking, custom Access databases, paper Travelers with OCR |

**Tier 4 is explicitly out of scope for the roofing vertical.** The roofer shortlist is all Tier 1.
Tier 4 is documented in `docs/00-architecture-brief.md §3.2` for the manufacturing segment and is not
implemented here.

---

## 2. The Adapter Contract

Every bridge adapter is responsible for producing output that satisfies this contract. See
`_template/contract.md` for the full field-mapping skeleton.

### Atoms (`public.thoughts` + extensions)

Every atom emitted by a bridge must set:

| Field | Requirement |
|-------|-------------|
| `content` | Human-readable summary of the fact being captured |
| `metadata` | JSONB — at minimum `{source_system, external_id, ingested_at, bridge_tier}` |
| `model_card` | `{provider: "bridge", model_name: "<adapter-slug>", model_version: "<semver>", captured_at: "<ISO8601>"}` |
| `trust_tier` | `"evidence"` default; `"instruction"` only for human-confirmed records (signed change orders, approved invoices, warranty registrations) |
| `property_id` | UUID — must resolve or create a `public.property` row from address/parcel in the source record |
| `client_id` | UUID — always `'self'` in single-tenant deployment |
| `job_id` | UUID — when the atom is about a specific engagement; resolve via `source_system` + `external_ref` |
| `content_fingerprint` | SHA-256 of `{source_system}:{external_id}:{field_key}:{value}` — enables idempotency |
| `cold_archive_status` | `"live"` default |
| `consent_flags` | `{cross_client_shareable: true, trade_restriction: ["roofing"], publishable_external: false}` — default for operational data |
| `source_type` | `"captured"` for bridge-ingested atoms |

Optional but strongly recommended when available:

| Field | When to set |
|-------|-------------|
| `era_of_practice` | For historical imports; `null` for current operational data |
| `original_capture_date` | When the underlying fact predates ingestion (e.g. a job opened last year) |
| `eeat_signal` | On atoms with published potential (photos with before/after narrative, completed scope descriptions) |
| `soft_or_hard` | `"hard"` for technical/financial/code atoms; `"soft"` for relational/narrative atoms |
| `regulatory_snapshot_id` | When the atom references a code standard or permit condition |

### Property Resolution

Every adapter that touches a record with an address must:

1. Normalize the address (trim whitespace, upper-case state abbreviation, strip unit prefixes).
2. Query `public.property` using the GIN index on `(lower(address_line1), lower(city), postal_code)`.
3. If a match exists, use its `property_id`.
4. If no match exists, create a new `public.property` row from the source address fields, then use the
   new `property_id`.
5. If a `parcel_id` is available in the source, use the unique index on `parcel_id` as the primary
   lookup; fall back to address match.

Property resolution is **upsert-safe**: the unique indexes on `property` prevent duplicate rows.

### Job Resolution

1. Look up `public.job` by `(source_system, external_ref)` using `idx_job_external`.
2. If found, use the existing `job_id`. Update `job_phase`, `closed_at`, `contract_amount`, and
   `scope_summary` if they have changed.
3. If not found, insert a new `public.job` row, carrying `property_id`, `external_ref`,
   `source_system`, and `job_phase` inferred from the milestone mapping (see per-adapter `mapping.md`).

### model_card

Every adapter sets its own model card. The `model_name` is the adapter slug (e.g. `"acculynx-bridge"`).
The `model_version` follows semver and must be bumped when the adapter's normalization logic changes in
a way that would produce different atom content from the same source payload.

```json
{
  "provider": "bridge",
  "model_name": "acculynx-bridge",
  "model_version": "1.0.0",
  "captured_at": "2026-05-29T14:00:00Z"
}
```

### trust_tier Rules

| Source record type | trust_tier |
|-------------------|------------|
| Any API-sourced operational record (job, contact, milestone) | `"evidence"` |
| Approved invoice (`invoice_updated` with status = approved) | `"instruction"` |
| Signed change order / supplement approval | `"instruction"` |
| Manufacturer warranty registration confirmed by manufacturer | `"instruction"` |
| Model-inferred classification (e.g. scope category) | `"inference"` |

Promotion from `evidence` to `instruction` requires the source system to have a human-confirmed approval
state. The bridge should not promote speculatively.

### Idempotency via content_fingerprint

Every atom write uses an upsert keyed on `content_fingerprint`. If a webhook replays the same event
(AccuLynx guarantees at-least-once delivery), the second write is a no-op. The fingerprint algorithm:

```
SHA-256( source_system + ":" + external_id + ":" + field_key + ":" + canonical_value )
```

where `canonical_value` is the normalized, serialized field value (numbers as fixed-decimal strings;
dates as ISO 8601 UTC; arrays as sorted JSON).

### Webhook Signature Verification

All Tier 1 adapters that receive webhooks must verify the request signature before processing.
AccuLynx delivers a `secret` when a subscription is created. Store this in `.env` (name it per
`config/.env.example`) and verify on every inbound request. Reject with HTTP 401 on mismatch.
Never log the raw secret.

### Error and Retry

- Return HTTP 200 to the webhook source within **10 seconds** (AccuLynx timeout). Offload heavy
  processing to a Supabase queue or Deno KV task.
- On processing errors, write to an `integration_errors` metadata key and re-queue; do not lose
  the event.
- On rate-limit (HTTP 429 from source), back off exponentially: 1s, 2s, 4s, 8s, cap at 60s.
- On source API 5xx, retry up to 5 times with exponential backoff; after 5 failures, write an
  `integration_error` atom and page Conductor.

---

## 3. Roofer Shortlist + Priority

Priority reflects the share of a typical roofer's critical operational data that lives in each system.

| Priority | Bridge | Tier | Why It Matters |
|----------|--------|------|---------------|
| 1 | **AccuLynx** | 1 | Primary PM tool. Leads, jobs, milestones, contacts, insurance, estimates, financials, photos, documents. The largest single source of operational atoms. |
| 2 | **CompanyCam** | 1 | Job-site photography. Before/after photo sets are the most powerful EEAT signal a roofer can produce. Also primary evidence for insurance supplement claims. |
| 3 | **QuickBooks Online** | 1 | Invoices, payments, job costing, insurance supplement accounting. Closes the financial loop that AccuLynx opens. |
| 4 | **StartInfinity** | 1 | Kanban-style project management; used by some Cleverwork clients alongside or instead of AccuLynx. Lower specificity for roofing but important for Cleverwork's multi-client template. |
| 5 | **EagleView** | 1 | Aerial roof measurement reports. Square footage, pitch, facets, ridges, valleys, hips — the measurement artifacts that drive estimate accuracy and insurance supplement negotiations. |

Supplier bridge candidates:

| Bridge | Tier | Planning status | Why It Matters |
|--------|------|-----------------|----------------|
| **ABC Supply** | 1 | Public docs available; access required | Catalog, branch-specific availability, customer-specific pricing, orders, order webhooks, invoices. |
| **SRS / RoofHub SIPS** | 1 | Public docs available; credentials required | Customer validation, branch/product/pricing flow, async order submission, delivery/POD, invoices. |
| **QXO** | 1 | Public capability docs only; endpoint docs gated | Similar supplier object model: account, product, pricing, order, delivery tracking/photos, invoices. |

---

## 4. job.closed → Post-Op Debrief Trigger

When a job in the source PM system reaches its terminal milestone (AccuLynx: the milestone whose name
maps to `job_phase = "closed"` or `"warranty"`; StartInfinity: a board column named "Closed" or
"Complete"), the bridge emits a `job.phase_changed` internal event to Conductor.

Conductor's debrief-trigger logic:

1. Receive `job.phase_changed` where `new_phase IN ("closed", "warranty")`.
2. Check whether a debrief atom already exists for this `job_id` (query `public.thoughts` for
   `metadata->>'event_type' = 'post_op_debrief_scheduled'` and the matching `job_id`).
3. If no debrief atom exists, write a `trust_tier = "instruction"` scheduling atom and post a
   Slack message to the PM's channel: *"Job [title] at [address] is closed. Ready to schedule the
   15-minute debrief? [Schedule / Skip]"*
4. If the PM clicks Skip, write a `trust_tier = "evidence"` atom recording the skip with timestamp.
   Do not re-prompt.
5. If the PM clicks Schedule, Conductor creates a calendar event and proceeds with the debrief SOP
   (see `docs/00-architecture-brief.md §2.1`).

This trigger is the mechanical link between the bridge layer and the continuous-capture rhythm that
makes the brain compound over time.

---

## 5. Adding a New Bridge

1. Copy `_template/` to `integrations/bridges/<source-slug>/`.
2. Fill in `metadata.json` (name, version, tier, source, enabled flag, env var names).
3. Complete `contract.md` (the field-mapping table for every object you will ingest).
4. Write `README.md` covering auth, ingested objects, milestone mapping, and any known quirks.
5. Implement the handler (Deno MCP container for Tier 1).
6. Add the integration toggle to `config/roofer.config.yaml` under `integrations.<slug>.enabled`.
7. Add env var names to `config/.env.example`.
8. Write an A3 if the adapter is non-trivial (see `docs/00-architecture-brief.md §4.1`).
