# Review Report

## Summary

Schema 189 materially improves the installed-disabled foundation in schema 188, but it is not ready for PEC-78 Maya shadow activation. The proposed boundary does not keep request authorization and effect reservation in one transaction, does not enforce the activation contract's model/tool/time/spend limits, and does not produce a complete, linear, immutable receipt record. Its broad `service_role` execution grants also make the generic Command Center service credential the effective privileged runtime identity.

The reviewed route can reserve effects but exposes no execution or reconciliation path, while readiness checks only row counts and broad states rather than the exact credential, identity, grant, budget, receipt, migration, and ownership invariants required by the activation contract. This is a static repository review only; no claim is made about a live PostgreSQL/Supabase catalog or deployed state.

## Findings

### P1 — Authorization and effect reservation are separated by a revocation/kill-switch race

**Evidence:** The route calls `pec78_authorize_request` and then, in a separate Supabase RPC transaction, calls `pec78_reserve_shadow_effect`. The reservation RPC rechecks only an active credential, active principal, active capability grant, active destination, and active budget. It does not recheck credential/capability/destination time bounds, the production gate, any kill switch, or the credential's current fence epoch. It also does not compare the principal fence returned by request authorization. `pec78_authorize_token` is another independent transaction. Thus the atomicity promised by the activation contract covers individual RPCs, not the complete authority decision that permits provider I/O.

**Impact:** A gate, credential, grant, destination, or kill switch can change after request authorization but before reservation, and the later RPC may still create a provider-authorized reservation and pre-I/O receipt. A stale runtime can reserve after a fence change because only the then-current epoch is copied into the effect; no previously authenticated epoch is supplied and compared. This defeats rollback and emergency-stop guarantees at the critical TOCTOU boundary.

**Fix:** Replace the split request/reservation path with one transactional RPC for outbound effects. In that transaction, lock and validate the exact principal, credential, runtime instance, fence epoch, capability, destination, production gate, all applicable kill switches, all expirations, replay claims, request idempotency, budget, effect uniqueness, and pre-I/O receipt. Bind the access token to a fence epoch or equivalent authority version and reject any mismatch. Keep a separate non-effect request-claim RPC only for capabilities that cannot cause provider I/O.

**Priority:** P1

**Confidence:** High

### P1 — The exact activation budget is not enforced or receipted

**Evidence:** `activation_budgets` stores input-token, output-token, tool-step, runtime-seconds, and aggregate-cost maxima, but no RPC accepts or records actual usage for any of them. `spent_usd` is never updated. Reservation checks only `model_route_id` and increments `slack_reserved` or `email_reserved`; readiness merely tests `spent_usd <= max_gate_cost_usd`. There is no model-attempt/retry counter, no cost-receipt table or terminal usage receipt, and no constraint requiring the separately verified T0 route beyond equality to a mutable budget row. The route validates message shape but does not enforce the contract's prohibitions on mailbox content, customer/financial data, links, or instructions beyond a prefix and length check.

**Impact:** Runs can exceed 4,000 input tokens, 2,000 output tokens, 20 steps, 300 seconds, zero retries, or $1.00 while database readiness continues to report the budget active. Missing cost evidence does not hard-stop. The database limits reservations, not verified deliveries or total execution, and cannot prove the controlled payload remained within the authorized synthetic intents.

**Fix:** Add immutable per-run/effect usage and cost receipts, database-checked cumulative counters, attempt/retry counts, deadlines, and a terminal hard stop for missing or over-limit evidence. Bind the reviewed model identifier and the two immutable intent/payload digests into the activation gate. Make execution authorization consume or reserve the full applicable budget atomically, then reconcile actual usage without permitting additional attempts after ambiguity. Validate a canonical structured payload whose fields make links, attachments, additional recipients, reply/forward behavior, and mailbox-derived content impossible.

**Priority:** P1

**Confidence:** High

### P1 — Receipt chaining is forkable and terminal evidence is incomplete

**Evidence:** `append_receipt` reads the latest receipt using `ORDER BY ... LIMIT 1 FOR UPDATE`, then derives a new hash. Locking the current tail does not serialize an insert when the table is empty, and concurrent transactions can read the same tail and create two valid children; `receipt_hash` uniqueness does not prevent that fork because each hash includes a different UUID. The hash omits `build_version`, contract/registry versions, provider account, provider message ID, outcome time, and other receipt columns. The reconciliation receipt passes null destination and request digests and never includes the provider message ID. Receipt rows have no effect ID/foreign-key linkage, and `append_receipt` can return a generated UUID even if its `INSERT ... SELECT` inserts no row for a missing principal. Direct receipt INSERT is not explicitly revoked from `service_role`, while only UPDATE/DELETE are trigger-blocked.

