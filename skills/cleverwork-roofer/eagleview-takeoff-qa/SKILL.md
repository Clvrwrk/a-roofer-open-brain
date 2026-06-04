---
name: eagleview-takeoff-qa
description: >
  Sanity-checks an EagleView aerial takeoff report against the job's field scope
  and contractor notes. Validates total squares, pitch-by-section, waste factor
  appropriateness, and ridge/hip/valley/eave linear-footage against what the crew
  reported. Flags discrepancies before they propagate into estimates, supplements,
  or warranty registrations.
when_to_use: >
  Trigger when @ob-ops receives a request like "check the EagleView", "does the
  takeoff look right", or "confirm the square count before we order materials".
  Also triggers automatically when a new EagleView report atom is written to a
  job record. Run BEFORE storm-claim-supplement and BEFORE materials order
  is placed. NOT a replacement for a field remeasure when access is available.
inputs:
  - name: job_id
    type: uuid
    required: true
    description: >
      FK to the job record. Skill retrieves the EagleView report atom,
      field-notes atoms, and any AccuLynx estimate atom attached to this job.
  - name: eagleview_report_atom
    type: atom
    required: true
    description: >
      The atom containing the EagleView PDF or structured export.
      Must include: report ID, property address, report date, total squares,
      pitch by section, and linear footage fields.
  - name: field_scope_atom
    type: atom
    required: false
    description: >
      Contractor's field notes or estimate atom. Used to cross-check aerial
      measurements against crew observations. Fallback: use AccuLynx estimate.
outputs:
  - name: takeoff_qa_report
    type: draft
    description: >
      A structured QA report listing each measurement field, the EagleView value,
      the field-scope value (if available), the delta, a PASS/FLAG/DISPUTE status,
      and a recommended action for each flagged item.
  - name: qa_result_atom
    type: atom
    description: >
      Atom written to the job record with trust_tier = evidence,
      soft_or_hard = hard, containing the QA summary and overall pass/fail status.
trust_tier_of_output: evidence
bound_agents:
  - ob-ops
provenance:
  origin: cleverwork
  author: Cleverwork
  source_url: null
  license: MIT
  a3_ref: null
---

# EagleView Takeoff QA

Cross-checks an aerial takeoff against field observations so measurement errors
are caught before they become estimate errors, materials over/under-orders, or
supplement disputes.

---

## Context Required

- EagleView report: report date, report type (Bid Perfect, Premium, or Estimating), property address, total squares, pitch-by-section breakdown, ridge linear feet, hip linear feet, valley linear feet, eave linear feet, rake linear feet
- Field scope or estimate atom: contractor's own square count, pitch observations, special conditions noted on site
- Job type context: new installation, reroof (one layer, two layers), repair patch, or storm damage partial replacement

---

## Process

### Step 1 — Report Currency Check

Verify the EagleView report date against:
- Job loss date or estimate date (for insurance jobs, report should postdate storm event)
- Any property modification atoms (if the structure was altered after the report was generated, flag as STALE)
- Satellite imagery recency note in the report (EagleView notes the imagery acquisition date)

If the report is more than 12 months old and the job is a full replacement, flag for fresh report order before proceeding.

### Step 2 — Squares Validation

| Check | Method | Threshold |
|---|---|---|
| Total squares | EagleView total vs. field estimate | Flag if delta > 5% |
| Pitch-section squares | Sum of section squares vs. total | Flag if they do not reconcile within rounding |
| Waste factor appropriateness | Compare EagleView suggested waste % to standard by pitch and complexity | Flag if suggested waste < 10% on complex hip roof or < 7% on simple gable |

Standard waste factor benchmarks (use these if no field-scope waste atom exists):
- Simple gable, 4/12–6/12: 8–10%
- Complex hip, 4/12–6/12: 12–15%
- Steep slope (>8/12): add 2–4% per complexity tier
- Valleys per 1,000 sq ft: add 1–2% per valley

Flag waste if EagleView's suggested factor is below the standard for the observed pitch and complexity. Do not auto-adjust — flag for human decision.

### Step 3 — Linear Footage Validation

