# Review Report

## Summary

- **FAIL:** Maya shadow activation is not safe on the reviewed implementation. The DPoP key can self-mint access tokens, and no atomic replay/idempotency or transactional authorization RPC exists.
- Destination, effect, and rollback requirements are stated in the activation document but are not enforceable by the current app/schema; provider ambiguity and kill races therefore have no safe execution path.
- This activation document is permission to prepare and review the shadow activation, not the approval record or production-gate decision for either outbound effect. Keep `PEC78_ADAPTER_MODE=disabled` and do not bind production credentials or provider adapters until all P1 findings are closed and tested.

## Findings

### F-01 — Maya's DPoP key is also trusted as the access-token issuer

- **Evidence:** The activation requires a “separately trusted Command Center issuer” and `cnf.jkt` binding (`PEC78-SHADOW-ACTIVATION.md:33-38`). `auth.server.ts:60-66` loads only `PEC78_MAYA_PUBLIC_JWK` and uses that same key to verify both the access JWT and DPoP proof. It compares only the configured key's nonstandard digest at `auth.server.ts:88-89`; it never reads or validates access claim `cnf.jkt`. The prior implementation security review identified the same defect (`pec78-implementation-review/security-review/review.md:36-40`).
- **Impact:** Possession or compromise of Maya's DPoP private key permits minting an apparently valid access JWT with attacker-selected capability, credential ID, runtime instance, and JTI. This collapses issuer authorization and proof-of-possession into one credential and defeats the central shadow trust boundary.
- **Fix:** Verify access JWTs with a separately managed Command Center issuer keyset selected by pinned `iss` and allowlisted `kid`; verify DPoP with the registered Maya proof key; compute its RFC 7638 thumbprint and require an exact, constant-time match to access claim `cnf.jkt`; reject unsupported/extra key shapes and bind the issuer, credential, and runtime instance to active database records.
- **Priority:** P1
- **Confidence:** High

### F-02 — Replay and request idempotency are storage-only and cannot be atomically claimed

- **Evidence:** Activation condition 4 requires access/proof JTIs and request idempotency to be atomically claimed (`PEC78-SHADOW-ACTIVATION.md:38`). `auth.server.ts:84-90` merely checks that JTIs exist and returns them; it never writes `replay_claims` or checks `Idempotency-Key`. Schema 188 defines `replay_claims` and `request_claims` (`188...sql:49-57`) but defines no claim RPC, policies, or execute grant. The current app directory has no store/RPC adapter. The architecture design requires `claim_request` and typed transactional RPCs (`pec78-design-retry/.../design.md:399-404`).
- **Impact:** If any shadow handler or provider adapter is attached to this verifier, identical access tokens/proofs can be replayed and concurrent duplicates can both reach work/effect logic. A request key reused with a changed payload cannot be rejected reliably, and a same-payload retry cannot safely return the original result.
- **Fix:** Add one narrowly granted, security-definer claim RPC that locks and rechecks principal/credential/runtime/kill state, atomically inserts both JTI hashes and `(credential, route, idempotency key, canonical request digest)`, returns a stored response only for an exact digest match, and returns deterministic replay/conflict codes. Fail closed when the RPC/store is unavailable. Add concurrent replay and changed-payload tests.
- **Priority:** P1
- **Confidence:** High

### F-03 — Exact destinations and effect budget are not represented as enforceable grants

- **Evidence:** The activation fixes the Slack team/app/DM and sole email recipient and forbids request-selected destinations (`PEC78-SHADOW-ACTIVATION.md:12-26`), with a one-Slack/one-email budget (`:47-53`). Schema 188 seeds no destination grants; its generic table allows any `destination_ref` text and arbitrary digests consistent only with provider enum (`188...sql:26-30`). `policy.server.ts:25-27` authorizes only method/path/capability, while `contract.ts:26-30` maps the shared `/effects` route only to `email.send.admin` and has no Slack effect route. No reviewed function derives the provider tuple from a grant or counts/reserves the activation budget.
- **Impact:** There is no database-enforced proof that a request targets only Christopher, no safe Slack authorization path, and no atomic cap preventing multiple sends. Implementing destinations in request payloads or environment-only configuration would allow destination substitution and race-based budget overruns.
- **Fix:** Create exactly two reviewed, disabled-then-promoted destination grant rows bound to Maya's pinned provider accounts and exact recipient/DM identifiers. Use separate typed effect operations (or a server-derived discriminator) for email and Slack. In the reservation transaction, resolve all destination/provider fields from the grant, reject any recipient/CC/BCC/thread/destination fields supplied by the request, and atomically enforce activation counters of at most one per capability.
- **Priority:** P1
- **Confidence:** High

