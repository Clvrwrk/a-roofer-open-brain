# WorkOS AuthKit Human Auth — Spec and Build Plan

**Target:** fully functional WorkOS authentication for `https://cc.proexteriorsus.net`
**Date:** 2026-06-09
**Status:** approved spec, ready to build
**Supersedes:** the header-trust placeholder in `app/command-center/src/lib/access-control.ts` and the auth notes in `deployment/remote/dashboard/AUTH.md` (which targeted the retired static dashboard).

---

## 1. Flow at a glance

```
Browser                    Command Center (Astro SSR)              WorkOS
  |                              |                                   |
  |-- GET /any-page ------------>| middleware: no valid session      |
  |<- 302 /auth/login -----------|                                   |
  |-- GET /auth/login ---------->| getAuthorizationUrl(authkit)      |
  |<- 302 AuthKit hosted UI -----|---------------------------------->|
  |          (email+password / Google / magic code, MFA)             |
  |<-------------- 302 /auth/callback?code=... ----------------------|
  |-- GET /auth/callback ------->| authenticateWithCode + sealSession|
  |<- Set-Cookie: wos-session ---| map email -> role -> actor        |
  |<- 302 returnTo ----------... |                                   |
  |-- later requests ----------->| middleware: authenticate()        |
  |                              |   expired? refresh() + re-set     |
  |                              |   locals.actor for pages + APIs   |
  |-- POST /auth/logout -------->| getLogoutUrl(), clear cookie      |
  |<- 302 WorkOS logout -> home  |                                   |
```

Service agents are untouched: `Authorization: Bearer <token>` against `/api/agent/*` keeps resolving through `resolveServiceActorFromToken()` before any session check.

## 2. Decisions (interview 2026-06-09)

| Decision | Choice |
| --- | --- |
| Sign-in methods | Email+password, Google OAuth, magic code — all enabled in AuthKit |
| MFA | Required for humans; named agents exempt (see §7 caveat) |
| Launch roster | Humans (Chris admin/ceo; Roberto purchasing; Lucinda accounting) **and** the 7 named agents |
| Role source | Env-based email→role allowlist (phase 1); WorkOS RBAC later |
| Unknown authenticated email | Allowed as **viewer**, but only if the email domain is on `COMMAND_CENTER_VIEWER_DOMAINS`; otherwise 403. Open Google OAuth + open viewer would otherwise admit any Google account |
| Local dev | `COMMAND_CENTER_AUTH_MODE=disabled` keeps the Local Operator path; production pins `workos` |
| agent-auth OAuth runtime (`auth.md` POSTs, JWKS, assertions) | **Out of scope.** Discovery placeholders stay `not_implemented` |

## 3. Current state (what this build replaces)

- `COMMAND_CENTER_AUTH_MODE=disabled` in production → every visitor is a full-permission Local Operator.
- `resolveWorkOsActorFromHeaders()` trusts `x-workos-user-email` / `x-forwarded-email` headers that nothing sets. Spoofable on the public origin. **Must be removed**, not kept as fallback.
- No WorkOS SDK in `package.json`, no `/auth/*` routes, no `src/middleware.ts`, no session cookie.
- `astro.config.mjs` has `security.checkOrigin: false` (needed for agent OAuth POSTs), so auth routes must do their own origin/CSRF checks.
- Pages render without any gate; only `/api/agent/*` routes call `resolveCommandCenterActor()`.

## 4. WorkOS dashboard configuration (manual, ~15 min)

1. In the WorkOS dashboard, use (or create) a **production environment** for Pro Exteriors Command Center.
2. **Authentication methods:** enable Email+Password, Google OAuth, and Magic Auth (email code). Leave SSO off.
3. **MFA:** set TOTP to *Optional* at the environment level for launch (see §7 for why), with human enrollment enforced operationally.
4. **Redirects:**
   - Redirect URI: `https://cc.proexteriorsus.net/auth/callback` (default)
   - App homepage / sign-in endpoint: `https://cc.proexteriorsus.net/auth/login`
   - Sign-out redirect: `https://cc.proexteriorsus.net/`