**Impact:** The receipt history cannot prove a single linear authorization chain or bind terminal provider evidence to the reserved effect. Concurrent effects can fork the purported global chain. A provider ID can exist only on the mutable effect row, so receipt preservation across rollback does not preserve complete delivery evidence. Broad privileged callers may be able to fabricate receipts depending on actual catalog/default privileges.

**Fix:** Chain receipts per effect/attempt (or serialize a global chain with a dedicated singleton head row), enforce a unique predecessor/successor relationship, and include every security-relevant canonical field in the database-computed hash. Add non-null effect/attempt linkage and foreign keys. Put provider account and provider message identity/digest in the terminal receipt. Raise if insertion does not occur. Explicitly revoke direct table INSERT from every runtime role, including `service_role`, and permit receipt creation only inside reviewed transition RPCs owned by a dedicated non-login role.

**Priority:** P1

**Confidence:** High

### P1 — Generic `service_role` is the privileged runtime and rollback identity

**Evidence:** Schema 189 grants all public PEC-78 authorization, reservation, reconciliation, rollback, and readiness RPCs to `service_role`. The application wrapper uses the shared `createServerSupabaseClient`, which is the general server-side client used across unrelated Command Center features. The SECURITY DEFINER functions do not verify the SQL caller beyond grants, and `pec78_rollback_shadow` accepts caller-supplied `p_actor_subject` and reason as receipt/audit identity. No dedicated PEC-78 runtime role, non-login function owner, ownership change, default-privilege lockdown, or catalog assertion is defined. RLS is forced, but Supabase service/owner bypass behavior is precisely why function and ownership boundaries must be independently constrained.

**Impact:** Compromise or misuse of the generic server service credential reaches the full PEC-78 privileged surface, including effect reconciliation and rollback, and can supply a misleading actor identity. The database cannot distinguish the Maya runtime, the separately trusted issuer, readiness automation, and rollback operator. This violates least privilege and weakens the intended service-role boundary even if HTTP DPoP verification is correct.

**Fix:** Create separate NOLOGIN roles for issuer/token claims, runtime request/effect transitions, readiness, and operator rollback as needed; grant each only its exact RPCs. Use a dedicated non-login, non-superuser, non-BYPASSRLS owner for SECURITY DEFINER functions, fully qualify extension functions, revoke `PUBLIC` and generic `service_role`, and set safe default privileges. Derive audit actor identity from the authenticated database role or a separately verified signed operator claim, not a free text parameter. Require catalog tests before promotion.

**Priority:** P1

**Confidence:** High

### P1 — No installed execution/reconciliation route can complete the required controlled test

**Evidence:** The API route recognizes only paths ending in `/reserve`; all other authenticated operations return `operation_not_installed`. Although `store.server.ts` exports `reconcileEffect`, the route never imports or calls it, and no provider execution adapter is present in the reviewed route. A successful reservation returns `201` and leaves the effect in `reserved`. Readiness treats any `reserved`, `executing`, or `failed_unknown` effect as unreconciled, so the implemented path makes readiness degraded without a reviewed route to finish or reconcile it.

**Impact:** The acceptance requirement of exactly one Slack and one email delivery with durable provider IDs cannot be performed through the reviewed surface. Operational code added later would necessarily cross the most sensitive pre-I/O/post-I/O boundary without being covered by this design. Crashes after reservation strand authority until rollback/manual intervention.

**Fix:** Add and review a single-use execution transition and terminal reconciliation surface. Require the effect ID plus an unguessable reservation/attempt token, current fence, exact provider account, and expiry; atomically move `reserved` to `executing` before I/O. Reconciliation must bind the provider ID/outcome to that attempt, reject arbitrary outcome strings, make identical replay deterministic, and permanently block automatic retry after `unknown`. Add crash-window and concurrent-caller tests before any shadow promotion.

**Priority:** P1

**Confidence:** High

### P1 — Readiness can report nominal booleans without proving the activation contract

**Evidence:** `pec78_shadow_readiness` checks counts and broad states only. It does not verify exact credential ID/runtime instance/issuer/thumbprint/provider references, exact five capability identities and validity windows, exact Slack workspace/app/bot/account/DM tuple, exact Google sender and sole recipient, destination expiry, gate build/registry/migration/review hashes, Linear authorization receipt, budget parameter values and usage receipts, unique runtime ownership, replay-store health/expiry, receipt-chain integrity, or schema/function ownership and grants. `no_kill_switch` counts all active switches globally rather than the switches applicable to Maya, producing both unrelated false negatives and no positive proof of each required scope. `no_active_lease` is also global. The application readiness layer consumes these booleans but cannot add missing database evidence.

