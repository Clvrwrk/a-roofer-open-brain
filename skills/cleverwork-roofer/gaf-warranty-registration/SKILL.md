---
name: gaf-warranty-registration
description: >
  Assembles the information required to register a GAF, Owens Corning, or
  CertainTeed manufacturer warranty after a roofing job closes, tracks registration
  status in the brain, and alerts @ob-accounting and @ob-ops when registration
  is overdue or requires a cert-status update. Supports transferable lifetime
  warranties (GAF System Plus, Golden Pledge), standard limited warranties,
  and contractor-tier cert maintenance tracking.
when_to_use: >
  Trigger when job_phase transitions to closed or warranty, or when @ob-accounting
  or @ob-ops receives a request like "register the GAF warranty", "did we
  register the Owens Corning warranty on the Henderson job", or "we're up for
  GAF Master Elite renewal". Also runs as part of the job-close checklist
  in the post-op-debrief recipe. NOT a substitute for the manufacturer's portal;
  this skill assembles and tracks — the human submits.
inputs:
  - name: job_id
    type: uuid
    required: true
    description: >
      FK to the job record. Retrieves materials atoms (manufacturer, product line,
      color, quantity), install date, property address, homeowner contact,
      and the contractor's current manufacturer cert tier.
  - name: manufacturer
    type: string
    required: true
    description: >
      gaf | owens-corning | certainteed — determines which registration fields
      and warranty product options apply.
  - name: warranty_tier
    type: string
    required: false
    description: >
      The warranty tier being registered (e.g., for GAF: Standard Limited |
      System Plus | Golden Pledge | WeatherStopper). If absent, the skill
      infers the maximum eligible tier based on the contractor's cert level
      and the products installed.
outputs:
  - name: warranty_registration_packet
    type: draft
    description: >
      A structured packet containing all required registration fields,
      pre-populated from brain atoms, ready for human entry into the
      manufacturer's portal. Includes the warranty tier, eligible duration,
      and any missing fields that the human must supply.
  - name: warranty_atom
    type: atom
    description: >
      Atom written to brain after registration is confirmed with
      trust_tier = instruction (post human confirmation), soft_or_hard = hard,
      containing warranty number, tier, registration date, expiration date,
      and transferability status. Linked to property record and job record.
trust_tier_of_output: evidence
bound_agents:
  - ob-accounting
  - ob-ops
provenance:
  origin: cleverwork
  author: Cleverwork
  source_url: null
  license: MIT
  a3_ref: null
---

# GAF Warranty Registration

Assembles the warranty registration packet from job atoms, tracks registration
status in the brain, and keeps cert-tier health current so the contractor never
loses a manufacturer certification through inaction.

---

## Context Required

- Job atoms: installation date, property address, homeowner name and contact, square count
- Materials atoms: manufacturer, product line (e.g., GAF Timberline HDZ, Owens Corning Duration), color, accessory products installed (starter strip, ridge cap, ice-and-water-shield, underlayment, ventilation)
- Contractor cert status atom: current tier (e.g., GAF Master Elite, GAF Certified Installer, OC Platinum Preferred, CertainTeed SELECT ShingleMaster) and cert expiration date
- Prior warranty registration atoms on the same property (for transferable warranty updates)

---

## Process

### Step 1 — Determine Eligible Warranty Tier

For each manufacturer, the warranty tier is determined by two factors: (1) the contractor's cert level, and (2) which accessory products were installed as a complete system.

**GAF:**
- Standard Limited Warranty: any installer, shingles only
- System Plus (50-year transferable): Certified Installer or Master Elite; requires GAF starter + ridge cap
- Golden Pledge (lifetime transferable): Master Elite only; requires full GAF system (starter, ridge cap, leak barrier, deck armor or Tiger Paw, ventilation from GAF line)
- WeatherStopper (commercial low-slope): separate track

**Owens Corning:**
- Standard: any installer
- Preferred Protection: Preferred or Platinum Preferred contractor; requires OC starter + ridge cap
- Platinum Protection: Platinum Preferred; full OC system including Duration shingles, ProStarter, ProEdge, WeatherLock

**CertainTeed:**
- SureStart Limited: any installer
- 4-STAR: ShingleMaster or SELECT ShingleMaster; requires CertainTeed accessory products
- 5-STAR: SELECT ShingleMaster; full CertainTeed system including WinterGuard, DiamondDeck, WinterGuard valleys

If the installed accessory list from materials atoms does not satisfy the full-system requirement for the maximum eligible tier, note which accessory is missing and flag whether it was substituted in the field (a common cause of warranty tier downgrade).

### Step 2 — Assemble Registration Fields

Pre-populate from brain atoms:

