---
name: storm-claim-supplement
description: >
  Drafts a Xactimate-style insurance supplement request from a roofer's job atoms
  and claim record. Assembles all line items the original adjuster scope missed or
  undervalued — code-required items, manufacturer install requirements, O&P, disposal,
  additional labor — formatted to match the structure an adjuster expects to review.
when_to_use: >
  Trigger when @ob-sales or @ob-accounting receives a request like "write a supplement",
  "the adjuster missed the ice and water shield", "we need to add O&P", or "the ACV
  check didn't cover code upgrade". Also triggers automatically when the claim atom on
  a job is updated with a new adjuster estimate that differs from the roofing contractor's
  scope by more than 10%. NOT a substitute for a licensed public adjuster; output is a
  draft that requires human review and explicit send-confirmation before delivery.
inputs:
  - name: job_id
    type: uuid
    required: true
    description: >
      FK to the job record. The skill retrieves claim atoms, scope atoms,
      EagleView measurement atoms, materials atoms, and any prior correspondence
      atoms attached to this job.
  - name: adjuster_estimate_atom
    type: atom
    required: true
    description: >
      The atom containing the adjuster's scope-of-loss document (PDF, CSV, or
      Xactimate export). Must have trust_tier = evidence and source_type = adjuster.
  - name: contractor_scope_atom
    type: atom
    required: true
    description: >
      The atom containing the roofer's full scope — from AccuLynx estimate,
      EagleView takeoff, and field notes. Must have trust_tier = evidence.
  - name: jurisdiction_id
    type: uuid
    required: false
    description: >
      FK to jurisdiction for code-required line items (ice-and-water-shield,
      drip edge, ventilation minimums). Pulls from property record if absent.
outputs:
  - name: supplement_draft
    type: draft
    description: >
      A structured supplement request document listing each disputed or missing
      line item with: Xactimate line-item code (when known), description,
      unit quantity, unit source (EagleView measurement or field measure),
      justification basis (code section, manufacturer requirement, or
      contractor invoice), and requested dollar amount.
  - name: supplement_atom
    type: atom
    description: >
      Atom written to brain after human approval with trust_tier = evidence,
      soft_or_hard = hard, and a link to the approved draft.
trust_tier_of_output: evidence
bound_agents:
  - ob-sales
  - ob-accounting
  - auditor
provenance:
  origin: cleverwork
  author: Cleverwork
  source_url: null
  license: MIT
  a3_ref: null
---

# Storm Claim Supplement

A Xactimate-style supplement request drafted from the gap between what the adjuster
scoped and what the job actually requires — with every line item traceable to a source.

---

## Context Required

- Job atoms: claim number, carrier, adjuster name and contact, loss date, loss type
- Adjuster estimate: line items, totals, ACV/RCV split, depreciation schedule
- Contractor scope: EagleView square count, pitch, waste factor, materials spec, labor breakdown
- Jurisdiction regulatory snapshot for code-required items
- Prior correspondence atoms if a prior supplement was already submitted and partially approved

---

## Process

### Step 1 — Frame the Gap

Pull both scopes (adjuster + contractor) and compute the delta for every line item category:

- Roof decking (OSB vs. plywood; code-required replacement threshold)
- Underlayment (felt 15 vs. synthetic; manufacturer requirement)
- Ice-and-water-shield (linear footage by eave/valley/penetration; IRC or local AHJ requirement)
- Drip edge (linear footage; color match; wind-zone requirement)
- Ridge cap shingles (separate from field shingles; manufacturer requirement for warranty)
- Starter strip (manufacturer requirement for wind rating)
- Pipe boot / flashing replacements (individual item counts from field notes)
- Ventilation (low-profile vs. ridge vent; code minimum net-free area calculation)
- Disposal and haul-away (weight by square x layers; dumpster permit if required)
- O&P (overhead and profit; standard when a GC is coordinating trades)
- Code upgrade items (permit fees, required secondary water barrier, HVHZ provisions if applicable)

Flag each delta as: MISSING (not in adjuster scope), UNDERVALUED (in scope but unit price below market), or QUANTITY DISPUTE (measurement differs from EagleView).

### Step 2 — Source Every Line Item

For each disputed or missing item, attach:

