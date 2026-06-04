# Recipe: Storm Response

> **Purpose:** End-to-end SOP for a roofing company's insurance-track storm workflow — from storm event detection through canvassing, inspection, claim filing, adjuster meeting, supplement, approval, scheduling, installation, close, and post-op debrief. This is the highest-value recurring workflow in residential storm-damage roofing and the one most responsible for revenue concentration risk when execution quality varies.

- **Trigger:** Storm event detection (automated) or manual canvass-launch by `@ob-sales`.
- **Terminal state:** Job closed in AccuLynx + post-op debrief completed + insurance proceeds fully reconciled in QuickBooks.
- **Primary agents:** Conductor, `@ob-sales`, `@ob-ops`, `@ob-accounting`, Capture.
- **Supporting agents:** Historian (prior property history), Researcher (storm data, insurer reputation), Auditor (all outbound artifacts).

---

## Phase 1 — Storm event detection

**Trigger sources (any of the following fires the recipe):**

- Automated: Researcher monitors NOAA storm-report RSS feeds and NWS severe weather alerts for the client's configured service area. Hail ≥ 1" diameter OR wind gust ≥ 60 mph triggers a storm event atom.
- Manual: PM or owner posts in the configured Slack channel: "storm-response start [zip codes or neighborhood]". Conductor interprets and opens the recipe.
- AccuLynx: If the client uses AccuLynx's storm-tracking integration, the webhook fires directly.

**Conductor actions on detection:**

1. Writes a storm event atom: `{event_date, hail_size_inches, wind_mph, affected_zip_codes, source: "NOAA" | "manual" | "acculynx"}`, `trust_tier = "evidence"`.
2. Notifies `@ob-sales` and the PM via Slack: "Storm event detected [date] in [area]. Hail [size]. Canvass window: [config.canvass_window_days] days. Ready to launch canvass?"
3. Human (PM or owner) confirms go/no-go on canvass. Conductor waits up to 4 hours; if no response, escalates to the Cleverwork AM.

**Agent:** Researcher (event detection), Conductor (routing + notification).

---

## Phase 2 — Canvassing routes

**Trigger:** PM confirms canvass go.

**`@ob-sales` actions:**

1. Pulls the affected zip codes from the storm event atom.
2. Calls Historian: retrieve all properties in the affected area where the client has done prior work (property atoms with matching jurisdiction or proximity). These are warm-call candidates — flag them separately.
3. Calls Researcher: retrieve public parcel data for the affected area to build cold-canvass address lists. Source: county assessor public records or configured parcel-data API.
4. Produces a canvass route plan (atom type: `canvass_plan`): warm-call list (prior clients), cold-canvass street-by-street sequence optimized for crew efficiency, assigned canvassers from `config.crews`.
5. Auditor reviews: no PII beyond address + owner name from public records, no fabricated damage claims in canvass scripts.
6. Conductor posts canvass route to assigned crew members' Slack.

**Output atoms:** `canvass_plan` (hard, evidence), `warm_call_list` (hard, evidence, `cross_client_shareable = false`).

**Agent:** `@ob-sales`, Historian, Researcher, Auditor, Conductor.

---

## Phase 3 — Inspection and CompanyCam evidence capture

**Trigger:** Homeowner agrees to inspection (canvasser records "agreed to inspect" in AccuLynx or Slack).

**`@ob-ops` actions:**

1. Schedules inspection appointment; updates AccuLynx job phase to `inspection_scheduled`.
2. Dispatches EagleView aerial measurement order for the property (if configured; `config.integrations.eagleview.enabled`).
3. Issues CompanyCam photo checklist to the inspector:

   **Required photo categories (Auditor will reject without all):**
   - Overall roof overview (4 compass directions)
   - Hail impact on shingles (granule loss, spatter marks, bruising)
   - Hail impact on soft metals (gutters, downspouts, flashing, vents, AC units)
   - Ridge line and hip condition
   - Fascia and soffit condition
   - Interior attic — evidence of water infiltration if any
   - Chimney and pipe boot condition
   - Any pre-existing damage clearly labeled as such

4. Inspector completes inspection; CompanyCam album is linked to the AccuLynx job.
5. Capture atomizes inspection findings: `soft_or_hard = "hard"`, `trust_tier = "evidence"`, `property_id` required, `era_of_practice` stamped (e.g. `IRC-2021` for the applicable roofing standard).
6. EagleView measurement report attached to job when returned.

**Quality gate:** Auditor checks CompanyCam album completeness against the required-photo checklist. Missing categories → Conductor notifies inspector to return for supplemental photos before claim is filed.

**Agent:** `@ob-ops`, Capture, Auditor, Conductor.

---

## Phase 4 — Insurance claim filing

**Trigger:** Inspection complete + CompanyCam album passes Auditor.

**`@ob-sales` actions:**

