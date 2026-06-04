# Bridge Adapter Template

This folder is the canonical starting point for every new bridge adapter. Copy the entire `_template/`
directory to `integrations/bridges/<source-slug>/` and fill in the blanks.

---

## Adapter Contract — Required Fields in Full

### Atom Fields (public.thoughts + cleverwork-roofer extensions)

Every atom produced by a bridge must satisfy the following. Required means the adapter must set it
before writing; conditionally required means it must be set when the source data makes it available.

#### Always Required

| Field | Type | How to Set |
|-------|------|-----------|
| `content` | TEXT | Human-readable sentence describing the fact. "Job 1045 moved to milestone Approved on 2026-05-29." |
| `client_id` | UUID | Always the single-tenant client's UUID. Read from `config/roofer.config.yaml → client.id`. |
| `model_card` | JSONB | `{provider:"bridge", model_name:"<adapter-slug>", model_version:"<semver>", captured_at:"<ISO8601 UTC>"}` |
| `trust_tier` | TEXT | `"evidence"` by default. See trust_tier rules below. |
| `content_fingerprint` | TEXT | SHA-256 of `"<source_system>:<external_id>:<field_key>:<canonical_value>"`. Used for idempotent upsert. |
| `metadata` | JSONB | Must include `{source_system, external_id, ingested_at, bridge_tier, event_type}`. All source-system IDs go here. |
| `source_type` | TEXT | `"captured"` for all bridge-produced atoms. |
| `cold_archive_status` | TEXT | `"live"` — do not change at write time. |
| `consent_flags` | JSONB | `{cross_client_shareable: true, trade_restriction: ["roofing"], publishable_external: false}` unless the specific record warrants stricter consent. |

#### Conditionally Required

| Field | Condition |
|-------|-----------|
| `property_id` | Any atom about a specific job site. Resolve via address or parcel. See property resolution SOP below. |
| `job_id` | Any atom about a specific job engagement. Resolve via `(source_system, external_ref)`. |
| `era_of_practice` | Historical imports where the underlying fact describes a prior code era. Leave `null` for current operational records. |
| `original_capture_date` | When the source system records a date the fact was first known (e.g. job opened_at). |
| `eeat_signal` | Atoms with publication potential — completed project narratives, before/after photo descriptions, client testimonials. Set `{type, value: 0.0–1.0, publishable_with_consent: false, consent_recorded_at: null}`. |
| `soft_or_hard` | Post-op debrief atoms. `"hard"` for technical/financial; `"soft"` for relational/narrative. |
| `regulatory_snapshot_id` | When the atom references a specific code version or permit condition. |

---

### Property Resolution SOP

```
1. Normalize source address:
   - trim(), titleCase(street), UPPER(state), trim(postal)
2. If parcel_id available:
   - SELECT id FROM public.property WHERE parcel_id = $parcel_id
   - If found → use property_id
3. Fallback to address match:
   - SELECT id FROM public.property
     WHERE lower(address_line1) = lower($addr1)
       AND lower(coalesce(city,'')) = lower($city)
       AND coalesce(postal_code,'') = $zip
   - If found → use property_id
4. If no match:
   - INSERT INTO public.property (address_line1, city, state, postal_code, parcel_id, ...)
   - Use new property_id
5. Store resolved property_id on all atoms for this source record.
```

Idempotent: unique indexes on `parcel_id` and `(lower(address_line1), lower(city), postal_code)`
prevent duplicate property rows.

---

### Job Resolution SOP

```
1. SELECT id, job_phase FROM public.job
   WHERE source_system = $source_system AND external_ref = $external_id
2. If found:
   - Compare job_phase; if changed, UPDATE job SET job_phase = $new_phase, updated_at = now()
   - Update contract_amount, closed_at, scope_summary if changed
   - Use existing job_id
3. If not found:
   - INSERT INTO public.job (client_id, property_id, external_ref, source_system, title, job_phase,
       trade, contract_amount, opened_at, metadata)
   - Use new job_id
```

---

### model_card

```json
{
  "provider": "bridge",
  "model_name": "<adapter-slug>",
  "model_version": "1.0.0",
  "captured_at": "<ISO8601 UTC timestamp of this ingest run>"
}
```

Bump `model_version` on any change to normalization logic that would produce different atom content
from the same source payload. This allows Maintenance to identify atoms that may need reprocessing.

---

### trust_tier Rules

| Source Record Type | trust_tier |
|-------------------|------------|
| API-sourced operational record (job, contact, milestone, photo) | `"evidence"` |
| Approved/paid invoice | `"instruction"` |
| Signed change order or approved supplement | `"instruction"` |
| Manufacturer warranty with confirmed registration number | `"instruction"` |
| Model-inferred classification produced by the adapter | `"inference"` |

Only `trust_tier = "instruction"` atoms are eligible to steer agent behavior. The bridge must not
promote to `"instruction"` speculatively.

---

### Idempotency via content_fingerprint

```typescript
// Pseudo-code
const raw = `${sourceSystem}:${externalId}:${fieldKey}:${canonicalValue}`;
const fingerprint = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
const hex = [...new Uint8Array(fingerprint)].map(b => b.toString(16).padStart(2,"0")).join("");
```

`canonicalValue` rules:
- Numbers: fixed-decimal string with 2 places (`"12500.00"`)
- Dates: ISO 8601 UTC (`"2026-05-29T00:00:00Z"`)
- Booleans: `"true"` / `"false"`
- Arrays: sorted JSON array string (`'["a","b","c"]'`)
- Strings: trimmed, lowercased for comparison fields; original case for content fields

---

### Webhook Signature Verification

```typescript
// AccuLynx example — adapt header name per source system
async function verifySignature(req: Request, secret: string): Promise<boolean> {
  const sig = req.headers.get("x-acculynx-signature") ?? "";
  const body = await req.text();
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2,"0")).join("");
  return sig === expected;
}
```

- Reject immediately with HTTP 401 on signature mismatch.
- Never log the raw secret or the raw signature header value.
- The secret value lives in `.env`; its name is listed in `config/.env.example`.

---

### Error and Retry Policy

| Scenario | Action |
|----------|--------|
| Source webhook received | Respond HTTP 200 within 10 seconds; offload processing to queue. |
| Processing error (non-retryable) | Write `integration_error` atom to brain; notify Conductor. |
| Source API rate-limit (HTTP 429) | Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, cap 60s. |
| Source API 5xx | Retry up to 5 times with exponential backoff; after 5 failures, write error atom and alert. |
| Duplicate webhook delivery | No-op: `content_fingerprint` upsert prevents double-write. |
| Property not resolvable | Write atom with `property_id = null`; set `metadata.property_resolution_failed = true`; flag for Maintenance Sort. |

---

## Template File Checklist

When you copy this template to a new adapter directory, complete:

- [ ] `README.md` — Overview, auth, objects ingested, milestone mapping, known quirks
- [ ] `metadata.json` — Name, version, tier, source, enabled flag, env var names
- [ ] `contract.md` — Field-mapping table (every source object → every brain field)
- [ ] `handler.ts` — Deno MCP container stub (webhook receiver + REST pull skeleton)
- [ ] A3 proposal in `proposals/` if the adapter justifies one (see `docs/00-architecture-brief.md §4.1`)
