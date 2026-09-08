# CRM companion: preserve existing back-office identities

2026-09-08; owning workstream PEC-301 ↔ CAT-190, shared experience PEC-299 ↔ CAT-188. CRM authority: `/Users/chussey/Documents/ChatGPT/crm.proexteriorsus.net`. Companion branch: `codex/crm-shared-design`.

Canonical Sales activation must not give new sales reps the prior blanket back-office access, or lock out verified existing back-office users. `crm-legacy-preservation.server.ts` parses an optional server-only `CRM_LEGACY_BACKOFFICE_IDENTITIES` roster. Missing or invalid roster preserves no users. Exact subject, organization and normalized verified email must match the existing verified sealed session, its subject continuity and configured CRM organization. No roster is supplied by this change.

Format: JSON object with exactly `version: 1` and `identities`, each entry containing exactly `subject`, `organization_id`, `email`. Maximum 200 entries / 65,536 characters. Emails must already be lowercase; opaque IDs cannot contain wildcard/whitespace syntax. Any duplicate decoded JSON key, duplicate subject/email, unknown key or invalid entry rejects the whole roster. Keep actual names/identities/evidence in an authorized private receipt, never this document.

Matched humans use the existing resolver before its stricter explicit-role fallback so previous effective member/viewer/accounting/purchasing permissions remain unchanged. Canonical mode stays enabled and implicit default-admin fallback stays disabled. Named-agent/service behavior is unchanged. Existing separately configured production-write approver rights are preserved, never inferred. This is sealed-session authorization freshness, not a new live membership-revocation check.

Sales continues through the independent canonical BFF/RPC membership and capability checks. A preserved back-office actor can still receive a Sales 403 for missing/revoked CRM membership. No route-wide fallback exists.

Validation: exact-source temporary dependency checkout `/private/tmp/crm-cc-source-orders-20260908/app/command-center`: 408 tests / 33 files passed; production build passed. New file contributes 51 cases. One initial test used the wrong expected RPC name (`crm_get_session` instead of actual `get_session`); the denial assertion already passed and only endpoint expectation was corrected. Failed log retained. Root proof: `artifacts/verification/cc-legacy-preservation`; independent review: `docs/delivery/CC-LEGACY-PRESERVATION-RED-TEAM.md` in CRM.

Not activated: no environment value, named roster, real CRM grant, public CC deployment, production data or migrations changed. Private CC still eafb185. Actual existing-user and Sales-only browser acceptance remains a release gate. Root policy/decision: `docs/delivery/CC-LEGACY-ACCESS-COMPATIBILITY.md` and EX-103.
