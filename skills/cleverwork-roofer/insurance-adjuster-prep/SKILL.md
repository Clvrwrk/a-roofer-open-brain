---
name: insurance-adjuster-prep
description: >
  Produces a concise adjuster-meeting brief for the roofer's sales lead or
  project manager. Pulls property history, prior claim atoms, current scope,
  photo documentation status, and known adjuster preferences from the brain,
  then organizes them into a one-page walkthrough guide the roofer carries
  into the field meeting.
when_to_use: >
  Trigger when @ob-sales receives a request like "prep me for the adjuster
  meeting", "what should I know before I meet the adjuster tomorrow", or
  when a calendar event tagged with adjuster_meeting is detected within
  24 hours. Also runs as part of the storm-response recipe after a
  supplement draft is approved. NOT a replacement for the contractor's
  professional judgment on scope; this is a preparation aid.
inputs:
  - name: job_id
    type: uuid
    required: true
    description: >
      FK to the job record. Pulls claim atoms, scope atoms, property history,
      and any prior adjuster correspondence.
  - name: adjuster_name
    type: string
    required: false
    description: >
      Name of the adjuster attending the meeting. Used to look up any
      inspector-notes or adjuster-preference atoms in the brain from prior jobs.
  - name: carrier_name
    type: string
    required: false
    description: >
      Insurance carrier. Used to retrieve any carrier-specific claim-handling
      pattern atoms captured from prior jobs.
  - name: meeting_datetime
    type: string
    required: false
    description: ISO 8601 datetime of the scheduled meeting.
outputs:
  - name: adjuster_brief
    type: draft
    description: >
      A one-page structured brief covering: property overview, claim summary,
      scope highlights, photo documentation checklist status, talking points
      for disputed items, and known adjuster or carrier preferences.
  - name: brief_atom
    type: atom
    description: >
      Atom written to brain after generation with trust_tier = evidence,
      soft_or_hard = hard, linked to the job and property records.
trust_tier_of_output: evidence
bound_agents:
  - ob-sales
provenance:
  origin: cleverwork
  author: Cleverwork
  source_url: null
  license: MIT
  a3_ref: null
---

# Insurance Adjuster Prep

A one-page field brief so the roofer walks into the adjuster meeting knowing exactly
what the property history shows, what the scope says, and what points are likely to
be contested.

---

## Context Required

- Job record: claim number, loss date, loss type (wind/hail/water), carrier, adjuster name and contact
- Property atoms: year built, structure type, prior roof replacement date and manufacturer, warranty status
- Scope atoms: square count, pitch, current materials spec, identified damage itemization
- Photo atoms from CompanyCam: storm damage documentation, field measurements
- Any prior adjuster-preference or carrier-handling-pattern atoms in the brain

---

## Process

### Step 1 — Property and Claim Context

Pull and summarize:
- Property address, year built, structure type (residential / low-slope / commercial), stories
- Prior roof history from property atoms: last replacement date, manufacturer, warranty (transferable? active?)
- Claim: number, loss date, loss type, carrier, adjuster name, prior contact history

Note any cross-client property atoms (consent-gated) that provide useful context: prior code compliance records, soil or structural notes, inspector preferences from other trades.

### Step 2 — Scope Summary

Extract from scope and EagleView atoms:
- Total squares (from EagleView report; include report date)
- Pitch(es) per section
- Layers (determines tear-off requirement and code compliance)
- Identified damage: hail impact diameter and density (if hail), wind lift or missing shingles, valley delamination, flashing damage
- Any pre-existing condition items that are clearly separate from storm damage

Summarize in plain language the roofer can say out loud during the walkthrough.

### Step 3 — Photo Documentation Status

Check CompanyCam atoms for this job:
- Storm damage documentation: marked as complete / partial / missing
- Field measurements (eaves, rakes, ridges, valleys, hips): complete / partial / missing
- Prior condition documentation (pre-storm photos if available): present / absent

If gaps exist, list them as items to capture before or during the adjuster meeting.

### Step 4 — Anticipated Disputes and Talking Points

Based on the gap between the contractor scope and (if available) a preliminary adjuster estimate:

For each contested item, prepare one plain-language talking point:
```
Item: [line item description]
Our position: [quantity and justification]
Likely objection: [what the adjuster may say]
Response: [factual basis — measurement source, code section, manufacturer requirement]
```

If no adjuster estimate is available yet, flag the line items most commonly disputed for this loss type (based on any prior-claim pattern atoms in the brain, or general domain knowledge if no atoms exist).

### Step 5 — Adjuster and Carrier Preferences

Query the brain for atoms tagged with the adjuster's name or the carrier's name from prior jobs:
- Known preferences (e.g., "prefers to walk the roof before reviewing any paperwork")
- Known sticking points (e.g., "always contests O&P unless a sub is documented")
- Prior relationship atoms (prior job together, positive or negative outcomes)

If no relevant atoms exist, note "No prior interaction recorded — standard approach."

### Step 6 — Assemble the Brief

One page. Sections in this order:

```
ADJUSTER MEETING BRIEF
Property: [address]     Claim #: [number]
Loss Date: [date]       Loss Type: [type]
Carrier: [carrier]      Adjuster: [name]
Meeting: [datetime]

PROPERTY OVERVIEW
[2-3 sentences: year built, roof history, warranty status]

SCOPE SUMMARY
[Square count, pitch, layers, damage summary — 3-5 bullets]

PHOTO DOCUMENTATION
[Complete / Gaps: list gaps]

ANTICIPATED DISPUTES
[Talking points from Step 4 — max 4 items; flag if more exist]

ADJUSTER / CARRIER NOTES
[Preferences and patterns from Step 5]

WHAT TO HAVE READY ON SITE
[EagleView printout, manufacturer spec sheet, permit copy, prior invoice if applicable]
```

---

## Output Format

Plain text following the template above. Brief enough to read on a phone while walking a roof. If the job is complex (multiple buildings, split peril, prior supplement history), allow a second page but not more.

---

## Judgment Rules

- Do not editorialize about the adjuster or carrier. Facts and preparation only.
- If the brain has conflicting atoms about a prior interaction (e.g., one debrief says the adjuster was cooperative, another says contentious), surface both with dates and let the human read them.
- Photo gaps are not a reason to delay the meeting brief — they are a reason to arrive early and fill the gaps before the adjuster walks.
- Never include the contractor's internal margin calculations in this brief. Scope items only.

---

## Works Well With

- `storm-claim-supplement` — run this skill after the supplement is drafted, before the follow-up adjuster meeting
- `eagleview-takeoff-qa` — confirm measurements are solid before walking the adjuster through them

---

## Notes

- If the adjuster is meeting virtually (desk adjuster review, no site visit), adjust the brief: remove the "What to have ready on site" section; add a "Documents to send in advance" section with the same items.
- If the loss date predates the current roof installation (i.e., the claim is for a roof installed by this roofer), pull the installation date atom and warranty registration atom — the adjuster may try to scope the damage as installation defect rather than storm loss.
