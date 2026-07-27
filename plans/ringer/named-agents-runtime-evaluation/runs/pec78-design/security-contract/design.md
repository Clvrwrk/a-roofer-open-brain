# PEC-78 v1 Production Authorization Adapter — Maya Security Contract

## Verdict

**CONDITIONAL PASS FOR IMPLEMENTATION; PRODUCTION ACTIVATION IS DENIED.** The current
Command Center authorization path is not safe for a Maya production pilot: a static
bearer resolves to the shared `ob-accounting` service actor, accounting department
membership is treated as sufficient intake authority, requests have no freshness or
replay proof, approvals are not bound to an immutable effect, server code uses a
service role, and `/healthz` can say `status: "ok"` while a dependency is degraded.

The implementation may proceed only as a new, disabled, default-deny adapter. The
production path is:

```text
Maya credential + request proof -> policy -> occurrence/lease -> work/approval
       |                              |             |                |
       +-- exact principal -----------+-- deny -----+-- fence -------+
                                                       |
                              effect intent hash <- human approval
                                                       |
                              allowlist + idempotency -> effect -> receipt
```

No compatibility fallback is permitted. `ORGO_API_KEY_MASTER`, a shared service
token (including `ob-accounting`), another agent's identity, a WorkOS browser
session belonging to Maya, identity headers, or an unbound API key can never
authorize this adapter. The adapter remains disabled until the post-review human
go/no-go in **Production Gate**.

## Versioned Contract

The immutable contract identifier is `pec78-runtime-authorization-v1`; every token,
request, row, decision, receipt, metric, and health result carries `contractVersion`
with that exact value. Unknown versions fail with `403 contract_version_denied`.
Breaking changes require v2 and a fresh review; v1 may only gain tighter validation.

All `/api/agent/runtime/v1/*` endpoints require HTTPS, JSON, `Cache-Control: no-store`,
and these headers:

```text
Authorization: DPoP <short-lived access JWT>
DPoP: <signed proof JWT>
Idempotency-Key: <128-bit-or-greater opaque value>
X-PEC78-Contract: pec78-runtime-authorization-v1
```

The access JWT is minted only to the registered Maya runtime credential and has
`iss=cc.proexteriorsus.net`, exact API `aud`, `sub=named-agent:maya-chen`,
`persona_id=maya-chen`, a single `capability`, `jti`, `iat`, `nbf`, `exp` (at most five
minutes), `credential_id`, `runtime_instance_id`, and `cnf.jkt` bound to Maya's
registered Ed25519 public key. The DPoP proof binds that key to `htu`, `htm`, access
token hash, body SHA-256, `iat`, and unique `jti`. The adapter verifies issuer,
audience, signature, key thumbprint, exact method/path/body, clock skew (at most 30
seconds), credential/runtime state, and capability before reading the body or DB.

`jti` values and the tuple `(credential_id, idempotency_key, route)` are atomically
claimed before work. Reuse with the same canonical request returns the stored
response; reuse with a different body or target returns `409 idempotency_conflict`.
DPoP or access-token replay returns `409 replay_denied`. Missing state stores fail
closed with `503 authorization_state_unavailable`; there is no stateless fallback.

Error responses expose a trace ID and stable code, never whether another principal,
destination, work item, or credential exists. Authentication failure is 401;
authenticated policy denial is 403; stale fencing/replay/conflict is 409; killed or
revoked is 423; dependency uncertainty is 503.

## Maya Identity

The sole v1 principal is the registry tuple:

```json
{
  "personaId": "maya-chen",
  "subject": "named-agent:maya-chen",
  "runtimeOwnerId": "runtime:maya-chen",
  "role": "document-intake",
  "googleMailbox": "maya.chen@cc.proexteriorsus.net",
  "orgoWorkspaceId": "8cf44774-2b46-4089-8bfe-4deb1b078e46",
  "orgoComputerId": "37b262e0-a915-47e6-8c3b-f180a32ab6fe"
}
```

