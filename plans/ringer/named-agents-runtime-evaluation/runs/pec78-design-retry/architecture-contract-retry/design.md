# PEC-78 v1 Maya-Only Production Authorization Adapter

## Verdict

**IMPLEMENTATION-READY, CONDITIONAL PASS; PRODUCTION REMAINS DISABLED.** Implement
`pec78-runtime-authorization-v1` as a new fail-closed authorization plane for Maya
Chen only. It must not widen or reinterpret the current shared service-agent path.
Today `AGENT_SERVICE_TOKENS` resolves Maya-like work to `ob-accounting`, existing
agent handlers authorize chiefly by actor type/department, and public `/healthz`
reports liveness even when dependencies are degraded. None of those surfaces may
authorize a PEC-78 occurrence, lease, approval, or effect.

The adapter ships in shadow mode with no production credential, schedule, provider
effect, or allow decision. Its invariant is:

```text
DPoP-bound Maya token -> exact v1 policy -> occurrence -> fenced lease -> work
                                                               |
human-bound immutable intent <- approval request --------------+
             |
recheck policy + reserve idempotency -> provider effect -> append-only receipt
```

Every missing, stale, contradictory, unknown, cross-persona, or unavailable input
denies. There is no shared-token, browser-session, header-identity, local-operator,
service-role-identity, or alternate-runtime fallback.

**The v1 authorization policy is default-deny.** A request is allowed only when its
exact route, method, Maya subject and bound credential, single capability, resource,
occurrence, current fenced lease, state transition, model route, destination grant,
approval (when required), cost breaker, and effect are all explicitly enumerated by
this contract and active in the matching versioned records. An absent or unknown
field, enum, grant, route, state transition, persona, provider account, destination,
or policy decision denies; approval cannot convert a default-deny result to allow.

## Versioned Contract

The exact contract ID is `pec78-runtime-authorization-v1`. It appears in every
credential, token, request, occurrence, lease, work item, approval, effect, receipt,
readiness report, registry snapshot, and production approval. Breaking changes
require v2 and a new gate; v1 changes may only narrow behavior or fix a denial bug.
The policy evaluator starts from `deny` for every request and may return `allow`
only for an exact match to this versioned contract; no legacy permission,
department membership, default value, compatibility behavior, or fallthrough may
supply a missing allow. This default-deny rule applies before resource lookup and
again inside each locked mutation and immediately before provider I/O.

All runtime endpoints are under `/api/agent/runtime/v1`, accept only HTTPS and
`application/json`, return `Cache-Control: no-store`, and require:

```http
Authorization: DPoP <access-jwt>
DPoP: <proof-jwt>
X-PEC78-Contract: pec78-runtime-authorization-v1
Idempotency-Key: <base64url 16..64 bytes>
Content-Type: application/json
```

`GET` readiness is the only exception to `Idempotency-Key`. The access JWT is at
most five minutes old and has exact claims:

```json
{
  "iss": "https://cc.proexteriorsus.net/agent/runtime/v1",
  "aud": "https://cc.proexteriorsus.net/api/agent/runtime/v1",
  "sub": "named-agent:maya-chen",
  "persona_id": "maya-chen",
  "contract_version": "pec78-runtime-authorization-v1",
  "capability": "one exact capability",
  "credential_id": "uuid",
  "runtime_owner_id": "runtime:maya-chen",
  "runtime_instance_id": "uuid",
  "jti": "uuid",
  "iat": 0, "nbf": 0, "exp": 0,
  "cnf": {"jkt": "base64url-sha256-jwk-thumbprint"}
}
```

The DPoP JWT uses Maya's registered Ed25519 key, `typ=dpop+jwt`, and contains
`htu`, `htm`, `ath`, `body_sha256`, `iat`, and unique `jti`. Verification order is:
header size/content type -> contract header -> JWT signature/algorithm/key -> exact
issuer/audience/subject/runtime/capability -> `nbf/exp` and +/-30-second proof skew
-> DPoP method/canonical URL/access-token hash/body hash -> active registry,
credential, instance and kill state -> atomic replay/idempotency claim -> schema.
No handler reads resource-identifying body fields before authentication.

