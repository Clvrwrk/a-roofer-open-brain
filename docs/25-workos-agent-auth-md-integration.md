# WorkOS auth.md Agent Auth Integration

## Scope

This pass publishes the discovery skeleton for WorkOS `auth.md` agent registration while retaining WorkOS as the human access gate.

- Reference repo: `https://github.com/workos/auth.md`
- Reference version: `v0.3.0`
- Reference date: `2026-06-03`
- Deployment origin default: `https://cc.proexteriorsus.net`

## Published Routes

- `/auth.md`
- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-authorization-server`
- `/agent/identity`
- `/agent/identity/claim`
- `/agent/identity/claim/complete`
- `/oauth2/token`
- `/oauth2/revoke`
- `/agent/event/notify`

The two well-known routes and `/auth.md` return real discovery documents. The POST endpoints return explicit `not_implemented` JSON responses until the credential runtime is built.

Astro `security.checkOrigin` is disabled in `app/command-center/astro.config.mjs` so OAuth form-encoded POSTs and Security Event Token POSTs are not blocked before route code runs. The agent-auth runtime must provide its own request authentication and replay protection before any endpoint performs state changes.

## Discovery Contract

The authorization server metadata includes:

- `issuer`
- `token_endpoint`
- `revocation_endpoint`
- `grant_types_supported`
- `agent_auth.skill`
- `agent_auth.identity_endpoint`
- `agent_auth.claim_endpoint`
- `agent_auth.events_endpoint`
- `agent_auth.identity_types_supported`
- `agent_auth.identity_assertion.assertion_types_supported`
- `agent_auth.events_supported`

The current `events_supported` value is:

```text
https://schemas.workos.com/events/agent/auth/identity/assertion/revoked
```

Provider-driven invalidation should use Security Event Token push delivery at `/agent/event/notify`. Do not implement the older `/agent/auth/revoke` or `agent_auth.revocation_uri` pattern.

## Required Runtime Build

Before accepting real agent registration:

1. Add service signing keys for service-minted `identity_assertion` JWTs.
2. Publish JWKS if the service signs assertions that external parties verify.
3. Add a trusted agent-provider issuer list and JWKS cache.
4. Add `jti` replay protection and token persistence.
5. Add claim-token and OTP persistence with short TTLs.
6. Bind claimed registrations to WorkOS-backed human ownership.
7. Protect business-data endpoints with WorkOS session checks and agent scopes.
8. Accept `application/secevent+jwt` at `/agent/event/notify` and validate issuer, audience, key, event schema, and replay state before invalidating registrations.

## Environment

- `COMMAND_CENTER_PUBLIC_URL=https://cc.proexteriorsus.net`
- `AGENT_AUTH_ISSUER=https://cc.proexteriorsus.net`
- `AGENT_AUTH_SIGNING_KEY=__set_me__`
- `AGENT_AUTH_TRUSTED_ISSUERS=__set_me__`
- `WORKOS_CLIENT_ID=__set_me__`
- `WORKOS_COOKIE_PASSWORD=__set_me__`
- `COMMAND_CENTER_AUTH_MODE=workos`

Human operators should remain on WorkOS while agent-auth endpoint behavior is implemented incrementally.
