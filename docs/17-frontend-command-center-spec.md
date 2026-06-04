# Frontend App Spec — Command Center (Astro SSR)

Status: draft v0.1 (for review)
Related: [15-prd-agent-platform.md](15-prd-agent-platform.md), [16-platform-architecture-and-topology.md](16-platform-architecture-and-topology.md), [`deployment/remote/dashboard/AUTH.md`](../deployment/remote/dashboard/AUTH.md), `config/brand/DESIGN.md`

The production Command Center. **Astro in SSR mode** was chosen for the smallest client attack surface and the lowest-rewrite path from the current vanilla "islands" — see the PRD for the rationale.

---

## 1. Stack

- **Astro (SSR, Node adapter)**, TypeScript, server-rendered pages with **interactive islands only where needed** (`client:visible`). Near-zero client JS otherwise.
- **WorkOS AuthKit** for human auth at the edge; sealed session cookie; server middleware guards every route.
- **Supabase** accessed **only from Astro server endpoints** with the service role — never in the browser (carries over the `serve.mjs` data layer).
- **Sentry** SDK (server + client) for errors/perf. **DESIGN.md** tokens for theming (navy authority, flag-red CTA, Inter).
- Deployed as a Coolify container on the CPX41 (TLS, health check, auto-restart).

## 2. Routes / views (migrated + new)

| Route | Source | Notes |
| --- | --- | --- |
| `/login`, `/auth/callback` | new | WorkOS AuthKit flow |
| `/` Command Center | prototype | work queues + packet preview |
| `/audits` Invoice Audits | prototype | live gate panel + actionable per-invoice table (paid/unpaid, override, set agreement / one-time price) |
| `/agreements` Price Agreements | prototype | currency matrix, add, CEO-approve, copy-email + blink, channel toggle |
| `/agreement-audit` Price Agreement Audit | prototype | per-agreement view → PDF + catalog (blended min/max/mean + lowest vendor) + line-by-line approval |
| `/territories` Vendor Territories | prototype | Google Maps island; miles |
| `/fleet` Fleet | prototype | vehicles, maintenance, compliance, drivers, fuel |
| `/settings` Settings | prototype | single-select, double-confirmed |
| `/agents` Agent Monitoring | **new** | agent status, last run, Hermes hygiene digest, Sentry health, queue depth |

## 3. Islands (port from current vanilla JS)

`territories.js`, `pricelists.js`, `agreementaudit.js`, `invoicegate.js`, `fleet.js` become Astro islands almost as-is. They already `fetch('/api/…')` — those endpoints move into Astro server routes. Keep islands small; everything privileged stays server-side.

## 4. Data layer

Astro server endpoints under `/api/*` replace `serve.mjs`, calling the existing Supabase RPCs (`territory_snapshot`, `price_list_snapshot`, `invoice_gate_snapshot`, `invoice_list`, `agreement_lines`, `catalog_snapshot`, `fleet_snapshot`, etc.). Each write route runs through the central `authorize(req, action)` guard (the WorkOS-role check that replaces today's permissive stub) and writes to `invoice_action_log` / agreement approval fields.

## 5. Security (the point of choosing Astro)

- **Auth enforced at the data layer**, not middleware-only: every `/api/*` route re-checks the WorkOS session + role server-side (defense against framework middleware-bypass classes of bug).
- **Strict CSP** + security headers (HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy); the Google Maps script is the only external allowance, scoped.
- **No service-role key, no Supabase admin client, no agent credentials in the browser.** The Maps browser key stays referrer-restricted.
- **Rate-limit** write endpoints; **audit-log** every privileged action with the WorkOS user id (replaces the manual "operator" field).
- Minimal dependency surface; Sentry scrubbing for PII/secrets.

## 6. Roles → access

Per `deployment/remote/dashboard/AUTH.md`: viewer (read dashboards), accounting (invoice payment), purchasing (agreements/territories/refresh), ceo/admin (approvals/settings/override). Read routes require any authenticated session; write routes require the action's allowed roles.

## 7. Build & deploy

Astro build → Node server container; Coolify deploy (env, TLS, health check at `/healthz`, auto-restart). Env names per `config/.env.example` (`WORKOS_*`, `SUPABASE_*`, `SENTRY_DSN`, `GOOGLE_MAPS_*`). The current `dist/` static app remains the offline fallback admin during cutover.

## 8. Migration path

1. Scaffold Astro SSR; move `index.html` layout → Astro layout with the navy rail + DESIGN.md tokens.
2. Port each island; move `/api/*` handlers from `serve.mjs` into Astro endpoints (logic unchanged).
3. Add WorkOS auth + middleware + the data-layer role checks.
4. Add CSP/security headers, Sentry, `/healthz`.
5. Build the new `/agents` monitoring view.
6. Coolify deploy; verify auth, gate enforcement, audit logging; cut over.
