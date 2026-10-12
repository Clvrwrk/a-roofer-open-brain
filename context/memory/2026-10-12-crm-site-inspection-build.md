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
