# Review Report

## Summary

- Schema 188 is a sound installed-disabled foundation, but it contains no executable authorization boundary for Maya shadow activation.
- Shadow activation would lack atomic authorization/replay handling, constrained destination authority, fenced effect reservation/reconciliation, and trustworthy immutable receipts.
- The prior PASS verdicts apply only to installed-disabled Phase 1; the activation contract cannot pass on the reviewed database artifact.

## Findings

### P1 — No atomic authorization or SECURITY DEFINER RPC boundary exists

**Evidence:** Schema 188 creates tables and one receipt-mutation trigger only. It defines no callable authorization, request-claim, work-transition, effect-reservation, reconciliation, kill, readiness, or rollback RPC. Consequently there is no function that locks and rechecks the principal, credential, capability, destination, production gate, kill switches, expiration, and fence in the same transaction that claims replay and request idempotency. The prior operations review explicitly identified this as a shadow/enabled blocker, while both remediation PASS reviews limited their verdict to installed-disabled.

**Impact:** An application implementation would have to use direct multi-statement table access or add an unreviewed privileged function. Either approach permits time-of-check/time-of-use races and partial authorization state, and cannot meet the activation contract's atomic-claim requirement. There is no SECURITY DEFINER implementation whose owner, fixed `search_path`, qualification, EXECUTE grants, or caller identity checks can be approved for shadow.

**Fix:** Add narrowly typed, versioned transactional RPCs for request claim, work transitions, effect reservation, terminal reconciliation, kill/fence, readiness, and rollback. Each privileged function must use a non-login least-privilege owner, fixed `search_path` (preferably `pg_catalog, runtime_auth`), fully qualified objects, explicit input validation, locked authoritative rows, and exact EXECUTE grants; revoke EXECUTE from `PUBLIC`, `anon`, `authenticated`, generic application roles, and `service_role` unless a dedicated, audited runtime role is intentionally used.

**Priority:** P1

**Confidence:** High

### P1 — Replay and idempotency races are not safely resolved

**Evidence:** `replay_claims` has independent unique constraints for access and proof JTI hashes, and `request_claims` has a unique `(credential_id, route_id, idempotency_key)`, but schema 188 provides no atomic claim RPC or conflict semantics. `request_digest`, `response_status`, and `response_body` are mutable and there is no state, completion marker, expiry, digest consistency constraint, or rule distinguishing an in-flight request from a completed replay. The activation contract requires access/proof JTIs and request idempotency to be atomically claimed.

**Impact:** Concurrent duplicates can observe ambiguous state, perform work before a response is durably associated, or reuse an idempotency key with a different request digest. A crash between independent claims can strand partial claims, while replay expiry has no database-enforced relationship to token lifetime.

**Fix:** Implement one locked RPC that inserts both JTI claims and the request claim in one transaction, rejects digest mismatch, and returns a deterministic in-progress/completed outcome on conflict. Add explicit request state and expiry, immutable request identity fields, bounded claim expiry tied to validated token/proof expiry, and concurrency tests for identical and conflicting duplicates.

**Priority:** P1

**Confidence:** High

### P1 — Destination authority is structurally under-constrained and has no exact runtime grant surface

**Evidence:** `destination_grants` accepts free-form `account_digest`, `destination_digest`, `thread_digest`, and `destination_ref`; it has no uniqueness constraint and no constraint tying provider to capability. Any capability grant can reference provider `google` or `slack`, including combinations inconsistent with `slack.send.christopher` and `email.send.admin`. Schema 188 seeds no exact Slack DM or email destination row and grants no dedicated runtime EXECUTE permission. The activation contract requires the fixed Slack workspace/app/DM and sole email recipient to be enforced by exact database grants and forbids request-selected destinations.

**Impact:** Duplicate or contradictory active grants can exist, an email capability can be paired with Slack (or vice versa), and a runtime could select a destination from mutable request data rather than a unique authoritative row. The database cannot prove CC/BCC, forwarding, reply-to, thread, account, or provider identity containment.

**Fix:** Model canonical provider account and destination components in typed columns, constrain provider/capability combinations, require one active unexpired destination per outbound capability with partial unique indexes, and seed only the exact reviewed digests/identifiers during a separately authorized activation migration. The reservation RPC must accept an effect ID—not a destination—and derive/compare the exact destination tuple in-database. Represent and reject CC/BCC/reply-to/forwarding/additional recipients in the validated payload contract.

**Priority:** P1

**Confidence:** High

### P1 — Effect reservation, reconciliation, and fencing cannot prevent duplicate or stale-owner sends

**Evidence:** `effects` exposes only a mutable state enum and a uniqueness key. It contains no reservation token, attempt number, reserved/executing timestamps, lease ID or lease epoch, provider account identity, reconciliation deadline, or transition constraints. `leases.epoch`, `occurrences.lease_epoch`, `schedules.fence_epoch`, and `principals.fence_epoch` are not linked by a guarded transition. No RPC atomically changes an effect to `reserved`, writes a pre-I/O receipt, and returns a provider-ready reservation; no RPC fences stale workers or reconciles ambiguous provider outcomes. The activation contract forbids automatic retry after ambiguity.

