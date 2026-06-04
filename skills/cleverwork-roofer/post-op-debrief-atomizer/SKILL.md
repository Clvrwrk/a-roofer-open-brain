---
name: post-op-debrief-atomizer
description: >
  Runs dual-track atomization on a post-op debrief transcript. Hard track extracts
  technical, financial, code, ops, and safety atoms. Soft track extracts relational,
  sentimental, client-values, and EEAT-signal atoms. Every atom is era-stamped,
  property-bound, and practitioner-attributed where the transcript supports it.
  This is the continuous-capture engine at the heart of the Open Brain.
when_to_use: >
  Trigger when the capture agent receives a completed debrief transcript from
  Granola or Fireflies after a job is marked closed or moved to warranty phase.
  Also triggers when a human uploads a transcript manually with the note
  "atomize this debrief". This skill should run on EVERY closed job without
  exception — it is mission-grade infrastructure exempt from the 10x A3 gate.
inputs:
  - name: transcript_text
    type: string
    required: true
    description: >
      Full text of the debrief transcript. May include speaker labels
      (e.g., "PM:", "Foreman:", "Client:") or may be unlabeled. Both work;
      labeled transcripts produce better practitioner attribution.
  - name: job_id
    type: uuid
    required: true
    description: >
      FK to the job record. Used to populate property_id, client_id,
      era_of_practice, and regulatory_snapshot_id on every atom generated.
  - name: debrief_date
    type: string
    required: true
    description: ISO 8601 date of the debrief session.
  - name: participants
    type: list
    required: false
    description: >
      List of participant names and roles. Used for practitioner attribution.
      Format: [{name, role, tenure_years, consent_to_attribute}].
      If absent, the skill infers roles from speaker labels in the transcript.
outputs:
  - name: hard_atoms
    type: list
    description: >
      List of hard atoms (soft_or_hard = hard) ready for bulk insert into
      public.thoughts. Each includes: content, trust_tier = evidence,
      property_id, job_id, client_id, era_of_practice, original_practitioner
      (where attributable), soft_or_hard = hard, consent_flags.
  - name: soft_atoms
    type: list
    description: >
      List of soft atoms (soft_or_hard = soft) with eeat_signal populated
      at inferred value 0.7–0.95 and publishable_with_consent = true,
      consent_recorded_at = null (consent confirmed later via EEAT flywheel).
  - name: atomization_summary
    type: draft
    description: >
      A one-page summary for Quality Control and Marketing: count of hard and
      soft atoms, practitioner attributions captured, EEAT candidates flagged,
      failure modes noted, and any follow-up actions the debrief surfaced.
trust_tier_of_output: evidence
bound_agents:
  - capture
provenance:
  origin: cleverwork
  author: Cleverwork
  source_url: null
  license: MIT
  a3_ref: null
---

# Post-Op Debrief Atomizer

Every closed job produces a debrief. Every debrief produces atoms. This skill runs
the dual track so that nothing said in that conversation is lost, and everything
useful is preserved with enough context to be retrieved and trusted five years from now.

---

## Context Required

- Debrief transcript (full text with speaker labels preferred)
- Job record: property address, job type (reroof, storm replacement, repair, commercial), materials used, completion date, jurisdiction
- Regulatory snapshot for the jurisdiction at the time of the job
- Participant list with tenure and consent flags (from onboarding or updated per-debrief)

---

## Process

### Step 1 — Segment the Transcript

Parse the transcript by the six anchor questions from the debrief script:
1. What did we get right?
2. What did we get wrong, or where did the plan diverge?
3. What did current code or current materials force us to do differently than five years ago?
4. Were there moments where institutional knowledge from a specific crew member made the difference?
5. What would you tell a foreman starting on this same property next year?
6. What mattered to you that we should remember if you ever call us again?

If the transcript does not follow this structure (legacy debrief or informal conversation), parse thematically. Do not fail on unstructured input — reduce confidence slightly and note in the atomization summary.

### Step 2 — Hard Track Atomization

