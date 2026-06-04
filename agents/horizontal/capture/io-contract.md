# Capture — IO Contract

> Concrete shapes: MCP endpoints called, `public.thoughts` fields read/written, example input → output, failure handling.

---

## MCP Endpoints Called

| Endpoint | Purpose | Called when |
|---|---|---|
| `match_thoughts` | Pre-write dedup check by content fingerprint | Before every `upsert_thought` call |
| `upsert_thought` | Write atom to `public.thoughts` | After dedup check passes |
| `get_property_by_address` | Resolve `property_id` from normalized street address | When incoming event has an address field |
| `create_property` | Create a new property record | When `get_property_by_address` returns null |
| `get_regulatory_snapshot` | Resolve snapshot by jurisdiction code + date | When `era_of_practice` is detected in content |
| `get_job` | Resolve `job_id` from AccuLynx or PM tool reference | When event carries a job identifier |
| `flag_for_maintenance` | Queue atom with missing fields | When required fields cannot be resolved |

All endpoints are MCP containers on Hetzner. Base URLs come from `config/roofer.config.yaml` under `runtime.*_url`. Agents authenticate to the internal brain with the appropriate `OB_ACCESS_KEY_*`; `SUPABASE_SERVICE_ROLE_KEY` stays only inside the `brain-mcp` container.

---

## `public.thoughts` Fields Read

Capture reads only during the dedup check:

| Field | Purpose |
|---|---|
| `content_fingerprint` | Compare against incoming content hash |
| `id` | Return to `derived_from` when dedup match found |

---

## `public.thoughts` Fields Written

Every Capture-written atom sets the following. Fields marked `*` are always required; absence blocks the write and triggers `flag_for_maintenance`.

| Field | Value at write |
|---|---|
| `id` | UUID generated at write time |
| `content` * | Normalized text from event payload |
| `embedding` | pgvector embedding, generated via embed MCP before write |
| `content_fingerprint` * | SHA-256 of `content` after normalization |
| `client_id` * | From `config/roofer.config.yaml` `client.id` |
| `property_id` | Resolved via `get_property_by_address`; null when no address present |
| `job_id` | Resolved via `get_job`; null when no job reference present |
| `trust_tier` * | Always `evidence` at capture time |
| `model_card` * | `{provider, model_name, model_version, captured_at: <ISO8601>}` |
| `source_type` * | One of: `slack`, `acculynx`, `granola`, `fireflies`, `companycam`, `quickbooks`, `email`, `paper_ocr`, `oral_history` |
| `soft_or_hard` | Set for debrief atoms: `hard` or `soft`; null for non-debrief atoms |
| `eeat_signal` | Set on soft atoms when classifier scores confidence ≥ 0.7 |
| `consent_flags` | Default from `config/roofer.config.yaml` `consent.defaults`; overridden per debrief flags |
| `era_of_practice` | Set by `era-tagger` skill when code/era language detected; null otherwise |
| `regulatory_snapshot_id` | Set when `era_of_practice` is set; null otherwise |
| `original_capture_date` | Date of original event (e.g. debrief recording date, not ingestion date) |
| `cold_archive_status` | Always `live` at write time |
| `created_at` | Server timestamp |

Fields inherited from OB1 base (`type`, `sensitivity_tier`, `importance`, `quality_score`, `derived_from`, `derivation_layer`, `supersedes`) are written per OB1's own atom-writer logic; Capture does not override them.

---

## Example: AccuLynx Job Note → Atom

**Input event** (AccuLynx webhook payload, simplified):

```json
{
  "event": "note.created",
  "job_id": "ALX-2847",
  "job_address": "1247 Elm Street, Columbus, OH 43215",
  "created_by": "foreman_mike",
  "created_at": "2026-05-28T16:04:00Z",
  "body": "Completed tear-off on section C. Found rotted decking on north slope, approx 12 sq ft. Replaced with 7/16 OSB. GAF Timberline HDZ re-installed per original spec. ICC IRC 2021 required solid deck per R905.2.1."
}
```

**Pre-write dedup check:**

```json
{ "rpc": "match_thoughts", "args": { "fingerprint": "<sha256 of normalized body>", "client_id": "self" } }
// Returns: [] (no match — proceed)
```

