---
name: auto-capture
description: >
  Ensures that high-value decisions, action items, and insights produced during
  a work session are written to the brain before the conversation closes.
  Runs as a behavioral cue at session end — not a background daemon. Every
  ACT NOW item becomes its own atom; the session as a whole becomes a summary atom.
  For a roofer's brain, this covers strategy sessions, estimating reviews,
  claim dispute analysis, EEAT flywheel planning, and any Cleverwork-client
  conversation that produces decisions worth keeping.
when_to_use: >
  Trigger when a work session is clearly ending: the human says "wrap up",
  "park this", "let's stop here", "I'll pick this up tomorrow", or when a
  brainstorm, scope review, or planning session has produced ACT NOW items
  worth preserving. Also trigger when a Panning for Gold run, an innovator
  A3 review, or a competitive analysis session produces ranked outputs.
  This is a behavioral protocol — treat it as a cue, not a timer.
inputs:
  - name: session_outputs
    type: string
    required: true
    description: >
      The key decisions, insights, and ACT NOW items from the session.
      Can be a summary written by the agent, or the human's own statement
      of what needs to be captured.
  - name: job_id
    type: uuid
    required: false
    description: >
      FK to the job record if the session was about a specific job.
  - name: session_context
    type: string
    required: false
    description: >
      Brief description of what the session was: "adjuster strategy review",
      "EEAT flywheel planning", "A3 review for new skill", etc.
      Used to populate the summary atom's context field.
outputs:
  - name: act_now_atoms
    type: list
    description: >
      One atom per ACT NOW item: the idea in its strongest form, why it
      matters, 2–3 next actions, and provenance (date, session context).
      Trust tier: evidence.
  - name: session_summary_atom
    type: atom
    description: >
      One summary atom for the session: what it was about, how many
      important items emerged, main themes, where the fuller context lives.
      Trust tier: evidence.
trust_tier_of_output: evidence
bound_agents:
  - capture
  - conductor
provenance:
  origin: ob1
  author: Jared Irish / Nate B. Jones (natebjones.com)
  source_url: https://github.com/open-brain-initiative/OB1
  license: MIT
  a3_ref: null
---

ATTRIBUTION: This skill is a re-expressed adaptation of the Auto-Capture skill
from OB1, authored by Jared Irish and part of the OB1 project by Nate B. Jones
(natebjones.com, https://github.com/open-brain-initiative/OB1). OB1 is licensed
FSL-1.1-MIT. This adaptation re-expresses the skill's session-close capture protocol
in the Cleverwork roofer domain. The core behavioral insight — that capturing requires
a behavioral cue at session end, not a background hook, and that specificity beats
vague summaries for long-term retrievability — belongs to OB1's original design.

---

# Auto-Capture

The most common way to lose a good decision is to assume you will remember it. Auto-Capture
exists because the brain does not remember — the brain is where things go so you do not
have to.

---

## Context Required

- The work session's outputs: decisions, insights, ranked options, assigned actions
- Whether any prior brain atoms are obviously related (check before writing duplicates)
- The job or project context if applicable

---

## Process

### Step 1 — Detect the Session is Ending

This is a behavioral cue, not a clock event. The session is ending when:
- The human explicitly says so ("wrap up", "park this", "good night")
- A brainstorm or planning session has converged on outputs that are ready to act on
- A Panning for Gold or evaluation run has produced a ranked list
- The conversation is about to close and there is clear value in the outputs

Do not trigger on ongoing active work. Trigger at the natural end of a session.

### Step 2 — Identify the ACT NOW Items

From the session's output, identify the decisions and insights that:
- Require a specific action from a specific person (or agent) in the near term
- Represent a conclusion the human should be able to retrieve months later without reopening this session
- Would be consequential to lose

Skip:
- Raw discussion that did not converge on a conclusion
- Items that were raised and explicitly parked or killed
- Obvious duplicates of atoms already in the brain

### Step 3 — Check for Prior Atoms

Before writing an ACT NOW atom, query the brain for obvious overlapping atoms using the available search tool. If a near-identical atom already exists:
- Do not duplicate it
- Note the prior atom and update it if new information supplements it

### Step 4 — Write ACT NOW Atoms

For each ACT NOW item, write one atom with:
- `content`: The idea in its strongest, most self-contained form. Must be understandable without reopening the session. "ACT NOW: request a re-inspection on the Henderson valley dispute — adjuster agreed to revisit if we provide manufacturer spec sheet for the valley membrane" is useful. "Need to follow up on Henderson" is not.
- `trust_tier = evidence`
- `soft_or_hard = hard` (or soft if the item is relational)
- `job_id` and `property_id` if applicable
- `original_capture_date = today`
- A brief note on why it matters
- 2–3 concrete next actions
- Provenance: date, session type, who was in the session

### Step 5 — Write the Session Summary Atom

One atom for the session itself:
- What the session was about
- How many ACT NOW items emerged and what category they fall into
- The main themes or threads (useful for Conductor's weekly digest and for Historian's retrieval)
- Where the fuller context lives if a document, draft, or prior atom contains it

This atom is lightweight — it is an index entry, not a full record. Its job is to let Historian find the session in the future.

### Step 6 — Report to Human

Confirm the capture in plain language:
```
Session captured.
  [N] ACT NOW atoms written:
    - [One-line summary of each]
  Session summary: [one sentence describing what the session was about]

If the capture tool failed: tell the human exactly which items did not make it to the brain and what they would need to do manually.
```

---

## Output Format

A confirmation message to the human listing what was captured. The atoms are written to the brain directly — they do not appear in the chat window in full unless the human asks.

---

## Judgment Rules

- Specificity over vagueness. Every ACT NOW atom must be understandable without the session context.
- If the capture tool fails, report the failure clearly. Do not pretend the atoms were written.
- One atom per item. Do not bundle four related decisions into one atom — they need to be individually retrievable.
- The session summary does not replace the ACT NOW atoms. It complements them by providing the context for all of them together.
- Trust tier is always `evidence`. ACT NOW atoms are not `instruction` until the assigned person or agent confirms the action.

---

## Works Well With

- `meeting-synthesis` — run meeting-synthesis first for a formal meeting; auto-capture is for less formal sessions that still produce decisions
- `post-op-debrief-atomizer` — for post-op debriefs, the atomizer is the right skill; auto-capture handles everything else
- `conductor` — Conductor uses the session summary atoms in the daily and weekly digests

---

## Notes

- Tool names vary by client environment. The capture tool is typically named `capture_thought` with a client-specific prefix, or it is the direct write path to `public.thoughts`. Use whatever is available; do not assume a fixed name.
- For Cleverwork-internal sessions (strategy, A3 review, EEAT planning), the session summary atom goes into the Cleverwork client brain, not any roofing client brain. Be explicit about which brain is receiving the capture.
- ACT NOW items that are assigned to specific agents (not humans) should include the agent role in the next-actions list so Conductor can route them on the next digest cycle.


---

## Attribution

Adapted from **OB1** by Nate B. Jones (FSL-1.1-MIT) — re-expressed in Cleverwork's own words, not copied verbatim. Nate gives away practical systems like this: <https://natebjones.com> · <https://substack.com/@natesnewsletter>.
