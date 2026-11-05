# 2026-11-04 — FL-49 missing from the CRM; AccuLynx import cutover extended

## Session 1

**Goal**: Explain why AccuLynx job FL-49 (Florida office) shows in the CC but not the CRM.

**Finding**: The CC reads `public.acculynx_jobs` (hourly sync, FL-49 = Approved 11/04). The CRM reads its own copy in `crm.efforts`, refreshed only by cron `crm-acculynx-nightly-sync` → `crm_private.acculynx_sync_nightly()`. That function skips any `crm_private.acculynx_import_settings` row past `cutover_at`, which was `2026-11-01 05:00 UTC`. From 11/1 the cron kept reporting "succeeded" while importing nothing (no `acculynx_import_runs` row after 10/31). FL-49's effort (`22c4b52a…`) froze as a 10/28 "Lead/prospect" with no job number, so a CRM search for "FL-49" finds nothing. Wider impact at the time: 269 linked AccuLynx jobs changed after the cutover, and 25 new jobs had no CRM effort.

**Change (prod DB, Chris approved "extend the cut over to 1/1/27")**:
- `crm_private.acculynx_import_settings.cutover_at`: `2026-11-01 05:00+00` → `2027-01-01 06:00+00` (midnight Central), org `ec0d8cb1-0467-4ca9-b58c-b8f3c29e05b5`, updated 2026-11-05 00:29 UTC.
- Rollback: `UPDATE crm_private.acculynx_import_settings SET cutover_at = '2026-11-01 05:00+00' WHERE organization_id = 'ec0d8cb1-0467-4ca9-b58c-b8f3c29e05b5';`
- Dry run of the catch-up sync (rolled back by design): 7,447 jobs seen, 28 created, 72 updated, 7,265 unchanged.
- The live catch-up run was not executed (blocked by the agent's permission check). The nightly cron at 09:30 UTC 2026-11-05 picks it up.

**Open threads**:
- [x] After 09:30 UTC 2026-11-05: confirm a new `crm_private.acculynx_import_runs` row and that effort `22c4b52a-b626-48f5-bdca-f531347c44af` shows milestone Approved with job number FL-49. Verified 2026-11-05 21:02 UTC in the DB: run at 09:30 (28 created, 72 updated, no error); FL-49 effort is now stage `production_signed`, phase 4, `acculynx_import.milestone = Approved`, `acculynx_job_number = FL-49`; the earlier cancelled lead is now `closed`. `crm.efforts.job_number` is still NULL (it only holds CRM-issued numbers for some rows), and the CRM UI itself was not checked.
- [ ] Before 2027-01-01: decide the real cutover (CRM as system of record) with the CRM team, or move the date again.
- [ ] CRM side: `acculynx_sync_nightly()` should log a run (or alert) when the cutover skips every row, instead of returning `[]` as success.
- [x] "~6,000 efforts without job numbers" was a false alarm. 6,108 AccuLynx jobs store `job_number = ''` (empty string, not NULL), and every one is a Lead/Prospect/Dead/Cancelled job, because AccuLynx numbers a job only once it progresses. With `nullif(job_number,'')`: 5,999 efforts have no number in AccuLynx either, 1,330 match exactly, 0 mismatch, and only **8** are missing a number AccuLynx has (FL-49, FL-50, KS-263…266, INS-29, TX-469), all numbered after the cutover. The next nightly sync fills them.

## Session 2 — duplicate check (Chris: "if we have duplicates let's get them purged")

**Findings (no data changed)**:
- No duplicate CRM efforts per AccuLynx job: unique index `efforts_acculynx_job (organization_id, acculynx_job_id)`, 0 violations; 0 duplicate `crm.efforts.job_number`.
- AccuLynx job numbers 1–9 repeat across accounts (CO/TX legacy sequences): different jobs, not duplicates.
- Duplicates come from AccuLynx itself (a rep enters a lead twice). Same account + customer name + street within 7 days: 56 groups / 123 rows. Almost all are already Cancelled in AccuLynx and closed in the CRM.
- **Only one live duplicate**: two unnumbered Insurance Program Leads for the same customer and address, 2.5 min apart on 10/19 (efforts `8404d4cc-45a0-43e6-ad04-22577a0b601c`, `b7559ae4-9e36-4ebd-8903-6ff850e9841a`). FL-49's customer also has an earlier lead (effort `f4bbb800-fb07-420e-aab1-280523a180f9`) that is Cancelled in AccuLynx; the CRM shows it open only because of the stale import, so the next sync closes it.
- Other same-property open groups are distinct work (separate buildings, trades, or a Texas → MC account move).

**Decision / recommendation**: do not delete in the CRM. Hard rule 1 (archive, never delete), and the nightly import would re-create any effort whose AccuLynx job still exists. Fix the duplicate at the source: cancel one of the two Insurance Program leads in AccuLynx (a human action; AccuLynx writes are gated). The two manual `UIUX AUDIT — Do not contact` efforts (`6d576468…`, `e0a66935…`) are CRM test data, not duplicates.

- [ ] Insurance Program: cancel the duplicate lead (efforts above) in AccuLynx.
