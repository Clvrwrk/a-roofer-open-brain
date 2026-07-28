# Review Report

## Summary

The PEC-78 production design is directionally sound, and activation is explicitly separate from installation. However, the reviewed source does not implement the production design it describes. The only runnable Maya listener is explicitly a non-production Composio WebSocket validation listener, while the planned signed-webhook endpoint, migration 190 encrypted-event boundary, event claim/lease API, and Command Center-mediated effect lifecycle are absent. The current worker can receive and send with its local Composio and inference credentials without exercising the DPoP, tenant/fence, production-gate, capability, source, kill-switch, or durable effect controls already modeled elsewhere.

Two P1 findings therefore block production activation. The installed-stopped state must remain in force until they are remediated and independently re-reviewed.

## Findings

### F1 — Production webhook authentication, replay defense, encrypted storage, and event claiming are not implemented

- **Evidence:** The plan requires exact raw-body verification of `webhook-id`, `webhook-timestamp`, and `webhook-signature`, a five-minute replay window, exact source-tuple rejection, AES-256-GCM encryption before storage, database uniqueness, and a DPoP-authenticated event claim/lease (`PEC78-MAYA-COMPOSIO-PRODUCTION.md:22-38`). The reviewed listener instead calls `composio.triggers.subscribe()` directly (`deployment/remote/orgo/maya-slack-listener/listener.mjs:49-79`), and its README explicitly limits that WebSocket path to controlled validation and says production must use a signed webhook (`deployment/remote/orgo/maya-slack-listener/README.md:5-7`). The plan-owned `schemas/cleverwork-roofer/190-pec78-composio-slack-production.sql` and `app/command-center/src/pages/api/integrations/composio/` do not exist. No webhook signature verifier, event-encryption implementation, or production inbound-event store exists in the reviewed `app/command-center/src/lib/pec78/` subtree.
- **Impact:** The reviewed implementation provides none of the claimed production ingress authenticity, freshness, encrypted-at-rest message boundary, delivery/message uniqueness, or authenticated lease ownership. Activating this worker would bypass the core security architecture and could permit spoofed/replayed or duplicate processing without a durable source of truth.
- **Fix:** Implement migration 190 and the signed raw-body webhook endpoint. Fail closed on missing/malformed signatures and timestamps; enforce the five-minute window and atomic delivery/message replay claims; validate the full immutable Composio/Slack tuple; minimize and AES-256-GCM-encrypt content before any database write; expose DPoP-authenticated atomic claim/lease/complete routes; and replace or retire `subscribe()` in the production artifact. Add all deterministic negative and concurrency tests specified at plan lines 81-99.
- **Priority:** P1
- **Confidence:** High

### F2 — The runnable worker is not governed by Command Center identity, tenant, fence, gate, kill, or durable effect authority

- **Evidence:** The worker requires only `COMPOSIO_API_KEY` and `OPENROUTER_API_KEY`, constructs Composio locally, and starts the direct subscription (`deployment/remote/orgo/maya-slack-listener/listener.mjs:14-26,49-79`; `deployment/remote/orgo/maya-slack-listener/start-listener.sh:53-68`). It claims events in a local receipt store, invokes Hermes, and sends through Composio (`deployment/remote/orgo/maya-slack-listener/attempt.mjs:19-45`); the provider call occurs before the local receipt is confirmed (`deployment/remote/orgo/maya-slack-listener/send-once.mjs:15-32`). DPoP/token validation exists in `app/command-center/src/lib/pec78/auth.server.ts:117-173`, and synthetic shadow authorization/effect RPCs exist in `schemas/cleverwork-roofer/189-pec78-maya-shadow-boundary.sql:64-89,115-238`, but the listener never calls them. Migration 189 describes a synthetic shadow boundary, not the planned Slack inbound-event claim boundary (`schemas/cleverwork-roofer/189-pec78-maya-shadow-boundary.sql:1-3`).
- **Impact:** Possession of the two runtime secrets is sufficient to act without a current credential/runtime-instance binding, principal fence epoch, production gate, source/capability grant, activation budget, or kill-switch check. Local filesystem exclusivity cannot atomically fence stale owners across runtimes or make provider effects authoritative in Command Center.
- **Fix:** Make the worker obtain a short-lived DPoP-bound token and atomically claim each event before decryption. Transactionally recheck credential, exact runtime instance, principal, fence epoch, production gate, inbound source, capability, budget, and all applicable kill switches. Reserve the exact effect in the database before provider I/O, transition it through executing/reconciliation/completion, and prevent lease reclamation whenever an effect is reserved, executing, or unknown.
- **Priority:** P1
- **Confidence:** High

