# Review Report

## Summary

The implemented PEC-78 Maya Composio production path passes this pre-activation operations/SRE review with no P0 or P1 findings. It is a deliberately installed-disabled package, not a live-production attestation: migration 190 seeds no active source, credential, gate, authorization, grant, or runtime; the webhook defaults to stopped; and Supervisor installs the worker with `autostart=false`. Activation remains a separate, trigger-last operator gate requiring fresh live evidence.

The exact public endpoint is `POST /api/integrations/composio/v1/webhook`. Middleware exempts only that path from WorkOS, while the route rejects disabled ingress with `423 ingress_stopped` before reading a body. When validation is enabled, it reads the body once, verifies the Composio HMAC over `webhook-id.webhook-timestamp.rawBody` within 300 seconds, validates the complete V3 source and Slack tuple, encrypts the minimized event, and persists only ciphertext and digests.

The database and worker provide a bounded validation path: database-clock leases are 180 seconds; Hermes is capped at 60 seconds, 4,000 output bytes, and 120 words; Composio send is capped at 30 seconds; claims are fenced to the exact credential/runtime owner; rows are claimed with `FOR UPDATE SKIP LOCKED`; event attempts are capped at two; queue eligibility is capped at 15 minutes; and unknown provider effects stop automatic retry. The exact Composio user/account/trigger, Slack team/channel/owner/bot, thread digest, model, tool slug/version, and destination are immutable or revalidated at each applicable boundary.

Focused evidence executed during this review:

- Maya listener: `npm test` passed 64/64 tests.
- Command Center PEC-78: `npm exec vitest run src/lib/pec78` passed 42/42 tests in five files from an isolated writable copy.
- Command Center: `npm run build` completed successfully from the same isolated writable copy.
- Direct Command Center commands in the source checkout were blocked only by the review sandbox denying writes to `node_modules/.vite-temp` and `.astro`; the writable-copy rerun proves the source itself builds and tests.
- Static inspection covered the full plan, migrations 188-190, all PEC-78 library and route files, middleware/environment declarations, and every first-party file in the Maya listener subtree.

## Findings

### F1 — Lease headroom is fail-closed but should be made an explicit end-to-end deadline

**Evidence:** Migration 190 issues a 180-second lease and checks that it is still active before effect reservation and immediately before the `reserved -> executing` provider-I/O authorization. Hermes is independently limited to 60 seconds and Composio to 30 seconds. The Command Center client obtains a fresh capability token before each operation, with a 30-second timeout on both token and operation requests. Under severe sequential control-plane delay, the lease can expire before `executing`; the database then denies the send.

**Impact:** This cannot authorize a late Slack send because the final database transition checks lease expiry, but it can turn control-plane slowness into a quarantined validation attempt and make latency diagnosis less direct.

**Fix:** Before activation, pass a single monotonic attempt deadline through Hermes, Command Center calls, and Composio; reserve a send safety margin before `executing`; and add a worst-case latency fixture. Token reuse within its 120-second lifetime is an optional optimization if it preserves DPoP and replay controls.

**Priority:** P2

**Confidence:** High

### F2 — Inference cost is bounded by validation cardinality, but dollar accounting is not reconciled

**Evidence:** The accepted message is capped at 2,000 characters, the model is pinned to `google/gemini-3.1-flash-lite`, Hermes is one-shot/tool-free with a 60-second timeout, an event has at most two claims, validation ingress atomically consumes a one-event authorization, and the Slack budget permits one reservation. Migration 189 contains `max_gate_cost_usd` and `spent_usd`, but the production worker does not reserve or reconcile actual OpenRouter usage into those fields.

**Impact:** The controlled activation remains operationally bounded to a small number of pinned-model inference attempts, but operator evidence cannot demonstrate exact dollars spent or percentage-breaker behavior from database receipts.

**Fix:** Reserve a conservative inference amount before Hermes, reconcile actual provider usage afterward, charge unknown usage at the reservation ceiling, and expose inference attempts/cost in the private evidence bundle.

**Priority:** P2

**Confidence:** High

### F3 — Raw-body byte fidelity needs a deployed non-ASCII fixture

**Evidence:** The route calls `request.text()` once and verifies the HMAC before JSON parsing. Unit fixtures prove signature validity, stale rejection, malformed signatures, and body-change rejection. JavaScript strings preserve ordinary valid JSON content, but the repository does not include a deployed-adapter fixture proving signature equality for non-ASCII bytes across the proxy/runtime boundary.

**Impact:** A provider payload containing non-ASCII message content could be rejected if an upstream adapter ever decodes and re-encodes bytes differently. Rejection is fail-closed and creates no event or send.

**Fix:** Add a route-level non-ASCII signed fixture against the deployed adapter. If byte equality is not demonstrated, read `arrayBuffer()` and verify the original bytes before UTF-8 decoding.

**Priority:** P2

**Confidence:** Medium

### F4 — Unknown-effect and full database rollback actions are documented gates rather than one composed operator command

**Evidence:** `operator-rollback.mjs` disables and confirms the exact Composio trigger before any downstream action, then stops the exact Supervisor program, quarantines its credential source, and disables the pinned OpenRouter key. Migration 190 records ambiguous sends as `failed_unknown` with `manual_reconciliation_required`; such effects block lease reclaim and automatic retry. The plan additionally requires principal fencing, gate/capability/source revocation, unknown-effect reconciliation, and evidence retention, but those database actions and the read-only provider lookup are not composed into the listener rollback command.

