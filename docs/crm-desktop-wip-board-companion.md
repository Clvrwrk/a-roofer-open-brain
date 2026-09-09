# Desktop Sales WIP/AR board adoption — September 9, 2026

Command Center `/sales` adopts `@proexteriors/sales-workspace` 0.1.33 and explicitly enables its desktop board. The board groups authorized records by office, filters by office and review assignee, and presents saved sales-review stages separately from source balances and reported collection expectations. Active sales and held exception queues retain their existing canonical scope. The first ten records per office open by default; expanding preserves the measured table height, keeps headers visible, and persists the disclosure choice. Existing review, pending-operation and dirty-draft controls remain in the shared workspace and host.

This is the companion of [CRM_PWA](https://github.com/Clvrwrk/CRM_PWA) branch `codex/prd-grill`. Its CI-isolation correction is [e282f40497129202eee2fa87439d953a32ebb19a](https://github.com/Clvrwrk/CRM_PWA/commit/e282f40497129202eee2fa87439d953a32ebb19a). The desktop source commit is pending at this receipt's creation; the immutable package digest below identifies the adopted source output. The reciprocal CRM record is `docs/delivery/STATUS.md`, which must bind the final desktop source commit and this companion commit before release acceptance.

Package: `app/command-center/vendor/proexteriors-sales-workspace-0.1.33.tgz`.

SHA-256: `e0a95034b7563cd99707aa8b6a9347111615f4031dc0fa1c34955a26486c217d`.

Validation:

- All 81 installed package files match the archive byte for byte; the lockfile SHA-512 matches the archive. Only the root workspace dependency pointer and workspace package lock entry changed; contracts, server and all other dependencies retain their previous versions.
- 177 tests across six Sales-shell, host-boundary, CRM staff/access, legacy-preservation and Friday-guard files pass against this package.
- The Sales consumer passes a scoped no-emit TypeScript check with explicit React ambient types. An earlier check with automatic ambient-type discovery was interrupted after stalling; it is not counted as a pass.
- The production Astro build passed for the desktop adoption before the final persistence-only package refresh. The final package and automatic version-marker commit require the post-commit production build recorded in the parent handoff.
- The package refresh encountered an unwritable default npm cache and an offline cache metadata resolution error. The exact package was installed from the reviewed local archive and its lock integrity was computed from its bytes; no unrelated dependency resolution, install scripts, or external package downloads were introduced.

Baseline public `/healthz` on September 9 reported `e4344d8bbd145d7697428fe41c01e011f0d7e714`, matching the clean companion branch before this adoption. Work remains on `codex/crm-shared-design`; no merge or deployment occurs in this task. The Accounting Friday consumer, canonical-Friday activation flag, database, provider configuration and communications are unchanged. Hosted authentication and production UI acceptance remain separate from this package/build verification.

## Admin Sales Review adoption — 0.1.34

The 0.1.33 history above is retained. Its desktop source is now [CRM_PWA 22f8086ee53e169770eb4839e2ff32a95fd62129](https://github.com/Clvrwrk/CRM_PWA/commit/22f8086ee53e169770eb4839e2ff32a95fd62129), adopted by companion `864743f8a570cc43ceb31015289265361d195a9d`. That companion's final production build passed after the normal version-marker update. [CRM verification run 34388580101](https://github.com/Clvrwrk/CRM_PWA/actions/runs/34388580101) is green; the previously identified database-fixture and non-portable documentation-link failures are resolved for that run.

This continuation adopts sales-workspace 0.1.34 for the pending CRM EX-118 admin-review implementation. Authorized admins receive the server's scoped review action, retain their actual editor attribution, and can explicitly submit a ready rep's Wednesday review with a required delegation reason. The host continues to pass `desktopBoard`; no additional consumer code, Accounting Friday activation, database deployment or credential change is included.

Package: `app/command-center/vendor/proexteriors-sales-workspace-0.1.34.tgz`.

SHA-256: `b0f3c43cd08c2d655f3b352abb798c4403be297c7bc6205dafb2c7390ab8d0b7`.

All 83 installed package files match the archive. The package dependency and peer requirements match the previous release, and the lockfile integrity is derived from the exact local archive. The same scoped Sales consumer TypeScript check and 177 tests across six Sales/authorization/Friday-compatibility files pass. The final version-marker commit requires the post-commit build result in the parent handoff. This CI result predates the pending EX-118 source commit and is not evidence that the admin increment has run in GitHub CI.

Reciprocal authority remains CRM `docs/delivery/STATUS.md` and `docs/product/CRM-EXPANSION-DECISIONS.md` EX-118. That source record must bind the admin source commit and this companion commit before release acceptance. Actual-actor private draft isolation is provided by the separately reviewed CRM migration; installing the UI package does not apply that migration or reopen any deployed member write gate. This companion is committed locally only, with no branch push, merge or deployment.
