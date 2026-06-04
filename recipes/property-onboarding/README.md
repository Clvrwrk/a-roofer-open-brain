# Recipe: Property Onboarding

> **Purpose:** Resolve or create a property record the first time a new address enters the brain — whether from an AccuLynx job, a canvass lead, a debrief, or a manual Slack mention. The property record is the primary key of the brain; every atom written about that address needs a valid `property_id` before it can be stored.

- **Trigger:** Any inbound atom or event that carries an address and a missing or unresolved `property_id`.
- **Duration:** Fully automated; typically completes in under 2 minutes.
- **Primary agents:** Capture, Historian, Conductor.
- **Supporting agents:** Researcher (external parcel lookup), Auditor (schema validation).

---

## When this recipe fires

The following events trigger property onboarding:

| Source | Trigger condition |
|---|---|
| AccuLynx job created | Job record contains address; `property_id` not yet in brain |
| Canvass lead entered | Canvasser posts address to Slack or records in AccuLynx |
| Post-op debrief atom | Capture encounters an address without a resolved `property_id` |
| Manual Slack mention | PM mentions an address in a context that implies work or bid |
| Cross-client property query | Historian finds an incoming property query with no local record |

---

## Step 1 — Resolve or create

**Historian** queries `public.property` for an exact or fuzzy address match.

Resolution priority:
1. **Exact match** on normalized address string (lowercased, abbreviations expanded: "St" → "Street", etc.). If found → return existing `property_id`. Recipe ends.
2. **Parcel ID match**: if the incoming record carries a parcel ID (from AccuLynx or EagleView), query by parcel ID. If found → update address fields if divergent, return existing `property_id`.
3. **Geocode match**: call the configured geocoding provider (`config.integrations.geocoder`) to resolve lat/lng. If a `property` record within 30 meters exists → flag as probable duplicate for human review; do not auto-merge. Conductor notifies PM.
4. **No match** → proceed to Step 2 to create a new record.

---

## Step 2 — Create the property record

Capture writes a new row to `public.property`:

| Field | Source |
|---|---|
| `id` | Generated UUID |
| `normalized_address` | Geocoder output |
| `street`, `city`, `state`, `zip` | Parsed from input |
| `lat`, `lng` | Geocoder output |
| `parcel_id` | County assessor API or manual entry |
| `year_built` | County assessor API (if available) |
| `structure_type` | County assessor API (if available); default `null` |
| `climate_zone` | Derived from zip code via `config.climate_zones` mapping |
| `created_at` | Now |
| `client_id` | Current client |

If any required field cannot be resolved automatically, Capture writes what it has and flags the record with `property_metadata_incomplete = true`. Conductor notifies the PM to fill in the gaps.

---

## Step 3 — Resolve jurisdiction

Every property belongs to a jurisdiction. Jurisdiction determines which regulatory snapshot applies.

1. Look up jurisdiction by `state` + `city` + `zip` in `public.jurisdiction`. If a match exists → link `property.jurisdiction_id`.
2. If no match: Capture creates a new `public.jurisdiction` row from `config.jurisdictions` (the client's configured jurisdictions list). If the jurisdiction is not in config, Conductor notifies the PM: "New jurisdiction detected: [city, state]. Please verify AHJ and add to config."
3. If jurisdiction config exists but no `regulatory_snapshot` exists for the current date range → seed one (Step 4).

---

## Step 4 — Seed regulatory snapshot

A `public.regulatory_snapshot` row records the building code in effect at a given property's jurisdiction on a given date.

Seeding logic:

1. Pull the jurisdiction's `base_code` from `config.jurisdictions.[id].base_code` (e.g. `IRC-2021`).
2. Pull any `local_amendments` from `config.jurisdictions.[id].local_amendments` (list of overrides — ice-and-water requirements, re-roof layer limits, drip edge mandates, etc.).
3. Write the snapshot: `{jurisdiction_id, effective_date: today, base_code, local_amendments, seeded_by: "property-onboarding-recipe", trust_tier: "evidence"}`.
4. If the property's `year_built` is more than 5 years ago AND a prior snapshot (older code cycle) is not present, flag to Historian: "Property built [year]; consider capturing prior-era regulatory snapshot for historical accuracy."

The regulatory snapshot is the reference that `era_of_practice` atoms link to. Without it, era-stamping is imprecise.

---

## Step 5 — Attach atoms

After the property record and jurisdiction are resolved:

1. Any atoms that were queued waiting for `property_id` are updated with the resolved ID.
2. Capture writes a `property_created` event atom: `{property_id, address, parcel_id, jurisdiction_id, regulatory_snapshot_id, created_by: "property-onboarding-recipe"}`, `trust_tier = "evidence"`, `cold_archive_status = "live"`.
3. If Historian found cross-client property atoms during Step 1 resolution (atoms from consenting clients in other trades about this same address), Conductor notifies the PM: "Property history available from a prior Cleverwork client (different trade). Ask `@ob-ops` for details."

---

## Step 6 — Auditor validation

Auditor validates the new property record against `standards/ops/v1.md` property-record requirements:

- [ ] `normalized_address` present and non-null
- [ ] `jurisdiction_id` resolved (not null)
- [ ] `regulatory_snapshot_id` resolved (not null)
- [ ] `climate_zone` present
- [ ] No PII beyond public parcel data (no homeowner contact info in property record — that lives on the `client_contact` object)

Pass → property record is `live`.
Fail → Capture re-runs the failed fields. If re-run fails, Conductor notifies PM for manual completion.

---

## How atoms attach to a property

Once a `property_id` is established, all subsequent atoms written about that address include it. The linkage is:

- Debrief atoms: `property_id` set by Capture during dual-track atomization.
- Job atoms: AccuLynx bridge sets `property_id` on every atom from the job record.
- Canvass atoms: `property_id` set when the canvass lead is converted to a job.
- Cross-client atoms: shared via the `property_history_for(property_id)` RPC, filtered by consent flags.

---

## Output atoms

| Atom | `soft_or_hard` | `trust_tier` | Notes |
|---|---|---|---|
| `property` record | `hard` | `evidence` | Master property row; seeded from public parcel data |
| `regulatory_snapshot` record | `hard` | `evidence` | Code in effect at property jurisdiction |
| `property_created` event | `hard` | `evidence` | Audit trail of when property entered the brain |

---

## Changelog

| Date | Version | Summary |
|---|---|---|
| 2026-05-29 | v1 | Initial SOP. Resolve-or-create, jurisdiction, regulatory snapshot, atom attachment. |
