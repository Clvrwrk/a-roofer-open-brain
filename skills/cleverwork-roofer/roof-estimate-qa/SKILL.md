---
name: roof-estimate-qa
description: >
  Reviews a roofing estimate for completeness and margin health before it is
  delivered to a prospect or submitted to an insurance carrier. Checks that every
  required line item is present, that quantities trace to a validated measurement
  source, and that the gross margin falls within the client's configured thresholds.
  Output passes through Auditor before delivery.
when_to_use: >
  Trigger when @ob-sales requests "review the estimate before I send it",
  "does this estimate look complete", or when an AccuLynx estimate moves to
  the "ready to send" stage. Also triggers when storm-claim-supplement has
  been drafted and a corresponding estimate needs to be verified for consistency.
  NOT a substitute for the estimator's professional judgment on scope
  decisions; this skill checks completeness and margin, not design choices.
inputs:
  - name: estimate_atom
    type: atom
    required: true
    description: >
      The estimate atom from AccuLynx or equivalent. Must contain line items,
      quantities, unit prices, and a subtotal. Accepts PDF export or structured
      JSON from bridge.
  - name: job_id
    type: uuid
    required: true
    description: >
      FK to the job record. Used to retrieve EagleView QA results,
      materials spec atoms, jurisdiction regulatory snapshot,
      and the client's configured margin thresholds from roofer.config.yaml.
  - name: job_type
    type: string
    required: false
    description: >
      insurance | retail | commercial — governs which completeness checklist applies.
      Defaults to retail if absent. Insurance jobs trigger additional checks
      for code-required items and O&P.
outputs:
  - name: estimate_qa_report
    type: draft
    description: >
      A structured QA report with a PASS or FAIL status, a completeness checklist,
      a margin analysis, and a numbered list of items requiring correction or
      human review before the estimate is sent.
  - name: qa_result_atom
    type: atom
    description: >
      Atom written to the job record with trust_tier = evidence, soft_or_hard = hard,
      and the overall QA result. Auditor reads this atom as part of its gate.
trust_tier_of_output: evidence
bound_agents:
  - ob-sales
  - auditor
provenance:
  origin: cleverwork
  author: Cleverwork
  source_url: null
  license: MIT
  a3_ref: null
---

# Roof Estimate QA

Completeness and margin check on a roofing estimate so nothing ships to a customer
or carrier with a missing line item or a margin that will hurt the job.

---

## Context Required

- Estimate: line items, quantities, unit prices, subtotal, tax (if applicable)
- EagleView QA result from `eagleview-takeoff-qa` (or raw EagleView atom if QA not yet run)
- Client's configured margin thresholds from `config/roofer.config.yaml`: `min_gross_margin_pct`, `target_gross_margin_pct`
- Job type: insurance, retail, or commercial
- Jurisdiction regulatory snapshot for code-required line items

---

## Process

### Step 1 — Completeness Checklist

Check every line item category against the applicable checklist. Mark each as PRESENT, MISSING, or NOT APPLICABLE.

**Universal checklist (all job types):**
- [ ] Tear-off / removal (if reroof or storm replacement)
- [ ] Disposal / haul-away (weight by squares × layers; dumpster permit if required)
- [ ] Deck inspection / repair allowance (standard 2–5% of squares for decking repairs)
- [ ] Ice-and-water-shield (eaves, valleys, penetrations; quantity vs. jurisdiction requirement)
- [ ] Synthetic underlayment or felt (full square coverage)
- [ ] Starter strip (linear feet of eaves + rakes)
- [ ] Field shingles (squares at validated measurement + waste)
- [ ] Ridge cap shingles (ridge + hip linear feet converted to squares; manufacturer spec)
- [ ] Drip edge (eave + rake linear feet; color and gauge noted)
- [ ] Pipe boot / flashing replacements (per unit count from field notes)
- [ ] Step flashing / counter-flashing (if applicable: chimneys, dormers, walls)
- [ ] Valley metal or valley membrane (valley linear feet)
- [ ] Ventilation (inlet and exhaust — net free area calculation or unit count)
- [ ] Nails / fasteners (not typically a separate line on retail estimates but verify for commercial)
- [ ] Labor (broken out by task if commercial or insurance; bundled acceptable for retail)

**Insurance-specific additions:**
- [ ] O&P line item (if GC coordinating multiple trades)
- [ ] Permit fee
- [ ] Code upgrade items (cite IRC section or AHJ requirement for each)
- [ ] Supplemental line items from `storm-claim-supplement` output (if supplement was drafted)

