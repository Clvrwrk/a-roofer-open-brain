# A3: Guided site inspection walkthrough in the CRM

Proposed by: Chris (brief of 2026-10-11; Linear project CRM_PWA_SITE_INSPECTION, PEC-570 to PEC-644)
Date: 2026-10-11
Status: pending
Affected clients: pro-exteriors
A3 file: proposals/2026-10-11-crm-site-inspection-walkthrough.md

---

## 1. The problem (measured)

- **Task being performed today:** a sales rep inspects a property by taking photos in CompanyCam or the phone's camera, keeps the job in AccuLynx, and types notes later. The CRM's own Inspection & Assessment page exists and has no live use (0 rows, 2026-10-11).
- **What is measured:**
  - 4,666 properties have a CompanyCam project and 845 have more than one, so photos of one house are already split across projects.
  - The CRM's "Inspection photos (at least 50)" gate checks a count, not coverage. Fifty photos of one slope pass it.
  - 10 jobs sit at the inspection stage in the CRM today; 4 of 7,008 sales efforts are native to the CRM, the rest are imported.
  - Nothing links a new lead's property to its CompanyCam project: of 3 CRM-born properties, 0 have a CompanyCam id.
- **What is not measured:** minutes per inspection, how often a penetration or roof face is missed, how often a pre-existing condition is disputed after the job, and the hours spent re-asking the rep for access and logistics. The project's own measures ticket (PEC-643) takes the time baseline from first-to-last photo times on recent CompanyCam projects.
- **Total monthly human cost:** not computable from what is measured. The cost that matters is the cost of an error: a missed penetration found on production day, or a damage dispute with no photo of the condition before work.

## 2. Root cause (5 Whys)

1. Why does coverage differ from rep to rep? — Nothing tells the rep which shots to take or how to frame them.
2. Why is that not already automated? — CompanyCam stores photos; it does not run a protocol. The CRM's inspection page records answers, not captures.
3. Why are the existing tools inadequate? — CompanyCam's API cannot accept video or audio, has no idempotency key, and its projects are publicly viewable by default. AccuLynx holds the job, not the evidence. Signal on site is poor and the CRM's offline mode covers drafts only.
4. Why not before? — The CRM had to exist first: sales efforts, the property spine (docs/113–116) and the job journey with its photo gate.
5. Why now? — The journey's inspection gate is live and counts photos nobody is guided to take; Lead Intake creates the property and sales effort the inspection hangs from.

## 3. Proposed solution

- **Which surface receives this:** the CRM (sales). No Open Brain agent gains a skill in v1.
- **What it does:** a guided walk on the rep's phone, started from the sales effort. Ten ground stops, backyard structures, then one stop per roof face. At each stop the camera shows a crop frame, a one-line instruction and an example; required close-ups hold the next stop until each is captured or marked Not here. The rep's narration is recorded after a Start screen that says so, or typed notes where recording is not allowed. Everything is saved on the phone first and uploads while the app is open. After submit, a worker transcribes the narration, finds or creates the property's one CompanyCam project, mirrors the photos, and drafts three reports: homeowner, company record, production site brief. A person reviews each; the homeowner report needs a manager's approval and staff send it by hand.
- **Brain rules it touches:**
  - **Hard rule 7, property-first:** every inspection pins the sales effort's `property_id`; the CompanyCam project id and link are written to the property's existing fields.
  - **Hard rule 4, trust tier:** drafted findings are `evidence`. A finding enters the record only when the inspector confirms it, and cannot be confirmed without a real capture.
  - **Hard rule 12, third-party tool gate:** not triggered. Transcription, FAL and CompanyCam are REST APIs called by a worker, not a skill, plugin, MCP or agent wrapper. Each is behind its own switch, default off.
  - **CompanyCam mirror-only rule:** changed. One CRM worker would write to CompanyCam. That needs Chris's explicit approval, an ADR, a development account and a sandbox run before any production write (PEC-576).
  - **No external send without a person:** kept. Nothing is sent to a homeowner by the system.
