---
name: critical-perspective
description: >
  Challenges a work product, proposal, or conclusion by systematically questioning
  its assumptions, surfacing alternative framings, and identifying what the analysis
  has not considered. Designed to make the thinking agents (auditor, quality-control,
  innovator) harder to fool by their own first conclusions.
when_to_use: >
  Invoke when an auditor is reviewing a complex work product and wants to stress-test
  its reasoning before issuing a pass. Invoke when quality-control is examining a
  repeated failure mode and risks confirming its initial hypothesis. Invoke when
  innovator is evaluating an A3 proposal and wants to pressure-test the ROI math
  and the root-cause analysis before recommending approval. Also useful when any
  vertical agent produces an output that "feels right" and needs deliberate friction
  before delivery.
inputs:
  - name: subject_text
    type: string
    required: true
    description: >
      The text, draft, proposal, or conclusion to be challenged.
      Can be a supplement draft, an estimate, an A3, a debrief summary,
      a QC standard, or any work product.
  - name: challenge_focus
    type: string
    required: false
    description: >
      Optional: a specific dimension to focus the critique on
      (e.g., "measurement assumptions", "consent logic", "margin math",
      "scope completeness"). If absent, runs a broad challenge across all dimensions.
outputs:
  - name: critical_perspective_report
    type: draft
    description: >
      A structured critique listing: hidden assumptions, alternative explanations,
      underrepresented considerations, questions the subject text cannot answer,
      and a summary of the strongest objections. Does not produce a revised version
      of the subject text — that is the producer's job.
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

ATTRIBUTION: This skill is a re-expressed adaptation of the Critical Perspective skill
from InfraNodus (infranodus.com/about/cognitive-variability). It is not a verbatim copy.
InfraNodus's original critical-thinking framework uses knowledge graph topology to identify
structural gaps in reasoning. This adaptation applies the same epistemic discipline to
construction-domain work products without requiring the InfraNodus MCP server.
Original skill set: https://github.com/infranodus/skills

---

# Critical Perspective

The purpose of this skill is not to tear down good work — it is to make the thinking agents
resistant to their own premature closure. A critic that only confirms what the producer
already believes adds nothing. A critic that finds the one thing the producer missed
adds everything.

---

## When to Apply This Skill

This skill is the epistemic discipline of running a deliberate second pass after a first
conclusion has formed. It is most valuable precisely when the first conclusion feels solid —
that is when confirmation bias is at its highest and the cost of unchallenged error is
greatest.

---

## Process

### Phase 1 — Assumption Inventory

Before challenging anything, list every assumption the subject text rests on:
- What must be true for the conclusion to hold?
- What inputs are taken as given without justification?
- What definitions are implicit rather than stated?
- What time window or scope boundary is assumed?

For each assumption, rate it: JUSTIFIED (evidence exists in the text), IMPLICIT (unstated but reasonable), or UNSUPPORTED (present but not grounded).

### Phase 2 — Alternative Explanations

For the central claim or recommendation in the subject text:
- What else could explain the same observations?
- What would a skeptic's interpretation of the same data produce?
- What would the conclusion look like if the most important variable were reversed?

List at least two genuine alternatives, not straw men.

### Phase 3 — Underrepresented Considerations

What does the subject text address well? Now ask: what does it not address that it should?
- Whose perspective is absent from the analysis?
- What second-order effects are not discussed?
- What conditions would make the recommendation fail?
- What is the strongest possible objection not raised by the text itself?

In a roofer's brain context, common underrepresented considerations include:
- The homeowner's perspective on an insurance claim (not just the contractor's)
- The downstream effect on manufacturer warranty when a substitute product is used
- The era-stamping gap when a method is described without a code reference
- The consent flag that was not set because nobody asked whether this information was competitive

### Phase 4 — Unanswerable Questions

Identify questions that the subject text raises but cannot answer from its own evidence:
- Where is the reasoning chain broken?
- Where does the text assert a conclusion that its evidence only suggests?
- What external information would change the recommendation?

### Phase 5 — Summary of Strongest Objections

Distill the three most important challenges from Phases 1–4. Order them by consequence:
1. The objection whose resolution would most change the conclusion
2. The second most consequential
3. The most likely to be overlooked because it is subtle rather than obvious

---

## Output Format

```
CRITICAL PERSPECTIVE REPORT
Subject: [brief description of what was challenged]
Focus: [challenge_focus or "broad"]

ASSUMPTIONS
  [A1] [Assumption text] — JUSTIFIED / IMPLICIT / UNSUPPORTED
  [A2] ...

ALTERNATIVE EXPLANATIONS
  [E1] [Alternative framing or explanation]
  [E2] ...

UNDERREPRESENTED CONSIDERATIONS
  [C1] [What the text missed or sidelined]
  [C2] ...

UNANSWERABLE QUESTIONS
  [Q1] [Question the text cannot answer]
  [Q2] ...

STRONGEST OBJECTIONS (in order of consequence)
  1. [Most consequential challenge]
  2. [Second]
  3. [Subtlest but most overlooked]
```

---

## Judgment Rules

- This skill does not revise the subject text. It challenges it. The producing agent decides what to change.
- If the analysis is genuinely strong and the challenges are weak, say so — do not manufacture objections to appear thorough.
- The trust tier of this output is always `inference`. A critical perspective is not a finding; it is a prompt for the human or producer to investigate further.
- Do not use this skill to relitigate decisions already confirmed at `trust_tier = instruction`. Challenge outputs at `evidence` or `inference` only.

---

## Works Well With

- `rhetorical-analyst` — while Critical Perspective challenges the substance of an argument, Rhetorical Analyst challenges the structure and persuasion mechanics
- `shifting-perspective` — after Critical Perspective surfaces what is missing, Shifting Perspective asks whose viewpoint would most change the picture
