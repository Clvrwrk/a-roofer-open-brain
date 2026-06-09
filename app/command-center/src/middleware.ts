import { defineMiddleware } from "astro:middleware";
import {
  buildUnauthorizedResponse,
  localActor,
  resolveActorFromSessionUser,
  resolveServiceActorFromBearer,
} from "@lib/access-control";
import { getRuntimeEnv } from "@lib/runtime-env";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, authenticateSession } from "@lib/session.server";

/**
 * Routes that must stay reachable without a WorkOS session:
 * - /auth/*           login, callback, logout, denied
 * - /auth.md          agent discovery document
 * - /healthz          deployment health checks
 * - /.well-known/*    OAuth discovery metadata
 * - /agent/*          agent-auth placeholder endpoints (NOT /agents page; NOT /api/agent/*)
 * - /oauth2/*         agent OAuth token/revoke placeholders
 * - /api/agentmail/webhook  svix-signature-verified inbound webhook
 */
const PUBLIC_PREFIXES = ["/auth/", "/.well-known/", "/agent/", "/oauth2/", "/_astro/", "/_image"];
const PUBLIC_EXACT = new Set(["/auth.md", "/healthz", "/api/agentmail/webhook"]);

function isPublicPath(pathname: string) {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isApiRequest(pathname: string) {
  return pathname.startsWith("/api/");
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
      return next();
    }
  }

  // 3. Dev fallback: anything but explicit workos mode keeps the Local Operator.
  if (env.COMMAND_CENTER_AUTH_MODE !== "workos") {
    locals.actor = localActor();
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
  return next();
});
