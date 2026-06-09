import type { APIRoute } from "astro";
import { getRuntimeEnv } from "@lib/runtime-env";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  getSessionLogoutUrl,
  isSameOriginRequest,
} from "@lib/session.server";

export const prerender = false;

// GET must not log anyone out (link prefetchers); POST only, same-origin only.
export const GET: APIRoute = () =>
  new Response(JSON.stringify({ error: "method_not_allowed", error_description: "Use POST to sign out." }), {
    status: 405,
    headers: { allow: "POST", "content-type": "application/json; charset=utf-8" },
  });

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const env = getRuntimeEnv();

  // Global checkOrigin is disabled for agent OAuth POSTs, so enforce it here.
  if (!isSameOriginRequest(request, env)) {
    return new Response(
      JSON.stringify({ error: "forbidden", error_description: "Cross-origin sign-out is not allowed." }),
      { status: 403, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }

  const sessionData = cookies.get(SESSION_COOKIE)?.value;
  const logoutUrl = await getSessionLogoutUrl(sessionData, env);

  cookies.delete(SESSION_COOKIE, { path: SESSION_COOKIE_OPTIONS.path });

  return redirect(logoutUrl ?? "/", 302);
};
