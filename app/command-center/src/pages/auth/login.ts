import type { APIRoute } from "astro";
import { isLocalOperatorFallbackAllowed } from "@lib/access-control";
import { getRuntimeEnv } from "@lib/runtime-env";
import { sanitizeReturnTo } from "@lib/session.server";
import { getWorkOs, getWorkOsConfigGaps } from "@lib/workos.server";

export const prerender = false;

export const GET: APIRoute = ({ url, redirect }) => {
  const env = getRuntimeEnv();

  if (env.COMMAND_CENTER_AUTH_MODE !== "workos") {
    // Sending the browser back to "/" is only safe when the Local Operator fallback will
    // actually pick it up there; otherwise the middleware bounces it straight back here and
    // the two redirects loop. A mode that is neither "workos" nor an allowed dev fallback is
    // a misconfiguration, so say so instead of spinning.
    if (isLocalOperatorFallbackAllowed(env)) return redirect("/", 302);
    return new Response(
      JSON.stringify({
        error: "auth_misconfigured",
        error_description:
          "COMMAND_CENTER_AUTH_MODE is neither \"workos\" nor an allowed Local Operator mode, so no sign-in path exists. Set COMMAND_CENTER_AUTH_MODE=workos.",
      }),
      { status: 503, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } },
    );
  }

  const gaps = getWorkOsConfigGaps(env);
  if (gaps.length > 0) {
    return new Response(
      JSON.stringify({
        error: "auth_unconfigured",
        error_description: `WorkOS auth mode is enabled but configuration is incomplete: ${gaps.join(", ")}.`,
      }),
      { status: 503, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } },
    );
  }

  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));

  const authorizationUrl = getWorkOs(env).userManagement.getAuthorizationUrl({
    provider: "authkit",
    clientId: env.WORKOS_CLIENT_ID!,
    redirectUri: env.WORKOS_REDIRECT_URI!,
    state: returnTo,
  });

  return redirect(authorizationUrl, 302);
};