- **Open Brain work in scope:** two tickets (PEC-634, PEC-635): link CRM-created CompanyCam projects to their property in the mirror, and give CRM-born properties the address key and location the mirror matches on. No atoms are written in v1; the inspection emits the existing `inspection.observed` event for a later capture job.
- **Trust tier of output:** `evidence` for captures, transcript and drafted findings; the reviewed snapshot is the record.

## 4. The new state (projected)

- **Time per occurrence:** not projected. The aim is the same visit with complete coverage, not a shorter one. Reports stop being separate rework: the homeowner report is edited instead of written, and production stops calling the rep.
- **Error rate:** every required item is captured or explicitly marked Not here or Not accessible with a reason, and the server refuses a submit with gaps.
- **Cost of operation per inspection:** transcription at $0.21 to $0.36 per hour of audio (research, 2026-10-11), so cents per inspection; findings drafted from text only; storage of about 50 to 150 photos of at most 16 MiB each. Example framing images are generated once at build time.
- **Required human review:** yes. The inspector confirms every finding; a manager approves the homeowner report; a person confirms the CompanyCam project whenever there is a candidate or several.

## 5. The math

| Item | Value |
|---|---|
| X, current monthly cost | not measured (see section 1) |
| Y, new monthly operating cost | transcription and model text: cents per inspection; reviewer time is the existing review, moved earlier |
| Z, one-time build | 75 tickets in seven milestones: 56 an agent can finish, 2 Open Brain, 8 drafted by an agent for Chris to decide, 9 that are Chris's alone. Hours not estimated |
| **ROI multiplier** | **not computable** |

**Exempt from 10x gate?** **Yes — mission-grade infrastructure.** This is how inspection evidence enters the property record: the property data model and the capture pipeline, not an optimization of a measured task. The error-cost argument also applies (a damage dispute with no record of prior condition), but that cost is not measured and is not relied on here.

## 6. Risks

- **What breaks if it misbehaves:**
  - A duplicate CompanyCam project. One project per property is an invariant; the worker creates only when there is no candidate, under a per-property lock.
  - Generated example images mistaken for evidence. They have no asset id and cannot enter a report or CompanyCam.
  - A homeowner recorded without consent. Recording starts only at a stated Start; listed states default to notes-only until counsel answers (PEC-575).
  - Captures lost on a phone that never syncs. Unsynced captures are locked, never deleted, without the inspector.
  - The riskiest technical assumption, one stream giving photos and narration in an installed iPhone app, is unproven. It is tested on real phones in the first milestone (PEC-587) before anything is built on it.
- **Rollback path:** every part is behind a switch, default off. Turning the feature switch off hides it; nothing is deleted. Migrations are additive.
- **New consent flags required?** Yes: a recording-consent rule keyed to the property's state, with a notes-only mode. No cross-client consent path is touched.
- **New standards checks required?** The protocol maps to the existing brand shot standard; no new domain standard.

## 7. Alternatives considered

- **Leave it human:** reps keep using CompanyCam's camera. Coverage stays uneven and the gate keeps counting photos instead of coverage.
- **A separate app:** rejected. The sign-in is bound to the CRM host and an installed iPhone web app cannot be opened from another origin.
- **A wrapped native app:** only if background upload, persistent camera permission or uploading while locked becomes a requirement.
- **Defer until:** the device proof fails on the phones reps carry. Then voice falls back to notes-only on those phones and the rest proceeds.

## 8. Decision

- [ ] **Approve** — build by milestone, M0 first; pilot client: pro-exteriors
- [ ] **Kill** — reason:
- [ ] **Defer** — revisit at: , condition:

Approver: Chris
Approved / decided on:

**Recommendation: approve M0 to M4** (rails and proof, guided capture, offline and voice, transcript and review, reports). **Hold M5** (CompanyCam writing) for its own decision, PEC-576.

---

## 9. Post-build tracking (completed after pilot)

- Inspections submitted out of started:
- Required items captured versus marked Not here or Not accessible:
- Minutes from begin to submit, against the CompanyCam baseline:
- Captures uploaded at the first attempt:
- Inspections reviewed on a desktop:
