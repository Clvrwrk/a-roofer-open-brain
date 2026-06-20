import { defineMiddleware } from "astro:middleware";
import * as Sentry from "@sentry/astro";
import {
  buildUnauthorizedResponse,
  localActor,
  resolveActorFromSessionUser,
  resolveServiceActorFromBearer,
} from "@lib/access-control";

// Attach the resolved actor to the current request's Sentry scope so each error names the
// account that hit it (id + email per the alpha decision). No-ops when Sentry isn't initialized.
function applySentryUser(actor: { id: string; type: string; displayName: string; email: string | null } | null) {
  if (!actor) return;
  Sentry.setUser({ id: actor.id, email: actor.email ?? undefined, username: actor.displayName });
  Sentry.setTag("actor.type", actor.type);
}
import { getRuntimeEnv } from "@lib/runtime-env";
import { prewarmSurfaceCaches } from "@lib/prewarm.server";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, authenticateSession } from "@lib/session.server";

prewarmSurfaceCaches();

/**
 * Routes that must stay reachable without a WorkOS session:
 * - /auth/*           login, callback, logout, denied
 * - /auth.md          agent discovery document
 * - /healthz          deployment health checks
 * - /.well-known/*    OAuth discovery metadata
 * - /agent/*          agent-auth placeholder endpoints (NOT /agents page; NOT /api/agent/*)
 * - /oauth2/*         agent OAuth token/revoke placeholders
 * - /api/agentmail/webhook  svix-signature-verified inbound webhook
 * - /submit-agreement/*      vendor magic-link page (single-claim uuid token = the auth)
 * - /api/price-agreement/submit/*  token-gated vendor submission endpoint
 */
const PUBLIC_PREFIXES = ["/auth/", "/.well-known/", "/agent/", "/oauth2/", "/_astro/", "/_image", "/submit-agreement/", "/api/price-agreement/submit/"];
const PUBLIC_EXACT = new Set(["/auth.md", "/healthz", "/api/agentmail/webhook"]);

function isPublicPath(pathname: string) {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isApiRequest(pathname: string) {
  return pathname.startsWith("/api/");
}

// Lightweight per-IP rate limit for the ONLY unauthenticated, DB-touching surface
// (the vendor magic-link page + submit endpoint). In-memory token bucket; per
// single-instance deploy this closes the cheap-flood vector against the shared
// prod DB without affecting the one legitimate vendor.
const RATE_LIMITED_PREFIXES = ["/submit-agreement/", "/api/price-agreement/submit/"];
const RL_WINDOW_MS = 60_000;
const RL_MAX = 60;
const rlBuckets = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function rateLimited(pathname: string, request: Request): boolean {
  if (!RATE_LIMITED_PREFIXES.some((p) => pathname.startsWith(p))) return false;
  const now = Date.now();
  const ip = clientIp(request);
  if (rlBuckets.size > 5000) for (const [k, v] of rlBuckets) if (v.resetAt < now) rlBuckets.delete(k);
  const b = rlBuckets.get(ip);
  if (!b || b.resetAt < now) { rlBuckets.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS }); return false; }
  b.count++;
  return b.count > RL_MAX;
}

function buildForbiddenJsonResponse() {
  return new Response(
    JSON.stringify({
      error: "forbidden",
      error_description: "This authenticated account is not authorized for the Command Center.",
    }),
    {
      status: 403,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    },
  );
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, request, cookies, locals, redirect } = context;
  const pathname = url.pathname;

  locals.actor = null;

  // 0. Rate-limit the unauthenticated magic-link surface (per-IP token bucket).
  if (rateLimited(pathname, request)) {
    return new Response(JSON.stringify({ error: "rate_limited", error_description: "Too many requests. Please slow down." }), {
      status: 429,
      headers: { "content-type": "application/json; charset=utf-8", "retry-after": "60", "cache-control": "no-store" },
    });
  }

  // 1. Public surface: discovery, health, auth flow, signed webhooks.
  if (isPublicPath(pathname)) {
    return next();
  }

  const env = getRuntimeEnv();

  // 2. Service agents: bearer token, API routes only.
  if (isApiRequest(pathname)) {
    const serviceActor = resolveServiceActorFromBearer(request, env);
    if (serviceActor) {
      locals.actor = serviceActor;
      applySentryUser(serviceActor);
      return next();
    }
  }

  // 3. Dev fallback: anything but explicit workos mode keeps the Local Operator.
  if (env.COMMAND_CENTER_AUTH_MODE !== "workos") {
    const actor = localActor();
    locals.actor = actor;
    applySentryUser(actor);
    return next();
  }

  // 4. WorkOS sealed-session check (refreshes expired access tokens).
  const sessionResult = await authenticateSession(cookies.get(SESSION_COOKIE)?.value, env);

  if (sessionResult.status !== "authenticated") {
    if (isApiRequest(pathname)) return buildUnauthorizedResponse();
    const returnTo = encodeURIComponent(`${pathname}${url.search}`);
    return redirect(`/auth/login?returnTo=${returnTo}`, 302);
  }

  const actor = resolveActorFromSessionUser(sessionResult.user, env);

  if (!actor) {
    // Authenticated identity, but not on any allowlist.
    if (isApiRequest(pathname)) return buildForbiddenJsonResponse();
    return redirect("/auth/denied", 302);
  }

  if (sessionResult.refreshedSealedSession) {
    cookies.set(SESSION_COOKIE, sessionResult.refreshedSealedSession, SESSION_COOKIE_OPTIONS);
  }

  locals.actor = actor;
  applySentryUser(actor);
  return next();
});
