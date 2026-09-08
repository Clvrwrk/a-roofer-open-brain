# Weekly source-order shared package adoption

2026-09-08. CRM_PWA source `0fb98922509f9e0e94d8a42a85302c2d7949aca4` on `codex/prd-grill`; companion parent `582452a4858ed8525ed008cd64a4498adda1a63d` on `codex/crm-shared-design`. Ownership PEC-299 ↔ CAT-188 and PEC-301 ↔ CAT-190. Reciprocal root receipts: `docs/delivery/CC-LEGACY-ACCESS-COMPATIBILITY.md`, `docs/delivery/WEEKLY-LEGACY-ORDERS-RED-TEAM.md`, `docs/delivery/WEEKLY-HTTP-CONFLICTS-RED-TEAM.md`, and `docs/delivery/evidence/weekly-source-orders-candidate.json`.

The exact frozen packages carry typed legacy source orders, preserve unknown amounts and path classifications, distinguish source financial snapshots from human payment verification, and handle deliberate HTTP409 conflicts without mutation retries. The canonical migration source and deployment authority remain in CRM_PWA; package adoption does not apply database migrations. Wednesday receipt history, Ops second audit, and Friday review retain their existing boundaries.

| Package | SHA256 |
|---|---|
| contracts0.1.17 | `aa9f947af827f07bf348fa6c7fa26f0e90abe8c38496d036ab00cec4b0f9f5ab` |
| crm-server0.1.17 | `e9fc93f4e2331e4bb185e59797e27d141bb15bcbb0df9e9e3135aba83f1578a0` |
| sales-workspace0.1.29 | `df88dda8db00fc4f9dfc3321428bfc225122e5aa3ee9e3b34ac8c869e8cc4879` |

Validation: **357 tests across 32 files and production build passed** in `/private/tmp/crm-cc-source-orders-20260908`: exact companion HEAD archive plus these package/lock/tarball overlays, cloned existing dependencies, and offline installation with an isolated npm cache. npm-produced lockfile equals the authored lockfile; only the root's three local dependency pointers and their three installed package entries change. No registry dependency or shared design version changes. The repository commit hook updates the existing `app/command-center/src/lib/version.ts` release marker; no manual version-policy change is made. Root build-document validation also passed. Sentry source-map upload was not attempted because no auth token was provided.

This adoption changes no access policy. Existing canonical activation still suppresses implicit open-access/domain human grants globally. The root compatibility review recommends preserving only exact existing verified WorkOS subject + organization + email identities with their prior effective rights; named-user evidence and reviewed implementation remain pending. Do not replace this with route-wide open access, guessed admins, or a CRM authorization bypass. Keep existing Friday report behavior until real population/report compatibility is proven. Public deployment, real-user onboarding and hosted acceptance are separate gates, not claims of this package commit.

Local proof logs (SHA256):

- `/private/tmp/crm-cc-source-orders-install.log`: `55acab5c880330f6fd52b30a7895a9670fa6dcc424b839f71f6f9ac3c86d753b`
- `/private/tmp/crm-cc-source-orders-tests.log`: `286c2bfdfee44c3e0bf509cba72cfabc9302e944d128f2f307e427d76b572549`
- `/private/tmp/crm-cc-source-orders-build.log`: `51a688d58fad35eed59e001b8dfb5d5ac3a59c9c05861d591418581acc9796ae`
- `/private/tmp/crm-cc-source-orders-docs.log`: `611ad52d20e6baf884a6bedcc7ccaded5ada0c63de0bbfc4bb4547c020148574`
