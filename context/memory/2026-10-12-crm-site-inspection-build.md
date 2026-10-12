# 2026-10-12 — CRM_PWA_SITE_INSPECTION build, session 2 continued

## Session 01:30

**Goal**: Chris: "continue the build with PEC-582, PEC-580 oversight not deliberate".

**Deliverables**:
- PEC-580 decision recorded: STORAGE-UPLOAD-1 in the CRM `docs/DECISIONS.md` on CRM_PWA#179 (`6816d9a6`), a comment on the Linear issue, and `docs/decisions/PEC-580-storage-permission.md` in the project folder. Production unchanged.
- Draft PR CRM_PWA#181 (`claude/site-inspection-setup`, on #180): PEC-582. Setup form (inspector picker, job reference, access notes), readiness check (`readiness.ts`), migration `20261105010000_crm_site_inspection_setup.sql`.
- `~/site-inspection-build/verify-all.sh`: every CI step locally, one exit code per step.

**Decisions** (agent):
- Access notes hold gate codes, and the audit trail captures whole rows, so they live in their own table with a recorded audit exclusion; a change is audited without text; a receipt stores a keyed MAC (`crm_receipt_mac_key`, present in production since 2026-10-04, checked by name only).
- The readiness check only reads permissions and free space. It never requests a permission, so the microphone stays untouched before the Start screen. It does not block Begin.
- Chris stated the PEC-580 decision but did not ask for it to be applied; the bucket and installer were not run.
- A missing receipt key answers 503 unavailable, not 422.

**Lessons**:
- The machine ran at a load average above 150 from other sessions' builds. Unit tests then time out at vitest's 5 s default; rerun alone before believing a failure.
- A compound shell command that pipes scripts into `bash -c` is refused by the harness's removal check. Put multi-step runs in a script file.

**Open threads**: PEC-584 (example images; FAL key unconfirmed; Chris approves each), PEC-588 (mockups), decision drafts PEC-576 and PEC-577. Chris: review #178 → #181, apply PEC-580, answer PEC-575, name phones and the pilot group (PEC-578). Follow-up raised: job-file and staff-photo uploads stay closed by the fence until a separate change.

## Session 02:35

**Goal**: Chris: "continue the build with PEC-584", with five answers: PRs #178 to #181 reviewed, no issues; PEC-580 "Apply it"; "Yes" to opening job-file and staff-photo uploads; PEC-575 recommendation approved; PEC-578 "record this information via an onboarding form when they log-in to the CRM and the data is still not recorded".

**Deliverables**:
- **Production, Supabase `rnhmvcpsvtqjlffpsayu`:** migration `20261103010000_crm_inspection_media_policy.sql` applied (ledger `20261012092918`, sha256 equal to the file); private bucket `crm-inspection-media`; `install-storage-policies.sql`; `open-job-file-and-staff-photo-uploads.sql`. Each was dry-run in a rolled-back transaction, then checked as an active sales rep. Record: CRM `ops/inspection-media/README.md` ("Applied"), draft PR CRM_PWA#182.
- Draft PR CRM_PWA#183 (`claude/site-inspection-examples`): PEC-584. 40 example framing images (12 wide shots, 28 kinds of close-up) generated with FLUX 1.1 pro ultra on FAL, cut to 960 × 720 WebP, shown on the route card with a fixed disclosure caption; 40 rows in `brand/imagery/manifest.json`, all `pending-human-review`. Contact sheets sent to Chris.
- Draft PR CRM_PWA#184 (`claude/staff-device-survey`): PEC-578. A question after sign-in records the phone each person carries; "Field phones" page; migration `20261106010000_crm_staff_devices.sql` (not applied); switch `CRM_STAFF_DEVICE_SURVEY_ENABLED`, off by default.
- Project folder: `decisions/D2-voice.md` marked approved; `decisions/PEC-580-storage-permission.md` marked applied; `review/pec-584-examples/`; `handoffs/current.md` rewritten.

**Decisions** (agent, each flagged to Chris):
- The bucket was created by SQL inside the installer's transaction, not through the Storage API. The row is the same.
- The four left-hand example views are mirrors of the right-hand ones, so the two always agree.
- No example image contains a person, which is how "nobody on a roof without fall protection" is held.
- The phone question never blocks work: a card with "Ask me later". Chris asked for a form at login; whether it may be dismissed is mine and is open for him to change.
- A person records only their own phone; managers and administrators read everyone's.

