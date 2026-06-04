# Connection And Access Checklist

Status: draft v0.1
Related: [`27-hetzner-coolify-agent-host.md`](27-hetzner-coolify-agent-host.md), [`28-sentry-mcp-and-observability.md`](28-sentry-mcp-and-observability.md), [`../config/.env.example`](../config/.env.example)

## Rule Of The Road

Use repo-root `.env` for real local secrets. It is ignored by git and should never be copied into chat, docs, commits, or screenshots.

Use `config/.env.example` only as the names-only contract. When a new integration is added to `.env`, mirror only the variable name and a placeholder value in `config/.env.example`.

Never copy `.env` to `.env.example`. If a tool needs a template, create it from names and placeholders, not from real values.

## What I Need From Chris

1. Add or confirm the env names below in repo-root `.env`.
2. Give Codex access through the least-powerful path that still lets the work happen: public key, app connector, scoped token, or admin invite.
3. Tell Codex which environment is live versus sandbox.
4. Do not paste plaintext secrets into chat. Put them in `.env`, Coolify env, or the relevant provider secret store.

## Local `.env`

Current pattern:

```bash
cp config/.env.example .env
```

Then edit `.env` locally. Codex may inspect key names safely, but should not print values.

For ABC Supply, the sandbox currently appears in `.env` as generic provider labels:

```bash
ClientID=...
Client_Secret=...
```

Keep those if you want, but add namespaced aliases for the app and future agents:

```bash
ABC_SUPPLY_ENV=sandbox
ABC_SUPPLY_CLIENT_ID=...
ABC_SUPPLY_CLIENT_SECRET=...
```

The aliases can contain the same values as `ClientID` and `Client_Secret`; only the names matter to tracked code and docs.

## Codex Account Versus API

Codex local supports ChatGPT account sign-in and API-key sign-in. Use the current Codex Desktop/account path for interactive repo work.

Use API auth for automation or server runtimes:

```bash
CODEX_API_KEY=... codex exec --json "summarize this repo"
```

`CODEX_API_KEY` is for `codex exec` automation. Keep it scoped to the single command or secret store entry, not a broad shell profile.

Use `OPENAI_API_KEY` for app code, agent runtimes, and services that call OpenAI APIs directly.

Use a Codex access token only when a trusted automation needs ChatGPT workspace identity and governance instead of Platform API billing. Store it as `CODEX_ACCESS_TOKEN` in a secret manager.

## Hetzner CPX41

Need from Chris:

- Server IP or hostname.
- SSH username and port.
- Confirmation that Codex's public SSH key is installed for that user.
- Whether Coolify is already installed or should be installed fresh.

Target env names:

```bash
HETZNER_SERVER_IP=...
HETZNER_SERVER_NAME=PE-open-brain
HETZNER_SERVER_TYPE=CPX41
HETZNER_SSH_USER=deploy
HETZNER_SSH_PORT=22
```

First verification:

```bash
ssh deploy@$HETZNER_SERVER_IP hostname
```

## DNS And Coolify

Need from Chris:

- DNS access or exact records to create.
- Coolify admin access, deploy token, or one-time setup path.
- Confirmation that `cc.proexteriorsus.net` should point to Command Center.

Initial DNS:

- `cc.proexteriorsus.net` -> Command Center.
- Coolify admin hostname -> Coolify dashboard.
- Internal MCPs should not have public DNS.

Target env names:

```bash
COMMAND_CENTER_PUBLIC_URL=https://cc.proexteriorsus.net
COOLIFY_API_TOKEN=...
COOLIFY_DASHBOARD_DEPLOY_HOOK=...
```

## Supabase

Current project:

