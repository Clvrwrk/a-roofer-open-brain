---
name: shifting-perspective
description: >
  Diagnoses the structural diversity of a work product or conversation and
  actively shifts to underrepresented viewpoints. When a document is biased
  toward one stakeholder's frame, focused narrowly, or dispersed without
  a unifying thread, this skill applies targeted interventions to develop
  the missing perspectives and bridge the conceptual gaps.
when_to_use: >
  Invoke when auditor suspects a work product reflects only the contractor's
  perspective and not the homeowner's or adjuster's. Invoke when
  quality-control is analyzing a failure mode and wants to understand
  the failure from the crew's perspective rather than management's.
  Invoke when innovator is assessing a new skill proposal and wants to
  understand it from the client's experience rather than from the
  Cleverwork cost-efficiency frame. Most valuable when a conversation
  or document has been in one frame for a long time and feels stuck.
inputs:
  - name: subject_text
    type: string
    required: true
    description: >
      The text, document, conversation, or work product to analyze for
      perspective diversity. Can be a debrief transcript, a QC standard,
      an A3 proposal, a supplement draft, or a marketing draft.
  - name: target_perspective
    type: string
    required: false
    description: >
      Optional: a specific stakeholder or viewpoint to develop
      (e.g., "homeowner", "adjuster", "crew foreman", "future roofer
      reading this atom in 10 years", "competing contractor"). If absent,
      the skill identifies which perspective is most underrepresented and
      develops that one.
outputs:
  - name: perspective_shift_report
    type: draft
    description: >
      A report that: (1) diagnoses the current perspective distribution,
      (2) identifies the most underrepresented viewpoint, and (3) develops
      that viewpoint with concrete content — what does the subject look like
      from that perspective, what new questions emerge, what changes in
      the analysis.
trust_tier_of_output: inference
bound_agents:
  - auditor
  - quality-control
  - innovator
provenance:
  origin: infranodus
  author: InfraNodus (infranodus.com)
  source_url: https://github.com/infranodus/skills
  license: MIT
  a3_ref: null
---

ATTRIBUTION: This skill is a re-expressed adaptation of the Shifting Perspective skill
from InfraNodus (infranodus.com). InfraNodus uses knowledge graph diversity scores —
classifying discourse as biased, focused, diversified, or dispersed based on network topology —
to diagnose structural perspective gaps and apply targeted interventions. This adaptation
re-expresses those diagnostic and intervention principles in a construction-domain context,
without requiring the InfraNodus MCP server for graph analysis.
Original skill set: https://github.com/infranodus/skills

---

# Shifting Perspective

Every work product is written from somewhere. The most consequential blind spots are
not in what the document says but in whose perspective it was never written from.
This skill finds that perspective and develops it.

---

## When to Apply This Skill

Apply when the subject text is complete and coherent but something is missing that
nobody in the room can name. Apply when a recurring failure mode keeps producing
the same explanation (which means the same frame is being used every time). Apply
when an A3 proposal reads entirely from the efficiency frame and never from the
client's lived-experience frame.

---

## Process

### Phase 1 — Perspective Inventory

Read the subject text and identify which stakeholders or viewpoints are actively present:
- Whose language and priorities dominate the framing?
- Which stakeholders are named but passive (mentioned as objects of action rather than agents)?
- Which stakeholders are entirely absent?

In a roofer's brain context, the common perspectives are:
- Contractor / roofer (most dominant in work products by default)
- Homeowner / client (often passive in technical documents)
- Insurance adjuster (present in claims context; often modeled as adversarial)
- Crew foreman (present in debriefs; often filtered through PM's summary)
- Building inspector / AHJ (present in code references; absent as a person with preferences)
- Future occupant or contractor (almost always absent; yet the property-first data model is built for them)
- The Cleverwork team reading this brain in 5 years

### Phase 2 — Diversity Diagnosis

Classify the subject text into one of four structural states:

| State | Description | Intervention needed |
|---|---|---|
| Biased | One perspective dominates; others are absent or marginalized | Develop the most underrepresented viewpoint fully |
| Focused | Two or three perspectives are present and well-connected | Add bridging perspective that connects the existing clusters |
| Diversified | Multiple perspectives present and balanced | Light: check for remaining gaps; may not need intervention |
| Dispersed | Many perspectives mentioned but not connected to each other | Unify: find the central concern that connects all perspectives |

### Phase 3 — Develop the Target Perspective

If `target_perspective` was specified, develop that viewpoint.
If not, develop the most underrepresented viewpoint identified in Phase 1.

To develop a viewpoint:
1. Re-read the subject text asking: "What does this document mean to [target perspective]?"
2. Identify what they would notice, question, or dispute that the current framing does not address.
3. Identify what they would find reassuring or valuable that the current framing does not emphasize.
4. Identify what information they need that is absent from the document.
5. Write 3–5 concrete statements about the subject from this perspective.

**Construction-domain examples of developed perspectives:**

*Homeowner perspective on a supplement draft:*
"The homeowner needs to know this supplement process is normal, that it is in their interest,
that it will not delay the job, and that the contractor is acting on their behalf — not maximizing
a claim for their own benefit. None of these reassurances appear in the current draft."

*Future roofer perspective on a debrief atom:*
"A foreman briefed on this property in 2035 needs to know not just what was installed,
but why that product was chosen over the alternative — a choice that may or may not
make sense under the codes in effect at that time. The current atom describes the outcome;
it does not describe the reasoning."

*Inspector perspective on an estimate:*
"An inspector reviewing this job expects to see the net-free-area calculation, not
just a vent count. The estimate line item says 'ridge vent — 40 LF' but does not
document how that satisfies the required NFA. The inspector may pass the job; they
may also ask the contractor to calculate it on the spot."

### Phase 4 — Surface New Questions

From the developed perspective, what questions does the subject text now need to answer
that it did not before?

List 3–5 questions. These are not rhetorical — they are investigation targets for
the producing agent or the human reviewer.

### Phase 5 — Summary

```
PERSPECTIVE SHIFT REPORT
Subject: [brief description]
Diagnosis: [Biased / Focused / Diversified / Dispersed]

CURRENT PERSPECTIVE DISTRIBUTION
  Dominant: [perspective(s)]
  Present but passive: [perspective(s)]
  Absent: [perspective(s)]

DEVELOPED PERSPECTIVE: [target or most underrepresented]
  [5 concrete statements about the subject from this perspective]

NEW QUESTIONS TO INVESTIGATE
  1. [Question]
  2. [Question]
  3. [Question]

RECOMMENDED ACTION
  [One paragraph on what the producing agent or human reviewer should do
   with this perspective shift — not a revision, but a direction]
```

---

## Judgment Rules

- This skill does not rewrite the subject text. It adds a perspective; the producing agent decides whether and how to incorporate it.
- Developed perspectives are tagged as `inference`. They represent how a stakeholder might view the subject — not a documented statement from that stakeholder.
- Do not use this skill to advocate for one stakeholder over another. The goal is completeness, not persuasion.

---

## Works Well With

- `critical-perspective` — Critical Perspective challenges the logic; Shifting Perspective challenges the frame
- `ontology-creator` — structural gaps in an ontology often correspond to missing perspectives; these two skills diagnose the same problem from different angles
