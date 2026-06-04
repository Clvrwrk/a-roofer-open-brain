# Debrief Script — Roofer Post-Op

> **What this is:** the standard post-op debrief script for a closed roofing job. Run it every time. Consistent framing is what makes the atoms comparable across jobs and years.
>
> **Time:** 20–30 minutes, sync. Video preferred; audio acceptable for foremen on a job site.
>
> **Recipe reference:** `recipes/post-op-debrief/` — the Conductor automation and Capture atomization pipeline that runs after this conversation.

---

## Before You Start

**Recording consent** is captured once at client onboarding (the Conductor sends the consent prompt to the client's designated contact; they confirm in Slack). You do not need to re-ask per debrief. If consent was not captured at onboarding, do not record until it is — check `consent_flags` on the client record.

**Who needs to be in the room:**

| Role | Required | Notes |
| --- | --- | --- |
| PM / project coordinator | Yes | Owns the job record in AccuLynx |
| Foreman / crew lead | Yes | Closest to the work |
| Client (the homeowner or property decision-maker) | Yes | The flowers question cannot be answered without them |
| Estimator | If scope shifted significantly | |
| Subcontractor lead | Only if a sub-relationship issue surfaced | |

If the client is unavailable, reschedule rather than run without them. The soft atoms — the ones with the highest EEAT value — require the client to say them out loud.

**Framing to open with** (Conductor delivers this automatically in the Slack scheduling message; repeat it verbally at the start of the call):

> "This is a blameless review. We're capturing what happened so we can serve you better next time, and so any crew member briefed on you and your property in the future will know what matters. Nothing here is used against anyone. If you want anything left out, just say so and we'll note it before the notes go into the system."

---

## The Six Core Questions

Read each question as written. The notes in *italics* are for the Cleverwork facilitator — they explain what you are listening for and how to probe for depth. Do not read the italics aloud.

---

### Q1 — What did we get right?

*Anchor the debrief on a positive. This question surfaces both hard atoms (what technically worked) and soft atoms (what mattered to the client beyond the spec). Do not rush past it. The flowers question (Q6) often echoes something that first surfaces here. Listen for: specific crew behaviors, communication moments, things that made the job easier for the client's daily life. These are the atoms that drive referrals and reviews.*

Probing follow-ups:
- "Was there a specific moment or interaction that stood out?"
- "What would you tell a neighbor who asked what it was like to work with us?"

---

### Q2 — What did we get wrong, or where did the plan diverge?

*This is the QC-input question. The goal is a blameless technical account of variance: scope changes, sequencing surprises, materials substitutions, weather delays, communication gaps. Hard atoms only here; this is not the place for personal criticism. If the client or crew starts to assign blame, gently redirect: "We're not looking for who's responsible — we're trying to understand what the system produced so we can improve it."*

Probing follow-ups:
- "Was there a point where the original estimate or plan turned out to be wrong? What happened?"
- "Were there any surprises with the materials, the substrate, or what we found when we got the old roof off?"
- "Did anything about the scheduling, access, or communication not work for you?"

---

### Q3 — What did current code or materials force us to do differently than you would have five years ago?

*This is the era-aware anchor. It explicitly elicits the recontextualization material that makes a 2026 atom usable by a future foreman without misleading them. Listen for: code changes (new ice-and-water requirements, updated wind ratings, IRC cycle changes), material changes (discontinued product lines, new underlayment specs, manufacturer warranty policy changes), local AHJ idiosyncrasies that are new.*

Probing follow-ups:
- "Did the inspector raise anything on this job that they didn't used to flag?"
- "Are there materials we used to default to that you can't use anymore, or new products that changed the install sequence?"
- "Anything about the permit process that was different this time?"

---

### Q4 — Were there moments where institutional knowledge from a specific crew member made the difference?

*The practitioner-attribution anchor. Surfaces the people whose oral history is worth deeper capture. This is how the brain builds its chain of provenance to named experts with tenure. Listen for: the foreman who knew the local inspector's quirks, the crew lead who remembered a similar substrate condition from 2018, the estimator who caught a scope gap because they had seen it before.*

Probing follow-ups:
- "Was there a moment where someone's experience — from years on this type of roof, in this jurisdiction, with this inspector — saved time or caught a problem?"
- "Is there someone on the crew whose knowledge we should make sure to capture more deeply before they retire or move on?"

---

### Q5 — What would you tell a foreman starting on this same property next year?

*The property-bound forward-utility anchor. This is what makes cross-client property history valuable. The atoms from this question have `property_id` set and `consent_flags.cross_client_shareable` defaulting to `true` (unless the client flags it otherwise). Listen for: structural observations, soil or drainage conditions, neighbor or HOA constraints, inspector preferences specific to this AHJ, the homeowner's particular concerns.*

Probing follow-ups:
- "Anything about this specific house — its construction, its location, what it faces — that the next person on the roof should know before they start?"
- "Any HOA rules, neighbor sensitivities, or access constraints they should plan for?"

---

### Q6 — What mattered to you that we should remember if you ever call us again?

*The flowers question. This is the EEAT and relational-equity anchor. It is the question that most often surfaces the unexpected atom — the thing that mattered to the client that was never in the scope, the proposal, or any email thread. The name comes from a Cleverwork case where the answer was: "You didn't leave flowers." The crew had moved a potted plant to access the gutter, replaced it when they left, but not quite where it had been. The client noticed. That was the atom — and it became the instruction for every future job at that address.*

*Do not anchor this question to the project. Ask it open-ended. Let silence sit. The most valuable atoms often come after a pause.*

Probing follow-ups (use sparingly — the open-ended version works best):
- "Is there anything about the way the job was run — communication, timing, how the crew behaved on your property — that we should carry forward?"
- "If you're calling us back next year for a gutter job, is there anything you'd want whoever shows up to already know?"

---

## Storm and Insurance Claim Variant

Use this variant instead of (or in addition to) the standard script when the job was a storm-damage claim. The standard six questions still apply; add the following after Q3 and before Q4.

---

### Q3b — How did the claims process go?

*Insurance claims have a second layer of institutional knowledge: how the adjuster interaction went, where the Xactimate line items were disputed, what the supplement strategy was, whether the ACV vs. RCV negotiation was clean or messy. This is first-class material for the Sales and Accounting agents and for future storm-canvassing skill development.*

Probing follow-ups:
- "Was the adjuster's initial scope close to what we estimated, or did we have to supplement significantly?"
- "Were there specific line items the adjuster pushed back on? Which ones, and how did we resolve it?"
- "Was the ACV payout vs. the RCV recovery process confusing for the homeowner? How did we handle explaining it?"
- "If you were advising another homeowner going through this for the first time, what would you tell them about working with their insurance company on a roof claim?"

---

### Q3c — What was the condition of the home when we started the claim?

*Captures the chain of custody for property condition — important for the insurance file and for the brain's property history. Listen for: pre-existing damage that was separate from the storm loss, documented vs. undocumented conditions, any dispute with the carrier about what was storm-related.*

Probing follow-ups:
- "Were there any pre-existing conditions — wear, previous repairs, code items — that complicated what the carrier would cover?"
- "How did we document the initial damage before we started? Any photos, reports, or measurements that were key to the claim?"

---

## After the Debrief

The Conductor automation handles the routing from here. For your reference, here is what happens:

1. **Transcript delivered to Capture.** If Granola or Fireflies is enabled, the transcript arrives automatically. If the call was unrecorded or captured manually, upload the notes or transcript to the job record in AccuLynx; the bridge will pick them up.
2. **Dual-track atomization.** Capture separates hard atoms (technical, code, financial, ops) and soft atoms (relational, EEAT, values). Both tracks are tagged with `property_id`, `job_id`, `era_of_practice`, and `regulatory_snapshot_id`.
3. **Quality Control is notified.** QC reads the hard-atoms summary. If failure modes from Q2 have appeared 3+ times in prior debriefs, QC adds this debrief to the DMAIC backlog.
4. **Marketing is notified.** Marketing reviews soft atoms with `eeat_signal.value > 0.7` for draft case study or testimonial candidacy.
5. **Innovator is notified.** Innovator scans for "we did this manually again" patterns as A3 candidates.
6. **Property record updated.** The property's `property_history` is updated; the debrief atoms are linked back to both the job and the property.

The full pipeline is documented in `recipes/post-op-debrief/`.
