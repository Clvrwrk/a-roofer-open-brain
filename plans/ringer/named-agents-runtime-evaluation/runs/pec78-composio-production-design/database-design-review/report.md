# Review Report

## Summary

The proposed production architecture is directionally feasible on PostgreSQL/Supabase, but the reviewed package is not implementation-ready. The production migration and Composio ingress/claim/complete code named by the plan do not exist in the review corpus. Migrations 188 and 189 provide a useful forced-RLS authorization foundation and shadow-effect machinery, but they do not provide encrypted inbound events, independent delivery/message deduplication, event claims or lease expiry/reclaim rules, owner-event-bound effects, or event-linked immutable receipts. The current runtime route explicitly returns `operation_not_installed` for authenticated operations other than shadow effect reservation.

No Supabase or production write was performed. A non-production preflight was not run because this was a read-only design review, no migration 190 artifact exists to apply, and no target branch/local/ghost database was named. Production activation must remain forbidden.

## Findings

### F1 — The production database and route contract is absent

- **Evidence:** `PEC78-MAYA-COMPOSIO-PRODUCTION.md` names `schemas/cleverwork-roofer/190-pec78-composio-slack-production.sql` and `pages/api/integrations/composio/` as owned implementation artifacts, but neither exists. The only PEC-78 store calls are the migration-189 shadow RPCs (`store.server.ts:26-88`). The runtime route returns `operation_not_installed` for every authorized path not ending in `/reserve` (`[...path].ts:41-52`).
- **Impact:** Ingress, claim, decrypt-after-claim, completion, lease recovery, and production readiness cannot operate or be reviewed against executable source. Activating the plan would either fail closed or encourage unreviewed direct production changes.
- **Fix:** Add tracked migration 190 and the named ingress/runtime route implementation while keeping all activation rows disabled. Define typed ingest, claim, reserve, reconcile, and complete RPC results and make the application fail closed on unexpected shapes. Re-run this review against those exact artifacts.
- **Priority:** P1
- **Confidence:** High

### F2 — Ciphertext storage and independent ingress deduplication have no enforceable schema

- **Evidence:** Migrations 188/189 contain no inbound-source or inbound-event table and no ciphertext, nonce, authentication-tag, webhook-delivery ID, Slack channel, or Slack timestamp columns. Their uniqueness rules cover scheduled occurrences, Gmail work items, request idempotency, and outbound effects (`188:37-70`), not Composio deliveries or Slack messages. The plan requires delivery ID and `(channel, timestamp)` to be independent uniqueness keys, but there is no executable constraint or ingest RPC.
- **Impact:** The system cannot prove that plaintext is excluded from storage, that nonce/tag/ciphertext are complete and versioned, or that a new delivery carrying an already-seen Slack message cannot create duplicate work. Application-only checks would race under concurrent webhook delivery.
- **Fix:** In migration 190, create private forced-RLS source/event tables with explicit ciphertext algorithm/key-version/nonce/tag/ciphertext fields and byte-length/check constraints; prohibit plaintext payload columns. Store a delivery digest and a message digest (or canonical channel/timestamp digests) under two separate unique constraints. Ingest with one `SECURITY DEFINER` transaction using `INSERT ... ON CONFLICT`/row locking and return the same event identity for either dedupe path without overwriting ciphertext.
- **Priority:** P1
- **Confidence:** High

### F3 — Atomic claims, lease expiry, and safe reclaim semantics are missing

- **Evidence:** The existing `runtime_auth.leases` table is tied to mailbox `occurrences`, and its only concurrency guard is one partial unique index for `state='active'` (`188:43-48`). No reviewed RPC claims a Composio event. No constraint requires `expires_at > acquired_at`, no claim operation increments or binds an event lease epoch, and no reclaim operation atomically checks for reserved/executing/failed-unknown effects. The route map advertises `/occurrences/claim` (`contract.ts:26-30`), but the route returns `operation_not_installed` (`[...path].ts:52`).
- **Impact:** Two workers cannot be proven to receive only one claim; an expired worker may still complete after a newer claimant; and reclaim could duplicate a Slack send when provider outcome is unknown.
- **Fix:** Add an event-specific lease/claim contract. Under an event row lock, validate principal, credential, runtime instance, source, gate, capability, all applicable kill switches, and current fence; atomically increment a monotonic lease epoch and return it. Require epoch/fence/credential/runtime matches on reserve and complete. Reclaim only after expiry and only when no event-linked effect is in `reserved`, `executing`, or unknown state. Add a partial unique active-lease constraint and database concurrency tests using two sessions.
- **Priority:** P1
- **Confidence:** High

### F4 — Gate/fence/capability checks are not yet complete for the receive path

- **Evidence:** The capability allowlist in migration 188 excludes `slack.receive.christopher` (`188:21-24`), and the TypeScript capability union and route map also exclude it (`contract.ts:10-31`). Migration 189 checks credentials, gates, capabilities, and selected kill switches for token/request/shadow reservation, but has no source/trigger/ingress gate or event claim. Its reconciliation RPC accepts only an effect ID and outcome and rechecks the fence only; it does not authenticate credential/runtime/capability/gate or bind the caller to the effect (`189:223-243`).
- **Impact:** The promised ingress and claim authorization boundary is absent. Reusing the reconciliation shape for production would allow any holder of server-role RPC access to reconcile arbitrary effects by ID, and state changes after reservation would not all fail closed.
- **Fix:** Replace the capability CHECK constraint in a tracked migration to add the receive capability, with lock/scan impact assessed. Add source and trigger rows installed disabled. Every claim/reserve/reconcile/complete RPC must validate the immutable event tuple and applicable principal, credential, runtime, source, trigger, gate, capability, destination, fence, lease epoch, time window, and kill switches in the same transaction. Do not expose a production reconciler that authorizes solely by effect ID.
- **Priority:** P1
- **Confidence:** High

