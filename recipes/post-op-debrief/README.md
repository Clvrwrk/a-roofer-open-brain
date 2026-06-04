# Recipe: Post-Op Debrief

> **Purpose:** Capture structured institutional knowledge from every closed roofing job through a 20–30 minute recorded session. The debrief is the continuous-capture heartbeat of the brain — it replaces the panic-mode retirement interview with a steady rhythm tied to the natural cadence of completed work.

- **Trigger:** `job.closed` webhook (or equivalent status transition) fired by AccuLynx, JobTread, or any configured PM tool.
- **Duration:** 20–30 minutes.
- **Format:** Video preferred; audio acceptable. Hybrid OK for foremen on site.
- **Participants (required):** PM or project coordinator, Foreman or crew lead, Client (homeowner or property owner — not optional, see §Rationale below).
- **Participants (optional):** Estimator (if scope diverged ≥15% from original), QC Lead (if any QC events fired during the job), Sub lead (if a sub-relationship issue was escalated during the job).

---

## Rationale: why the client must be in the room

The soft atoms that drive lifetime customer loyalty — the relational memory that turns a transaction into a referral pipeline — cannot be reverse-engineered from the PM's notes. They require the client to say them out loud. The canonical example from Cleverwork's architecture is a crew that protected flowers planted by a client's deceased mother without being asked. The PM's notes say "crew cleared staging area." Only the client can tell you what actually happened. That atom — captured once — is worth more to the EEAT flywheel than ten generic five-star reviews.

---

## Trigger flow

```
AccuLynx / JobTread job phase → "Closed" or "Warranty"
        │
        ▼
Bridge adapter fires job.closed webhook → Conductor
        │
        ▼
Conductor checks debrief.config.yaml:
  - auto_schedule: true → Conductor sends calendar invite to participants
  - auto_schedule: false → Conductor posts Slack message to PM: "Job [ID] closed. Schedule debrief."
        │
        ▼
Debrief is scheduled within config.debrief_window_days (default: 5 business days)
```

---

## Pre-debrief checklist (Conductor completes automatically)

Before the meeting, Conductor pulls and posts in the prep thread:

- [ ] Job summary from AccuLynx: scope, crew, install dates, final invoice amount.
- [ ] Any open punch-list items or warranty flags.
- [ ] Any QC events or Auditor rejects that fired during the job (surfaced to QC anchor question).
- [ ] Photos from CompanyCam (link to album, not embedded).
- [ ] Prior debrief atoms for this property (if any), surfaced by Historian.
- [ ] Prior debrief atoms for this client (if any), surfaced by Historian.

---

## Recording and transcription

- Recording requires **consent captured once at client onboarding** (see `recipes/client-onboarding-wizard/README.md`). The debrief invitation confirms consent is on file; it does not re-ask per meeting.
- Transcription provider is set in `debrief.config.example.yaml` (default: Granola; fallback: Fireflies). The raw audio file and transcript are both attached to the job's atom set.
- Conductor opens the meeting with the blameless framing (read verbatim from config):

> *"This is a blameless review. We're capturing what happened so we can do it better, and so a future crew briefed on you will know what mattered. Nothing said here is used against anyone. If you want anything redacted, tell us now or within 24 hours and we'll pull it before atomization."*

---

## The six anchor questions (v1 script)

These questions are templates, not a rigid script. The facilitator (PM or Cleverwork AM) adapts the wording to the job context. The order is intentional — open with a positive, move through technical, close with relational.

### Q1 — What did we get right?

*Anchor positive. Confirms what the crew should repeat. Also the first place soft atoms emerge — moments when the crew did something beyond the spec that mattered to the client.*

Facilitator probe: *"Was there anything the crew did that you weren't expecting but appreciated?"*

**Atom track:** Hard and soft. Hard atoms: confirmed best practices worth codifying. Soft atoms: acts of care, attentiveness, professionalism that the client noticed.

---

### Q2 — What went wrong, or where did the plan diverge?

*The QC-input question. Surfaces deviations from scope, schedule, or cost. Also captures near-misses and safety observations.*

Facilitator probe: *"Were there any moments when the plan and reality were out of sync — even briefly?"*

**Atom track:** Hard only. `soft_or_hard = "hard"`, `trust_tier = "evidence"`, QC notified immediately if a safety observation surfaces.

---

### Q3 — What did current code or current materials force us to do differently than we'd have done five years ago?

*Era-aware anchor. The single question most responsible for generating recontextualization material. Elicits the practitioner knowledge that makes the brain reliable in 2031.*

Facilitator probe: *"Any moment where you said 'we used to do this differently' — what changed and why?"*