| Field | Source |
|---|---|
| Property address | property record |
| Homeowner name | job record / client contact atom |
| Homeowner email/phone | job record / client contact atom |
| Install date | job completion date atom |
| Square footage | EagleView QA validated squares × 100 |
| Contractor company name | `config/roofer.config.yaml` → `company.name` |
| Contractor license number | `config/roofer.config.yaml` → `company.license_number` |
| Contractor cert tier | cert status atom |
| Manufacturer product line | materials atom — SKU and product name |
| Product color | materials atom |
| Accessory products | materials atoms — list each qualifying accessory |
| Permit number | permit atom (if applicable; required for Golden Pledge) |

Flag any field where the value is ABSENT or UNCERTAIN — the human must resolve before portal submission.

### Step 3 — Identify Registration Deadline

Manufacturer registration windows:
- GAF Golden Pledge: must be submitted within **30 days** of install completion
- GAF System Plus: within 60 days
- Owens Corning Platinum Protection: within 30 days
- CertainTeed 5-STAR: within 60 days
- Standard warranties: generally 90 days; check current manufacturer terms

Compute deadline from install date atom. If deadline is within 7 days, mark URGENT. If deadline has passed, flag as OVERDUE and note whether late registration may still be accepted (this varies by manufacturer; do not assert a yes/no — route to human + manufacturer).

### Step 4 — Cert Tier Health Check

Retrieve the contractor's cert status atom and check:
- Current tier and expiration date
- Minimum jobs-per-year or continuing education requirements (tier-specific; check against known requirements stored in brain atoms or flag for human if absent)
- Whether this job's registered warranty counts toward the annual volume requirement

If cert expiration is within 90 days, alert `@ob-accounting` and `@ob-ops` with a renewal reminder.

### Step 5 — Assemble the Packet

```
WARRANTY REGISTRATION PACKET
Job: [address]        Job ID: [id]
Manufacturer: [GAF / Owens Corning / CertainTeed]
Eligible Warranty Tier: [tier]
Warranty Duration: [N] years / Lifetime — Transferable: [Yes / No]
Registration Deadline: [date]  Urgency: STANDARD / URGENT / OVERDUE

REGISTRATION FIELDS
  [Field name]: [value] | SOURCE: [atom reference]
  [Field name]: ABSENT — human must supply
  [... all fields]

SYSTEM COMPLETENESS
  Required for [tier]: [list of products]
  Installed: [list matched to materials atoms]
  MISSING: [list — flag if any]

CERT STATUS
  Current Tier: [tier]
  Cert Expiration: [date]  [RENEWAL ALERT if < 90 days]
  This job counts toward annual volume: [Yes / No / Unknown]

SUBMISSION PORTAL
  GAF:            https://www.gaf.com/en-us/for-contractors/warranties/register
  Owens Corning:  https://www.owenscorning.com/en-us/roofing/contractor-resources
  CertainTeed:    https://www.certainteed.com/contractors/

NEXT STEP FOR HUMAN
  [Instructions for portal submission, and what to copy back to the brain after confirmation]
```

### Step 6 — Post-Registration Capture

When the human confirms the warranty has been registered (via Slack reply or AccuLynx update):
- Write the warranty atom with:
  - `trust_tier = instruction` (human-confirmed registration)
  - `soft_or_hard = hard`
  - `property_id`, `job_id`, `client_id`
  - `consent_flags.cross_client_shareable = true` (warranty info is non-competitive property history)
  - `eeat_signal = null` (financial/warranty records are not externally published)
  - Fields: warranty_number, tier, manufacturer, registration_date, expiration_date, transferable, cert_tier_at_registration

---

## Judgment Rules

- Never submit to a manufacturer portal directly. This skill assembles; the human submits.
- If the installed system does not qualify for the requested warranty tier, report the gap clearly — do not downgrade silently.
- For transferable warranties on properties that appear in the cross-client property history (consent granted), note that the warranty transferability is a valuable property atom for future owners or contractors.
- If a prior warranty registration atom exists for this property, check whether it is being superseded and document the supersession in the new atom using the `supersedes` field.

---

## Works Well With

- `eagleview-takeoff-qa` — provides validated square footage used in the registration
- `post-op-debrief-atomizer` — debrief captures materials details that feed warranty registration
- `eeat-publishing` — a warranted GAF Golden Pledge or OC Platinum job is a strong EEAT signal; flag the warranty atom for marketing review after registration

---

## Notes

- GAF Master Elite status is a significant marketing differentiator (approximately 3% of US roofing contractors). If the contractor is Master Elite, flag the warranty registration as an EEAT candidate for the marketing agent.
- Warranty transfer: when a homeowner sells, the transferable warranty must be transferred within 60 days (GAF) or 30 days (OC) of closing. Maintenance should monitor property sale atoms (if available from public records or client notification) and alert @ob-accounting.
- For commercial projects with extended warranty terms (NDL, Total System), separate registration logic may apply — flag for human and reference manufacturer's commercial warranty team.
