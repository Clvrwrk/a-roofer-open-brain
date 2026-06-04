# EagleView → Brain Schema Field Mapping

**API version documented against:** EagleView API (verify exact version at account setup)
**Adapter version:** 1.0.0
**Last reviewed:** 2026-05-29

---

## 1. Measurement Report → `public.property` + `public.job` + atoms

### public.property (from report address)

| EagleView Field | Brain Field | Transform |
|----------------|-------------|-----------|
| `report.propertyAddress.streetAddress` | `address_line1` | Normalize |
| `report.propertyAddress.city` | `city` | |
| `report.propertyAddress.state` | `state` | 2-char code |
| `report.propertyAddress.zip` | `postal_code` | |
| `report.parcelId` (if provided) | `parcel_id` | |

### Scope Summary Atom (one per report)

| EagleView Field | Brain Field | Transform / Notes |
|----------------|-------------|------------------|
| `report.reportId` | `metadata.external_id` | |
| `"eagleview"` | `metadata.source_system` | |
| `report.imageryDate` | `original_capture_date` | DATE of aerial capture |
| `report.orderDate` | `metadata.order_date` | |
| `report.reportType` | `metadata.report_type` | e.g. "Premium", "Standard", "QuickSquares" |
| Full measurements object | `metadata.measurements` | JSONB — full measurement dataset |
| Derived | `content` | See content template below |
| `"instruction"` | `trust_tier` | Third-party verified measurement |
| `"hard"` | `soft_or_hard` | |
| `null` | `eeat_signal` | Measurement reports are not EEAT atoms |
| SHA-256(`eagleview:{reportId}:scope_summary:{imageryDate}`) | `content_fingerprint` | |

**Content template:**
`"EagleView measurement report for {address}: {totalSquares} squares, predominant pitch {pitch}/12, {facetCount} facets. Imagery date: {imageryDate}."`

---

## 2. Individual Measurement Atoms

One atom per key measurement, enabling precise retrieval and citation.

| Measurement | `metadata.measurement_type` | `content` template | `trust_tier` |
|------------|-----------------------------|--------------------|-------------|
| Total squares | `"total_squares"` | `"Roof at {address}: {value} total squares (EagleView, {imageryDate})."` | `"instruction"` |
| Predominant pitch | `"pitch"` | `"Roof pitch at {address}: {value}/12 predominant (EagleView, {imageryDate})."` | `"instruction"` |
| Facet count | `"facet_count"` | `"Roof at {address}: {value} facets (EagleView, {imageryDate})."` | `"instruction"` |
| Ridge LF | `"ridge_linear_feet"` | `"Ridge at {address}: {value} linear feet (EagleView, {imageryDate})."` | `"instruction"` |
| Hip LF | `"hip_linear_feet"` | `"Hip at {address}: {value} linear feet (EagleView, {imageryDate})."` | `"instruction"` |
| Valley LF | `"valley_linear_feet"` | `"Valley at {address}: {value} linear feet. Key supplement line item (EagleView, {imageryDate})."` | `"instruction"` |
| Eave LF | `"eave_linear_feet"` | `"Eave at {address}: {value} linear feet (EagleView, {imageryDate})."` | `"instruction"` |
| Rake LF | `"rake_linear_feet"` | `"Rake at {address}: {value} linear feet (EagleView, {imageryDate})."` | `"instruction"` |
| Waste factor | `"waste_factor"` | `"Calculated waste factor at {address}: {value}% (EagleView, {imageryDate})."` | `"instruction"` |
| Penetrations | `"penetrations"` | `"Penetrations at {address}: {value} units ({types}) (EagleView, {imageryDate})."` | `"instruction"` |

All individual measurement atoms carry:
- `property_id` — resolved property UUID
- `job_id` — resolved job UUID (if a matching open job exists)
- `metadata.report_id` — EagleView report ID for cross-reference
- `metadata.imagery_date` — date of aerial capture

---

## 3. Insurance Evidence Flagging

When the report's property matches an open `public.insurance_claim`:

| Brain Field | Value |
|-------------|-------|
| `metadata.insurance_evidence` | `true` |
| `metadata.claim_id` | UUID of matching claim |
| `trust_tier` | `"instruction"` (already set; EagleView is carrier-accepted) |

---

## 4. Report Revision Handling

When a revised report arrives for a property that already has EagleView measurement atoms:

| Action | How |
|--------|-----|
| Previous scope summary atom | Set `cold_archive_status = "archived"` |
| Previous measurement atoms | Set `cold_archive_status = "archived"` |
| New scope summary atom | Write with `derived_from = [previous_scope_atom_id]` |
| New measurement atoms | Write with `derived_from = [previous_measurement_atom_id]` |
| New atoms | Set `recontextualization_notes = "Supersedes EagleView report {previous_report_id} dated {previous_date}."` |

---

## 5. Cross-Reference with Estimates

When AccuLynx estimate atoms exist for the same job, the bridge cross-references:

- If estimate squares differ from EagleView squares by more than 5%, write a discrepancy atom:
  `metadata.event_type = "measurement_discrepancy"` with both values and the delta.
- Discrepancy atoms have `trust_tier = "evidence"` and `soft_or_hard = "hard"`.
- These are valuable supplement atoms: *"EagleView measured {N} squares; adjuster scoped {M}
  squares; delta of {D} squares = ${supplement_value} at current material rate."*

---

## Fields Not Mapped

| EagleView Field | Reason |
|----------------|--------|
| Report PDF URL | URL is stored in `metadata.report_pdf_url`; file is not downloaded |
| Low-slope measurements | Roofer template defaults to steep-slope; low-slope can be added via config |
| Snow load / live load calculations | Structural engineering scope; not in roofer brain v1 |