**Impact:** A malformed or wrong active row set can satisfy the SQL readiness response, while unrelated agents can make it fail. Readiness therefore cannot serve as the required fresh production proof and risks a false promotion signal.

**Fix:** Return one fail-closed check for every exact activation invariant, keyed to fixed reviewed identifiers/digests and current time. Verify applicable kill-switch scopes, Maya ownership/leases/effects, exact gate and migration hashes, receipt continuity, usage/cost evidence, and dedicated role/function catalog posture. Treat missing checks, unexpected extra rows, nulls, and stale observations as degraded. Keep production catalog verification as a separate deployment gate and do not infer it from repository tests.

**Priority:** P1

**Confidence:** High

### P1 — Destination/provider controls are not exact at the database boundary

**Evidence:** Schema 189 adds uniqueness only on `(capability_grant_id, provider, destination_digest)` for active rows. It does not constrain `slack.send.christopher` to Slack or `email.send.admin` to Google, nor constrain the fixed Slack workspace/app/DM, Google sender/recipient, provider bot/user identity, or provider account digest to reviewed constants. Multiple active rows with the same `destination_ref` but different digests/accounts remain legal; the `SELECT INTO` queries have no deterministic uniqueness guarantee. The request supplies no destination directly because application constants fill it, but a caller with RPC execution can supply any `p_destination_ref` for which a broad service-role-created row exists. Reservation returns the clear destination reference to the caller.

**Impact:** A wrong or contradictory active grant can authorize the wrong provider identity or destination while passing current readiness counts. Application constants are helpful defense in depth but are not the exact database grant required by the activation contract. Provider identity introspection and its stable evidence are not bound to reservations and receipts.

**Fix:** Store and constrain canonical typed destination components and provider identity evidence. Add exact activation-specific checks (or immutable seeded rows referenced by the gate), provider/capability constraints, and a unique active row per outbound capability. Have the RPC derive the destination row from capability and gate rather than accept a destination reference. Bind provider-introspection evidence/digests to the gate, effect, and receipts; return only the provider-ready opaque grant identifier needed by the adapter.

**Priority:** P1

**Confidence:** High

### P1 — Rollback is not sufficient for ambiguous outcomes and is callable with unvalidated audit data

**Evidence:** Rollback atomically disables the principal, revokes authority, increments principal/schedule fences, fences active leases, and revokes effects in several preterminal states. However, it does not change `failed_unknown`, does not create a provider-reconciliation work item/deadline, and does not bind the rollback receipt to affected effects. It accepts arbitrary reason and actor strings, has no authorization check beyond generic `service_role`, and repeated calls increment fences and append receipts again rather than returning the original rollback result. The HTTP route does not expose a reviewed rollback endpoint or demonstrate the required `PEC78_ADAPTER_MODE=disabled` change; a database RPC cannot set that environment variable.

**Impact:** Database rollback helps fence future work but does not operationalize proof of zero-or-one delivery for ambiguous provider outcomes. Repeated invocations are state-safe in broad terms but not idempotent as an auditable operation, and audit attribution is spoofable. The required application stop and 423 behavior is not one atomic operation with database revocation.

**Fix:** Separate and document the adapter-disable operational step, then invoke a dedicated authenticated rollback RPC with a stable rollback idempotency key. Preserve `failed_unknown` as terminal/non-retryable, but create explicit immutable reconciliation obligations and receipts for each ambiguous attempt. Bind affected effect IDs and new epochs into the rollback receipt, derive actor identity from trusted authentication, and make exact replay return the original result without another fence increment.

**Priority:** P1

**Confidence:** High

### P2 — Replay/idempotency completion semantics are incomplete and internally inconsistent

**Evidence:** `pec78_authorize_request` inserts JTI replay claims before checking an existing request claim. A same-token retry is denied as replay before idempotency can return its stored result; a fresh-token retry consumes new replay claims and can return an existing request whose `response_status` and `response_body` are null because no reviewed code updates them. The route ignores `requestState.replayed` and continues to reservation. On an effect replay, the reservation RPC returns no provider or expiry fields, yet the route always constructs a new `201 reserved` response from those fields. Token issuance stores only proof JTI, capability, and expiry; it does not bind runtime instance, requested access-token lifetime, proof thumbprint, or issued access JTI. Caller-supplied replay expiries are not constrained to validated token/proof expiry or a maximum horizon.