### F3 — The prompt-injection boundary relies on natural-language instructions without deterministic output enforcement

- **Evidence:** Untrusted Slack text is appended directly after natural-language instructions under `Christopher's message:` (`deployment/remote/orgo/maya-slack-listener/hermes-runner.mjs:19-27`). Tool execution is correctly disabled and verified (`deployment/remote/orgo/maya-slack-listener/hermes-runner.mjs:30-43`; `deployment/remote/orgo/maya-slack-listener/verify-trust-chain.mjs:85-120`), but output handling only normalizes/removes Slack references and NUL characters before posting; it does not enforce the stated restrictions against fabricated actions, secret/instruction disclosure, or scope escape (`deployment/remote/orgo/maya-slack-listener/core.mjs:183-207`).
- **Impact:** A deliberately or accidentally injected owner message may steer Maya into producing misleading, policy-violating, or instruction-revealing text that is then posted under Maya's Slack identity. Tool disabling limits direct side effects but does not make generated outbound text safe.
- **Fix:** Pass message content in a structured, unambiguous data envelope and explicitly treat every byte as untrusted quoted content. Add deterministic post-generation policy checks for the accounting-only scope, required prefix/length, prohibited action claims, secrets/system-instruction disclosure, and unauthorized addressees. Fail closed or escalate to Christopher on a violation; add adversarial prompt-injection fixtures.
- **Priority:** P2
- **Confidence:** High

### F4 — Durable outbound authorization does not bind the claimed event's exact Slack thread

- **Evidence:** `runtime_auth.destination_grants` defines `thread_digest` (`schemas/cleverwork-roofer/188-pec78-runtime-auth-v1-installed-disabled.sql:26-30`), but migration 189's authorization/reservation path checks the fixed destination and destination digest without enforcing `thread_digest` (`schemas/cleverwork-roofer/189-pec78-maya-shadow-boundary.sql:145-151,188-203`). The Command Center store does not submit a thread binding (`app/command-center/src/lib/pec78/store.server.ts:56-72`). The validation worker does locally derive and use the source channel/thread (`deployment/remote/orgo/maya-slack-listener/core.mjs:148-156,194-207`; `deployment/remote/orgo/maya-slack-listener/attempt.mjs:35-41`), but that tuple is not covered by a durable Command Center reservation tied to an immutable claimed inbound event.
- **Impact:** The authorization record cannot prove or enforce that the provider call used the claimed owner's exact channel and parent thread. A bug or implementation drift could redirect an otherwise authorized effect within the destination scope without database rejection.
- **Fix:** Store channel and parent-thread identifiers as immutable encrypted-event fields; include non-reversible channel/thread digests in the effect intent and idempotency key; have reservation return the exact authorized tuple; and reconcile the provider result against that tuple before success.
- **Priority:** P2
- **Confidence:** High

### F5 — Production rollback does not invoke the database kill/fence path or reconcile unknown effects