For every factual, technical, financial, operational, safety, or code-related statement in the transcript, extract one atom per distinct claim.

**Hard atom fields to populate:**

| Field | Value |
|---|---|
| `content` | The claim in a single, self-contained sentence. Must be understandable without the transcript. |
| `soft_or_hard` | `hard` |
| `trust_tier` | `evidence` (default); `instruction` only if the statement is a confirmed decision by the client |
| `property_id` | From job record |
| `job_id` | From input |
| `client_id` | From job record |
| `era_of_practice` | Infer from the job date and jurisdiction code-in-effect. Use regulatory_snapshot_id. Example: `IRC-2021-[jurisdiction]` |
| `original_capture_date` | Job completion date or debrief date, whichever is earlier |
| `original_practitioner` | Attributed speaker if identifiable; null if unlabeled |
| `regulatory_snapshot_id` | FK from the jurisdiction's regulatory timeline |
| `recontextualization_notes` | If the claim describes a practice that may be superseded by newer code, note it here |
| `eeat_signal` | null (hard atoms are not externally published by default) |
| `consent_flags.cross_client_shareable` | `true` by default unless the content is explicitly competitive or financially sensitive |
| `consent_flags.publishable_external` | `false` (hard atoms are not published) |

**Hard atom categories to extract:**
- Technical: means and methods, sequencing, materials performance observations, product substitutions
- Scope deviations: plan vs. actual, change orders issued, reasons
- Code: any mention of an inspection result, code requirement, inspector decision, AHJ interpretation
- Financial: cost variances, change order amounts, material cost surprises (redact specific dollar amounts — record the pattern, not the number)
- Safety: near-misses, OSHA compliance actions, site hazards observed
- Equipment/labor: crew performance, tool issues, subcontractor quality, scheduling events
- Property-specific: structural observations, existing conditions noted, soil or drainage issues
- Manufacturer: warranty registration triggers, product failures, rep contact

For each hard atom, apply the recontextualization test: would a foreman in 2035 reading this atom need to know that the code has likely changed? If yes, populate `recontextualization_notes`.

### Step 3 — Soft Track Atomization

For every statement involving client relationships, client values, emotional experience, crew recognition, or qualitative outcome that carries a trust signal, extract one atom per distinct claim.

**Soft atom fields to populate:**

| Field | Value |
|---|---|
| `content` | The relational or emotional claim in a single self-contained sentence |
| `soft_or_hard` | `soft` |
| `trust_tier` | `evidence` |
| `property_id` | From job record |
| `job_id` | From input |
| `client_id` | From job record |
| `eeat_signal.type` | Infer: Experience, Expertise, Authoritativeness, or Trustworthiness |
| `eeat_signal.value` | 0.70–0.95 inferred score (see table below) |
| `eeat_signal.publishable_with_consent` | `true` (default for soft atoms; consent confirmed later) |
| `eeat_signal.consent_recorded_at` | `null` (not yet confirmed; set during EEAT flywheel) |
| `consent_flags.publishable_external` | `false` until consent is recorded |
| `original_practitioner` | Attributed to the client speaker when possible (consent to attribute confirmed at onboarding) |

**EEAT signal scoring table (for inferred value):**

| Score | Description |
|---|---|
| 0.90–0.95 | Direct client testimony about a specific, remarkable outcome — the "flowers" type atom. Highly quotable, specific, emotionally resonant. |
| 0.80–0.89 | Client testimony about quality, trust, or repeat-hire intent. Solid but less specific. |
| 0.70–0.79 | PM or foreman describing a client moment they observed. Second-hand but credible. |
| Below 0.70 | Soft but not EEAT-publishable — write the atom but set `publishable_with_consent = false`. |

**Soft atom categories to extract:**
- Client recognition of specific crew member by name
- Client statement of intent to rehire or refer
- Client description of what mattered most about the project experience
- Crew description of a client circumstance that changed how they approached the job
- Accessibility or family context the crew worked around
- Project outcome that surprised the client positively
- Long-standing relationship atoms (e.g., "this is the fifth roof we've done for them")
- Any statement about trust, reputation, or referral origin