5. **Sessions:** set maximum session length (recommend 7 days) and inactivity timeout (recommend 24 h). Access tokens refresh roughly every 5 minutes via the SDK; the middleware handles that.
6. Copy the **API key** and **Client ID** for the env contract below.
7. **Provision users:** create the 3 human users and 7 named-agent users (emails in §8). Send password-set invites for humans; set strong generated passwords for agents and store them in the agent desktop vault.

## 5. Environment contract

Names already exist in `config/.env.example`; values go into Coolify app env (never committed).

```bash
COMMAND_CENTER_AUTH_MODE=workos
WORKOS_API_KEY=sk_...
WORKOS_CLIENT_ID=client_...
WORKOS_REDIRECT_URI=https://cc.proexteriorsus.net/auth/callback
WORKOS_COOKIE_PASSWORD=<openssl rand -base64 32>   # >=32 chars

# Phase-1 role allowlists (new names; add to .env.example as placeholders)
COMMAND_CENTER_HUMAN_ADMIN_EMAILS=chussey@cleverwork.io,chussey@aia4.io
COMMAND_CENTER_ROLE_PURCHASING_EMAILS=roberto@proexteriorsus.com
COMMAND_CENTER_ROLE_ACCOUNTING_EMAILS=lucinda@proexteriorsus.com
COMMAND_CENTER_VIEWER_DOMAINS=proexteriorsus.com,proexteriorsus.net,cleverwork.io,aia4.io
```

Update `config/.env.example`: change the `WORKOS_REDIRECT_URI` placeholder from the `CLIENT.brain.cleverwork.io` pattern to the `cc.proexteriorsus.net` callback, and add the three new role/domain variables as names-only placeholders.

## 6. Implementation plan (files)

All paths under `app/command-center/`. Additive; no schema changes; no destructive edits.

### 6.1 `package.json`
Add dependency `@workos-inc/node` (v8+; provides `loadSealedSession`, `authenticate`, `refresh`, `getLogoutUrl`).

### 6.2 New `src/lib/workos.server.ts`
Server-only singleton:

```ts
import { WorkOS } from "@workos-inc/node";
import { getRuntimeEnv } from "@lib/runtime-env";

let client: WorkOS | null = null;
export function getWorkOs() {
  const env = getRuntimeEnv();
  if (!client) client = new WorkOS(env.WORKOS_API_KEY, { clientId: env.WORKOS_CLIENT_ID });
  return client;
}
```

