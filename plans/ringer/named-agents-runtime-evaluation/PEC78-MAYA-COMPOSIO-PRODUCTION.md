# PEC-78 Maya Composio Production Path

Status: source candidate frozen and final Ringer gate passed; production activation evidence remains a separate gate.
Owner and sole human approver: Christopher Hussey.
Runtime: Maya's existing dedicated Orgo computer.
Tool/auth layer: Composio only for Slack ingress and Slack effects.

## Outcome

Replace the failed prototype-only Composio WebSocket subscription with a signed,
durable production path. A message deliberately addressed to Maya by Christopher
in the one approved Slack channel is accepted exactly once, claimed only by Maya's
fenced Orgo runtime, answered by the pinned Hermes harness, and posted once through
Maya's Composio-connected Slack app with the prefix `[NA-5][MAYA] -`.

This package installs and tests that path disabled. It does not consume another
owner message, enable a trigger, activate a schedule, read Gmail, or send Slack or
email during implementation. Those effects require the activation checklist below.

## Architecture and ownership

1. Composio posts V3 `composio.trigger.message` deliveries to a public Command
   Center endpoint. The endpoint verifies `webhook-id`, `webhook-timestamp`, and
   `webhook-signature` over the exact raw body with a five-minute replay window.
2. The endpoint uses a dedicated per-project webhook signing secret and rejects
   every wrong signing secret, user, connected account, trigger, Slack
   workspace, channel, sender, bot, subtype, and message shape except the reviewed
   Maya tuple. It never logs message text or stable identifiers in plaintext.
3. The accepted, minimized Slack payload is AES-256-GCM encrypted before the
   server-only Supabase client stores it. Database-enforced delivery and message
   uniqueness make redelivery idempotent.
4. A DPoP-authenticated Maya route atomically claims one event under her credential,
   runtime instance, principal fence, production gate, capability grant, and a
   short lease. Command Center decrypts only after a successful claim.
5. The Orgo worker rechecks the immutable event tuple and addressing rule, invokes
   the pinned Hermes runner, reserves an exact threaded Slack effect, calls Slack
   only through Composio, reconciles the provider result, and completes the event.
6. Unknown send outcomes never retry automatically. Expired leases may be reclaimed
   only when no effect is reserved/executing/unknown for that event.

Owned source boundaries:

- `app/command-center/src/lib/pec78/`
- `app/command-center/src/pages/api/integrations/composio/`
- `app/command-center/src/pages/api/agent/runtime/v1/`
- `app/command-center/src/middleware.ts`
- `app/command-center/src/env.d.ts`
- `schemas/cleverwork-roofer/190-pec78-composio-slack-production.sql`
- `schemas/cleverwork-roofer/191-pec78-composio-slack-production-hardening.sql`
- `deployment/remote/orgo/maya-slack-listener/`
- this plan, its checks, manifest, and Ringer run artifacts

Unrelated dirty-tree files are outside scope and must not be staged or changed.

## Data and secret boundary

- `COMPOSIO_WEBHOOK_SECRET` and `PEC78_EVENT_ENCRYPTION_KEY` are server-only
  production environment values. Neither enters Supabase rows, Orgo, source,
  Ringer artifacts, logs, Linear, receipts, or screenshots.
- The Composio API key remains only on Maya's Orgo runtime and in the approved
  operator control environment. The Command Center webhook needs only its signing
  secret.
- Stored event content is ciphertext plus nonce/tag and non-reversible digests.
- Responses contain no Composio project secret, Slack token, OAuth secret, raw
  webhook envelope, or owner email.
- Logs contain result codes, trace IDs, and digests only.

## Database contract

Migration 190 is additive except for replacing the existing capability check with
the same allowlist plus `slack.receive.christopher`. It creates private forced-RLS
tables for one ingress source, encrypted inbound events, and event leases; revokes
all public/anon/authenticated access; and exposes only reviewed `SECURITY DEFINER`
RPCs with fixed search paths and explicit execute grants limited to the server
role. No active source, grant, gate, credential, or trigger is seeded. Migration
191 permanently fences the unsafe v1 ingest and unbound readiness signatures,
binds ingest and readiness to the exact build/registry/runtime/trigger tuple,
rechecks all authority and kill scopes at the provider-I/O edge, makes execute
replay terminally ambiguous, and atomically reconciles effect/event/lease state.