**Impact:** Concurrent or stale runtimes can reserve or execute the same effect, a principal/schedule fence increment need not invalidate an already-read effect, and a crash around provider I/O can produce an unrecorded or duplicate message. The one-Slack/one-email budget is not enforced by the schema.

**Fix:** Add a transactionally enforced effect state machine with compare-and-set transitions, attempt/reservation identity, lease and fence epochs, timestamps, and unique budget keys for this activation. Reservation must lock/recheck all authority and fence rows, write the pre-I/O receipt, then return a single-use reservation. Reconciliation must require the reservation token and provider outcome, prohibit retry from `failed_unknown`, and fence stale owners. Add concurrent reservation, crash-window, stale-lease, kill-switch, and ambiguous-result tests.

**Priority:** P1

**Confidence:** High

### P1 — Receipts are append-only but not trustworthy or complete enough for effect authorization

**Evidence:** The trigger visibly rejects receipt UPDATE/DELETE, which is a useful installed-disabled control. However, inserts are not restricted to a dedicated RPC; required linkage columns are nullable and lack foreign keys; `receipt_hash` and `previous_receipt_hash` are caller-supplied with no database verification; there is no uniqueness/order rule for pre-I/O and terminal events; and nothing makes receipt insertion atomic with effect transitions. The table also has no payload/provider-message digest field that can bind terminal reconciliation beyond the optional effect-related digests.

**Impact:** A privileged caller can insert fabricated, orphaned, duplicated, or discontinuous receipts. Provider I/O could occur without a committed reservation receipt, or an effect could become terminal without a corresponding terminal receipt. Append-only storage alone does not provide immutable, attributable evidence.

**Fix:** Deny direct inserts and expose receipt creation only through the transition RPCs. Require appropriate foreign keys and non-null identifiers by event type, calculate hashes in-database from canonical fields, serialize per-effect receipt chains, and enforce exactly one committed reservation receipt plus one permitted terminal reconciliation receipt per attempt. Preserve receipts across every rollback and test mutation/insertion denial for all generic, owner-like, and service-role paths.

**Priority:** P1

**Confidence:** High

### P1 — Expiration, revocation, rollback, and service-role containment are not database-enforced

**Evidence:** Credential `not_before`/`expires_at`, capability `valid_from`/`valid_until`, and destination `valid_until` are nullable; there are no ordering checks or database transitions to expired state. Production gates require timestamps but do not enforce `expires_at > issued_at` or uniqueness of the active gate. Schema/table revokes cover `public`, `anon`, and `authenticated`, but there is no dedicated runtime role, no explicit service-role containment, and no catalog assertion for ownership/BYPASSRLS/default privileges. Forced RLS has no policies, so installed-disabled is denied, but a Supabase service/owner path may bypass RLS once privileges are introduced. No rollback RPC atomically disables the gate, credential, capabilities/destinations, schedule, and increments the principal fence.

**Impact:** Missing or nonsensical time bounds can be treated as indefinitely valid; multiple active gates or grants can conflict; a broad service/owner connection could become the de facto authorization identity; and partial rollback can leave stale authority usable. Returning 423 at the application layer is not proof that database authority has been revoked.

**Fix:** Make activation credentials/grants/destinations strictly bounded and add timestamp-order checks and partial uniqueness for active authority. Create a dedicated NOLOGIN/NO-BYPASSRLS runtime role with EXECUTE-only access to reviewed RPCs, explicitly revoke generic/service-role execution, lock down default privileges, and add catalog tests. Implement an atomic rollback/kill RPC that revokes every authority row, disables the schedule and production gate, increments the principal and relevant schedule/lease fences, preserves receipts, and produces a rollback receipt; prove repeated rollback is idempotent.

**Priority:** P1

**Confidence:** High

## Clean

- Schema 188 is transactionally wrapped, additive, and seeds only the exact Maya principal, five capability grants, and canonical schedule in `disabled`; it seeds no credentials, destinations, gates, work, or effects.
- All 15 tables have RLS enabled and forced, and privileges are revoked from `public`, `anon`, and `authenticated`. With no policies or executable RPCs, the reviewed artifact remains fail-closed for installed-disabled.
- Receipt UPDATE/DELETE attempts fail visibly through a trigger, and foreign keys generally use `ON DELETE RESTRICT`, supporting preservation of installed-disabled records.
- Basic uniqueness exists for principal identity, capability grants, replay hashes, request keys, work-provider messages, and effect idempotency keys. These are useful primitives once wrapped in reviewed atomic RPCs.

## Assumptions

- This review is a static design review of the activation contract, schema 188, and the four prior PEC-78 review reports only; no database catalog, application code, tests, or later migration was inspected or executed.
- Schema 188 is the complete database artifact proposed as the basis for Maya shadow activation. If a later migration supplies the missing RPCs, roles, grants, constraints, and activation rows, it requires a separate review.
- The prior Phase 1 PASS verdicts remain valid only for installed-disabled and do not authorize credential provisioning, mailbox access, controlled test effects, recurring scheduling, or shadow mode.
- PostgreSQL table owners and Supabase administrative/service roles can bypass some RLS/privilege controls; exact production ownership and role attributes must therefore be proven by catalog tests before activation.

MACHINE_VERDICT: FAIL