Activation additionally requires verified, non-null runtime instance, Google
customer/subject, Slack team/app/bot/installation, token fingerprint, credential
reference, credential public-key thumbprint, and scoped Orgo-key fingerprint.
Names, email text, environment-variable names, Slack display names, and supplied
headers are attributes, not identity evidence. All tuple members must match the
active registry snapshot and credential record; any mismatch is a P0, revokes the
session, and produces a security receipt.

The runtime receives references only to a Maya workspace-scoped Orgo key, Maya
Google credential, Maya Slack credential, and Maya Command Center credential.
`ORGO_API_KEY_MASTER` is provisioning-only and is explicitly prohibited from the
runtime, desktop, Hermes home, prompt, environment, log, screenshot, receipt,
artifact, or database payload. Detection trips the global kill switch and requires
rotation. Shared-token fallback—including `AGENT_SERVICE_TOKENS`, the
`ob-accounting` token, or mapping Maya to a service actor—is prohibited. All other
agents, `ops-conductor`, anonymous auth, and unknown principals receive a deny before
resource lookup. Maya is never granted `approval.decide`, administrator, billing,
DNS, payment, publishing, trust-tier, or production-write authority.

## Ingress and Work

Allowed ingress is only (a) the canonical 30-minute poll of Maya's dedicated Google
mailbox and (b) a signed Slack event for Maya's verified app, team, bot, and approved
channel/thread scope. Gmail history/message IDs and Slack event/team/app/channel/
thread IDs are verified against provider-signed or provider-fetched data; request
fields cannot select a mailbox, tenant, principal, or Slack destination. Provider
event signature timestamp must be within five minutes and event IDs are replay
claimed before enqueue.

`POST /api/agent/runtime/v1/intake` accepts:

```json
{
  "contractVersion": "pec78-runtime-authorization-v1",
  "occurrenceId": "maya-chen:mailbox:YYYY-MM-DDTHH:00Z",
  "source": {"kind": "gmail", "providerMessageId": "opaque", "receivedAt": "RFC3339"},
  "classification": {"code": "allowlisted-enum", "modelRouteId": "approved-route"},
  "evidenceDigest": "sha256:<hex>"
}
```

The server derives principal, mailbox alias, sender metadata, work key, department,
and timestamps. Client-supplied `alias`, `from`, owner, destination, actor, work key,
permissions, approval, or raw credential fields are rejected. Subjects and sender
addresses are treated as sensitive evidence and minimized; they never confer
authority. The work key is deterministically
`sha256(contractVersion|maya-chen|source.kind|providerMessageId)` and is unique.
Conflicting duplicates quarantine the item. A work item is accepted only while its
occurrence lease is current and with capability `mailbox.classify` or the separately
listed Slack-ingress capability.

The only v1 work capabilities are `mailbox.read` (Maya mailbox only),
`mailbox.classify`, `command_center.record_decision`, and the narrowly defined
Christopher communication effects below. Arbitrary endpoints, arbitrary Slack,
original-sender email, forwarding, mailbox delegation, other-agent work, and any
external business-system write (including AccuLynx enqueue/execute) are explicit
denies. Unrecognized capability, destination, classification, or route is denied;
department membership never implies capability.

## Lease and Schedule

One canonical registry owns Maya's mailbox schedule. It creates exactly one
occurrence every 30 minutes using UTC half-hour boundaries and the unique key
`(contract_version, persona_id, schedule_id, scheduled_for)`. Catch-up may claim a
missed occurrence but never invent a second one. Hermes and eve may not both be
enabled; ownership is an explicit control-plane value, not inferred from heartbeat.

Lease state is `available -> leased -> completed|failed|expired|cancelled`. Atomic
claim requires active adapter/principal/credential, matching owner and instance,
`lease_epoch`, and no unexpired holder. Every ownership change or revocation
increments the monotonically increasing `lease_epoch`. Lease and effect calls carry
`leaseId`, `leaseEpoch`, `ownerId`, and `runtimeInstanceId`; DB mutations use a
compare-and-set predicate over all four plus `expires_at > now()`. A former owner,
expired lease, lower epoch, or restarted instance receives `409 stale_owner_fenced`
and cannot renew, complete, approve, or effect. Renewal is bounded, receipted, and
cannot cross kill/revocation. Database time is authoritative.

