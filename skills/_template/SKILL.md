---
name: skill-name-kebab-case
description: >
  One to three sentences. Plain English. What this skill does and for whom.
  Be specific about the domain — "roofer" is better than "contractor".
when_to_use: >
  Explicit trigger conditions. Include upstream events (e.g., "job_phase = closed"),
  trigger phrases (e.g., "write a supplement"), composability notes, and when NOT to
  use (point to a sibling skill if one is a better fit).
inputs:
  - name: example_input_name
    type: string
    required: true
    description: Where this comes from and what it contains.
  - name: optional_input_name
    type: atom
    required: false
    description: Optional enrichment. Describe the fallback if absent.
outputs:
  - name: primary_output_name
    type: draft
    description: What the output looks like, where it goes, and who reviews it.
trust_tier_of_output: evidence
  # instruction  — human-confirmed or trusted import; may steer downstream behavior
  # evidence     — observed or model-derived fact with a traceable source (default)
  # inference    — model-generated conclusion; requires human confirm before promotion
bound_agents:
  - ob-sales         # replace with the correct vertical agent(s)
  - auditor          # include auditor when output requires gating before delivery
provenance:
  origin: cleverwork
  author: Cleverwork
  source_url: null
  license: MIT
  a3_ref: proposals/YYYY-MM-DD-skill-name.md
---

# Skill Name

One sentence stating the core problem this skill solves.

---

## Context Required

List what the agent needs before running this skill:

- Input A: where it comes from, what format
- Input B: optional; fallback if absent

---

## Process

### Step 1 — Frame

Describe the framing step. What does the agent establish before doing any work?

### Step 2 — Gather

What atoms, records, or external data does the agent pull? Which Historian queries? Which fields matter?

### Step 3 — Produce

The core work. What does the agent generate? What rules govern content, format, and completeness?

### Step 4 — Gate

What audit or human-review step happens before delivery? Who confirms? What trust tier is the output at this point?

### Step 5 — Deliver

How does the output reach its destination (Slack message, PM tool update, draft saved to brain)?

### Step 6 — Capture

What atoms does the agent write to the brain after completion? What fields must be populated?

---

## Output Format

Describe the expected output shape. Include an example skeleton if useful.

```
SECTION HEADING
- Key point
- Key point

SECTION HEADING
- Key point
```

---

## Judgment Rules

- Rule about what to include vs. omit
- Rule about attribution and sourcing
- Rule about uncertainty handling ("if unknown, say unknown — do not invent")
- Rule about trust tier: when to escalate vs. proceed

---

## Works Well With

- `sibling-skill-name` — when X condition is present, this skill picks up where this one leaves off
- `auditor` — every output of this skill passes Auditor before delivery

---

## Notes

Edge cases, known failure modes, or gotchas specific to this skill.