### F-04 — No transactional effect boundary exists to make pre-I/O receipts and ambiguous outcomes safe

- **Evidence:** The activation requires an immutable receipt before provider I/O, terminal reconciliation afterward, and no retry after ambiguity (`PEC78-SHADOW-ACTIVATION.md:40-41,53`). Schema 188 provides tables only; it has no `reserve_effect`, `finish_effect`, or `reconcile_effect` RPC. Its `effects` row lacks a lease ID/epoch, credential ID, approval ID, provider account, attempt/reservation identifier, and reconciliation evidence (`188...sql:64-70`). Receipts have no FK relationships and no provider-attempt/message field (`:77-81`). No effects/provider adapter exists in current `src/lib/pec78`.
- **Impact:** A future handler cannot prove that authorization, unique reservation, budget consumption, and pre-I/O receipt committed together. After a timeout or crash it cannot reliably distinguish “not sent” from “sent but response lost,” so retrying risks duplicate messages while declaring failure risks an unrecorded real effect.
- **Fix:** Complete the immutable effect model and implement typed reservation/completion/reconciliation RPCs. Commit authorization rechecks, budget decrement, unique provider-stable idempotency key, `reserved` state, and append receipt in one transaction before I/O. Treat timeout/2xx-without-durable-ID as `failed_unknown`; prohibit retry until provider-account-scoped reconciliation proves zero matches, and globally stop on multiple matches.
- **Priority:** P1
- **Confidence:** High

### F-05 — Kill and rollback are a checklist, not an atomic fencing control

- **Evidence:** Rollback lists separate configuration and database actions (`PEC78-SHADOW-ACTIVATION.md:55-59`). Schema 188 contains kill-switch and fence columns (`188...sql:8-13,31-36,83-87`) but no `set_kill_switch` RPC or trigger that increments epochs, fences leases, consumes approvals, revokes unstarted effects, and queues ambiguous effects atomically. The app has no kill/rollback implementation. The design requires those transitions in one transaction and immediate pre-provider recheck (`pec78-design-retry/.../design.md:436-455`).
- **Impact:** During rollback, a worker can pass an earlier check and invoke a provider between the independent fuse, grant, credential, and fence updates. A partial rollback can report stopped while an active lease/approval/effect survives. Setting disabled also cannot safely classify an in-flight provider attempt.
- **Fix:** Implement one authoritative kill RPC that locks the principal/schedule, activates the kill, increments fence epochs, fences leases, expires approvals, revokes unstarted effects, marks reserved/executing effects reconciliation-required, and appends receipts atomically. Executors must repeat the locked kill/fence check immediately before reservation/provider I/O. Make the deployment fuse a second layer, then add kill-vs-execute race and rollback verification tests.
- **Priority:** P1
- **Confidence:** High

### F-06 — Authorization scope is route-level only and is not bound to authoritative rows

- **Evidence:** `evaluatePec78Policy` checks contract, subject, persona, method/path, and a client token capability only (`policy.server.ts:20-27`). `auth.server.ts:84-90` accepts arbitrary nonempty `credential_id` and `runtime_instance_id`; it does not validate principal, credential expiry/state, production gate, grant validity, registry version, provider account, schedule/lease ownership, fence epoch, or kill switches. Schema 188 has no RPC boundary and no RLS policies/execute-only roles. Activation condition 1 requires principal, credential, capability, destination, and production gate all active/unexpired (`PEC78-SHADOW-ACTIVATION.md:31-35`).
- **Impact:** Route admission can be satisfied entirely with signed claims disconnected from current authority. Once mutable routes exist, revoked/stale credentials, fabricated runtime IDs, expired grants, wrong provider accounts, and killed principals could retain access; direct service-role implementation would bypass the deny-only RLS posture.
- **Fix:** Make route policy only an early deny. Every mutation/effect must call a typed RPC that derives identity from verified server claims and, under row locks, validates exact active principal/credential/runtime/registry/build/production gate/capability/destination/lease/fence/kill state. Grant the runtime execute-only access to those RPCs and no table privileges; add catalog and cross-principal denial tests.
- **Priority:** P1
- **Confidence:** High