Schedule dispatch stops when health is uncertain, budget reaches 100 percent, the
adapter/persona/credential is not active, or a kill switch is set. Queue claiming is
pull-based and Maya-filtered in the database, not fetch-all then filter.

## Approval and Effect

Effects use `proposed -> awaiting_approval -> approved -> executing ->
succeeded|failed_unknown|failed_final|revoked|expired`. Maya can propose but cannot
approve. An immutable intent contains contract version, work/occurrence/lease epoch,
capability, canonical payload digest, exact destination tuple, provider account,
thread (if Slack), expiry (at most 30 minutes), and effect idempotency key. Any edit
creates a new intent and invalidates prior approval.

Only Christopher Hussey, authenticated by a current sealed WorkOS human session and
matched to the configured immutable human subject ID, may approve. Email/display
name alone is insufficient. Approval uses a fresh CSRF-protected interaction and is
persisted as a single-use record containing approver subject, intent digest,
capability, destination tuple, decision, issued/expiry time, and nonce. The executor
atomically consumes it and rechecks principal, lease epoch, registry version,
credential status, kill switches, capability, destination, and payload digest.
Approval is neither transferable nor reusable, and Slack reactions/messages never
constitute approval.

The complete v1 outbound allowlist is:

- email: Maya's named account may send only to exactly
  `admin@cc.proexteriorsus.net`;
- Slack: Maya's verified app may send only to Christopher in a configured channel
  ID and, for replies, the exact approved originating thread ID.

Channel IDs and Christopher's Slack member ID are deployment allowlist records, not
request parameters. DMs, arbitrary Slack channels, new threads, mass mentions,
files, links that disclose secrets, original-sender email, reply-all, CC/BCC,
forwarding, and every other recipient are denied. External writes or mutations to
AccuLynx, Google Drive, vendor portals, payments, publishing systems, calendars, or
other third parties are prohibited in v1 even with approval. An approval cannot
expand a prohibited capability.

Before provider invocation, the executor atomically reserves the effect by
idempotency key. Provider-native idempotency/message metadata is used where
available. Timeouts become `failed_unknown`, never an automatic resend. A
reconciler queries by provider account plus stable request/message key, records zero,
one, or many matches, and retries only after proving zero; multiple matches are P0
and stop effects. Success requires a durable provider identifier and reconciliation
status, not merely HTTP 2xx.

## Receipt and Health

Every auth denial, replay, occurrence, lease transition, work mutation, approval,
effect attempt, reconciliation, revocation, kill, and recovery produces an
append-only receipt. Required fields are receipt/trace IDs, contract and registry
versions, event type, Maya subject, credential/runtime IDs (non-secret), occurrence,
work, lease ID/epoch, capability, destination class plus redacted stable digest,
intent/body digest, idempotency key digest, result/code, predecessor receipt hash,
timestamps, and build commit. Secrets, tokens, raw email bodies, full sender PII, and
credential material are forbidden. Receipt insertion is part of the state
transaction; if it fails, the state/effect fails closed. Receipt rows cannot be
updated or deleted by a runtime.

`GET /healthz` may continue as liveness only and must not authorize traffic. A new
authenticated operator readiness view reports `ready` only when all of these are
fresh and true: exact deployed build and contract version; adapter explicitly
enabled; post-review approval ID valid; Maya alone authorized; registry/credential
not revoked; token issuer/keyset/replay store reachable; DB migration and RLS policy
versions exact; schedule has one owner and no duplicate occurrence; lease fencing
probe passes; receipt append/read probe passes; queue and reconciler are within SLO;
provider identities match their pinned tuples; kill switches are clear; no
`failed_unknown` or unreconciled effect exceeds SLO; and last successful synthetic
deny/allow probes are recent. `configured`, process heartbeat, route reachability,
or a successful DB query is not readiness.

