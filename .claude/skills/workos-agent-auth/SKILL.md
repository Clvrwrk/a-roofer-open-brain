---
name: workos-agent-auth
description: >
  How an OB agent authenticates to the WorkOS-gated live Command Center
  (https://cc.proexteriorsus.net) to read/act on live data. The single source
  of truth for agent access to the external site. Triggers on "agent auth",
  "WorkOS agent auth", "agent access the live site", "how does an agent log in
  to cc.proexteriorsus.net", "service token", "agent bearer token",
  "AGENT_SERVICE_TOKENS", "agent can't reach the dashboard / 401", "auth.md",
  "agent auth discovery", "/oauth2/token", "register an agent". Read this
  BEFORE re-investigating how agents reach the live site — the answer is here.
---

# WorkOS agent auth — reaching the live Command Center

The live Command Center at **https://cc.proexteriorsus.net** is **WorkOS-gated**.
Humans sign in through WorkOS (AuthKit); **agents do NOT have a human session**.
Two access surfaces exist. Know which one to use.

```
                         cc.proexteriorsus.net  (middleware.ts gate order)
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 1. Public:   /healthz  /auth.md  /.well-known/*  /auth/*  webhooks     │ → open
  │ 2. /api/*  + Authorization: Bearer <service-token>  ───────────────────│ → ✅ AGENTS USE THIS
  │ 3. (dev only) COMMAND_CENTER_AUTH_MODE!=workos → Local Operator        │ → localhost only
  │ 4. HTML pages (/accounting/…, /operations/…) → WorkOS human session    │ → humans only
  └──────────────────────────────────────────────────────────────────────┘
```

**Bottom line:** an agent reads live data by calling **`/api/*` JSON routes** with an
**`Authorization: Bearer <token>`** header. Agents **cannot** load the rendered HTML
dashboards on prod (those require a human WorkOS session) — read the data API instead.

## ✅ Path A — service bearer token (WORKS TODAY, use this)

Status (verify anytime via `curl -s https://cc.proexteriorsus.net/healthz`):
`agentServiceAuthConfigured: true`, `agentServiceTokenCount: 13` — all roster agents
are provisioned on prod.

- **Header:** `Authorization: Bearer <token>` on any `/api/*` route.
- **Token store:** root **`.env`** key **`AGENT_SERVICE_TOKENS`** = CSV of
  `agentId:token,agentId2:token2,…`. (Prod also accepts a hashed-only form per agent:
  `AGENT_SERVICE_TOKEN_SHA256_<AGENTID>` = sha256 hex of the token, so no plaintext sits
  at rest — see `getServiceTokenHashEnvKey` in `app/command-center/src/lib/access-control.ts`.)
- **Validation:** `resolveServiceActorFromBearer` → `resolveServiceActorFromToken`
  (`access-control.ts`): constant-time match of `sha256(token)` against the CSV or the
  per-agent hash env. A match maps to a `service_agent` actor with that agent's
  `departmentAccess` + `SERVICE_AGENT_PERMISSIONS`.
- **Enforcement:** `app/command-center/src/middleware.ts` step 2 — bearer auth is honored
  on **API routes only**. A bad/missing token on an API route → `401` with
  `www-authenticate: Bearer realm="open-brain-command-center"`.

### Agent roster (valid `agentId`s — `SERVICE_AGENT_IDENTITIES`)
`ob-accounting`, `ob-ops`, `ob-sales`, `ob-marketing`, `ob-exec`, `ob-capture`,
`ob-researcher`, `ob-conductor`, `ob-innovator`, `ob-historian`, `ob-auditor`,
`ob-quality-control`, `hermes`. Each is department-scoped — respect the
**security boundary** (CLAUDE.md rule 5): Historian internal-only, Researcher external-only.

### Secret-handling rules (non-negotiable, same as the coolify skill)
- **Never print a token value into the chat transcript.** Surfacing a credential from a
  store is blocked by the auto-mode classifier — correctly.
- **To USE a token:** read it in-place into a shell variable, never echoed. The value
  lives in root `.env` (`AGENT_SERVICE_TOKENS`); the user can read their own file.
- Running a real prod token against the live site is a production action — get the user's
  go-ahead first; don't escalate from "write docs" to "exercise prod creds."

### Cookbook (operator/agent runs this; token never echoed)
```bash
# Pull one agent's token from root .env into a var (no echo). CSV is agentId:token,...
CSV="$(grep -E '^AGENT_SERVICE_TOKENS=' .env | sed -E 's/^[^=]+=//' | tr -d '"')"
TOK="$(printf '%s' "$CSV" | tr ',' '\n' | grep '^ob-auditor:' | head -1 | cut -d: -f2-)"

# Read live data through the gated API (HTML pages will NOT work — API only):
curl -s -H "Authorization: Bearer $TOK" \
  "https://cc.proexteriorsus.net/api/order-audit/lines?order=2004689677" | jq .
# 401 → token not provisioned / wrong agentId / hit an HTML page instead of /api/*.
```

### Readable live API routes (data agents can consume)
`app/command-center/src/pages/api/**`. Useful read endpoints:
`/api/order-audit/lines?order=<n>`, `/api/price-agreement/package/items`,
`/api/agent/work-queue`, `/api/product-surface.json`, `/api/vendor-territories`.
Write/decision routes (`/api/invoice-audit/mark`, `/api/credit-memos/disposition`,
`/api/agent/work-queue/[workId]/decision`) require the matching permission — and remember
**rule: no external sends without a human** (CLAUDE.md, SOUL.md).

### Provision or rotate a token
Tokens are env vars on the prod app → set them via the **/coolify** skill, then redeploy.
1. Generate a token: `openssl rand -hex 32` (store the plaintext in the user's secret file,
   e.g. `.env.agent-passwords` — never chat).
2. Prefer the hashed form: `printf %s "$TOK" | shasum -a 256` → set Coolify env
   `AGENT_SERVICE_TOKEN_SHA256_<AGENTID>` (agentId uppercased, non-alnum → `_`;
   e.g. `ob-accounting` → `AGENT_SERVICE_TOKEN_SHA256_OB_ACCOUNTING`).
   Or append `agentId:token` to the `AGENT_SERVICE_TOKENS` CSV.
3. Redeploy (coolify skill) → confirm `healthz.agentServiceTokenCount` went up.

## 🚧 Path B — WorkOS `auth.md` OAuth flow (discovery live, minting NOT yet implemented)

The app publishes the WorkOS **Auth for AI Agents** discovery surface (the standard at
https://workos.com/auth-md, dated 2026-06-06). Implementation: `src/lib/agent-auth.ts`,
routes under `src/pages/auth.md.ts`, `src/pages/.well-known/oauth-*`, `src/pages/oauth2/*`,
`src/pages/agent/auth*`.

- **Discovery (live, 200):**
  - `https://cc.proexteriorsus.net/auth.md` — human-readable agent-auth doc
  - `…/.well-known/oauth-protected-resource`, `…/.well-known/oauth-authorization-server`
  - Token: `…/oauth2/token` · Revoke: `…/oauth2/revoke` · Register: `…/agent/auth`
- **Scopes:** `open-brain.read`, `open-brain.tasks.request`, `open-brain.tasks.write`,
  `open-brain.memory.read`. **Issuer:** `https://cc.proexteriorsus.net`.
- **Registration methods:** `anonymous` (api_key), `identity_assertion`
  (`urn:ietf:params:oauth:token-type:id-jag` or `verified_email`).
- **⚠️ NOT usable yet:** per `/auth.md`, "Registration, token minting, token revocation,
  and SET verification return explicit **not_implemented** responses until the signing key,
  token store, trusted issuer list, replay protection, and WorkOS human session bridge are
  installed." So `/oauth2/token` will not mint a token today. **Use Path A.**

### To finish Path B (future work)
Install: signing key + token store, trusted-issuer list, replay protection, and the WorkOS
human-session bridge (for the User-Claimed flow). Then `/oauth2/token` mints scoped,
short-lived, revocable bearer tokens and Path A can be deprecated in favor of per-scope OAuth.

## Quick triage
- **"Agent got 401 on the live site."** Hitting an HTML page, not `/api/*` → switch to the
  API route. Or token missing/wrong `agentId` → check `healthz.agentServiceTokenCount` and
  the `AGENT_SERVICE_TOKENS` entry.
- **"`/oauth2/token` returns not_implemented."** Expected — Path B isn't built. Use Path A.
- **"Need to confirm auth is live."** `curl -s https://cc.proexteriorsus.net/healthz` →
  `agentServiceAuthConfigured`, `agentServiceTokenCount`, `agentAuthDiscovery`.

## References
- Code: `app/command-center/src/lib/access-control.ts` (token resolution, roster, perms),
  `src/middleware.ts` (gate order), `src/lib/agent-auth.ts` (OAuth discovery).
- Deploy/env: **/coolify** skill (set token env vars + redeploy).
- Standard: WorkOS Auth for AI Agents — https://workos.com/auth-md.
