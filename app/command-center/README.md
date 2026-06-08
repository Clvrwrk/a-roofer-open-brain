# Open Brain Command Center

Astro SSR human-in-the-loop command surface for Pro Exteriors. The app reads live server-side Supabase mirrors, writes dashboard decisions to durable workflow tables, and mirrors those decisions to Slack through `slack_mirror_events`.

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:4321`, or pass a port explicitly when another dev server is already running:

```bash
npm run dev -- --port 4326
```

## Routes

- `/` shows the cross-department live work queue derived from Supabase source tables.
- `/abc-price-agreement-gaps` shows the ABC fixed-agreement guardrail queue for human review by branch, invoice, SKU, agreement window, and price variance.
- `/weekly-snapshot` renders the AccuLynx-style two-week productivity snapshot with click-through drilldowns for locations, sales reps, AR, claims, and activity.
- `/weekly-snapshot/:slice`, `/weekly-snapshot/rep/:rep`, and `/weekly-snapshot/records/:record` render the active drilldown pages behind snapshot metrics, rows, and records.
- `/accounting` is the Accounting department home for Lucinda, with margin-protection metrics, ABC review work, credit memo state, and the confirmed human authority model.
- `/operations`, `/sales`, `/marketing`, `/executive`, and `/system` render department home dashboards with source-backed queues.
- `/operations/:slug`, `/sales/:slug`, `/marketing/:slug`, `/executive/:slug`, and `/system/:slug` render filtered live detail dashboards for queue click-throughs.
- `/accounting/invoices`, `/accounting/price-agreement-gaps`, `/accounting/credit-memos`, `/accounting/product-matches`, and `/accounting/vendor-regions` render live ABC/Supabase-backed margin-protection dashboards.
- `/accounting/review-queue`, `/accounting/ar-aging`, `/accounting/insurance-proceeds`, `/accounting/change-orders`, `/accounting/job-costing`, `/accounting/close`, `/accounting/vendor-intake`, and `/accounting/audit-log` render Accounting dashboards from current mirrors and workflow/action tables.
- `/accounting/credit-memos/:invoice` renders the invoice-level credit memo packet.
- `/api/product-surface.json` returns the sanitized server-side product/pricing snapshot.
- `/api/agent/session` returns the current human, named-agent, or service-agent actor and its permitted surfaces.
- `/api/agent/work-queue` returns the actor-filtered queue for agents that operate without a browser session.
- `/api/agent/work-queue/:workId/decision` accepts approval, rejection, evidence-request, and resume signals according to actor permissions.
- `/agents` shows the live agent monitor sourced from department queues, workflow state, Slack mirrors, and auth discovery.
- `/auth.md` returns the LLM-readable agent-auth instructions for this service.
- `/.well-known/oauth-protected-resource` returns the protected resource metadata.
- `/.well-known/oauth-authorization-server` returns the OAuth authorization server metadata with the `agent_auth` block.
- `/agent/identity`, `/agent/identity/claim`, `/agent/identity/claim/complete`, `/oauth2/token`, `/oauth2/revoke`, and `/agent/event/notify` are reserved POST endpoints that currently return `not_implemented`.
- `/api/agentmail/webhook` receives AgentMail webhook events and verifies Svix signatures before logging sanitized event metadata.
- `/healthz` returns a server-side health payload without exposing secrets.

## Runtime notes

- The app resolves environment variables from process env first, then local `.env` / `.env.local` files found by walking up from the app/runtime path. Production should use Coolify env, not repo files.
- WorkOS is not enforced in local/default mode. Set `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`, and `COMMAND_CENTER_AUTH_MODE=workos` when the real auth layer is enabled.
- The product surface uses server-only Supabase credentials. Set `SUPABASE_URL` or `PUBLIC_SUPABASE_URL`, plus `SUPABASE_SERVICE_ROLE_KEY`. Do not expose the service-role key with a `PUBLIC_` variable.
- The weekly snapshot uses live Supabase mirrors only: CRM pipeline, AccuLynx job mirror health, ABC invoice/review rows, and dashboard action logs. Missing payment/QB data renders as a live empty/unavailable state, never copied screenshot numbers.
- Agent auth discovery defaults to `https://cc.proexteriorsus.net`. Override with `COMMAND_CENTER_PUBLIC_URL` or `AGENT_AUTH_ISSUER` for another deployment origin.
- Agent service API access uses `AGENT_SERVICE_TOKENS` for phase-1 bearer-token auth. Format: `agent-id:token,other-agent:token`. Prefer vault-backed per-agent tokens in production and rotate any key that was visible in chat.
- AgentMail uses `AGENTMAIL_API_KEY`, `AGENTMAIL_DOMAIN`, `AGENTMAIL_WEBHOOK_URL`, and `AGENTMAIL_WEBHOOK_SECRET` or `AGENTMAIL_WEBHOOK_SECRETS`. The production webhook URL is `https://cc.proexteriorsus.net/api/agentmail/webhook`.
- Astro `security.checkOrigin` is disabled because OAuth token/revocation and agent SET endpoints must accept machine-to-machine POSTs without browser Origin headers. Those routes must enforce JWT, issuer, audience, replay, and token checks in the runtime phase.
- Agent runtime calls should use server-only environment variables such as `AGENT_RUNTIME_URL`.
- Dashboard decisions write to `dashboard_work_items` and `dashboard_action_log`, then create `slack_mirror_events` rows. Slack delivery requires the bot to be in the configured mirror channel or have the required Slack scope.