Canonical JSON is RFC 8785; all digests are lowercase `sha256:<64 hex>`. The atomic
request key is `(credential_id, route_id, idempotency_key)`. Same key and request
digest returns the stored status/body; a different digest returns
`409 idempotency_conflict`. JWT/DPoP JTI reuse returns `409 replay_denied`.

Every response has `{contractVersion, traceId, status, ...}`. Stable failures are:
`401 authentication_required|invalid_proof`, `403 contract_version_denied|
capability_denied|destination_denied`, `404 resource_not_found`, `409
replay_denied|idempotency_conflict|stale_owner_fenced|state_conflict`, `422
invalid_request`, `423 adapter_stopped|principal_revoked`, and `503
authorization_state_unavailable|dependency_unready`. Errors reveal no other
principal, credential, destination, or resource.

The exact endpoints are:

| Method and path | Required capability | Purpose |
| --- | --- | --- |
| `POST /occurrences/claim` | `mailbox.read` | Atomically create/claim the due Maya mailbox occurrence and lease. |
| `POST /leases/{leaseId}/renew` | capability on lease | Renew the same fenced owner, max five minutes. |
| `POST /intake` | `mailbox.classify` | Record one provider-verified message decision/work item. |
| `POST /leases/{leaseId}/complete` | `command_center.record_decision` | Close occurrence after all work is durable. |
| `POST /effects` | `slack.send.christopher` or `email.send.admin` | Propose immutable outbound intent; never sends. |
| `POST /effects/{effectId}/execute` | intent capability | Consume approval and invoke the allowlisted provider once. |
| `POST /effects/{effectId}/reconcile` | intent capability | Resolve `failed_unknown`; never blind-resend. |
| `GET /readiness` | operator bearer, not Maya | Private production readiness. |
| `POST /operator/kill` | pinned human operator session | Set a kill switch; never available to Maya. |

Human approval is a WorkOS-session UI/API path, not a runtime endpoint:
`POST /api/operator/runtime/v1/effects/{effectId}/decision`. It requires same-origin
CSRF, recent reauthentication, and Christopher's pinned WorkOS subject.

## Maya Identity

The only v1 subject is the exact registry tuple:

```json
{
  "personaId": "maya-chen",
  "subject": "named-agent:maya-chen",
  "runtimeOwnerId": "runtime:maya-chen",
  "role": "document-intake",
  "serviceRole": "ob-accounting",
  "mailbox": "maya.chen@cc.proexteriorsus.net",
  "orgoWorkspaceId": "8cf44774-2b46-4089-8bfe-4deb1b078e46",
  "orgoComputerId": "37b262e0-a915-47e6-8c3b-f180a32ab6fe"
}
```

`serviceRole` is registry metadata only and grants nothing in PEC-78. Activation
also requires verified non-null Google customer/subject/credential IDs; Slack
team `T0B8QEGPVQW`, app `A0BD0PAEU2E`, bot/installation/token fingerprint;
runtime instance/credential/key thumbprint; and a Maya-scoped Orgo-key fingerprint.
All must match one immutable registry snapshot hash. Email text, names, token-env
key names, Slack display names, request headers, and WorkOS Maya browser identity
are not runtime authentication.

Add `CommandCenterActorType = ... | "runtime_named_agent"`, but construct that actor
only in the PEC-78 middleware after DPoP verification. It has ID
`named-agent:maya-chen`, no generic `CommandCenterPermission[]`, department
`accounting`, `desktopEnabled=false`, and a single token capability. Do not add Maya
to `SERVICE_AGENT_IDENTITIES`, `AGENT_SERVICE_TOKENS`, or hashed service-token
lookup. Existing `/api/agent/intake`, work-queue decision, and AccuLynx enqueue must
reject `runtime_named_agent`; the adapter calls dedicated services instead.

The runtime receives references only to Maya-scoped Google, Slack, Command Center,
and workspace-scoped Orgo credentials. `ORGO_API_KEY_MASTER`, `ob-accounting` bearer,
Supabase service-role key, another persona key, and unbound keys are prohibited.
Master-key detection is a global-stop P0. Maya never receives approval, admin,
billing, DNS, payment, publish, `trust_tier`, AccuLynx, or arbitrary external-write
capability.

## Ingress and Work

