# Open Brain Command Center

Phase 1 Astro SSR walking skeleton for the human-in-the-loop agent command surface.

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:4321`.

## Routes

- `/` shows the department-by-cadence work queue and local approval controls.
- `/agents` shows Hermes, Maintenance, GSD Core, and runtime monitor placeholders.
- `/healthz` returns a server-side health payload.

## Runtime notes

- WorkOS is represented as a server-side placeholder. Set `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`, and `COMMAND_CENTER_AUTH_MODE=workos` when the real auth layer lands.
- Agent runtime calls should use server-only environment variables such as `AGENT_RUNTIME_URL`. Do not expose service-role credentials with `PUBLIC_` variables.
- The current queue data is static seed data in `src/lib/cadence.ts`; live cron-backed runs arrive in the cadence engine phase.