### Step 4 — Practitioner Attribution

For every atom where a specific crew member's knowledge, action, or observation is the source of the claim:
- Set `original_practitioner = {name, role, tenure_years, consent_to_attribute}`
- If `consent_to_attribute = false`, the atom is still written but the practitioner's name is omitted from any external publication chain
- Note the practitioner in the atomization summary as a candidate for deeper oral history capture

### Step 5 — Flag EEAT Candidates

From the soft atoms, identify the top 3 EEAT candidates (highest eeat_signal.value with publishable_with_consent = true). Include them in the atomization summary with a brief note for the marketing agent.

### Step 6 — Atomization Summary

Write a one-page summary for Quality Control and Marketing:

```
POST-OP DEBRIEF ATOMIZATION SUMMARY
Job: [address]     Job ID: [id]
Debrief Date: [date]     Participants: [list]
Transcript quality: [structured / partially labeled / unlabeled]

HARD ATOMS: [N] extracted
  Technical: [N]   Code: [N]   Scope deviations: [N]
  Financial patterns: [N]   Safety: [N]   Property-specific: [N]

SOFT ATOMS: [N] extracted
  EEAT candidates (value > 0.80): [N]
  Top candidates:
    1. "[first sentence of best atom]" — EEAT type: [type], score: [value]
    2. "[first sentence of second atom]"

PRACTITIONER ATTRIBUTIONS: [N]
  [Name] ([role], [N] years tenure) — [N] atoms attributed

FAILURE MODES NOTED: [list or "None"]
  (Feeds Quality Control DMAIC backlog if pattern recurs)

FOLLOW-UP ACTIONS
  [ ] Flag [foreman name] for oral history session (high-attribution atom count)
  [ ] Route EEAT candidates to @ob-marketing
  [ ] Check warranty registration status for this job
  [ ] [Other actions from debrief content]
```

---

## Judgment Rules

- Every claim becomes one atom. Do not bundle multiple claims into one atom — the unit of memory is a single, retrievable, independently verifiable fact or observation.
- Do not paraphrase in ways that change meaning. Light editing for clarity is acceptable; changing the substance of what someone said is not.
- If a claim is ambiguous about who said it, mark `original_practitioner = null` rather than guessing.
- Financial dollar amounts: record patterns and variances but not specific dollar amounts in cross-client-shareable atoms. The specific amount lives in the job-financial atom (consent_flags.cross_client_shareable = false).
- If the transcript includes a statement that sounds like a complaint about a competitor contractor, write the hard atom (it is property history) but set `consent_flags.cross_client_shareable = false` — this is competitive information.
- Era-stamping is mandatory. Every hard atom must have `era_of_practice` populated or a note explaining why it is indeterminate (e.g., oral history without a confirmed date).

---

## Works Well With

- `eeat-publishing` — the soft EEAT candidates this skill flags are the input for that skill
- `gaf-warranty-registration` — materials atoms extracted here trigger the warranty checklist
- `quality-control` agent — the atomization summary is the primary input for QC's DMAIC pattern detection

---

## Notes

- The "flowers question" (question 6) is the most valuable question in the debrief script and the most likely source of a 0.90+ EEAT atom. Treat every response to it as a soft atom candidate.
- Unlabeled transcripts: if Granola or Fireflies does not produce speaker labels, attempt to infer from contextual cues (role vocabulary, technical vs. client language). Flag inferences as uncertain in the practitioner attribution.
- This skill does not make consent decisions — it marks atoms with their default consent flags based on `config.consent.cross_client_default` from `roofer.config.yaml`. The human can override per-atom during the EEAT flywheel review.
- Mission-grade status: this skill is exempt from the 10x A3 gate. It is the mechanism by which knowledge is preserved. Every closed job that does not produce atoms is a permanent loss. The ROI is the brain itself.