**Property resolution:**

```json
{ "rpc": "get_property_by_address", "args": { "address": "1247 Elm Street, Columbus, OH 43215" } }
// Returns: { "id": "prop_uuid_abc123", "parcel_id": "...", "jurisdiction_id": "jur_oh_franklin" }
```

**Era tagger output** (from `skills/cleverwork-roofer/era-tagger`):

```json
{ "era_of_practice": "IRC-2021", "regulatory_snapshot_id": "snap_uuid_irc2021_oh" }
```

**Atom written** (`upsert_thought`):

```json
{
  "content": "Completed tear-off on section C. Found rotted decking on north slope, approx 12 sq ft. Replaced with 7/16 OSB. GAF Timberline HDZ re-installed per original spec. ICC IRC 2021 required solid deck per R905.2.1.",
  "client_id": "self",
  "property_id": "prop_uuid_abc123",
  "job_id": "job_uuid_hargrove",
  "trust_tier": "evidence",
  "source_type": "acculynx",
  "model_card": {
    "provider": "anthropic",
    "model_name": "claude-sonnet-4-6",
    "model_version": "20250514",
    "captured_at": "2026-05-28T16:04:12Z"
  },
  "soft_or_hard": "hard",
  "era_of_practice": "IRC-2021",
  "regulatory_snapshot_id": "snap_uuid_irc2021_oh",
  "original_capture_date": "2026-05-28",
  "consent_flags": {
    "cross_client_shareable": true,
    "trade_restriction": ["roofing"],
    "publishable_external": false,
    "expires_at": null
  },
  "cold_archive_status": "live",
  "eeat_signal": null
}
```

---

## Example: Post-Op Debrief Soft Atom

**Input:** Debrief transcript excerpt — Foreman Mike speaking:
> "Mrs. Henderson asked us to make sure the flower bed along the east wall didn't get hit by debris. We ran extra tarps and nobody touched a single pot. She actually cried when she saw it. That was a first for me."

**EEAT classifier output:**

```json
{
  "type": "Experience",
  "value": 0.91,
  "publishable_with_consent": true,
  "consent_recorded_at": null
}
```

**Atom written:**

```json
{
  "content": "Foreman Mike: crew ran extra debris tarps to protect east-wall flower bed per homeowner request; flower bed undamaged; homeowner expressed strong emotional appreciation. (Job: Henderson, 412 Birchwood Dr. Property: prop_uuid_henderson.)",
  "client_id": "self",
  "property_id": "prop_uuid_henderson",
  "job_id": "job_uuid_henderson_2026",
  "trust_tier": "evidence",
  "source_type": "granola",
  "soft_or_hard": "soft",
  "eeat_signal": {
    "type": "Experience",
    "value": 0.91,
    "publishable_with_consent": true,
    "consent_recorded_at": null
  },
  "consent_flags": {
    "cross_client_shareable": false,
    "trade_restriction": [],
    "publishable_external": false,
    "expires_at": null
  },
  "cold_archive_status": "live"
}
```

---

## Failure Handling

| Failure | Behavior |
|---|---|
| `match_thoughts` returns a fingerprint match with identical content | Do not write; log dedup event; increment dedup counter in Maintenance Sort queue |
| `match_thoughts` returns a match with *different* content (near-duplicate) | Write both atoms; set `contradicts` cross-reference on each; flag pair to Maintenance Set-in-Order queue |
| `get_property_by_address` returns null | Write atom with `property_id = null`; flag to Maintenance Sort queue for manual property resolution |
| `get_job` returns null | Write atom with `job_id = null`; flag with note; do not block write |
| `era-tagger` fails or returns no match | Write atom with `era_of_practice = null`; flag for Maintenance era-stamp audit |
| Required field cannot be resolved (`client_id` missing) | Abort write; log error to Conductor error queue; do not write a partial atom |
| `upsert_thought` returns a 4xx/5xx | Retry up to 3 times with exponential backoff; if still failing, log to Conductor error queue and hold event for manual replay |
| Source webhook delivers duplicate event | Fingerprint check catches it; subsequent `match_thoughts` returns match; skip silently |
