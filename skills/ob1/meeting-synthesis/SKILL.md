---
name: meeting-synthesis
description: >
  Turns meeting transcripts or notes into a durable record of decisions made,
  actions assigned, risks raised, and questions left open. Separates what was
  decided from what was discussed, and preserves uncertainty honestly instead
  of smoothing it into false resolution. For a roofer's brain, this covers
  adjuster meetings, homeowner walk-throughs, crew briefings, subcontractor
  negotiations, and Cleverwork strategy sessions.
when_to_use: >
  Invoke when @ob-sales, @ob-ops, or conductor receives a request like
  "summarize that adjuster meeting", "extract the action items from this call",
  "what did we decide on the Henderson scope", or "draft the follow-up for
  the homeowner walk-through". Also runs as part of the post-adjuster-meeting
  step in the storm-response recipe. Best when you have a transcript or
  detailed notes, the attendee list, and the purpose of the meeting.
inputs:
  - name: meeting_transcript_or_notes
    type: string
    required: true
    description: >
      Full transcript, voice memo transcription, or structured notes.
      Speaker labels help but are not required.
  - name: meeting_purpose
    type: string
    required: false
    description: >
      Why this meeting happened: adjuster walkthrough, homeowner approval,
      subcontractor pre-job briefing, claim dispute call, etc.
      Used to frame the output correctly.
  - name: job_id
    type: uuid
    required: false
    description: >
      FK to the job record. Used to link the synthesis atom to the property
      and job, and to pull prior meeting atoms for context.
outputs:
  - name: meeting_synthesis
    type: draft
    description: >
      A structured record: purpose and summary, decisions made, actions with
      owners, risks and unresolved questions, recommended next step. Optionally
      includes a follow-up message draft.
  - name: synthesis_atom
    type: atom
    description: >
      Atom written to the brain with trust_tier = evidence, soft_or_hard = hard
      (or soft for relational content), linked to job and property records.
trust_tier_of_output: evidence
bound_agents:
  - ob-sales
  - ob-ops
  - conductor
provenance:
  origin: ob1
  author: Nate B. Jones (natebjones.com)
  source_url: https://github.com/open-brain-initiative/OB1
  license: MIT
  a3_ref: null
---

ATTRIBUTION: This skill is a re-expressed adaptation of the Meeting Synthesis skill
from OB1 by Nate B. Jones (natebjones.com, https://github.com/open-brain-initiative/OB1).
OB1 is licensed FSL-1.1-MIT. This adaptation re-expresses the skill's workflow and
framing in the Cleverwork roofer domain without copying the original prose. The core
structural insight — separating "decided" from "assigned" from "discussed", and
preserving material disagreement rather than smoothing it — belongs to OB1.

---

# Meeting Synthesis

Good meeting notes tell you what happened. Good meeting atoms tell you what happened
and make the outcome retrievable and trustworthy eighteen months later when a new
dispute surfaces about what was agreed.

---

## Context Required

- Transcript, notes, or faithful summary of the meeting
- Attendees and their roles (homeowner, adjuster, contractor PM, foreman, subcontractor, etc.)
- Meeting purpose
- Job or property context if applicable
- Whether the desired output is internal notes, a decision atom, or a follow-up message

---

## Process

### Step 1 — Frame the Meeting

State clearly:
- What kind of meeting this was (adjuster walkthrough, homeowner approval, pre-job crew briefing, change-order negotiation, claim dispute call)
- Why it happened (triggered by what event in the job lifecycle)
- Who attended and in what capacity

### Step 2 — Extract the Signal

Parse the transcript and separate into four buckets:

**DECIDED:** Statements where all parties reached a conclusion or agreement. Must be a definitive outcome, not a tentative discussion. If the decision had conditions, state them.

**ASSIGNED:** Specific actions, tasks, or follow-ups with named owners and (when mentioned) deadlines. If the owner is unclear, note that.

**DISCUSSED:** Topics raised that inform context but did not produce a decision or assignment. These are the "at the time of this meeting" atoms — valuable provenance, not necessarily actionable.

**UNRESOLVED:** Questions raised that were not answered; disagreements that were not resolved; risks named but not mitigated. These are often the most valuable outputs — they are the explicit unknowns.

In a roofer's brain, common unresolved items from adjuster meetings:
- Disputed line items pending a second inspection
- Matching obligation for partial replacement not yet decided
- Code upgrade items under review by the carrier
- Final ACV vs. RCV determination pending depreciation waiver

### Step 3 — Attribute Where the Transcript Supports It

Name the owner of each assignment and the speaker of each key decision where the transcript makes it clear. Do not guess attribution when the transcript is ambiguous — leave blank rather than assign incorrectly.

### Step 4 — Preserve Uncertainty

If a statement in the transcript sounds important but was not resolved:
- Keep it as UNRESOLVED — do not promote it to DECIDED to tidy up the output
- Note it explicitly: "Discussed but not resolved: [topic]"

If there was a meaningful disagreement that was not bridged during the meeting:
- Record both positions
- Note the resolution path if one was mentioned (next call, written follow-up, second inspection)

### Step 5 — Produce the Artifact

```
MEETING SYNTHESIS
Meeting type: [type]   Job: [address]
Date: [date]     Attendees: [list with roles]
Purpose: [one sentence]

SUMMARY
[2–3 sentences: what happened and what the meeting resolved]

DECISIONS
- [Decision 1] (Owner: [name if applicable])
- [Decision 2]

ACTIONS
- [Action] — Owner: [name] — Due: [date or "as soon as possible"]
- ...

RISKS AND UNRESOLVED QUESTIONS
- [Unresolved item 1]
- [Disputed item with both positions noted]

RECOMMENDED NEXT STEP
[One sentence: what should happen next and who is responsible]

[Optional: FOLLOW-UP MESSAGE DRAFT]
[If requested: a short message to send to the relevant party after the meeting]
```

### Step 6 — Write to Brain

Write the synthesis atom to the job and property records. For adjuster meetings:
- Tag key decisions and disputed items as separate atoms so they are individually retrievable
- Link to the meeting synthesis atom as the provenance source

---

## Judgment Rules

- Do not inflate tentative discussion into decided outcomes to make the synthesis look cleaner.
- Attribution matters. "The adjuster agreed to add the O&P" is a different atom from "The PM believes the adjuster will add O&P."
- The unresolved questions list is not a failure — it is often the most valuable deliverable from a meeting, especially in contested claims contexts.
- Keep the follow-up draft separate from the synthesis. The synthesis is the internal record; the follow-up is what goes to a third party and may need human editing before it leaves.

---

## Works Well With

- `insurance-adjuster-prep` — run that skill before the meeting; this skill processes the outcome after
- `storm-claim-supplement` — adjuster meeting decisions feed directly into supplement adjustments
- `auto-capture` — when a meeting ends, auto-capture ensures the synthesis lands in the brain before the window closes

---

## Notes

- For crew briefings and subcontractor pre-job meetings, the synthesis format is the same but the content categories shift: DECIDED becomes "scope confirmed" items; UNRESOLVED becomes "scope clarifications pending."
- For homeowner approval meetings, preserve soft atoms too — a homeowner's explicit statement about what matters to them is EEAT-signal material that should be flagged for the soft track.


---

## Attribution

Adapted from **OB1** by Nate B. Jones (FSL-1.1-MIT) — re-expressed in Cleverwork's own words, not copied verbatim. Nate gives away practical systems like this: <https://natebjones.com> · <https://substack.com/@natesnewsletter>.