V1 ingress is only the scheduled pull of Maya's dedicated Gmail mailbox. Slack is
an outbound destination in v1, not work ingress; adding inbound Slack requires a
new reviewed grant and contract revision. The server-side Google connector derives
the mailbox from the credential record and verifies Google customer/subject,
history ID, message ID, and receipt time. The request cannot choose an account.

`POST /occurrences/claim` body:

```json
{
  "contractVersion": "pec78-runtime-authorization-v1",
  "scheduleId": "maya-mailbox-30m-v1",
  "scheduledFor": "2026-07-26T20:30:00Z",
  "runtimeInstanceId": "uuid",
  "requestedLeaseSeconds": 300
}
```

Success `201` (or idempotent `200`) returns `{occurrence:{id, scheduleId,
scheduledFor, state}, lease:{id, epoch, expiresAt}, mailboxCursor}`. The server
requires `scheduledFor` to be the exact due UTC half-hour, derives Maya/owner, and
does not return credentials.

`POST /intake` body:

```json
{
  "contractVersion": "pec78-runtime-authorization-v1",
  "occurrenceId": "uuid",
  "lease": {"id": "uuid", "epoch": 7},
  "source": {
    "kind": "gmail",
    "providerMessageId": "opaque <= 512",
    "providerHistoryId": "opaque <= 128",
    "receivedAt": "RFC3339"
  },
  "classification": {
    "code": "invoice|order|price_agreement|customer_document|spam|security_sensitive|financial_material|legal_policy|ambiguous|other",
    "modelRouteId": "approved route ID",
    "confidenceBasis": "deterministic|model_checked"
  },
  "evidenceDigest": "sha256:<hex>"
}
```

The server re-fetches/verifies provider metadata and derives subject/sender evidence,
`department=accounting`, owner, and `work_key = sha256(contractVersion|maya-chen|
gmail|providerMessageId)`. Raw body and attachments remain in the approved evidence
store, not runtime authorization tables. Client fields `persona`, `actor`, `alias`,
`mailbox`, `from`, `subject`, `destination`, `workKey`, `approval`, `permissions`,
or credentials cause `422 invalid_request`. Unique `(persona_id, source_kind,
provider_message_id)` makes retries return the original work. Same ID with a new
evidence digest becomes `quarantined`, stops that occurrence, and emits a P0 receipt.

Work states are `received -> classified -> proposed|escalated -> completed`, plus
terminal `quarantined|cancelled`. Only `classified -> proposed` is allowed for a
communication effect. `security_sensitive`, `financial_material`, `legal_policy`,
`ambiguous`, and unsupported `other` must go to `escalated`; they cannot propose an
effect. A transition uses compare-and-set `state_version` and an in-transaction
receipt. Existing `dashboard_work_items`/`dashboard_action_log` are best-effort
post-commit projections and never authorize or make the runtime transaction fail.

The complete Maya capability set is `mailbox.read`, `mailbox.classify`,
`command_center.record_decision`, `slack.send.christopher`, and
`email.send.admin`. The first three are internal state capabilities. The last two
are separately approved effects. Arbitrary routes, original-sender replies,
forwarding, Drive/vendor/AccuLynx mutation, and all other effects deny.

## Lease and Schedule

`maya-mailbox-30m-v1` is the only schedule: UTC `*/30 * * * *`, no jitter, maximum
catch-up age 30 minutes, one outstanding occurrence. The canonical Command Center
dispatcher inserts occurrences; Hermes may claim them but may not create arbitrary
times. Eve is disabled. Uniqueness is `(contract_version, persona_id, schedule_id,
scheduled_for)` and `scheduled_for` must have seconds zero and minute 0 or 30. Thus
one retry or many workers still produce one idempotent occurrence per half-hour.

Occurrence state machine:

```text
scheduled -> claimable -> leased -> completed
                      \-> failed
                      \-> expired -> claimable (same occurrence, higher epoch)
scheduled|claimable|leased -> cancelled (kill/revoke)
```

Lease state is `active -> completed|failed|expired|cancelled|fenced`. Claim is one
SQL transaction that locks occurrence/principal, checks readiness and owner, expires
the old lease if needed, increments occurrence `lease_epoch`, and inserts one active
lease. Partial unique index permits one active lease per occurrence. Lease duration
is 300 seconds; renew adds at most 300 seconds and total custody cannot exceed 25
minutes. Database time is authoritative.

