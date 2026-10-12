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

## Session 23:40 (same sitting, after Chris answered)

**Goal**: Chris answered PEC-574 in the session: all eleven foundations defaults accepted; A3 approved for M0 to M4, M5 held for PEC-576. Continue the build.

**Deliverables**:
- A3 and proposals backlog marked approved; `docs/decisions/D1-foundations.md` marked approved; PEC-574 Done in Linear.
- CRM branch `claude/site-inspection-begin` (stacked on #179): PEC-581 (set up and begin) and PEC-583 (protocol v1 as data, shared evaluator, route screen). Migration `20261104010000_crm_site_inspection.sql`, page `/site-inspection`, API `/api/site-inspection`, switch `CRM_SITE_INSPECTION_ENABLED`, `docs/architecture/SITE-INSPECTION.md`, INSPECT-1–11 in the CRM `docs/DECISIONS.md`.
- Fix pushed to #179: the autofix workflow must mirror every `verify.yml` check (a unit test enforces it).

**Decisions** (agent):
- PEC-581 and PEC-583 ship in one PR with one migration: three unapplied migrations rewriting the same function in a row would be worse. PEC-582 (setup screen) gets its own migration.
- Begin starts an arrival already checked in on Inspection & Assessment rather than recording a second one.
- "Who can add them" = people who manage assignments for the job's office (`crm_private.can_manage_office`).
- One inspection open per sales effort at a time.
- The database suite is a vitest file under `tests/database` (run by `test:db:core`), because a plain script cannot import the TypeScript request handler.

**Lessons**:
- A `LANGUAGE sql` function is checked when created. Several database suites replay only some migrations, so a new migration's SQL-language function that calls a later-skipped helper fails there. Use plpgsql for helpers that call across migrations.
- Run the whole unit suite after touching `.github/workflows/verify.yml`; `tests/unit/error-autofix-pipeline.test.ts` pins `autofix.yml` to it.

**Open threads**: PEC-582 (setup screen, readiness check; access notes need a table outside the audit capture, which records whole rows), PEC-597–599 (launch points), PEC-584 (example images), PEC-588 (mockups), decision drafts PEC-575–577.
