# Review Report

## Summary

The PEC-78 Maya Composio candidate passes this read-only source final gate with no P0/P1 findings. Migration 191 correctly fences the unsafe migration-190 entry points and binds validation ingestion to the exact trigger, connected account, Composio user, Slack source, build, registry, runtime instance, active credential, migration-specific production gate, receive grant, principal fence, freshness window, and single-use activation authorization. The final provider-I/O edge is the sole `reserved -> executing` transition that returns `provider_io_authorized=true`; it serializes with rollback and rechecks the live credential, principal, gate, source, send grant, destination, budget, event/effect/lease tuple, expiries, fence/epoch, and global/contract/principal/credential/capability/destination/effect kill scopes.

Replay and crash behavior fail closed. Any effect row prevents lease reclaim; a second execute is explicitly ambiguous and cannot authorize provider I/O; and reconciliation terminalizes the effect, event, lease, and linked receipts in one transaction. DPoP separates issuer and proof keys and binds token/proof JTIs, capability, credential, runtime, method, canonical HTTPS URL, access-token hash, and body digest. Accepted Slack content is minimized and AES-256-GCM encrypted before persistence, decrypted only after a database claim, and passed to a tool-free, bounded Hermes child as explicitly untrusted JSON. The production worker's only Slack effect is the pinned Composio `SLACKBOT_SEND_MESSAGE` call bound to Maya's user/account, the reviewed channel, and the claimed thread; the installed SDK uses zero retries for non-idempotent tool execution.

Rollback is trigger-first: it must confirm the exact new trigger disabled before any downstream mutation, then invokes the database fence, stops and credential-quarantines the exact worker, and disables inference authority. The database rollback and execute edge share the same advisory transaction lock, so a rollback that wins makes execute re-read revoked authority and fail. The package installs stopped (`autostart=false`, `startretries=0`) and installation requires exact STOPPED evidence.

Local, no-external-effect verification passed: Command Center PEC-78 Vitest passed 45/45 tests in five files; listener Node tests passed 65/65; and an isolated Command Center Astro production build completed. The database harness was inspected but not rerun because it requires a mutable non-production database; its retained preview result is supporting evidence only, not a production attestation.

## Findings

### F-01 — Live production identity and state remain an activation gate

- **Evidence:** Source readiness explicitly does not attest live Orgo worker or Composio trigger state (`app/command-center/src/lib/pec78/readiness.server.ts`). The activation plan separately requires production migration/preflight and backup proof, deployed build identity, registry/runtime/source/gate binding, exact stopped worker archive hash, old/new trigger identities and disabled states, an empty/healthy database state, and one fresh Christopher authorization (`plans/ringer/named-agents-runtime-evaluation/PEC78-MAYA-COMPOSIO-PRODUCTION.md`, Activation gate). The database harness refuses the production ref, requires `PEC78_DB_TEST_TARGET=nonproduction`, and reports its target (`app/command-center/scripts/pec78-db-integration.mjs:6-18,327-344`).
- **Impact:** A source PASS does not prove that production currently runs these exact migrations and binaries or that provider/runtime state is installed-disabled. Treating retained preview proof as production readiness could bypass the operational activation gate, although it grants no authority in this source package.
- **Fix:** Before activation, collect and compare the production migration/preflight and backup proof, deployed `buildCommit`, registry digest, runtime instance/credential, database source/gate/grants/fence, release trust-chain hash and STOPPED state, exact old/new trigger identities and disabled states, and empty queue/no live lease/no ambiguous effect. Enable the reviewed new trigger last only after Christopher's fresh authorization.
- **Priority:** P2
- **Confidence:** High

### F-02 — Project binding depends on secret isolation rather than an explicit envelope field

- **Evidence:** The plan says the endpoint rejects every wrong Composio project and lists a wrong-project negative fixture (`PEC78-MAYA-COMPOSIO-PRODUCTION.md:25,85`). The webhook verifies the raw-body HMAC and explicitly compares trigger ID, connected-account ID, and Composio user ID, but accepts no project ID input and checks no project field (`app/command-center/src/lib/pec78/composio-webhook.server.ts:85-125`; `app/command-center/src/pages/api/integrations/composio/v1/webhook.ts:31-39`). The webhook tests cover wrong trigger/account/user but contain no independent wrong-project case (`app/command-center/src/lib/pec78/composio-webhook.server.test.ts:34-41`). The prior remediation PASS therefore assumes the configured webhook secret is unique to the reviewed project.
- **Impact:** If Composio scopes the signing secret more broadly than the single reviewed project, another project sharing that secret and the same source identifiers could satisfy the implemented checks. If the secret is demonstrably project-unique, the HMAC supplies the missing project binding and this is a proof/documentation gap rather than an exploitable path.
- **Fix:** At activation, retain provider evidence that `PEC78_COMPOSIO_WEBHOOK_SECRET` is unique to the exact reviewed project/subscription. If Composio exposes a signed project identifier, bind and test it explicitly; otherwise revise the acceptance text to define project binding as possession of a dedicated per-project signing secret and add a fixture proving a different project's secret fails.
- **Priority:** P2
- **Confidence:** Medium