Renew/complete bodies contain only `contractVersion`, `epoch`, and (for complete)
`outcome:{processed, escalated, proposedEffectIds}`. Every mutation predicates on
`lease.id`, current `epoch`, `runtime_owner_id`, `runtime_instance_id`, `state=active`,
and `expires_at > clock_timestamp()`. Takeover, restart, credential rotation,
revocation, or kill increments epoch; former owners get `409 stale_owner_fenced`.
No lease is renewable across a disabled schedule, 100% cost breaker, unhealthy
dependency, kill, suspension, or revocation.

## Approval and Effect

Effect state machine:

```text
proposed -> awaiting_approval -> approved -> reserved -> executing -> succeeded
                |                 |             |           \-> failed_unknown
                +-> rejected      +-> expired   +-----------> failed_final
proposed|awaiting_approval|approved -> revoked
failed_unknown -> reconciled_succeeded|retry_authorized|duplicate_detected
retry_authorized -> reserved (same effect/idempotency key)
```

`POST /effects` accepts:

```json
{
  "contractVersion": "pec78-runtime-authorization-v1",
  "workId": "uuid",
  "occurrenceId": "uuid",
  "lease": {"id": "uuid", "epoch": 7},
  "capability": "email.send.admin|slack.send.christopher",
  "destinationGrantId": "uuid",
  "payload": {
    "text": "bounded UTF-8 text",
    "subject": "email only, bounded UTF-8",
    "threadTs": "Slack reply only; must equal grant-bound source thread"
  },
  "payloadDigest": "sha256:<canonical payload>",
  "modelRouteId": "approved route ID",
  "expiresAt": "RFC3339 <= now+30m"
}
```

The server resolves destination details from the grant, never the payload. Exact
grants are: (1) Maya Google account -> `admin@cc.proexteriorsus.net`, no cc/bcc,
forward/reply-all/attachment; (2) Maya Slack app/team/bot -> Christopher's pinned
member ID in one configured channel, and only the exact approved existing thread.
No DM, new thread, other channel/member, files, mass mentions, or arbitrary links.
The immutable `intent_digest` covers contract/registry/build, principal, credential,
work/occurrence/lease epoch, capability, destination grant and tuple digest,
provider account, canonical payload digest, model route, expiry, and effect
idempotency key. Any edit creates a new effect and revokes old approval.

The operator decision body is `{decision:"approve"|"reject", intentDigest,
note?, csrfToken}`. Approval requires Christopher's configured immutable WorkOS
user/organization subject IDs, a sealed session reauthenticated within five
minutes, same-origin CSRF, and no runtime bearer. Email alone is insufficient.
Persist a single-use approval nonce, exact intent/destination/capability, issued and
five-minute expiry. Slack messages/reactions are never approvals.

`POST /effects/{id}/execute` body is `{contractVersion, lease:{id,epoch},
approvalId, approvalNonce}`. One transaction locks effect/approval, rechecks every
identity, registry, build, lease, grant, route, cost, kill, digest and expiry,
consumes approval, and inserts the unique effect reservation. Provider I/O happens
only after reservation and an append receipt. Completion stores the provider
account and stable message ID. `(contract_version, principal_id, capability,
effect_idempotency_key)` is unique.

A timeout or ambiguous provider response is `failed_unknown`; never automatically
send again. Reconciliation queries the pinned provider account using the stable
request/message metadata. One match succeeds, zero permits a separately receipted
`retry_authorized`, and multiple matches set `duplicate_detected`, global stop, and
P0. HTTP 2xx without a durable provider ID is not success.

## Receipt and Health

Every authorization result, replay/idempotency claim, occurrence/lease/work
transition, approval, reservation, attempt, reconciliation, kill/revocation, and
recovery appends a `runtime_receipts` row in the same transaction as its state
change. Required fields are `id`, `trace_id`, contract/registry/build versions,
`event_type`, principal/credential/owner/instance IDs, occurrence/work/lease ID and
epoch, capability, redacted destination class and digest, request/intent/idempotency
digests, result/code, `previous_receipt_hash`, `receipt_hash`, and DB timestamps.
No token, key, raw message/body, sender PII, or credential material is allowed.
Runtime identities cannot update/delete receipts. A missing receipt aborts state;
before-provider receipt failure prevents I/O.