Check each linear measurement:

| Field | Cross-check method |
|---|---|
| Ridge linear feet | Should equal the sum of all ridge section lengths from section breakdown |
| Hip linear feet | Verify section count × average hip length makes sense geometrically |
| Valley linear feet | Cross-check against field notes; valleys are a common source of dispute in supplements |
| Eave linear feet | Should match perimeter minus rakes; compare to field rough perimeter measurement |
| Rake linear feet | Gable ends only; compare to EagleView section diagram |

Flag any field where the linear footage is zero on a structure that visibly has that feature (e.g., zero valleys on a multi-section complex hip is physically implausible).

### Step 4 — Pitch Reconciliation

For each pitch section reported:
- Compare EagleView pitch to field-noted pitch
- Flag any section where EagleView pitch differs from field notes by more than 2/12
- Note: EagleView pitch is derived from satellite stereophotogrammetry and is generally accurate to ±1/12 on standard slopes; steeper slopes and low-slope sections carry greater measurement uncertainty

### Step 5 — Special Conditions Check

Flag for human review if any of the following are present in field notes but absent from the EagleView report:
- Skylights, solar panels, chimneys, or HVAC penetrations that affect net square footage
- Dormers or stepflashing sections
- Evidence of multiple roof systems at different elevations (split-level, additions)
- Low-slope or flat sections requiring different material spec

### Step 6 — Assemble QA Report

```
EAGLEVIEW TAKEOFF QA REPORT
Job: [address]
EagleView Report ID: [id]  Report Date: [date]  Type: [Bid Perfect / Premium / Estimating]
QA Run Date: [date]
Overall Status: PASS | FLAGGED (N items) | DISPUTE (N items require human resolution)

SQUARES
  EagleView Total: [N] squares
  Field Estimate: [N] squares | Delta: [N] squares ([%]) | Status: PASS / FLAG
  Waste Factor (EV suggested): [%]  Standard for this pitch/complexity: [%] | Status: PASS / FLAG

LINEAR FOOTAGE
  Ridge: EV=[N]ft  Field=[N]ft  Delta=[N]ft  Status: PASS / FLAG
  Hip:   EV=[N]ft  Field=[N]ft  Delta=[N]ft  Status: PASS / FLAG
  Valley:EV=[N]ft  Field=[N]ft  Delta=[N]ft  Status: PASS / FLAG
  Eave:  EV=[N]ft  Field=[N]ft  Delta=[N]ft  Status: PASS / FLAG
  Rake:  EV=[N]ft  Field=[N]ft  Delta=[N]ft  Status: PASS / FLAG

PITCH RECONCILIATION
  [Section A]: EV=[N/12]  Field=[N/12]  Status: PASS / FLAG

SPECIAL CONDITIONS
  [List of flags or "None identified"]

RECOMMENDED ACTIONS
  [Numbered list of actions for each flagged item]
```

---

## Judgment Rules

- Do not auto-correct the EagleView report. Flag, explain, and route to the human.
- If field scope is absent and the EagleView numbers are internally consistent, issue PASS WITH NOTE rather than blocking the job.
- For insurance jobs, discrepancies between EagleView and contractor field measure are potential supplement justification — document them clearly with sources.
- Never adjust the waste factor without human approval; an incorrectly high waste factor on a supplement is a liability.

---

## Works Well With

- `storm-claim-supplement` — run this skill first; validated measurements flow directly into supplement quantities
- `roof-estimate-qa` — estimate completeness check uses this skill's output as the measurement source
- `gaf-warranty-registration` — warranty registration requires validated square counts for product registration

---

## Notes

- EagleView report types: Bid Perfect (standard residential), Premium (adds facet-by-facet detail), Estimating (adds Xactimate line items). The QA logic above applies to all types; Premium reports allow more granular section-by-section checks.
- If the property has a FLAT or low-slope section (pitch < 2/12), EagleView measurement accuracy is lower and a field remeasure is strongly recommended before ordering materials.
- EagleView report IDs should be stored as atoms with `source_type = eagleview` and the `source_url` pointing to the report download link for auditability.