### 6.3 New `src/lib/session.server.ts`
- `SESSION_COOKIE = "wos-session"`, cookie options `{ path: "/", httpOnly: true, secure: true, sameSite: "lax" }`.
- `getSessionFromCookie(cookies)` → `workos.userManagement.loadSealedSession({ sessionData, cookiePassword })`.
- `authenticateOrRefresh(cookies)` → calls `session.authenticate()`; on failure (other than missing cookie) attempts `session.refresh()` and returns `{ user, sealedSession? }` so callers can re-set the cookie. Fail-closed on any error.
- `buildLoginRedirect(returnTo)` and `sanitizeReturnTo(value)` — only same-origin relative paths (must start with `/`, no `//`, no `\`); anything else falls back to `/`.

### 6.4 New auth routes
- `src/pages/auth/login.ts` (GET): `getAuthorizationUrl({ provider: "authkit", redirectUri, clientId, state: <sanitized returnTo> })` → 302.
- `src/pages/auth/callback.ts` (GET): exchange `code` via `authenticateWithCode({ code, clientId, session: { sealSession: true, cookiePassword } })`; set `wos-session` cookie; 302 to sanitized `state` returnTo or `/`. On error → 302 `/auth/login`. Never log the code or sealed session.
- `src/pages/auth/logout.ts` (POST): manual same-origin check (`Origin`/`Referer` must match `COMMAND_CENTER_PUBLIC_URL`, since global `checkOrigin` is off) → `session.getLogoutUrl()`, clear cookie, 302. GET requests get 405 so prefetchers can't log users out.
- `src/pages/auth/denied.astro`: access-denied page for authenticated-but-unauthorized users (bad domain), with a logout button.

### 6.5 New `src/middleware.ts` (Astro middleware — the gate)
Order of checks per request:

1. **Public paths** — always pass: `/auth/*`, `/healthz`, `/auth.md`, `/.well-known/*`, `/agent/*`, `/oauth2/*`, `/api/agentmail/webhook` (svix-verified), and `/_astro/*` + static assets.
2. **Bearer token** — if `Authorization: Bearer` resolves a service agent, set `locals.actor` and pass (API routes only).
3. **Mode check** — if `COMMAND_CENTER_AUTH_MODE !== "workos"`, set `locals.actor = localActor()` and pass (dev fallback).
4. **Session** — `authenticateOrRefresh`. Valid: map email→actor (§6.6), re-set cookie if refreshed, set `locals.actor`, pass. Authenticated but domain-rejected: 302 `/auth/denied` (403 JSON for `/api/*`). Invalid/missing: pages → 302 `/auth/login?returnTo=<path>`; `/api/*` → existing `buildUnauthorizedResponse()`.

Type `locals.actor` in `src/env.d.ts` (`App.Locals`).

### 6.6 Modify `src/lib/access-control.ts`
- **Delete** `resolveWorkOsActorFromHeaders()` and `getWorkOsEmailFromHeaders()` — the spoofable header path goes away entirely.
- Add `resolveActorFromWorkOsUser(user, env)`:
  - email matches `NAMED_AGENT_IDENTITIES` → named-agent actor (existing permissions).
  - email on admin list → human actor, roles `["human","admin","ceo"]`, all permissions, all departments.
  - email on purchasing list → roles `["human","purchasing"]`, permissions: read + `approval.decide` scoped to `departmentAccess: ["accounting","operations"]` (vendor agreements, price refresh, territories).
  - email on accounting list → roles `["human","accounting"]`, `approval.decide` with `departmentAccess: ["accounting"]`.
  - email domain on `COMMAND_CENTER_VIEWER_DOMAINS` → roles `["human","viewer"]`, permissions `["command_center.read","work_queue.read"]`, all departments read-only.
  - otherwise → `null` (middleware sends to `/auth/denied`).
- `resolveCommandCenterActor(request, env, sessionUser?)` keeps its bearer-token-first order but takes the session user from middleware instead of reading identity headers.

Note this tightens the current model: humans stop being uniformly all-powerful; purchasing/accounting get department-scoped `approval.decide`. The human-gate policy in `docs/32` is unchanged — it just becomes enforceable per role.

### 6.7 Modify `src/lib/auth.ts`
`getCommandCenterUser()` gains a session-derived variant used by `AppShell.astro`: real name/email/role from `locals.actor`, plus `authMode: "workos"`. Local fallback unchanged.

### 6.8 Modify `src/layouts/AppShell.astro`
Show signed-in identity (name + role chip) and a logout button (POST form to `/auth/logout`). When `authMode === "local"`, show the existing Local Operator badge so dev mode is visibly distinct.

### 6.9 API route cleanup
`/api/agent/session`, `/api/agent/work-queue*`, and `/api/accounting/.../mark-paid` switch from calling `resolveCommandCenterActor(request)` directly to reading `locals.actor` set by middleware (single resolution per request, no header path). `mark-paid` already enforces `approval.decide` + accounting department; that check stays. `/api/product-surface.json` is currently **unauthenticated** — middleware closes that hole automatically since it is not on the public-path list (it returns sanitized data, but it should still sit behind the gate once the origin is public).

## 7. MFA caveat (honest limitation)

WorkOS AuthKit's TOTP requirement is configured per environment, not per user. "Required" would force the 7 agent accounts to enroll TOTP, which is brittle on Orgo desktops. Phase-1 policy:

- Dashboard MFA = **Optional**.
- Chris, Roberto, Lucinda enroll TOTP at first login (operational requirement, verify in WorkOS Users view).
- Agent accounts: long random passwords in the desktop vault, no TOTP.
- Revisit when WorkOS per-user/per-role MFA policies or a second environment for agents becomes worth the overhead. If hard enforcement becomes mandatory sooner, the alternative is storing agent TOTP secrets in the vault and automating code entry.

## 8. Account provisioning roster

| Account | Role mapping | MFA |
| --- | --- | --- |
| chussey@cleverwork.io, chussey@aia4.io | admin/ceo (env allowlist) | TOTP required (operational) |
| roberto@proexteriorsus.com (Roberto Huerta) | purchasing | TOTP required |
| lucinda@proexteriorsus.com (Lucinda Dunn) | accounting | TOTP required |
| maya.chen@cc.proexteriorsus.net | named agent (code roster) | none |
| alex.rivers@cc.proexteriorsus.net | named agent | none |
| casey.morgan@cc.proexteriorsus.net | named agent | none |
| rowan.vale@cc.proexteriorsus.net | named agent | none |
| lena.brooks@cc.proexteriorsus.net | named agent | none |
| jordan.price@cc.proexteriorsus.net | named agent (workspace-only) | none |
| sam.torres@cc.proexteriorsus.net | named agent (workspace-only) | none |

Named-agent mailboxes must be able to receive WorkOS verification email (Magic Auth/verification goes to `@cc.proexteriorsus.net` — confirm AgentMail or workspace routing delivers these before agent first-login day).

## 9. Build order, verification, rollback

### Phase A — code (no production impact; mode stays `disabled`)
1. Add SDK, `workos.server.ts`, `session.server.ts`.
2. Add `/auth/login`, `/auth/callback`, `/auth/logout`, `/auth/denied`.
3. Add `src/middleware.ts` + `env.d.ts` locals typing.
4. Rework `access-control.ts` (delete header trust, add role mapping), `auth.ts`, `AppShell.astro`, API routes.
5. `npm run check` (Astro build) passes; with mode=disabled, local dev behaves exactly as today.

### Phase B — WorkOS dashboard + staging verification
6. Dashboard config per §4; provision Chris's user only.
7. Optional local verification with a second redirect URI `http://127.0.0.1:4326/auth/callback` in the WorkOS staging environment.
8. Deploy to Coolify with full env (§5) but `COMMAND_CENTER_AUTH_MODE=workos`; verify before announcing.

### Phase C — verification checklist (production)
- [ ] `curl -s https://cc.proexteriorsus.net/healthz` → 200 without auth.
- [ ] Unauthenticated `GET /` → 302 to `/auth/login` → AuthKit hosted page.
- [ ] Chris signs in (each method: password, Google, magic code) → lands on returnTo, identity chip correct, role admin.
- [ ] Unauthenticated `GET /api/agent/session` → 401 JSON.
- [ ] Service bearer token against `/api/agent/session` → 200, service actor (unchanged path).
- [ ] Spoof check: `curl -H "x-workos-user-email: attacker@evil.com" https://cc.proexteriorsus.net/api/agent/session` → 401 (header path deleted).
- [ ] Gmail account not on any list → `/auth/denied`, no data access.
- [ ] Wait >5 min, navigate → session silently refreshes (no login bounce).
- [ ] Logout → WorkOS sign-out → redirected home, then `GET /` → login redirect.
- [ ] `GET /auth.md` and `/.well-known/*` still public; agent POST endpoints still `not_implemented`.

### Phase D — roster rollout
9. Provision Roberto + Lucinda (TOTP) and the 7 agent accounts; add allowlist envs; verify purchasing/accounting users can decide only in their departments and viewers cannot decide anything.
10. One named agent (Maya) logs in from her Orgo desktop; verify named-agent permission set (no `approval.decide`).

### Rollback
Set `COMMAND_CENTER_AUTH_MODE=disabled` in Coolify and redeploy — instant return to current behavior. No data migrations involved.

## 10. Out of scope (explicit)

- agent-auth OAuth runtime: `/agent/auth*` and `/oauth2/*` POSTs, service-signed assertions, JWKS, replay protection (docs/25 §Required Runtime Build).
- WorkOS Organizations/RBAC, SSO/SCIM, per-user MFA policy.
- Vault-backed per-agent service tokens (docs/32 follow-up).
- Supabase RLS changes — the service-role boundary is unchanged; WorkOS gates the human, the app authorizes the action.