Public `GET /healthz` remains liveness only. Remove tenant/resource identifiers,
credential counts, and raw dependency errors from its public body; it must expose
`status`, `service`, `timestamp`, and `buildCommit` only. It never feeds policy.

Private `GET /api/agent/runtime/v1/readiness` uses a distinct read-only operator
bearer and returns HTTP 200 only for `ready`, otherwise 503:

```json
{
  "contractVersion": "pec78-runtime-authorization-v1",
  "status": "ready|degraded|stopped",
  "observedAt": "RFC3339",
  "maxAgeSeconds": 60,
  "checks": [{"id":"adapter_enabled", "ok":false, "code":"disabled", "observedAt":"RFC3339"}],
  "buildCommit": "sha",
  "registryVersion": "sha256:<hex>"
}
```

Checks are exact build/contract/migration; post-review approval; Maya-only active
principal/credential/runtime; issuer/key/replay DB; RLS/grant checksum; one schedule
owner/no duplicate occurrence; fencing probe; receipt append/read probe; provider
identity tuple; queue/reconciler SLO; cost route/breakers; kill clear; zero overdue
`failed_unknown`; and recent synthetic allow/deny probes. Missing/stale/contradictory
evidence is false. Readiness is observational and never an authorization input;
the executor independently rechecks state. False green is a release P0.

## Persistence and Migration

Add one numbered migration after the repository's current live schema version; do
not guess the number until implementation rebases on live. Use schema `runtime_auth`
so these tables cannot collide with existing dashboard data:

| Table | Essential columns and constraints |
| --- | --- |
| `principals` | `id`, exact subject/owner/resource tuple, `registry_version`, `state disabled|active|suspended|revoked`, `fence_epoch`; v1 check fixes Maya. |
| `credentials` | principal FK, `credential_id`, issuer/key thumbprint/provider refs, instance ID, state/times; unique thumbprint and active instance. |
| `capability_grants` | principal FK, exact five-capability enum, state/validity; unique active principal+capability. |
| `destination_grants` | capability FK, provider/account/destination/thread digests, encrypted/ref-only values, state/validity. |
| `schedules` | exact schedule ID/expression/owner, state, catch-up/lease limits; v1 Maya check. |
| `occurrences` | schedule/principal/time/state/epoch/cursor; unique version+principal+schedule+time. |
| `leases` | occurrence/credential/owner/instance/epoch/state/expiry; unique active occurrence. |
| `replay_claims` | credential, JWT/DPoP JTI hashes, expiry; unique claim hashes. |
| `request_claims` | credential/route/key/request digest/stored response; unique credential+route+key. |
| `work_items` | occurrence/source IDs/digests/classification/state/version; unique Maya Gmail message. |
| `effects` | all immutable intent fields, approval/state/provider result/reconciliation fields; unique effect idempotency tuple. |
| `approvals` | effect/intent digest, pinned approver subjects, nonce hash, decision/issued/expiry/consumed; unique nonce. |
| `receipts` | append-only fields/hash chain; unique ID and receipt hash. |
| `kill_switches` | scope global|contract|principal|credential|capability|destination|schedule|effect, target, active/reason/actor/time; unique active scope+target. |
| `production_gates` | contract/principal/build/registry/migration/credential/grant IDs, approver subjects, review packet digest, expiry/state. |

All IDs are UUIDs; timestamps are `timestamptz`; enums/check constraints reject
unknown states/capabilities; FKs are `RESTRICT`; no cascade deletes. Force RLS on
every table. Revoke all from `public`, `anon`, `authenticated`, existing named and
service roles. Maya has no direct table grant. Grant `EXECUTE` only on narrowly
typed `runtime_auth` RPCs to a dedicated `pec78_maya_runtime` DB authenticator;
grant decision RPC only to `pec78_human_approver`; grant redacted readiness RPC to
`pec78_readiness`. The app's service role stays server-only and is not Maya's
identity.

Security-definer RPCs use `SET search_path = pg_catalog, runtime_auth`, schema-
qualified objects, no dynamic SQL, `row_security=on` where applicable, and repeat
subject/credential/capability/lease/kill checks inside the locked transaction.
Required RPCs are `claim_request`, `claim_occurrence`, `renew_lease`, `record_intake`,
`complete_lease`, `propose_effect`, `decide_effect`, `reserve_effect`,
`finish_effect`, `reconcile_effect`, `set_kill_switch`, and `read_readiness`.

