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
