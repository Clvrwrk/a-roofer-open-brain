# EagleView Bridge

EagleView provides aerial roof measurement reports — the most accurate way to determine roof
area, pitch, facets, ridges, hips, valleys, and penetrations without a physical measurement.
For insurance work, EagleView reports are frequently accepted by carriers as the measurement basis
for scope disputes and supplement negotiations. For storm response, they are ordered immediately
after a loss event to establish pre-storm roof condition and exact square footage.

Priority: 5 of 5 in the roofer shortlist. High per-job value; lower volume than AccuLynx.

---

## Authentication

EagleView uses API key authentication.

- Header: `Authorization: Bearer {EAGLEVIEW_API_KEY}` (confirm against current EagleView API docs)
- Secret storage: `.env` → `EAGLEVIEW_API_KEY`
- API docs: https://eagleview.com/developer (verify current URL at account setup)

---

## What EagleView Provides

An EagleView report contains the aerial measurement data for a specific property's roof. The key
quantities that drive roofing estimates and insurance claims:

| Measurement | Description | Why It Matters |
|------------|-------------|---------------|
| **Total squares** | Roof area in roofing squares (1 square = 100 sq ft) | Determines material quantity and labor cost |
| **Predominant pitch** | Most common roof pitch as X/12 | Affects labor (steep-slope adder), safety, and manufacturer warranty eligibility |
| **Facets** | Number of distinct roof planes | Drives waste factor calculation; more facets = more cuts = more waste |
| **Ridge linear feet** | Total ridge length | Ridge cap material quantity |
| **Hip linear feet** | Total hip length | Hip cap and starter material |
| **Valley linear feet** | Total valley length | Ice-and-water shield quantity; a key supplement line item |
| **Eave linear feet** | Total eave/drip-edge length | Drip edge and starter strip quantity |
| **Rake linear feet** | Total rake (gable edge) length | Rake trim and starter material |
| **Penetrations** | Skylights, pipes, vents, HVAC units | Flashing material and labor; often underestimated |
| **Waste factor** | Calculated % waste based on facet count | Applied to total squares for material order |

These measurements are the **scope definition atoms** — the facts that an estimate is built from.
When they differ from the field measurement or the insurance adjuster's scope, the delta is the
supplement opportunity.

---

## Ingested Objects

### Measurement Report

An EagleView report is ordered by job/address and returns a structured dataset. The bridge:

1. Receives a completed report (via webhook or polling)
2. Resolves the property from the report address → `public.property`
3. Resolves or creates a `public.job` row
4. Writes one **scope summary atom** with the full measurement dataset in `metadata.measurements`
5. Writes individual **measurement atoms** for the key quantities (total squares, pitch, valleys, etc.)
   so each can be independently retrieved and cited

Individual measurement atoms allow `@ob-ops` to answer *"What was the valley footage on the
Henderson job?"* with a precise cited atom rather than asking the user to open the PDF.

### Report Versions

EagleView reports can be revised (e.g. when the initial imagery is updated with a higher-resolution
pass). When a revised report arrives for the same property:

1. The previous measurement atoms are updated to `cold_archive_status = "archived"`
2. New atoms are written with the updated measurements
3. A `derived_from` provenance link connects the new atoms to the archived ones
4. `recontextualization_notes` on the new atoms: *"Supersedes EagleView report {report_id_previous}
   dated {date}."*

### Insurance Supplement Support

EagleView measurements are especially valuable in supplement negotiations because they are
third-party-verified. When an EagleView report is linked to an open `public.insurance_claim`:

1. The measurement atoms are flagged `metadata.insurance_evidence = true`
2. `trust_tier` is set to `"instruction"` (EagleView reports are accepted as authoritative
   measurements by most carriers — they represent human-confirmed external truth)
3. The claim's `metadata.eagleview_report_id` is set for quick retrieval

---

## Property and Job Resolution

EagleView reports are ordered with a specific property address. Resolution follows the standard SOP:

1. Address normalization → property lookup → create if not found
2. Match to open `public.job` by `(property_id, job_phase IN ("estimate","won","in_progress"))`
3. If multiple open jobs exist on the same property (uncommon but possible for commercial),
   the bridge flags for human resolution via Conductor

---

## Webhook vs. Pull

EagleView report completion can take minutes to hours depending on imagery availability.
The bridge subscribes to completion webhooks when available. As fallback, it polls for pending
reports every 30 minutes using the report status endpoint.

---

## Era-Stamping

EagleView reports capture the roof as it existed at the time of the aerial pass. The `original_capture_date`
on measurement atoms is the date of the aerial imagery, not the date the report was ordered.
This distinction matters for insurance claims (the pre-storm condition must be documented) and
for cross-client property history (a future roofer seeing these measurements needs to know they
reflect the 2026 roof, not the current condition).

When the report imagery date differs from the order date by more than 30 days, the adapter
sets `recontextualization_notes`: *"Imagery date is {imagery_date}; report ordered {order_date}.
Measurements reflect roof condition as of {imagery_date}."*
