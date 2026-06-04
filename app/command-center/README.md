# Open Brain Command Center

Phase 1 Astro SSR walking skeleton for the human-in-the-loop agent command surface.

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:4321`.

## Routes

- `/` shows the Supabase-backed product/pricing surface plus the department-by-cadence work queue and local approval controls.
- `/api/product-surface.json` returns the sanitized server-side product/pricing snapshot.
- `/agents` shows Hermes, Maintenance, GSD Core, runtime monitor placeholders, and the WorkOS/auth.md agent discovery posture.
- `/auth.md` returns the LLM-readable agent-auth instructions for this service.
- `/.well-known/oauth-protected-resource` returns the protected resource metadata.
- `/.well-known/oauth-authorization-server` returns the OAuth authorization server metadata with the `agent_auth` block.
- `/agent/identity`, `/agent/identity/claim`, `/agent/identity/claim/complete`, `/oauth2/token`, `/oauth2/revoke`, and `/agent/event/notify` are reserved POST endpoints that currently return `not_implemented`.
- `/healthz` returns a server-side health payload without exposing secrets.

## Runtime notes

- The app loads environment variables from the repository root through Astro/Vite `envDir`, so `/Users/chussey/Documents/a-roofers-open-brain/.env` is the local source.
- WorkOS is represented as a server-side placeholder. Set `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`, and `COMMAND_CENTER_AUTH_MODE=workos` when the real auth layer lands.
- The product surface uses server-only Supabase credentials. Set `SUPABASE_URL` or `PUBLIC_SUPABASE_URL`, plus `SUPABASE_SERVICE_ROLE_KEY`. Do not expose the service-role key with a `PUBLIC_` variable.
- Agent auth discovery defaults to `https://cc.proexteriorsus.net`. Override with `COMMAND_CENTER_PUBLIC_URL` or `AGENT_AUTH_ISSUER` for another deployment origin.
- Astro `security.checkOrigin` is disabled because OAuth token/revocation and agent SET endpoints must accept machine-to-machine POSTs without browser Origin headers. Those routes must enforce JWT, issuer, audience, replay, and token checks in the runtime phase.
- Agent runtime calls should use server-only environment variables such as `AGENT_RUNTIME_URL`.
- The current queue data is static seed data in `src/lib/cadence.ts`; live cron-backed runs arrive in the cadence engine phase.