**Impact:** Trigger-first containment is executable and prevents new ingress/runtime sends, while durable database state prevents automatic retry. The remaining database revocation and reconciliation steps require operator coordination and are more error-prone during an incident.

**Fix:** Before widening beyond the one-message validation, ship a composed runbook/command that performs trigger confirmation first, runtime containment, database fencing/revocation, read-only unknown-effect inspection, explicit human reconciliation, and a retained secret-free evidence bundle. It must never retry an unknown effect.

**Priority:** P2

**Confidence:** High

## Clean

- The public route constant, filesystem route, and middleware exception agree exactly on `/api/integrations/composio/v1/webhook`; no wildcard integration bypass exists.
- Disabled or invalid ingress mode normalizes to stopped and returns before body read, signature handling, encryption, or storage. Supervisor is installed stopped with `autostart=false`, `startretries=0`, a bounded unexpected-restart policy, and exact stopped-state verification.
- HMAC verification uses constant-time comparison, a five-minute freshness window, strict header bounds, body-size bounds, and verification before parsing. Accepted content is encrypted with AES-256-GCM before the store call; logs and receipts contain codes, trace IDs, hashes, and provider-message hashes rather than message text.
- Validation authorization is a database row locked and consumed in the same ingress transaction. It is bound to principal/source, trigger, channel, fence, time window, and one event. Duplicate delivery and Slack message keys are independently unique. With the required empty pre-activation queue, consumption prevents a second fresh validation event from entering the worker loop.
- Worker authority is bound to Maya's exact DPoP key, credential, runtime instance, runtime owner, principal fence, production gate, receive/send capabilities, source, and destination. `FOR UPDATE SKIP LOCKED`, a partial unique active-lease index, and lease epochs prevent two claimants from owning the same event.
- The 180-second lease is enforced with database time. A provider send cannot begin unless the lease is live at the `executing` transition. Events older than 15 minutes are not claimed, attempts cannot exceed two, and ambiguous effects block reclaim.
- Provider and destination literals agree across policy, webhook verification, database source/effect checks, runtime routes, and worker: Composio user `maya-chen`; connected account `ca_X9dQyRDSS0sa`; trigger `ti_5Zoxig5EIJmY`; Slack team `T0B8QEGPVQW`; channel `C0BD7L43PC2`; Maya bot `U0BD0Q0H55G`; owner `U0B8SGJJZLJ`.
- The worker rechecks team/channel/owner after authenticated decryption. Reservation binds channel and source-thread digests, the route accepts only the exact channel/thread format and Maya prefix, and Composio executes only `SLACKBOT_SEND_MESSAGE` at pinned tool version `20260721_00` for the exact user/account with broadcasts and unfurls disabled.
- Hermes is pinned to OpenRouter model `google/gemini-3.1-flash-lite`, receives only its inference credential in a minimal environment, runs through a verified zero-tool configuration, treats Slack content as untrusted JSON data, and rejects overlong, disclosure-like, or unverified-action replies.
- Readiness cannot become green from mode strings alone. The production server readiness requires configuration plus fresh database observations, an empty queue, no lease, and no unknown effect. Its `server_ready` label and note explicitly scope it to the server; the plan separately requires deployed commit, migrations/preflight, exact stopped worker/hash, new-trigger-disabled, old-trigger-disabled, and operator evidence before trigger-last activation.
- The legacy local listener is atomically quarantined with integrity evidence and tested restoration. The old Composio trigger is never reused by the plan; both old-disabled and new-disabled provider evidence are mandatory before the reviewed new trigger is enabled as the final activation mutation.
- Unknown send outcomes become `failed_unknown`, require manual reconciliation, block lease reclaim, and stop the worker loop. There is no automatic resend from an unknown state.
- Rollback ordering is executable and tested: failure to confirm trigger disable prevents downstream mutation; after confirmation, runtime containment and inference-key disable are attempted independently and exact evidence is validated.
- Operator evidence is deliberately an activation prerequisite, not synthesized by repository readiness: migration/preflight and backup proof, deployed commit/registry identity, trigger identities and disabled states, worker archive hash/stopped state, one fresh Christopher authorization, and retained rollback/effect receipts are all required before activation.

## Assumptions

- This is a read-only source and local-execution review of an installed-disabled implementation. It does not attest that migrations 188-190 are applied, that the public endpoint is deployed, or that live Composio, Slack, Orgo, OpenRouter, Supervisor, Supabase, trigger, credential, or authorization state matches the repository.
- `server_ready` is interpreted according to its versioned response and explicit note: it is a Command Center/server prerequisite, not a complete activation verdict. Activation remains forbidden until the separate live evidence checklist is satisfied.
- The one-use conclusion applies to the initial `validation` rollout with an empty queue, one active authorization, and trigger-last activation as required by the plan. It does not authorize general `enabled` conversational operation or a second message.
- P2 findings are pre-activation hardening and operability work. None permits an unauthorized or duplicate provider effect in the reviewed one-message validation path because ingress, lease, effect, and unknown-outcome controls fail closed.
- Existing dirty files belong to the implementation under review. This review modified only this `report.md`.

MACHINE_VERDICT: PASS