- **Evidence:** The plan requires trigger-first disable, exact worker stop, principal fencing/kill, gate/capability/source revocation, and reserved/unknown effect reconciliation (`PEC78-MAYA-COMPOSIO-PRODUCTION.md:101-115`). The runnable rollback disables the Composio trigger, stops/quarantines the runtime, and disables inference (`deployment/remote/orgo/maya-slack-listener/operator-rollback.mjs:32-53,132-165`). Although `public.pec78_rollback_shadow` exists (`schemas/cleverwork-roofer/189-pec78-maya-shadow-boundary.sql:246-293`), the rollback utility never invokes it, and WebSocket effects are not recorded in the database lifecycle.
- **Impact:** The operational rollback cannot establish the claimed Command Center authority revocation or reliably enumerate and reconcile provider-ambiguous effects. A stale or alternate runtime may retain authority that the operator believes was removed.
- **Fix:** Add a protected operator endpoint/RPC that atomically fences the principal and revokes the production gate, inbound source, and relevant capabilities/destinations. Invoke it in the documented trigger-first rollback sequence, then enumerate and reconcile every reserved, executing, and unknown effect. Persist secret-free receipts proving each step and the exact stopped worker identity.
- **Priority:** P2
- **Confidence:** High

## Clean

- **Activation is correctly separate:** The plan states implementation installs/tests disabled and makes activation a later checklist (`PEC78-MAYA-COMPOSIO-PRODUCTION.md:3,16-18,117-133`). Supervisor is installed with `autostart=false`, `autorestart=false`, and zero retries (`deployment/remote/orgo/maya-slack-listener/maya-slack-listener.conf:5-8`); installation loads it and proves `STOPPED` (`deployment/remote/orgo/maya-slack-listener/install-disabled.sh:200-212`).
- **Validation identity and tenant pinning is strong:** Immutable literals pin the Composio user/account/trigger and Slack workspace/channel/owner/bot (`deployment/remote/orgo/maya-slack-listener/policy.mjs:1-10`), with per-event and preflight checks in `core.mjs:119-180`. This is useful validation defense, but it does not cure F1/F2 for production.
- **Composio-only Slack compliance is present in the validation path:** Slack send uses `composio.tools.execute` with the pinned user and connected account (`deployment/remote/orgo/maya-slack-listener/send-once.mjs:15-23`); no direct Slack token/SDK path was found. Hermes is verified tool-free before execution (`deployment/remote/orgo/maya-slack-listener/verify-trust-chain.mjs:85-120`).
- **Local duplicate/unknown handling is conservative:** Exclusive local receipts deduplicate events, prepared receipts recover as ambiguous, confirmed sends do not retry, and send errors are marked ambiguous (`deployment/remote/orgo/maya-slack-listener/core.mjs:233-269`; `deployment/remote/orgo/maya-slack-listener/send-once.mjs:25-33`). This is appropriate for controlled validation but is not a substitute for production database uniqueness and reconciliation.
- **Validation destination/thread binding is explicit:** The worker rejects the wrong channel/thread context and builds the reply against the accepted event's channel and thread (`deployment/remote/orgo/maya-slack-listener/core.mjs:148-156,194-207`; `deployment/remote/orgo/maya-slack-listener/attempt.mjs:35-41`).
- **Secret handling has useful hardening:** The launcher verifies `0700` directories and a `0600` secret file, verifies the release trust chain, then starts with a minimal environment (`deployment/remote/orgo/maya-slack-listener/start-listener.sh:26-28,43-68`). The Composio key is not passed into the Hermes subprocess (`deployment/remote/orgo/maya-slack-listener/core.mjs:210-225`). No embedded Slack token or complete provider secret was found in the reviewed first-party files.

## Assumptions

- This is a source/design review only. Production environment values, deployed commits, database migration history, Composio project/trigger state, live Supabase grants, Orgo machine state, and Christopher's activation approval were not inspected.
- All first-party files in the two requested subtrees, including tests and package/lock metadata, were included. `node_modules` was not present in the requested subtree and third-party package internals were not independently audited.
- Absence findings describe the supplied/reviewed repository state. If production ingress or migration artifacts exist elsewhere, they remain outside the stated ownership boundary and do not satisfy this review until brought into the reviewed package with tests and provenance.
- P1 means production-blocking under the supplied governance, which requires stopping when any P0/P1 remains open (`docs/74-named-agent-runtime-ringer-governance.md:95-105`).

MACHINE_VERDICT: FAIL
