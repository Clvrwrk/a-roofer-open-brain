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

## Submitted-record locks and shared audit history — EX-119

The preceding admin package was committed locally as `b753bfa1946ca8b321207f096f9fc8931532e85a`; its post-version-marker production build passed. The CRM admin source is now commit `d828ea6`. This continuation adopts the pending EX-119 source output: contracts/server 0.1.20 and sales-workspace 0.1.35. The final source commit remains to be bound by the reciprocal CRM STATUS receipt.

Accepted handoffs expose a locked read-only review. Explicit authorized unlock requires a reason, and a saved amendment consumes that unlock. Both shared consumers present the actual editor, prior/new business values and database timestamp, with customer/order identity and a latest-change note. Editor refresh is applied before its reset after an accepted unlock; draft and lock-reason dirty state remain independent. Source-correction entry controls require the current actor's unlock. History clears cached data after session-invalidating failures, pauses polling during inspection, and measures the existing list height before appending earlier entries.

Exact package SHA-256 values:

- `proexteriors-contracts-0.1.20.tgz`: `dd49b2ca38f9ee7a97b8bfd97ca5388fa9917ff2f42a53f1d7f2659999d15d56`
- `proexteriors-crm-server-0.1.20.tgz`: `30880ef7bc94a71f4bcd1a079ac6119f5f65dcb6f625ae68915104f0cde164d8`
- `proexteriors-sales-workspace-0.1.35.tgz`: `04997fcd6b86826d507874612c24f10474650d3c132fa660448e7d9a39e490d8`

All 37 contracts, 22 server and 87 workspace installed files match their archives. Lockfile changes are limited to these three package entries, their root pointers and the new internal contracts version. Both Sales and canonical Friday consumers pass the scoped TypeScript check. The six scoped companion test files pass 177 tests. An additional Node smoke test against the installed server package proves `/api` and `/api/sales` audit-history routes dispatch the same read-only RPC and reject absent sessions before transport. The final post-version-marker production build belongs in the parent handoff.

Independent CRM UI coverage passes nine tests, including asynchronous 403 session invalidation and the actual parent unlock callback with a deferred refresh: the editor key remains stable while refresh is pending, then resets against the refreshed item version. This supplements the parent's synthetic browser checks; it does not establish hosted authorization or production activation.

`FridayWeeklyWorkspace` still renders the same shared `WeeklyWorkspace`. When `CRM_WEEKLY_CANONICAL_ENABLED` is true, the Accounting Friday route selects that consumer, and its legacy update endpoint returns 409 after authorization and before parsing or writing legacy data. The false flag preserves the legacy route. No flag, hosted migration, write grant, deployment, branch push or main merge is performed by this package adoption. Source lock enforcement and historical privacy depend on the separately reviewed EX-119 database migration; package installation alone does not activate them.

## Explicit rep authorization and Command Center role boundary — EX-120

EX-119 source is CRM `16c4042`, adopted by companion `ec5e65a2b925cfd7075fc2f55e65f7626a97316b`; that final production build passed. This continuation adopts contracts/server0.1.21 and sales-workspace0.1.36 for the pending EX-120 source commit. Parent CRM STATUS must bind the final source commit and this companion commit.

The Command Center resolver now verifies the current canonical session before any legacy/email roster. Canonical admin receives full CC administration with its canonical UUID; manager/project_manager/sales_rep deny CC access and use CRM. Operations may retain explicitly preserved or configured back-office permissions; an unlisted Operations WIP reader remains confined to Sales. Revoked/missing/malformed canonical sessions cannot fall back to a legacy grant. Both shared Sales and canonical Friday consumers derive the rep-access administration entry from the verified canonical admin role. No browser request chooses its actor or grants itself a role.

Exact package SHA-256 values:

- `proexteriors-contracts-0.1.21.tgz`: `bb4e1009349625553827b5680b3979fc68029363d0c154074d5aad3d2563010f`
- `proexteriors-crm-server-0.1.21.tgz`: `5cf6e8b35c13e7efed3ca7e97c98153397d2946a7e9402597871e713b99671b7`
- `proexteriors-sales-workspace-0.1.36.tgz`: `d900a680d5940d9e4c36b183a8d59b8824ee48f56e808fc9e317a95bc316f500`

All150installed files (39contracts/22server/89workspace) match the exact archives. Their SHA-512 lock integrities derive from those bytes; unrelated lock entries are unchanged. Local archive extraction uses the previously documented offline installation method; no external dependency resolution or install script was introduced.

Both shared consumers and the CC resolver pass scoped TypeScript using the actual app aliases; the pre-commit production build passes. The six scoped Sales/host/staff/access/legacy/Friday test files pass178tests after updating stale bypass expectations to the explicit new policy. This includes manager/rep denial even when an email roster would formerly grant admin or Accounting, global-admin full access without an email roster, Operations preservation only after current canonical verification, and subsequent canonical revocation denial. The initial four Operations-positive failures against installed contracts0.1.20 are retained in the task evidence; they closed after exact0.1.21 adoption, whose Session enum accepts Operations/project_manager. No denial was weakened to obtain the pass.

Independent root UI/API tests pass11cases for required reasons, dirty discard refusal, stable same-body retry keys after errors, duplicate-submit/pending controls, clearing cached assignment data on session invalidation, verified-host admin UI entry, both BFF bases, missing-session/CSRF denial and rejection of client-supplied role/actor/duplicate UUIDs. These are local checks, not actual production user acceptance.

This companion changes code and committed package artifacts only. The user has authorized deployment, but the parent owns actual publication, migrations, private candidate staging and public routing. No companion branch push, database mutation, write-grant change or deployment is performed here. The final post-version-marker production build belongs in the parent handoff; existing production legacy data bindings must remain intact during cutover.

The initial uncommitted0.1.36 archive (`b6ec0f506f28458be40d7e24526145661c7f966e4dae4c9644313754cebd9d7e`) is superseded by the digest above. Both new rep-selection and assignment-history panes now use the shared first-ten disclosure, measured unchanged expanded height and persistent reveal preference; hardcoded340/440px scroll panes were removed. Two added runtime tests prove measured623px expansion and741px persisted restoration, alongside the prior nine UI/API cases. Final178companion tests and scoped consumer/resolver TypeScript pass against the refreshed archive.

**Deployed UI acceptance remains FAIL.** The user requires the exact earlier requested screen to be deployed and reviewed on both CRM and Command Center. Local previews, package equality, unit tests, build success and this commit do not mean that UI has been delivered or accepted. Parent must record actual final hosted image/commit identity and signed-in screen review before changing that status.