The ingest RPC validates the full reviewed source tuple, active principal/source,
fence, time window, and kill switches in one transaction. The claim/complete RPCs
validate Maya's credential, runtime instance, capability, production gate, fence,
lease, and event state under row locks. Delivery ID and Slack channel/timestamp are
independent uniqueness keys.

## Deterministic acceptance checks

- Valid and invalid webhook HMAC fixtures, stale timestamps, malformed signatures,
  body-byte changes, and missing secrets.
- Wrong project/user/account/trigger/team/channel/sender/bot/subtype/message shapes.
- Plain-name addressing and exact `@Maya` mention acceptance; incidental name,
  Unicode confusable, quote/code-block, bot, and thread-loop rejection.
- Duplicate webhook delivery and duplicate Slack message create one event.
- Two concurrent claims produce one lease; wrong credential/runtime/fence denied.
- Event ciphertext decrypts only with the configured key and authenticated claim.
- No raw message text appears in DB-call fixtures, receipts, or logs.
- Slack effect binds channel and thread from the claimed owner event, requires the
  Maya prefix, and rejects a different destination or author.
- Unknown provider outcome blocks automatic retry; successful reconciliation and
  event completion are idempotent.
- Disabled ingress, adapter, source, trigger, supervisor, gate, capability, budget,
  or kill switch fails closed.
- Focused unit tests, Command Center build, migration static checks, and Orgo worker
  tests pass.

## Rollout and rollback

Installation order is migration, Command Center deployment with ingress disabled,
private readiness proof, Orgo worker install stopped, Composio project webhook
subscription, new trigger creation disabled, then identity/hash comparison.

Activation order is production gate/capability/source, Command Center shadow mode,
Orgo worker start, new trigger enable last. The old malformed trigger is never
enabled or reused. Slack delayed-event replay stays off for the initial validation.

Rollback is trigger-first: disable and confirm the new Composio trigger, commit the
database principal fence and authority revocations, stop and confirm the exact Orgo
worker, disable the dedicated inference key, reconcile any reserved or unknown
effect, and retain encrypted events, receipts, logs, and private rollback artifacts.
The provider-I/O edge and rollback share one database serialization lock. Never
delete the Orgo computer or recreate evidence.

## Frozen-candidate evidence — 2026-07-27

- Focused Command Center tests: 5 files / 45 tests PASS.
- Maya listener tests: 65/65 PASS.
- Command Center production build: PASS; only expected local Sentry upload warnings.
- Exact nonproduction Supabase proof: project `zmkddrpracgxuuxiyipi`, migrations
  188-191, 16 assertions PASS, including exact-trigger readiness, destination-kill
  readiness, and a two-session rollback-versus-execute serialization proof.
- Final Ringer run:
  `pec78-maya-composio-production-final-gate-20260728T011555Z-p70553`.
  Security, database, and operations all PASS first attempt with no P0/P1.
- Production preflight: CLEAR with zero failures; backup proof `1222069117`
  completed at `2026-07-27T08:14:39.224Z`. Production had only migration 188 at
  this checkpoint; migrations 189-191 had not been applied.
- Production advisor output has substantial pre-existing security/performance
  debt. The candidate adds only private forced-RLS tables and fixed-search-path
  definer RPCs; post-migration comparison must show no new PEC-78 advisor finding.
- No production migration, deploy, trigger, Orgo mutation, Slack message, email,
  mailbox access, or schedule occurred while collecting this evidence.

## Activation gate

Activation is forbidden until all are true:

1. Supabase non-production migration test and production preflight/backup proof.
2. Source-backed Ringer security, database, and operations reviews PASS with no P0/P1.
3. Command Center deployed commit and private readiness match.
4. New Composio webhook subscription and new trigger identities are recorded by
   digest; the new trigger is confirmed disabled and the old trigger disabled.
5. Orgo worker is installed stopped and its exact archive hash matches source.
6. Linear records the failed prototype test, replacement design, run IDs, checks,
   rollback, and the exact next authorized effect.
7. Christopher authorizes one fresh, non-sensitive owner message after readiness.

The first six conditions are source/preflight complete as recorded above, except
that live deployed-build, trigger-disabled, and installed-stopped worker evidence
must be collected from the production systems after installed-disabled deployment.
Condition 7 must be a fresh authorization after those checks; prior rejected or
successful messages cannot be replayed or substituted.

Passing one message proves only the bounded Slack callback. It does not activate
Gmail, the 30-minute mailbox schedule, email sending, additional channels/users,
other named agents, or unrestricted conversational autonomy.