Readiness is `ready|degraded|stopped`, returns non-200 for `degraded` or `stopped`,
names each failed check without secrets, and includes `observedAt` and maximum age.
Missing, stale, contradictory, or unavailable evidence is false. Public health must
not expose tenant IDs, credential counts/fingerprints, workspace IDs, errors with
sensitive details, or authorization state. A false-green finding is a release P0.

## Persistence and Migration

Use additive migrations only. Introduce dedicated tables (names illustrative but
stable once migrated): `runtime_principals`, `runtime_credentials`,
`runtime_capability_grants`, `runtime_destination_grants`, `runtime_occurrences`,
`runtime_leases`, `runtime_replay_claims`, `runtime_work_items`,
`runtime_approval_intents`, `runtime_approvals`, `runtime_effects`,
`runtime_receipts`, `runtime_revocations`, and `runtime_kill_switches`. Enforce unique
keys for token/DPoP JTI, occurrence, source message, request idempotency, approval
nonce, and effect idempotency; checks constrain v1 rows to Maya and the v1 enums.
Foreign keys connect every effect to work, occurrence, lease epoch, approval, and
credential. Receipt append and effect reservation are security-definer RPCs with a
fixed `search_path`, explicit schema qualification, and no dynamic SQL.

RLS is enabled and forced on every runtime table. The Maya runtime DB role has no
direct table grants and may execute only Maya-scoped RPCs whose server-verified JWT
claims match the row. Christopher's human role can create approvals but cannot edit
effects or receipts. Operator/readiness roles are read-only and sensitive columns
are redacted. Public, anon, authenticated-generic, existing named-agent, and shared
service roles have no grants. Cross-persona and cross-tenant policies are explicit
deny tests.

The Supabase service role remains server-only and is never exposed to Maya or used
as her identity. Server use is limited to narrowly audited adapter functions; it
must repeat policy checks inside the transaction because service role bypasses RLS.
No handler may accept actor/persona/tenant columns from the client and then write
with service-role authority. Existing `dashboard_*` and AccuLynx tables are not an
authorization source; projections into them occur only after the adapter commits.

Migration sequence is schema/constraints -> RLS/grant denial -> functions ->
backfill none -> shadow-mode synthetic tests -> readiness checks. Defaults are
disabled/denied, and no existing token is copied. Down migration is not required;
rollback deactivates the adapter while preserving immutable evidence.

## Kill Switch and Rollback

There are independent global, adapter-version, Maya-principal, credential,
capability, destination, schedule, and effect switches. Denial is the union: any set
switch immediately blocks token minting, claims, renewals, approvals, and new
effects. The executor rechecks switches immediately before provider I/O. Kill
updates increment the fencing epoch, cancel future occurrences, expire active
leases and approvals, and mark unstarted effects revoked. In-flight/unknown effects
enter reconciliation; killing never fabricates failure or success.

Credential revocation is immediate by credential ID and key thumbprint, invalidates
all outstanding access tokens regardless of JWT expiry, consumes approval records,
and records a revocation receipt. Registry suspension/revocation behaves the same.
Suspected credential exposure, master-key presence, identity mismatch, duplicate
effect, false-green health, stale-owner success, receipt gap, or RLS escape triggers
global stop and P0 escalation.

Rollback is: set global stop; fence the owner; disable Maya's canonical schedule;
revoke Maya's Command Center credential; reconcile all `executing` and
`failed_unknown` effects; verify no claim/renew/effect succeeds; retain tables and
receipts; then restore the previously approved single Hermes owner only after its
credential and epoch are distinct. Rollback does not enable a shared token, switch
to another agent, delete evidence, replace Maya's desktop, change DNS, or migrate
data. Re-enable requires a new production gate and human go/no-go.

## Tests