## Clean

- Migrations 188-191 install no active trigger, source, credential, gate, capability, destination, budget, schedule, or provider effect. Migration 191 revokes service-role execution from the unsafe v1 ingest and no-argument readiness functions and grants only the hardened signatures.
- Private runtime tables use forced RLS and revoke direct API/service-role DML. Definer RPCs use fixed trusted search paths, explicit signatures, and narrow service-role execution grants. Ciphertext columns enforce AES-256-GCM shape; receipt rows are append-only.
- Validation ingestion uses one database transaction and advisory lock to consume the exact one-event authorization and insert ciphertext. Independent delivery and Slack-message uniqueness constraints make provider redelivery and message rewrapping idempotent; a rejected insert rolls back authorization consumption.
- Claiming uses row locking, `SKIP LOCKED`, an active-lease uniqueness constraint, lease epochs, a two-attempt ceiling, and refuses reclaim whenever any linked effect exists.
- Reservation authenticates channel/thread digests from the claimed encrypted event. Execution revalidates the destination grant and destination/effect kill scopes immediately before its unique authorization transition.
- A repeated executing call returns `effect_execution_ambiguous` with provider I/O unauthorized. Reconciliation atomically finalizes effect/event/lease state; unknown and failed outcomes quarantine instead of retrying.
- DPoP access tokens and proofs are Ed25519-signed with separated keys and short lifetimes. Database replay claims make proof and request JTIs single-use, and request authorization binds capability, credential, runtime, route, idempotency key, request digest, and destination.
- Webhook verification authenticates exact raw bytes with constant-time HMAC comparison, strict size/header/timestamp bounds, and a five-minute window before parsing. It rejects wrong source identities, Slack team/channel/owner, bot/self, subtype, attachment, malformed timestamp, and incidental/confusable addressing.
- Only minimized Slack fields enter AES-256-GCM plaintext; persisted content is ciphertext, nonce, tag, key version, and non-reversible digests. Logs contain codes, trace IDs, and digests, not message content or secrets.
- Hermes is one-shot, model-pinned, zero-tool, time/output/word bounded, and receives only the OpenRouter credential in its child environment. Its prompt isolates untrusted Slack text; output filtering removes Slack references and rejects disclosure and unverified-action language.
- `production-worker.mjs` has no Slack token, Slack SDK, webhook sender, or alternate send path. It calls only Composio's pinned Slack tool/account/user/channel/thread tuple with broadcasts, link names, and unfurls disabled.
- Runtime secrets are confined to an owner-only `0600` environment file under `0700` directories. The root-owned release/trust chain is verified before launch, and the Hermes child is not given Composio or DPoP credentials.
- Supervisor installs the production worker disabled and exact STOPPED state is verified. The retained prototype is not the configured Supervisor command and is quarantined through a recoverable, integrity-checked transaction.
- Trigger-first rollback refuses downstream mutation if exact trigger disable cannot be confirmed. Database rollback revokes source, activation authorization, gates, grants, destination, budget, credentials, and leases; increments the principal fence; quarantines pending events; and retains ambiguous effects for reconciliation.
- The database proof harness covers catalogs/grants/RLS, ciphertext transaction rollback, concurrent one-use ingestion and claims, ingress authority, execute authority and all applicable kill scopes including destination/effect, second-execute ambiguity, atomic finalization, terminal reclaim denial, receipt immutability, exact-trigger readiness, destination-kill readiness, and rollback/execute serialization.
- Verification performed for this gate: app tests 45 passed/0 failed; listener tests 65 passed/0 failed; isolated Astro build passed. No production database, Composio, Slack, Orgo, OpenRouter, Supervisor, deployment, or other external state was read or changed.

## Assumptions

- The candidate is the current dirty checkout at `/Users/chussey/.codex/worktrees/3550/a-roofers-open-brain`; existing modified and untracked files were treated as review inputs and left unchanged. Only this task directory's `report.md` was created.
- The retained successful preview database proof accurately corresponds to the checked-in migrations 188-191 and harness. It is not production evidence and was not rerun during this read-only gate.
- The production Composio signing secret will be proven unique to the exact reviewed project/subscription before activation; absent that proof, F-02 must be reclassified as a P1 activation blocker.
- The fixed Composio/Slack identities are the reviewed identities, and the new production trigger will be proven distinct from the retained malformed prototype trigger.
- Recovery reconciliation after send-authority revocation is intentionally permitted because it cannot authorize provider I/O or transition a reserved effect to executing.
- PASS means the installed-disabled source candidate clears this security gate. It is not authorization to migrate production, deploy, start the worker, enable a trigger, consume a message, or send Slack.

MACHINE_VERDICT: PASS
