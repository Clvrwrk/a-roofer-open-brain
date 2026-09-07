# CRM weekly workbench companion

2026-09-06 Pacific. Owned companion: `artifacts/companion/brain-design`, branch `codex/crm-shared-design`. Source is Clvrwrk/CRM_PWA `codex/prd-grill`, following source commit52983bb. The exact candidate is identified by the immutable package digests below; CRM's `docs/delivery/evidence/weekly-participation-ui.json` records this companion commit after creation.

Adopts sales-workspace0.1.3 and contracts0.1.1; design0.1.0 stays unchanged. The shared WIP/AR screen now contains weekly worklist, rep coverage/submission states and human contract review. Existing host session and same-origin sales BFF boundaries remain authoritative; no staff/provider endpoint or Friday writer was activated by installing a component.

- proexteriors-sales-workspace-0.1.3.tgz SHA256 `788d67c5067513c63e62997243ba74d13b89679725966ada741a743644f05d7a`.
- proexteriors-contracts-0.1.1.tgz SHA256 `e60c434718659ce2a539127b15007d8785539804a3bd62ee64c596ce30aade2b`.
- 21 compiled/style files and weekly runtime contract match the source package.
- Command Center335 tests and build passed. No browser acceptance: computer control reports the Mac locked.

Reciprocal source report: CRM `docs/delivery/WEEKLY-PARTICIPATION-UI.md`; independent report `docs/delivery/WEEKLY-PARTICIPATION-RED-TEAM.md`. No production deployment, production/source write, outreach or spend. Existing Friday integration, trusted source mappings, actual auth and cross-host/device validation remain open. A component adoption is not a live weekly reporting release.