- Quantity source: EagleView report page and measurement field, or field measure atom
- Price source: Xactimate price list for the jurisdiction (if available in atoms), or supplier invoice atom, or RS Means reference
- Justification basis — use the most authoritative applicable source in this priority order:
  1. Manufacturer installation requirement (GAF, Owens Corning, or CertainTeed spec sheet atom)
  2. IRC section or local AHJ amendment from the jurisdiction regulatory snapshot
  3. OSHA or local safety regulation
  4. Industry standard practice (cite NRCA Roofing Manual edition and section)
  5. Contractor's prior completed-job atom showing consistent practice (era-stamped)

If no justification source is in the brain, note the item as NEEDS SOURCE and flag for human to supply before sending.

### Step 3 — Draft the Supplement Document

Structure the output as follows:

```
SUPPLEMENT REQUEST
Claim #: [number]
Carrier: [carrier name]
Adjuster: [name, contact]
Insured: [property owner name]
Property: [address]
Loss Date: [date]
Submitted by: [contractor name, license #]
Submitted: [date]

SUMMARY
Original adjuster estimate total (RCV): $[amount]
Requested supplement total: $[amount]
Revised total (RCV): $[amount]

LINE ITEMS

[Item #] [Description]
  Quantity: [N] [units] per [source]
  Adjuster allowance: $[amount] / unit | $[total]
  Requested: $[amount] / unit | $[total]
  Difference: $[delta]
  Justification: [basis — code section, manufacturer requirement, or measurement source]

[repeat for each line item]

ATTACHMENTS REFERENCED
- EagleView report [report_id] dated [date]
- [Manufacturer name] installation requirements [document reference]
- [Code citation] from [jurisdiction] [regulatory snapshot date]
- Photos: [CompanyCam album link or atom reference]
```

### Step 4 — Gate (Human Confirm Before Send)

Mark the draft with `trust_tier = evidence` and `cold_archive_status = live`, but do NOT route to the carrier until a human explicitly confirms.

Conductor presents the draft to `@ob-sales` assignee and `@ob-accounting` with:
- Total supplement amount requested
- Count of NEEDS SOURCE items (must be zero before send)
- A "Approve to send / Edit / Hold" prompt

Output only advances to the carrier after explicit human approval. The approval action sets `trust_tier = instruction` on the supplement atom.

### Step 5 — Deliver

Approved supplement is attached to the job record in AccuLynx (via bridge). The supplement document is saved as a PDF atom with `source_type = cleverwork_output`, linked to the claim atom.

### Step 6 — Capture

Write an atom for the supplement submission:
- `soft_or_hard = hard`
- `trust_tier = evidence` (elevated to `instruction` on approval)
- `property_id`, `job_id`, `client_id` populated
- `eeat_signal = null` (financial/legal content is never externally published)
- `consent_flags.cross_client_shareable = false` (claim details are competitive)

---

## Output Format

See Step 3 template above. The draft is a structured text document, not a Xactimate file. If the carrier requires a native Xactimate import, the human adjuster or estimator converts the line items after review.

---

## Judgment Rules

- Never invent a unit price. If no source exists in the brain or a standard reference, write MARKET RATE UNKNOWN and flag for human.
- Never round up quantities. Use EagleView measurements exactly; note waste factor separately.
- If the adjuster's scope includes an item the contractor's scope does not, do not remove it — note the discrepancy as a question for the human reviewer.
- If the claim's loss type (wind vs. hail vs. water intrusion) does not support a requested line item, omit the item and flag it as SCOPE MISMATCH.
- ACV vs. RCV: draft always shows RCV. If the policy is ACV-only, note this prominently at the top and let the human decide whether to include depreciation recovery language.

---

## Works Well With

- `insurance-adjuster-prep` — run this skill before the adjuster meeting that follows a supplement submission
- `eagleview-takeoff-qa` — run first to validate measurements before supplement quantities are finalized
- `roof-estimate-qa` — confirms the contractor's scope is complete before the gap analysis

---

## Notes

- O&P (overhead and profit): 20% is the long-standing industry standard. Some carriers contest it; include it by default and note the standard. Do not pre-negotiate on behalf of the contractor.
- Permit fees: always include if a permit was pulled. Attach the permit atom.
- Matching: if the supplement includes partial replacement of a continuous surface (e.g., siding or flashing on a mixed-damage job), flag the matching obligation under the applicable state statute or policy language; this is a human-judgment call.
- Never reference a specific carrier's internal pricing or policy terms that were not supplied by the human as an input atom. Do not assume policy terms.