Migration order is schema/types/tables -> constraints/indexes -> force RLS/revokes
-> functions/explicit executes -> disabled Maya seed and five disabled grants ->
synthetic fixtures in test only. There is no production backfill and no token copy.
Projection to `dashboard_*` is performed by a post-commit worker carrying runtime
IDs/digests, never in the authorization transaction and never in reverse.

Implementation file map:

```text
agents/registry/named-agent-principals.json                  # status stays not-installed until gate
app/command-center/src/lib/pec78/contract.ts                 # constants, schemas, canonicalization
app/command-center/src/lib/pec78/auth.server.ts              # JWT/DPoP/replay verification
app/command-center/src/lib/pec78/policy.server.ts            # exact Maya/capability/destination policy
app/command-center/src/lib/pec78/store.server.ts             # typed RPC adapter only
app/command-center/src/lib/pec78/effects.server.ts           # provider adapters/reconciliation
app/command-center/src/lib/pec78/readiness.server.ts         # private readiness checks
app/command-center/src/middleware.ts                         # route-family isolation before legacy bearer
app/command-center/src/pages/api/agent/runtime/v1/**         # runtime routes listed above
app/command-center/src/pages/api/operator/runtime/v1/**      # approval/kill, WorkOS+CSRF
app/command-center/src/pages/healthz.ts                      # public liveness minimization
app/command-center/src/env.d.ts                              # refs/IDs/flags, no secrets in output
supabase/<next-live-number>-pec78-runtime-auth-v1.sql         # additive schema/RLS/RPCs
app/command-center/src/lib/pec78/*.test.ts                    # unit/fault/concurrency tests
server/tests/pec78-runtime-auth-v1.sql                        # RLS/grant/RPC tests
```

Middleware must test the PEC-78 prefix before legacy service bearer resolution. A
PEC-78 request never falls through to local auth or WorkOS. In non-WorkOS dev mode,
PEC-78 still requires synthetic DPoP or denies.

## Kill Switch and Rollback

Denial is the union of global, contract, Maya principal, credential, capability,
destination, schedule, and effect switches. `PEC78_ADAPTER_MODE=disabled|shadow|
enabled` is a deployment fuse, but DB switches are authoritative too; enabled
requires both plus a current `production_gates` row. Every executor rechecks them
immediately before provider I/O.

Setting a kill switch increments the principal/schedule fence epoch, cancels future
occurrences, fences active leases, expires approvals, and revokes unstarted effects
in one transaction with receipts. Executing/unknown effects go to reconciliation;
kill never invents an outcome. Credential revocation by ID and thumbprint has the
same immediate fencing effect and invalidates unexpired JWTs.

Rollback procedure is exact and non-destructive:

1. Set global switch and deployment fuse `disabled`; verify readiness `stopped`.
2. Disable `maya-mailbox-30m-v1`, increment epoch, revoke Maya credential/key.
3. Prove claim, renew, approve, and execute all return 423/409.
4. Reconcile every `reserved|executing|failed_unknown`; escalate ambiguity.
5. Preserve schema, approvals, effects, and receipts; do not down-migrate/delete.
6. Remove provider credentials from the runtime by reference and restore the last
   reviewed runtime image/config only with a new credential and higher epoch.
7. Re-enable only through a fresh Production Gate.

Rollback never enables `ob-accounting`, another persona, Eve, shared credentials,
or a weaker route. Identity mismatch, master-key presence, RLS escape, stale-owner
success, duplicate effect, receipt gap, or false-green readiness triggers global
stop and P0.

## Tests

Implementation acceptance requires executed, deterministic tests:

1. **Contract/auth:** wrong scheme/version/issuer/audience/sub/persona/key/instance,
   expired/future/revoked JWT, altered method/URL/body, reused JTIs, unavailable
   replay store, Maya WorkOS session, `ob-accounting`, local operator, all other
   agents, and master-shaped key deny. Same idempotency request replays response;
   changed digest conflicts.
2. **Ingress/scope:** only Maya Gmail credential/message passes; forged mailbox,
   sender, actor, work key, cross-tenant/message, unknown classification/model route,
   `/api/agent/intake`, AccuLynx enqueue, and arbitrary effects deny. Conflicting
   provider duplicate quarantines.
