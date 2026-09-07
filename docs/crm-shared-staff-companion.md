# Shared CRM staff connection companion

2026-09-06 Pacific. Worktree `artifacts/companion/brain-design`, branch `codex/crm-shared-design`. Source Clvrwrk/CRM_PWA branch `codex/prd-grill` following599c2d2. The source receipt `docs/delivery/evidence/shared-staff-bff.json` records the companion commit after creation; immutable archive hashes identify this candidate.

Replaces permanent `/api/sales` stub with the same canonical server dispatch as CRM, under explicit CRM_CANONICAL_ENABLED + existing human WorkOS session. Server-only crmStaffSession initializes empty and is attached only after verified WorkOS human authentication on the sales API namespace. Local/service authority cannot populate it. Refreshed sealed sessions are reauthenticated before token forwarding. Public actor/Sentry/activity shapes exclude tokens; exact public origin and host/session CSRF are enforced. No live flag or WorkOS/Supabase configuration changed.

Packages and SHA256:
- crm-server0.1.0: `d92ff3e6602df67b8c47bc85fede548d0e2617a9a665b8a2c7fb9b7cecdea543`.
- contracts0.1.3: `9c6e5f679ee6573781b7e2b21a955b1cca07afb7c52a91bc185205f9b0821373`.
- sales-workspace0.1.5: `11079ee6be983a6b321293dc2280d9397d1beefc336ee716b1104b77b8c84734`.
- Design0.1.0 unchanged.8 server +8 contracts +29 sales compiled/style/JSON/declaration files match source. Native Node imports installed server/contracts without TypeScript loader.

340 CC tests/build passed. Four new tests cover verified-session attachment, fresh verification after refresh, refresh failure/mismatch, and exclusion of local/service/missing organization authority. Independent review additionally passed9 targeted CC tests,11 source tests and four compiled-package held-out groups. No browser acceptance because Mac is locked. Source CRM clean container and91 unit tests also passed; these do not prove this host's actual OAuth/issuer or financial reconciliation.

Source implementation/report: `docs/delivery/SHARED-STAFF-BFF.md`; red team `docs/delivery/SHARED-STAFF-BFF-RED-TEAM.md`. Next: test-branch issuer/template/membership/origin verification and real cross-host cycle/authorization acceptance during final OAuth phase; trusted source mapping and UI acceptance still open. No production deployment, source/provider write, outreach or spend.