1. Generates claim-filing packet from AccuLynx:
   - Signed Contingency Agreement (or Direction to Pay, per client's workflow preference)
   - CompanyCam photo album link (PDF export)
   - EagleView measurement report
   - Scope-of-loss summary (drafted by `@ob-sales`, reviewed by Auditor)

2. Scope-of-loss summary format:
   - Property address and parcel ID
   - Date of loss (from storm event atom)
   - Affected materials: shingles (manufacturer, style if known), flashings, gutters, soffit/fascia, accessory items
   - Estimated replacement cost (ACV basis for initial claim; RCV recovery noted as pending)
   - GAF / OC / CertainTeed material specification (per client's preferred manufacturer from `config.manufacturer_preference`)

3. Auditor reviews scope-of-loss: math correct, no pre-existing damage attributed to storm, era-appropriate material specs.

4. Homeowner or PM files with insurer. Job phase updated to `claim_filed` in AccuLynx.

**Output atoms:** `claim_packet_summary` (hard, evidence), `scope_of_loss_v1` (hard, evidence).

**Agent:** `@ob-sales`, Auditor.

---

## Phase 5 — Adjuster meeting preparation

**Trigger:** Insurer schedules adjuster site visit (AccuLynx job phase transitions or PM posts in Slack).

**`@ob-sales` + `@ob-ops` actions:**

1. Historian retrieves prior adjuster meeting atoms for this insurer or this jurisdiction: known adjuster preferences, common dispute items, successful supplement patterns.
2. Researcher pulls current Xactimate pricing for the jurisdiction and current insurer's known settlement posture (where available in public claims data or industry sources).
3. `@ob-sales` produces adjuster meeting prep packet:
   - Photo summary (top 12 photos from CompanyCam album, labeled)
   - Code citation sheet: local AHJ requirements that mandate specific line items (ice-and-water shield requirements, drip edge code, decking replacement triggers). Era-stamped (`era_of_practice`).
   - Prior property history note (if Historian found relevant atoms)
   - Xactimate line items the client expects to be on the estimate (with code backing)

4. Auditor reviews: code citations verified against current regulatory snapshot, Xactimate line items plausibly scoped.

5. PM attends adjuster meeting with packet.

**Output atoms:** `adjuster_prep_packet` (hard, evidence), `adjuster_meeting_notes` (hard, evidence — captured post-meeting).

**Agent:** `@ob-sales`, `@ob-ops`, Historian, Researcher, Auditor.

---

## Phase 6 — Xactimate supplement

**Trigger:** Initial adjuster estimate received and reviewed. Supplement threshold: any line item discrepancy ≥ $200 or any omitted code-required item.

**`@ob-accounting` + `@ob-sales` actions:**

1. `@ob-accounting` imports the insurer's Xactimate estimate (PDF or XML from AccuLynx).
2. Compares line-by-line against the client's scope-of-loss (`scope_of_loss_v1` atom) and the current Xactimate pricing database (Researcher provides if not already retrieved).
3. Identifies supplement candidates:
   - Omitted line items (code-required items not included by adjuster)
   - Under-priced line items (price below current Xactimate market for jurisdiction)
   - Missing O&P on items where general contractor markup applies
   - ACV vs. RCV depreciation recovery (track holdback amounts)

4. `@ob-sales` drafts supplement letter: structured argument per line item, each backed by either a code citation or a Xactimate pricing reference. Format: itemized table + narrative cover letter.

5. Auditor reviews: math verified, code citations current, no items claimed without documentation.

6. PM submits supplement to insurer. Job phase → `supplement_submitted`.

**Output atoms:** `supplement_v1` (hard, evidence), `supplement_math_audit` (hard, evidence — Auditor's pass artifact).

**Agent:** `@ob-accounting`, `@ob-sales`, Researcher, Auditor.

---

## Phase 7 — Approval and scheduling

**Trigger:** Insurer issues approval (final estimate accepted or supplement partially/fully approved).

**Conductor + `@ob-ops` actions:**

1. `@ob-accounting` reconciles approved amount vs. original scope: records ACV payment, holdback (RCV depreciation), and any outstanding supplement items still pending.
2. `@ob-ops` creates the install job in AccuLynx with approved scope, material quantities from EagleView, and scheduled crew.
3. Materials order generated: manufacturer selection from `config.manufacturer_preference`, color match from CompanyCam photos, quantity from EagleView report.
4. Permit pulled if required by jurisdiction (`config.jurisdictions.[id].permit_required_for_reroof`). `@ob-ops` flags permit requirement; PM handles filing.
5. Conductor posts schedule to crew Slack + homeowner notification (template from `config.homeowner_comms`).

**Output atoms:** `approved_scope` (hard, instruction — human-confirmed approval), `materials_order` (hard, evidence), `permit_record` (hard, evidence).

**Agent:** `@ob-accounting`, `@ob-ops`, Conductor.

---

## Phase 8 — Installation

**Trigger:** Install date.

**`@ob-ops` actions throughout install:**

1. Morning of install: Conductor posts crew briefing — property address, approved scope summary, any site-specific notes from prior property atoms (Historian retrieves), safety requirements.
2. Daily log capture: foreman posts end-of-day log to designated Slack channel. Capture atomizes: `{date, crew, work_completed, materials_consumed, issues}`, `trust_tier = "evidence"`.
3. CompanyCam progress photos: Capture links new albums to the job's atom set daily.
4. Any scope deviation (discovered damage, decking replacement trigger, additional layers) → `@ob-ops` documents in AccuLynx + creates a change-order draft (routed to `@ob-accounting` for pricing, then Auditor, then homeowner signature).
5. Install completion: crew documents final conditions in CompanyCam (close-out album: completed field, clean gutters, no debris, material waste staged).

**Quality gate:** Auditor reviews close-out CompanyCam album against required close-out photo checklist before job advances to `punch` phase.

**Output atoms:** Daily log atoms (hard, evidence), change-order atoms if applicable (hard, instruction once signed).

**Agent:** `@ob-ops`, Capture, `@ob-accounting`, Auditor, Conductor.

---

## Phase 9 — Close and final reconciliation

**Trigger:** Install complete + close-out photos pass Auditor.

**`@ob-accounting` actions:**

1. Final invoice issued via AccuLynx / QuickBooks: total approved scope + approved change orders, minus ACV already received, equals RCV holdback request + homeowner deductible.
2. Depreciation recovery (RCV holdback) request submitted to insurer with certificate of completion.
3. Manufacturer warranty registration submitted (GAF, OC, or CertainTeed — per installed materials). Warranty record atom created: `{manufacturer, warranty_tier, registration_date, property_id, job_id}`.
4. `@ob-accounting` confirms: all supplement items resolved or closed with documented reason. AR aging checked: zero open items past 30 days before job marked closed.
5. AccuLynx job phase → `Closed`.

**Output atoms:** `final_invoice` (hard, instruction — signed), `warranty_registration` (hard, evidence), `financial_close_summary` (hard, evidence).

**Agent:** `@ob-accounting`, Auditor.

---

## Phase 10 — Post-op debrief

**Trigger:** AccuLynx job phase = `Closed` fires `job.closed` webhook → hands off to `recipes/post-op-debrief`.

See `recipes/post-op-debrief/README.md` for the full SOP.

Storm-specific debrief notes to surface in Q2 (what diverged) and Q3 (era-aware):
- Were any supplement items denied? What was the insurer's stated reason?
- Did any code citation succeed or fail with the adjuster? Which ones?
- Did the EagleView measurement match actuals? Where did it diverge?
- Any insurer-specific patterns worth capturing for Historian?

---

## End-to-end agent map

| Phase | Primary | Supporting |
|---|---|---|
| 1 — Storm detection | Researcher, Conductor | — |
| 2 — Canvassing | `@ob-sales`, Historian, Researcher | Auditor, Conductor |
| 3 — Inspection | `@ob-ops`, Capture | Auditor, Conductor |
| 4 — Claim filing | `@ob-sales` | Auditor |
| 5 — Adjuster prep | `@ob-sales`, `@ob-ops` | Historian, Researcher, Auditor |
| 6 — Supplement | `@ob-accounting`, `@ob-sales` | Researcher, Auditor |
| 7 — Approval + scheduling | `@ob-ops`, `@ob-accounting`, Conductor | — |
| 8 — Installation | `@ob-ops`, Capture | `@ob-accounting`, Auditor, Conductor |
| 9 — Close | `@ob-accounting` | Auditor |
| 10 — Debrief | See post-op-debrief recipe | — |

---

## Config keys consumed by this recipe

All keys live in `config/roofer.config.yaml` unless noted.

| Key | Purpose |
|---|---|
| `service_area.zip_codes` | Geographic scope for storm event detection |
| `service_area.counties` | County-level scope for canvass lists |
| `canvass_window_days` | Days after storm event to canvass |
| `integrations.eagleview.enabled` | Toggle EagleView measurement orders |
| `integrations.companycam.enabled` | Toggle CompanyCam album linking |
| `manufacturer_preference` | Default shingle manufacturer (GAF, OC, CertainTeed) |
| `jurisdictions.[id].permit_required_for_reroof` | Per-jurisdiction permit flag |
| `homeowner_comms.schedule_template` | Homeowner schedule notification template |
| `crews` | Crew roster for canvass assignment and install scheduling |

---

## Changelog

| Date | Version | Summary |
|---|---|---|
| 2026-05-29 | v1 | Initial SOP. 10-phase end-to-end storm workflow. Agent map, quality gates, config keys. |
