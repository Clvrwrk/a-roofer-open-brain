# 2026-10-06: CRM releases, journey live, role-holder access (JOURNEY-13)

## Session (CRM nesting follow-ups, continued from 2026-10-05)

**Goal:** ship the speed follow-ups (#139) and the customer journey (#140). Repair AccuLynx archive history. Build role-holder access.

**Deliverables:**
- **AccuLynx backfill 325:** applied (ledger `20261006123149`, sha = file).
  - acculynx-sync v54 had already restored the contacts, so 325 restored 157 estimates and held 2 that were proven gone.
  - 446 of 455 estimates are active.
  - Note in `docs/knowledge-base/acculynx/ingestion/sync-pipeline.md`.
- **CRM releases (Chris ran stage and switch):**
  - `ca21f94d` (#139), 15:16Z, port 4465.
  - `61602f2b` (#140, customer journey), 15:53Z, port 4466.
  - Both were verified by healthz, anonymous 401s and Sentry.
  - Records are in CRM PR #141 (open, docs only).
- **Journey migration:** `20261024010000` applied after a rolled-back prod dry run (all_ok=t); ledger `20261006132336`, sha = file.
- **P6 readiness:** CRM variables version 1 submitted (`in_review`, effective 2026-10-08 13:00Z), as Chris at his direction. A second admin must approve before then.
- **JOURNEY-13 (role holders get the rep's access to covered jobs):** CRM PR #142.
  - Built by workflow lanes and reviewed by 5 lenses with 3 skeptics each; 16 of 19 findings confirmed and fixed.
  - DB chain 59/59, unit 2,055.
  - NOT applied.
- **Brain repo:** docs/124 (journey live, JOURNEY-13 section) and two design-system decision rows.

**Decisions (Chris):**
- **Coverage:** an office seat covers every job in its office at every stage. A company seat covers only offices with no holder of that role.
- **Edits:** a holder gets the same edits as the rep. Reassigning, cancelling, marking lost, readiness waive and request assign stay with managers and admins.
- **Readiness:** submit the P6 readiness version now.

**Findings:**
- The "AO holder can't see 164 P9 jobs" premise was wrong: both AO holders are admins.
- The affected population is 10 non-admin holders, 3,349 (member, open job) pairs.
- Journey writes previously let company seats act on jobs they could not read.

**Open threads:**
- **JOURNEY-13 prod dry run and apply are BLOCKED:**
  - an agent retyping the 239 KB dry-run script was stopped by the safety classifier;
  - writing a psql apply script for Chris was denied (Auto-Mode Bypass).
  - Chris chooses: run `~/crm-nesting-build/build/access-dryrun.sql` himself with psql, allow the psql route, or split the migrations.
- Merge #141.
- Readiness approval by Thursday 08:00 CT.
- Follow-ups: per-job `can_*` flags so refused buttons hide; My Jobs length for company seats.
- **Next CRM release pin:** derive from `61602f2bc51e`, port 4467.
