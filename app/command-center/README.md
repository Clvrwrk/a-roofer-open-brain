# Open Brain Command Center

Astro SSR operations and review application for Pro Exteriors. It reads Supabase-backed operational mirrors server-side, presents decision workflows and exposes authorized agent APIs. WorkOS gates the production app; service tokens authorize selected `/api/*` routes rather than human HTML pages.

## Local setup

Use Node.js 22 and npm, from this directory:

```bash
npm ci
npm test
npm run build
HOST=127.0.0.1 PORT=4399 \
COMMAND_CENTER_SLACK_RUNTIME=off COMMAND_CENTER_PREWARM=off \
npm run start:web
```

Open [127.0.0.1:4399](http://127.0.0.1:4399); Ctrl-C stops the foreground process. The no-secret path renders a limited local app and does not establish live-data readiness. `npm run dev` starts the interactive Astro development server. `npm run check` currently aliases the build; it is not a separate comprehensive type checker.

`npm start` uses the runtime supervisor and can start Slack listeners. The `start:web` command above runs the web server directly. Keep background loops disabled when reviewing a copied checkout. The reviewed Astro preview command reported a wildcard host and runs a daemon; if used, verify its bind address and stop it with `astro preview stop`.

## Configuration

Variable names are documented in [`config/.env.example`](../../config/.env.example). Process variables take precedence; the runtime also walks ancestors for `.env` and `.env.local`. Moving source folders can change which file is discovered. Do not reuse a production credential file for ordinary local development or put server credentials into browser bundles.

The production Docker context is this directory: its package files, `public/`, `runtime/` and built `dist/` are app-local. The approved pipeline builds on push to the configured branch; source-path moves require CI and Coolify configuration review.

## Route families

| Path | Current role |
| --- | --- |
| `/` | Territory Map. |
| `/accounting` | Redirect to `/accounting/invoice-audit`. |
| `/accounting/*` | Invoice audit, agreement workflows, credit memos, Friday WIP/AR and accounting review. |
| `/operations/*` | Operations queues, estimate/order audits and review work. |
| `/executive/*` | Pipeline, cash flow/runway and fixed-cost surfaces. |
| `/sales/*`, `/marketing/*`, `/system/*` | Department and system routes; live Sales paths may be owned by the CRM companion router. |
| `/agents`, `/api/system/sync-health` | Runtime and integration monitoring with authorization/readiness distinctions. |
| `/design-system/*` | Living tokens, components, decisions and agent handbook. |
| `/api/agent/*` | Authorized agent identities, queues and supported actions. |
| `/auth/*` | WorkOS sign-in/session flows. |
| `/oauth2/*` and reserved OAuth endpoints | Partial/reserved interfaces; do not infer a complete OAuth authorization server. |
| `/healthz` | Public liveness and build identity only. |

The authoritative route list is [`src/pages/`](src/pages/), not an exhaustive prose enumeration. A route's presence does not establish its production readiness. See the [CC/CRM proxy boundary](../../deployment/proxy/README.md) before changing `/sales` routing.

## Verification

```bash
npm test
npm run build
```

The root [Verify Command Center workflow](../../.github/workflows/verify.yml) additionally runs dependency audit, root self-heal checks and Edge observer/relay tests. Sentry upload credentials are optional for a local build; without them release/source-map upload is skipped with a warning.

Check `/healthz` for the deployed `buildCommit`, then verify protected API denials and approved authenticated workflows. Local tests, public liveness, live-data readiness and human/device acceptance are different evidence. The historical root `verify-deployment.sh` has not been reconciled with the current protected routes and reduced public-health response.

## Shared contracts

Read the [repository conventions](../../CONVENTIONS.md), [CRM companion boundary](../../docs/111-crm-pwa-companion-repo.md), [pricing/UOM silo rules](../../docs/105-price-agreement-silo-rules.md), [design system](../../docs/112-design-system-site.md) and [self-healing loop](../../docs/127-self-healing-loop.md). Shared migrations, ingestion functions, provider adapters and deployment files remain at their repository-level roots.