```bash
SUPABASE_URL=https://rnhmvcpsvtqjlffpsayu.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

Need from Chris:

- Keep service-role key in `.env` locally and Coolify env server-side only.
- Add anon/public keys when the browser-facing path needs them.
- Confirm whether migrations should be run by Codex or kept manual until production cutover.

First verification:

```bash
npm run dev
```

Then load `/api/healthz.json` and `/api/product-surface.json`.

## WorkOS

Keep human auth through WorkOS once the UI is ready.

Need from Chris:

- WorkOS API key.
- WorkOS client ID.
- Redirect URI for `cc.proexteriorsus.net`.
- Cookie password of at least 32 characters.

Target env names:

```bash
COMMAND_CENTER_AUTH_MODE=workos
WORKOS_API_KEY=...
WORKOS_CLIENT_ID=...
WORKOS_REDIRECT_URI=https://cc.proexteriorsus.net/auth/callback
WORKOS_COOKIE_PASSWORD=...
```

Do not enable `COMMAND_CENTER_AUTH_MODE=workos` in production until callback routing and session sealing are verified.

## Sentry

Need from Chris:

- Sentry org slug.
- Project slug for Command Center.
- DSN.
- Personal or org token in `.env`.

Target env names:

```bash
SENTRY_DSN=...
SENTRY_AUTH_TOKEN=...
SENTRY_ORG_AUTH_TOKEN=...
SENTRY_ORG=...
SENTRY_PROJECT=...
SENTRY_ENVIRONMENT=production
SENTRY_MCP_URL=https://mcp.sentry.dev/mcp
```

Use account login for an interactive local CLI session:

```bash
sentry auth login
```

Use token auth for agents and server-side automation:

```bash
SENTRY_AUTH_TOKEN=... sentry org list --json
```

## ABC Supply Sandbox

Need from Chris:

- ABC sandbox API docs or portal notes for allowed scopes.
- Confirmation of the integration track: client credentials aggregator, client credentials individual/business, or auth-code flow.
- A sandbox account/ship-to/bill-to identifier if read-only account tests require one.

Target env names:

```bash
ABC_SUPPLY_ENV=sandbox
ABC_SUPPLY_CLIENT_ID=...
ABC_SUPPLY_CLIENT_SECRET=...
ABC_SUPPLY_API_BASE_URL=https://partners-sb.abcsupply.com
ABC_SUPPLY_AUTH_BASE_URL=https://sandbox.auth.partners.abcsupply.com/oauth2/aus1vp07knpuqf6Xz0h8
ABC_SUPPLY_SCOPES=account.read location.read product.read pricing.read order.read invoice.read
```

First tests must be token exchange plus harmless read-only endpoints. Do not place orders or register webhooks until a human confirms the sandbox behavior.

## Zilliz And MemSearch

Local MemSearch is installed and can index curated `context/` files.

Need from Chris:

- Decision: local Milvus Lite for bootstrap, Zilliz Cloud for shared agent memory, or self-hosted Milvus later.
- If shared memory is desired, keep `ZILLIZ_URI` and `ZILLIZ_TOKEN` in `.env` and Coolify env.

Target env names:

```bash
ZILLIZ_URI=...
ZILLIZ_TOKEN=...
MILVUS_URI=...
MILVUS_TOKEN=...
```

## Google, Research, And Capture APIs

Keep provider keys in `.env` and expose them only to the containers that need them.

Current known key names include:

```bash
GOOGLE_MAPS_BROWSER_KEY=...
GOOGLE_MAPS_SERVER_KEY=...
GOOGLE_WORKSPACE_CLI_CLIENT_ID=...
GOOGLE_WORKSPACE_CLI_CLIENT_SECRET=...
FIRECRAWL_API_KEY=...
APIFY_API_KEY=...
YOUTUBE_API_KEY=...
```

Browser keys may be public by design, but must be restricted by HTTP referrer. Server keys and client secrets stay server-side only.

## Deployment Order

1. Normalize `.env` names locally.
2. Verify Command Center against Supabase locally.
3. Add WorkOS only after `cc.proexteriorsus.net` callback is reachable.
4. Add Sentry DSN and token; verify CLI/API auth.
5. Bootstrap Hetzner and Coolify.
6. Deploy Command Center.
7. Deploy internal agent containers.
8. Turn on MemSearch shared backend if needed.
9. Start ABC sandbox read-only tests.
10. Add cron schedules after each agent has a verified idempotent task.