### F-07 — Secret-bearing provider references are structurally allowed and activation lacks a secret scan/rotation gate

- **Evidence:** The activation forbids raw secrets in SQL, logs, prompts, receipts, source, or Ringer artifacts (`PEC78-SHADOW-ACTIVATION.md:43-45`). Schema 188 nevertheless defines unconstrained `credentials.provider_refs jsonb` (`188...sql:15-19`), which can store tokens or keys; no constraint, typed reference table, or write RPC enforces reference-only content. The activation acceptance list (`:61-69`) does not require a secret/PII scan, runtime environment inspection, or rotation proof before promotion, although the security design forbids master/shared credentials in the runtime (`pec78-design/security-contract/design.md:92-99`).
- **Impact:** An operator or future service-role path can persist raw provider credentials in durable database JSON, and secrets can enter deployment/runtime artifacts without failing the activation gate. Subsequent receipts or diagnostics may propagate them.
- **Fix:** Replace `provider_refs` with typed opaque credential-reference identifiers and allowlisted metadata columns, or enforce writes exclusively through a validating RPC that rejects secret-shaped keys/values. Add pre-promotion source/artifact/database/log/environment secret scans, prove the runtime has only Maya-scoped references, and document immediate global kill plus credential rotation on detection.
- **Priority:** P2
- **Confidence:** High

### F-08 — The activation document ambiguously authorizes outbound execution without defining the approval decision

- **Evidence:** Human authorization permits “controlled Slack/email test messages” (`PEC78-SHADOW-ACTIVATION.md:7-10`), and shadow semantics say a proposed effect may execute when six technical conditions hold (`:28-41`). Unlike both PEC-78 designs, those conditions do not require a single-use Christopher WorkOS approval bound to the immutable intent. The activation does not identify itself as an approval or production-gate record, contains no immutable intent digest, approval nonce, expiry, approver decision, or gate identifier, and schema 188 has no seeded approval/production-gate row or decision RPC (`188...sql:72-76,88-93`). Therefore this review treats the document only as permission to create and review the activation artifacts—not as effect approval or a production-gate decision.
- **Impact:** Implementers can reasonably interpret the activation text as blanket preapproval for two sends, bypassing the designed per-intent, expiring, single-use human decision. Conversely, requiring a per-effect approval without stating it makes acceptance indeterminate. Either interpretation weakens auditability and creates effect-authority ambiguity.
- **Fix:** State explicitly that this activation is not an effect approval. Require a fresh, single-use Christopher WorkOS approval for each immutable email/Slack intent, bound to exact payload digest, capability, destination grant, build/registry/gate, expiry, and nonce, consumed atomically at reservation. If blanket test approval is intended instead, specify an equally immutable two-slot gate and obtain a fresh security review.
- **Priority:** P1
- **Confidence:** Medium-High

## Clean

- The reviewed installed-disabled state is fail-closed: readiness cannot become green from configuration strings, and schema 188 seeds only a disabled Maya principal, five disabled capability grants, and the disabled canonical schedule; it seeds no credential, destination, production gate, occurrence, lease, approval, or effect.
- The activation fixes Maya's identity and the intended Slack/email destinations, prohibits shared-bot fallback and recipient expansion, forbids raw secrets in artifacts, preserves receipts on rollback, disables the recurring schedule, and prohibits automatic retry after an ambiguous provider result.
- Schema 188 forces RLS, revokes the named generic roles, uses restrictive FKs, and rejects receipt update/delete with an exception trigger. These are useful foundations but do not supply shadow authority.

## Assumptions

- “Shadow activation” includes production mailbox reads/classification and the two controlled outbound provider effects described in the activation document, rather than merely installing disabled schema.
- `PEC78-SHADOW-ACTIVATION.md` is authorization to prepare and assess the proposed shadow run. It is not itself a per-effect human approval, an approval row, or a production-gate decision; those remain separately required and absent from the reviewed implementation.
- The reviewed `app/command-center/src/lib/pec78` and schema 188 are the complete current PEC-78 implementation in scope; no unreviewed issuer, RPC, destination, effect, provider, kill, or approval layer may be relied upon.
- The existing PEC-78 designs remain normative where the shorter activation document does not explicitly replace them.
- Static review only: no database migration, route test, provider call, credential inspection, or network action was performed.

MACHINE_VERDICT: FAIL