**Atom track:** Hard. `era_of_practice` populated from the answer. `regulatory_snapshot_id` linked if the answer references a specific code edition (IRC-2018, IRC-2021, local AHJ amendment, GAF warranty requirement change, etc.).

---

### Q4 — Were there moments where a specific crew member's experience made the difference?

*Practitioner-attribution anchor. Surfaces the people whose oral history is worth deeper capture — veterans whose knowledge is flight-risk for the brain.*

Facilitator probe: *"Was there a moment where someone said 'I've seen this before' and that changed how we handled it?"*

**Atom track:** Hard. `original_practitioner` JSONB populated. If the named individual has tenure ≥ 10 years, flag for standalone knowledge-harvest session (Innovator receives this signal).

---

### Q5 — What would you tell a foreman starting on this same property next year?

*Property-bound forward-utility anchor. This is what makes cross-client property history valuable. The answer should be written as if it will be read by someone who has never been to this property.*

Facilitator probe: *"Think about the address. The soil, the roof pitch, the neighbor situation, the inspector's preferences. What would save the next crew time?"*

**Atom track:** Hard. `property_id` required. `consent_flags.cross_client_shareable` defaults to `true` unless the client explicitly flags competitive information. Era-stamped.

---

### Q6 — What mattered to you that we should remember if you ever call us again?

*The flowers question. This is the EEAT and relational-equity anchor. Do not rush it. Allow silence. The most unexpectedly valuable atom of the entire debrief often comes here.*

Facilitator probe: *Silence is enough. If needed: "Is there anything about how this job went — or about your family's situation, your property, what matters to you — that you'd want us to carry forward?"*

**Atom track:** Soft. `soft_or_hard = "soft"`, `eeat_signal.type = "Experience"` or `"Trustworthiness"` (inferred), `eeat_signal.value = 0.85` default (elevated because this question is curated for it), `eeat_signal.publishable_with_consent = true`, `eeat_signal.consent_recorded_at = null` (recorded later via EEAT flywheel one-click flow). `trust_tier = "evidence"`.

---

## Dual-track atomization rules

Capture runs both tracks in parallel on the transcript after the meeting. Neither track blocks the other.

| Track | `soft_or_hard` | Default `trust_tier` | Default `eeat_signal` | `cross_client_shareable` |
|---|---|---|---|---|
| Hard | `hard` | `evidence` | `null` | `true` unless flagged |
| Soft | `soft` | `evidence` | `{type: inferred, value: 0.7–0.95, publishable_with_consent: true, consent_recorded_at: null}` | `false` (soft atoms are not cross-client shared by default; they are EEAT candidates only) |

Every atom from either track receives:
- `property_id` (required — if property not yet in brain, Capture triggers property-onboarding recipe first)
- `job_id` (required)
- `client_id` (required)
- `era_of_practice` (required if the content references a code, standard, or practice)
- `original_practitioner` (if a named individual was cited)
- `model_card` (populated automatically by Capture)
- `original_capture_date` = date of debrief

---

## Post-debrief routing

All four notifications fire concurrently after Capture completes atomization.

1. **Maintenance Sort** runs at end-of-day on the new atom set: deduplication, provenance check, orphan detection.

2. **Quality Control** is notified with a hard-atom summary. If any failure mode in the hard atoms matches a pattern already seen 2+ times in the rolling 90-day window, QC adds this debrief to its DMAIC backlog. QC also flags any practitioner with tenure ≥ 10 years mentioned in Q4.

3. **Marketing** (via the EEAT flywheel recipe) is notified with a soft-atom queue containing all atoms where `eeat_signal.value ≥ 0.7`. Marketing may begin drafting publication candidates immediately; client one-click approval happens in the flywheel step.

4. **Innovator** is notified with the full transcript. Innovator scans for patterns tagged "we did this manually again" or "this took longer than it should" as candidate skill proposals. No action is taken; patterns are logged to Innovator's observation queue.

5. The job's `post_op_debrief_completed_at` field is stamped. The property's `property_history` is updated with a debrief-atom summary.

---

## Quality gates

- **Auditor** reviews the atom set before it is marked `live`. Checks: required fields present, no PII in hard atoms (`eeat_signal` absent or consent not yet recorded), no pricing or client-list data in cross-client-shareable atoms, `trust_tier` is `evidence` (not auto-promoted to `instruction`).
- If Auditor rejects: Capture re-atomizes the flagged atoms. QC is notified if the same rejection pattern has occurred before.
- `trust_tier` promotion to `instruction` requires QC's explicit approval on a per-atom basis.

---

## Changelog

| Date | Version | Summary |
|---|---|---|
| 2026-05-29 | v1 | Initial SOP. Six anchor questions, dual-track atomization, post-debrief routing. |