### F5 — Effects and receipts cannot prove linkage to the inbound event

- **Evidence:** Existing effects link to Gmail-oriented `work_items` and scheduled `occurrences`, not an inbound Slack event (`188:58-70`). Receipts have nullable occurrence/work/lease fields but no event or effect foreign key (`188:77-81`). `append_receipt` accepts neither event ID nor effect ID and populates none of those linkage fields (`189:91-113`); reservation/reconciliation therefore record digests but not relational event/effect linkage (`189:217-242`). The no-update/delete trigger protects existing receipt rows (`188:103-107`), but the schema does not prevent truncation by an object owner and does not validate a receipt's claimed transition against its linked row.
- **Impact:** Auditors cannot deterministically trace accepted delivery → canonical message → claim/lease → exact threaded Slack effect → provider outcome → completion. Hash-chain integrity does not repair missing semantic linkage, and owner-level truncation remains outside the immutability control.
- **Fix:** Add non-null event/effect/lease linkage appropriate to each receipt type, backed by foreign keys or a typed receipt model and transition-time validation. Include those IDs and lease/fence epochs in the receipt hash. Keep the mutation trigger, revoke direct table DML including service role, expose append only through narrowly granted RPCs, and monitor/limit owner-level operations through migration governance and backup evidence.
- **Priority:** P1
- **Confidence:** High

### F6 — Migration safety, grants, rollback, and non-production test evidence are underspecified

- **Evidence:** The plan calls migration 190 additive except for replacing the capability check, but replacing `pec78_capability_grants_capability_check` requires a constraint change on an existing table and may require validation/locking. No migration artifact shows idempotent object creation, explicit owner/default-privilege posture, forced RLS for new tables, or function grants. Migration 189 does correctly force RLS on its new tables and explicitly revokes/grants RPC execution (`189:57-62,282-294`), but its definer functions include writable `public` in `search_path` (`189:64-68,115-121,169-174,223-267`) instead of the narrowest path. The plan's rollback is operational only; there is no tested rollback SQL/forward-fix contract for a partially applied migration. Required non-production migration, advisor, concurrency, and ciphertext tests have no executable artifact or result.
- **Impact:** Installation could take an unplanned lock, grants could drift with role/default privilege differences, definer-name resolution has unnecessary attack surface, and rollback/test claims cannot be verified without production writes.
- **Fix:** Document the constraint replacement as the sole non-additive metadata change and use a lock-conscious `NOT VALID`/validation strategy where applicable. For every new private table: enable and force RLS, revoke schema/table/sequence access from `PUBLIC`, `anon`, and `authenticated`, and grant no direct service-role table DML. For every definer RPC: schema-qualify all objects/operators as practical, set a minimal trusted search path (omit `public`), revoke execute from `PUBLIC` before granting only the intended server role, and pin a non-login owner. Provide a transactional install, a forward rollback/disable procedure that retains evidence, and tests on a preview/local/restored/ghost target: catalog assertions, role/grant tests, two-session claims, lease-expiry clocks, duplicate races, ciphertext negative tests, unknown-outcome reclaim denial, receipt mutation denial, and rollback/readiness tests. Run preflight, advisors, and app smoke tests there before any production preflight.
- **Priority:** P1
- **Confidence:** High

## Clean

- Migrations 188 and 189 consistently enable and force RLS on the private runtime tables they create and revoke table access from `PUBLIC`, `anon`, and `authenticated` (`188:95-101`; `189:57-62`).
- Migration 189 explicitly revokes public RPC execution and grants reviewed public RPCs only to `service_role` (`189:282-294`); the internal receipt appender is also revoked from service role.
- Existing definer functions set explicit search paths and generally schema-qualify table references. Removing `public` would further narrow them.
- The existing partial unique lease index and row locks are sound primitives to adapt for an event-specific claim protocol, but are not sufficient by themselves.
- The existing effect idempotency constraint and terminal `failed_unknown` state are useful outbound primitives. The production design correctly states that unknown outcomes must not retry automatically.
- The receipt mutation trigger and serialized advisory-lock hash chain are useful tamper-evidence controls for row updates/deletes and concurrent appends.
- The plan's installed-disabled posture, trigger-first rollback order, evidence retention, and requirement for non-production migration tests plus backup-backed production preflight align with the Supabase change-preflight instructions.

## Assumptions

- Review target is the checked-out source at `/Users/chussey/.codex/worktrees/3550/a-roofers-open-brain`; uncommitted files were treated as current review inputs and were not modified.
- Project ref is `rnhmvcpsvtqjlffpsayu` and production is the intended eventual target, as documented in `docs/36-supabase-infrastructure-ops.md`; this review did not connect to it.
- Migration 190 and Composio production routes are genuinely absent rather than omitted from the requested review package.
- `service_role` is used only by the server-side Command Center client. Its broad platform privileges do not substitute for narrowly defined RPC contracts.
- Exact Composio/Slack identifiers may be stored only as ciphertext or non-reversible digests except where an operational destination reference is explicitly approved; this review did not inspect production rows or secrets.
- A PASS verdict requires executable migration/application artifacts and non-production evidence for the acceptance checks, not plan prose alone.

MACHINE_VERDICT: FAIL
