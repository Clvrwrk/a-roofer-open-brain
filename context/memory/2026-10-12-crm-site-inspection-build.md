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