**Impact:** Legitimate retries do not receive a stable original response, replay claims can be consumed without work, and response shapes differ or lose fields. Oversized/stale claim lifetimes can create denial of service or inconsistent replay windows. Token issue records cannot prove which concrete access token and DPoP key were authorized.

**Fix:** Define an explicit request state machine (`in_progress`, `completed`, terminal failure), store the canonical response atomically with completion, and check idempotency/digest before consuming unnecessary fresh replay claims while still rejecting cryptographic replay. Return the stored status/body exactly. Bind token claims to credential, runtime instance, capability, thumbprint, access JTI, issuer, and bounded expiry generated by the database/trusted issuer rather than accepted from the caller. Add concurrent identical/conflicting retry tests.

**Priority:** P2

**Confidence:** High

### P2 — SQL portability and installation validity are not proven

**Evidence:** SECURITY DEFINER functions set `search_path` to `pg_catalog, runtime_auth, public` and call `digest` without schema qualification. Supabase commonly installs extensions in a dedicated extension schema, while schema 188/189 does not create `pgcrypto` or establish where `digest` resolves. Schema 189 also alters populated authority tables with immediate constraints and creates partial unique indexes without preflight queries; although schema 188 seeds no credentials/gates/destinations, the migration itself does not assert that prerequisite state. No SQL execution proof or migration test is included in the reviewed artifacts.

**Impact:** Migration/function execution can fail in an environment where `digest` is not visible on the fixed path, or deployment can fail if state diverged from the assumed installed-disabled baseline. Relaxing the function search path to make it work would introduce a SECURITY DEFINER resolution risk.

**Fix:** Explicitly require the extension, schema-qualify the trusted extension function in every SECURITY DEFINER body, and keep an immutable safe search path. Add fail-fast preflight assertions for the exact schema-188 baseline before constraints/indexes. Execute schema 188 then 189 in a disposable Postgres/Supabase-compatible environment and test function creation, grants, RLS behavior, rollback, and concurrency. Production catalog proof remains a separate required gate.

**Priority:** P2

**Confidence:** Medium

## Clean

- Schema 189 is transactionally wrapped and does not itself activate a credential, destination, production gate, schedule, provider, or budget row.
- Timestamp ordering constraints for credentials, capability grants, and production gates improve on schema 188.
- Active-gate and active-destination partial unique indexes reduce some duplicate-authority cases.
- All SECURITY DEFINER functions declare a fixed search path, and unauthenticated/client roles are explicitly denied EXECUTE.
- Effect reservation locks the budget row, so concurrent reservations cannot exceed the stored one-Slack/one-email reservation counters.
- Effect uniqueness plus digest/destination checks provides a useful base for idempotent reservation.
- The pre-I/O receipt is inserted in the same transaction as effect reservation, and terminal effect update and reconciliation receipt are in one transaction.
- Rollback performs its database revocations and fence changes in one transaction and preserves existing receipt rows.
- The route fixes the two destination strings in application code and rejects CC/BCC-like extra JSON fields; it also requires a PEC-78 test prefix and exact email subject.
- Schema 188 remains fail-closed when installed alone: authority rows are disabled, no credentials/destinations/gates exist, RLS is enabled and forced, and client roles are revoked.

## Assumptions

- This is a static, read-only review of `PEC78-SHADOW-ACTIVATION.md`, the prior database FAIL report, schemas 188 and 189, and the reviewed PEC-78 store/route/auth/readiness code available in the worktree on 2026-07-26.
- No SQL was applied to production or any live Supabase project, no provider call was made, and no live catalog, role, grant, policy, extension, migration-history, identity, credential, gate, receipt, or readiness evidence was inspected. Nothing in this report claims live catalog evidence.
- Schema 188 is assumed to precede schema 189 exactly. Repository working-tree changes were treated as candidate artifacts and were not modified.
- Supabase's general server client is assumed to use the service-role credential based on its role in this codebase; exact deployed credential and role attributes require catalog/configuration evidence before activation.
- Application adapter shutdown, provider identity introspection, provider I/O, and provider-side reconciliation are outside the SQL artifacts unless explicitly implemented in the reviewed route; their absence is not inferred to be supplied elsewhere.
- The activation contract requires no P0/P1 findings for readiness. Because this report contains P1 findings, PASS is forbidden.

MACHINE_VERDICT: FAIL