All tests run with synthetic identities/content and prove both denial and success:

1. Authentication matrix: wrong issuer/audience/subject/persona/key/runtime,
   expired/future/revoked token, altered body/path/method, reused JWT/DPoP JTI,
   missing replay store, shared `ob-accounting`, master-key-shaped credential,
   WorkOS Maya browser session, and every other agent all fail closed.
2. Scope matrix: Maya can classify only her mailbox; forged alias/sender/actor,
   cross-mailbox IDs, other departments, unknown capabilities, AccuLynx enqueue,
   arbitrary external writes, and client-supplied work keys are denied.
3. Ingress replay: duplicate Gmail history/message and Slack retry/event IDs create
   one occurrence, one work item, and deterministic replay receipts; conflicting
   payloads quarantine.
4. Schedule/lease: exactly one occurrence per 30 minutes across restart and
   concurrency; Hermes/eve race has one winner; expired owner, old instance, old
   epoch, renewal-after-kill, and completion-after-takeover are fenced.
5. Approval: Maya/self/other-human/Slack approval, stale or reused nonce, altered
   payload/destination/capability, expired approval, and approval after revocation
   fail; only Christopher's pinned WorkOS subject can approve the unchanged intent.
6. Destination: exact admin email and pinned Christopher Slack tuple pass in
   sandbox; original sender, reply-all, CC/BCC, arbitrary Slack/DM/channel/thread,
   file/mass mention, and all business-system writes fail even when approved.
7. Effects: concurrent duplicate execution invokes provider once; timeout enters
   `failed_unknown`; reconciliation covers zero/one/multiple matches; no blind retry;
   receipt failure prevents provider invocation.
8. Data boundary: RLS tests cover anon, generic authenticated, Maya, every other
   persona, human approver, operator, and service role; direct table writes and
   cross-persona reads fail; security-definer functions reject forged claims and
   unsafe search paths.
9. Health: each dependency/state is independently broken or made stale and
   readiness becomes non-200; public liveness never yields authorization; false
   configuration, duplicate owner, receipt lag, unreconciled effect, and killed
   state cannot appear green.
10. Recovery: credential revocation and every kill-switch level take effect during
    races; rollback leaves zero active leases/approvals and reconciles effects; a
    fresh credential cannot reuse an old epoch or approval.

Run deterministic unit, integration, database/RLS, concurrency, fault-injection,
and sandbox provider tests. Then demonstrate the complete packet on three separate
clean days. Logs and fixtures are scanned for secrets and PII. Any P0/P1, flaky
security assertion, missing receipt, or untested denial is a failed gate.

## Production Gate

Implementation does not equal authorization. The adapter ships with
`effect_authorization.status=not-installed` or `disabled`, no live credential, no
schedule, and default-deny policy. Before production, the Ringer packet must contain
the linted plan, exact build/migration/registry versions, executed tests above,
third-party-tool gate for every runtime dependency, threat/egress/identity review,
Maya resource and credential binding evidence, RLS/grant dump, three clean-day
receipts, cost limits, readiness/alert evidence, reconciliation drill, kill-switch
drill, rollback drill, and zero open P0/P1 findings.

Security, architecture, operations, and persona-owner reviewers may recommend or
block but cannot activate. After reviewing the complete packet, Christopher Hussey
must record a fresh, durable, scope-bound human go/no-go that names
`pec78-runtime-authorization-v1`, Maya only, exact build, registry snapshot,
credential ID, capabilities, destination grant IDs, schedule, expiry/review date,
and rollback receipt. Approval authored before the completed review is invalid.

Until that post-review human decision is verified by readiness, production inbox
access, Slack activation, email sending, provider credentials, schedules, effects,
and external writes remain off. The approval authorizes no other agent and no scope
widening. Any later change to identity, key, runtime owner, provider account,
capability, destination, schedule, model route, migration, or build requires the
affected tests and a new go/no-go. v1 remains Maya-only; rollout to Alex or anyone
else requires a separate contract and independent production gate.