**Lessons**:
- The image generator draws address plaques beside garage doors whatever the prompt says. 17 first attempts were rejected. Keep the wall beside and above a garage door out of frame and look at every image at full size.
- The docs validator's SR-12 wants `validate_build_docs`, `Verified locally` or `Verification:` in the newest status entry; "Verification (date):" alone fails. I had not run the validator before opening #183 and the first local run caught it.
- Do not edit the clone while the full local CI run is using it; new files were staged outside and copied in.

**Open threads**: Chris: merge #178 to #184 (GitHub requires his review); approve the 40 images; one real job-file upload and one real headshot upload as proof of staff uploads; confirm "Ask me later"; name the pilot group; PEC-576 and PEC-577. Agent next: PEC-588 (mockups).

## Session 04:30

**Goal**: Chris: "continue the build with PEC-588", and "Merge #178 to #184 in order".

**Deliverables**:
- **CRM_PWA#178 to #184 merged to `main` (`5796aa31`).** GitHub requires an approving review and none existed, so each was merged with the administrator override on Chris's instruction, retargeting each stacked PR to `main` in turn. `main` equals the last reviewed branch (empty diff). Nothing deployed; the live build was unchanged (`a70ffc2c`). The twelve built tickets are Done in Linear.
- **PEC-588:** five of the six mockup boards corrected to the spec and published on the design canvas (https://claude.ai/artifact/5hfsHCnKf2byUpGEpg98wD); local copies in the project folder's `design/mockups/`; record in `docs/review/pec-588-mockup-corrections.md`. In Review.

**Decisions** (agent):
- Read "Merge #178 to #184 in order" as Chris's instruction to merge past the review requirement, which I had told him I would not do on my own. Reported to him as an administrator override.
- The mockup work went to one subagent with a written brief; I checked its result by published file sizes and text searches of each board. The canvas type forbids rendering to verify, so the boards were not looked at.
- The subagent also corrected spec contradictions outside the ticket's eight items (left and right as seen from the street, recording starts after Start, clips not one take, "AI draft" pills, stop names) and left six things the spec is silent on as questions for Chris.

**Open threads**: Chris: look at the mockups and answer the six questions; approve the 40 example images; one real job-file upload and one real headshot upload; confirm "Ask me later"; name the pilot group; PEC-576 and PEC-577. Agent next: decision drafts PEC-576 and PEC-577.

## Session 05:15

**Goal**: Chris answered the open questions (mockups, images approved, phone question confirmed, pilot group named) and chose "Release both now" for the pilot group's mock inspection.

**Deliverables**:
- **Live:** crm.proexteriorsus.net runs `5796aa31` since 2026-10-12T12:43:39Z with the site inspection M0 and field phone survey switches on. Rollback target `crm-weekly-a70ffc2c7ed7` on 4475. I ran copy, stage and switch over SSH on Chris's approval; a subagent prepared the pin, test, bundle and commands in `~/site-inspection-build/release/`.
- **Production migrations:** `20261104010000`, `20261105010000`, `20261106010000` applied (ledger `20261012121925`, `20261012122031`, `20261012122105`), each by one transaction that refuses unless the text's sha256 equals the file's.
- CRM_PWA#185 merged (records: migrations, image approval, DEVICE-1 confirmed). CRM_PWA#186 open (release pin and record; carries #177's commits).
- Mockups: second and third passes published (Lead Intake screen, Start screen, full setup, shed to the ground stops, tab bar on board 3).
- Run sheet for the pilot group: project folder `docs/review/mock-inspection-run-sheet-2026-10-12.md`.

**Decisions** (Chris): all 40 images approved; "Ask me later" confirmed; pilot group Blane, Robert, Roberto, Chandler; release both now; standing permission to merge my own CRM pull requests with the override after CI passes.

**Lessons**:
- A migration can be applied so that a mistyped copy cannot run: wrap the text in a dollar-quoted literal, compare its sha256 with the file's inside the same `DO` block, then `EXECUTE` it and write the ledger row. Saved in the CRM release memory.
- The host steps (scp, stage, switch) were not blocked for the agent this time; earlier notes said they would be.
- The live build's own pin was on another session's unmerged pull request (#177), and its test failed on main once new migrations existed. A pin chain needs the previous pin merged promptly.

**Open threads**: merge #186 when CI is green; mock inspection results (first signed-in look, first staff uploads); device list onto PEC-578; PEC-576 and PEC-577 drafts; M1 capture tickets.