3. **Occurrence/concurrency:** 100 parallel claims at a half-hour produce one
   occurrence/active lease; restart returns same occurrence; Hermes/Eve race has one
   winner; invalid minute and >30-minute catch-up deny.
4. **Fencing:** expiry/takeover/rotation/kill increments epoch; old lease/instance/
   owner cannot renew, intake, complete, propose, approve, or execute.
5. **State machines:** every documented edge passes and every absent edge conflicts;
   receipt and state commit atomically; projection failure cannot change authority.
6. **Approval:** Maya/self/other human/email-only/Slack reaction, stale CSRF/session,
   reused nonce, expired approval, altered digest/grant/payload/route and approval
   after kill deny. Only pinned Christopher subjects approve unchanged intent.
7. **Destinations:** exact admin email and pinned Christopher channel/thread pass in
   sandbox. Original sender, cc/bcc/reply-all/forward/attachment, DM/new/arbitrary
   channel/thread/member, file/mass mention, and business writes deny even approved.
8. **Effects/faults:** concurrent execute invokes provider once; timeout becomes
   `failed_unknown`; zero/one/many reconciliation paths work; retry requires zero;
   receipt/reservation failure prevents I/O; 2xx without provider ID is unknown.
9. **Database:** catalog tests prove force RLS, exact grants, fixed search paths,
   constraint/FK/index presence, append-only receipts, and denial for anon, generic
   authenticated, existing service/named agents, cross-persona, and direct writes.
10. **Health/recovery:** break or stale every readiness input independently and get
    503; killed/duplicate owner/unreconciled work never green; public health leaks no
    sensitive data; kill/rollback races leave zero active leases/approvals and no
    unreconciled effect beyond SLO.
11. **Regression/build:** existing access-control, agent APIs, PEC-77 registry
    validators, Astro build, secret/PII scan, and route snapshot pass. Legacy actors
    gain no PEC-78 access.

Run unit, API integration, SQL/RLS, concurrency, property/state-machine,
fault-injection, and sandbox-provider suites. Then collect three separate clean-day
Maya shadow receipts. Any flaky security assertion, open P0/P1, missing denial,
missing receipt, or unexplained provider outcome fails the gate.

## Production Gate

Rollout has four explicit phases; advancing each requires a durable review receipt:

1. **Installed-disabled:** merge code/migration with adapter flag `disabled`, registry
   effect status `not-installed` or `disabled`, disabled seed rows, no credential,
   schedule, mailbox read, Slack/email effect, or provider I/O.
2. **Synthetic shadow:** install synthetic credential and fixtures only; execute all
   tests and rollback drill. No production data or provider credentials.
3. **Maya production shadow:** after separate approval, bind verified Maya resources
   and observe/auth-deny the canonical schedule for three clean days; record no
   outbound effects and do not read message bodies beyond approved test fixtures.
4. **Maya enabled:** only after the completed packet and a new Christopher go/no-go,
   activate one schedule/owner and the explicitly named capabilities/destination
   grants. No other persona or destination is seeded or implied.

The final Ringer packet must include the original stalled-worker retry record,
linted manifest, exact build/migration/registry hashes, threat/egress/identity and
third-party-tool reviews, credential/resource bindings, grant/RLS catalog dump,
executed test output, three clean-day receipts, model/cost breakers, readiness and
alert proof, provider sandbox evidence, reconciliation/kill/rollback drills, and
zero open P0/P1.

Christopher Hussey is the sole final approver. The post-review approval row must
name this contract, Maya subject, exact build/registry/migration, credential and
runtime instance, owner/schedule, five capability-grant IDs, only the selected
admin-email/Christopher-Slack destination grant IDs, provider account IDs, model
routes/cost limits, packet digest, issue/expiry/review date, and rollback receipt.
An earlier, email-only, Slack, blanket, or pre-review approval is invalid.

**Until that row exists and private readiness independently reports `ready`, keep
`PEC78_ADAPTER_MODE=disabled`, the canonical schedule disabled, all production
credentials unbound, and all production effects denied.** V1 is permanently
Maya-only. Alex or any other persona requires a separate versioned contract,
implementation review, clean-day evidence, and human production gate.
