# CRM native staff authorization companion

September8,2026. Root CRM source1a1e7e0 (health/checkpoint8f3b120); prior companion712aad98; live/main ancestry40a917e9902b830c6489c059980c775781f60445 verified. Ownership PEC-301 ↔ CAT-190, CODEX receipt docs/linear/teams/PEC/2026-09-07-crm-pwa-release.md.

Adopts server0.1.12; SHA256 8350d4dcd92bbfc148630ab5c7f0643389b2fe0b1d4f56f38fe102a0eebd2750. CRM root artifact: packages/crm-server/. Canonical mode requires verified email before email grants, explicit configured admin roster, exact WorkOS org and current canonical membership with wip_read for Sales fallback. Sales users receive only Sales permissions and only WIP/canonical API paths; unknown legacy Sales routes are denied. Existing explicitly configured back-office and named-agent access remains separate. Invalid canonical/auth configuration fails closed; verified refresh state persists even when downstream access fails.

Validation: full357tests/32files and production build passed. Independent red team found five gaps, all corrected; independently reran21tests in three changed files and PASS for this source/test slice. No hosted CC release acceptance. Actual callback/org configuration, verified initial operator roster and candidate-host tests are required before enabling canonical mode. Source maps were not uploaded because no Sentry auth token was passed to local build.

Rollback: revert this scoped source/package change before activation, or return to previous image/config on owned deployment. Never revert canonical financial/audit data as part of a code rollback. Root counterpart: docs/delivery/CC-SALES-ACCESS.md. Full-release hard gates remain in root docs/delivery/FRIDAY-WIP-RELEASE-GOAL.md.