**Commercial additions:**
- [ ] Mobilization / setup
- [ ] Staging and logistics (multi-story or occupied building)
- [ ] Roofing membrane and insulation board (if low-slope)
- [ ] Seam tape and adhesive (if TPO/PVC/EPDM)

### Step 2 — Quantity Cross-Check

For each line item with a quantity, verify against the measurement source:
- Squares: compare to EagleView QA validated total (or flag if QA not yet run)
- Linear footage items: compare to EagleView linear footage fields
- Per-unit items (pipe boots, vents, skylights): compare to field-notes count atom

Flag any quantity that deviates from the measurement source by more than 5% without an explanation in the estimate notes.

### Step 3 — Margin Analysis

Compute gross margin from the estimate:
```
Gross Margin % = (Subtotal - Total Material Cost - Total Labor Cost) / Subtotal × 100
```

- If material cost and labor cost are not broken out in the estimate, attempt to compute from unit prices vs. known cost atoms (supplier quotes, prior job cost atoms in the brain).
- If cost data is insufficient for the calculation, report INSUFFICIENT COST DATA and flag for human.

Compare to configured thresholds:
- `< min_gross_margin_pct`: FAIL — flag as margin below floor; do not send without human override
- `≥ min_gross_margin_pct and < target_gross_margin_pct`: WARN — within acceptable range but below target
- `≥ target_gross_margin_pct`: PASS — margin on target

### Step 4 — Price Sanity Check

For each unit price, compare to:
- Prior job atoms for the same line item (last 12 months, same jurisdiction)
- Supplier quote atoms on file
- Flag any unit price that is more than 20% above or below the trailing average without a note explaining the variance (material shortage premium, special finish, expedite charge, etc.)

### Step 5 — Assemble QA Report

```
ROOF ESTIMATE QA REPORT
Job: [address]     Job Type: [insurance / retail / commercial]
Estimate ID: [id]  Estimate Date: [date]
QA Run Date: [date]
Overall Status: PASS | FAIL (N items) | WARN (N items)

COMPLETENESS
  [Line item]           Status: PRESENT / MISSING / N/A
  [... full checklist]

QUANTITY CROSS-CHECK
  [Line item]  Estimate qty: [N]  Measurement source qty: [N]  Delta: [N] [%]  Status: PASS / FLAG

MARGIN ANALYSIS
  Subtotal: $[amount]
  Estimated Cost: $[amount] ([basis])
  Gross Margin: [%]
  Floor: [min_gross_margin_pct]%  Target: [target_gross_margin_pct]%
  Status: PASS / WARN / FAIL

PRICE SANITY
  [Line item flagged with variance and note]

REQUIRED CORRECTIONS BEFORE SEND
  [Numbered list — Auditor blocks delivery until all FAIL items are resolved]

RECOMMENDED IMPROVEMENTS
  [Numbered list — WARN items and suggestions; human discretion]
```

### Step 6 — Gate via Auditor

The QA report and qa_result_atom are routed to Auditor. Auditor issues:
- PASS: estimate may be delivered
- FAIL: estimate returns to @ob-sales with the correction list; may not be delivered until corrections are confirmed

---

## Judgment Rules

- MISSING line items are always FAIL; the estimate cannot go out with a structural gap.
- WARN items do not block delivery but are recorded in the qa_result_atom.
- Never override a margin FAIL automatically. The human must approve sending a below-floor estimate with an explicit note explaining the business reason.
- If the job type is insurance and O&P is missing, always FAIL — O&P on insurance claims is a standard industry practice, not an optional line.
- Do not invent cost figures to compute margin. If cost data is absent, say so.

---

## Works Well With

- `eagleview-takeoff-qa` — run first; the validated measurement is the quantity source for this skill
- `storm-claim-supplement` — the supplement line items should appear in the estimate; this skill cross-checks consistency
- `auditor` — this skill's output feeds the Auditor gate before estimate delivery

---

## Notes

- Deck repair allowance: the standard 2–5% is a budget placeholder. If field notes document specific deck damage, use the documented quantity instead.
- Tax: some jurisdictions tax labor, materials, or both on roofing. The tax handling is not checked by this skill — it is the estimator's responsibility and should be confirmed against the jurisdiction regulatory snapshot.
- For change orders mid-job: run this skill on the change-order amount in isolation, not the full original estimate. The original estimate's QA result is an immutable atom; change orders get their own QA run.
