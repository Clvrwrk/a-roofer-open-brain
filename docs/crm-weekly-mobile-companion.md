# CRM weekly mobile companion receipt

2026-09-06. Companion branch `codex/crm-shared-design`, parent `2039199`. Source CRM_PWA branch `codex/prd-grill`, source parent `2dcdd77`; reciprocal source receipt `docs/delivery/evidence/weekly-mobile-ux.json`.

Installed the source-owned sales-workspace 0.1.6 archive for the shared Sales and canonical Friday consumers. SHA256: `3b91c92817c736f1187b42bc797985c4dfb769ea6dcfd360058eece5562803a3`. All 29 installed compiled/style files match CRM source output. Contracts 0.1.3, crm-server 0.1.0 and design 0.1.0 are unchanged.

The mobile selected detail now precedes the worklist, opening places focus at its heading and closing returns to its contract row (search fallback). Office-local midnight cutoffs display the actual Wednesday completion day. This package changes no authority, ledger amount, deadline rule or audit stage. See source `docs/delivery/WEEKLY-MOBILE-UX.md` and its independent review.

No production rollout flag, OAuth configuration, provider connection or live Friday data changed. Runtime cross-host acceptance remains open.

Verification: 340 Command Center tests and production build passed. Sentry release/source-map upload was skipped because no token was provided; no release was attempted. Shared artifact parity passed for all 29 compiled/style files. The CRM builder checked mobile selection, focus return and draft discard against synthetic port 4330; live CC staff/canonical Friday runtime acceptance remains pending.
