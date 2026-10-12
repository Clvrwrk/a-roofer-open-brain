# 2026-10-11 — CRM_PWA_SITE_INSPECTION build, session 2

## Session 23:16

**Goal**: Chris: "build CRM_PWA_SITE_INSPECTION". Build every ticket that has no blocker and put the foundations decision in front of him.

**Deliverables** (CRM repository `Clvrwrk/CRM_PWA`, working clone `~/site-inspection-build/crm-work`, base `main` `a70ffc2`):
- Draft PR CRM_PWA#178, branch `claude/site-inspection-prefactors`: PEC-570 (dock task can open a route), PEC-571 (service worker precaches a list of shells), PEC-572 (`scripts/route-over-postgres.mjs` shared test helper), PEC-573 (inline media read with byte ranges, `media-src 'self'`), PEC-585 (`docs/qa/SITE-INSPECTION-DEVICE-CHECKLIST.md`).
- Draft PR CRM_PWA#179, stacked on #178, branch `claude/site-inspection-storage-prep`: PEC-579. Migration `20261103010000_crm_inspection_media_policy.sql` (switch off, predicate, no Storage grant) and the operator step `ops/inspection-media/` (installer, rollback, runbook with production's policy inventory). Not applied anywhere.
- Open Brain (this branch): A3 `proposals/2026-10-11-crm-site-inspection-walkthrough.md` (pending) and its backlog entry.
- Project folder: `docs/decisions/D1-foundations.md` (eleven yes/no decisions, the INSPECT-1–11 block, the amended-rules table). Posted as a comment on PEC-574.
- Linear: PEC-570–573, 579, 585 moved to In Review with PR links.

**Decisions** (agent, for Chris to confirm in review):
- PEC-579 is split: a harmless migration plus an operator installer, like job files and staff photos. A migration in `main` is applied by the next release, so the grant could not sit in one ahead of Chris's PEC-580 decision.
- `GRANT INSERT ON storage.objects TO member` is table-wide and would make `crm_job_file_create` and `crm_staff_photo_create` reachable. `crm_member_upload_fence` (restrictive) keeps staff inserts to `crm-inspection-media`. Removing it makes the suite fail, which proves the point.
- The inspection Storage predicate is effort-scoped and switched off; PEC-589 tightens it to reserved catalog keys before the switch is turned on.
- PEC-573 keeps the whole-object read and hash check per range request (up to 25 MiB per seek) rather than passing the range to Storage.
- D1 item 6 minimum photo size: proposed 1,920 px on the long side (a 1080p stream frame). The only default not taken from the spec.
- Did not start PEC-581 or anything behind D1: the ticket structure Chris approved gates them on his answer.

**Open threads**:
- Chris: answer PEC-574 ("all yes" or the numbers to change); review and merge #178 then #179 (retarget #179 to `main`); PEC-580 (decide, create the bucket, run the installer).
- Known unknown: hosted Storage may insert with `RETURNING`; no production upload has ever tested any CRM Storage fence. First real photo (PEC-601) settles it.
- Other decision drafts not written yet: PEC-575 (voice), PEC-576 (CompanyCam, ADR 0009), PEC-577 (reports).
- This Open Brain branch is pushed, not merged: a push to `main` deploys the Command Center and it holds only the A3, the backlog entry and this log.
- Local test database: Docker container `site-inspection-pg` on 127.0.0.1:55439 (throwaway).
