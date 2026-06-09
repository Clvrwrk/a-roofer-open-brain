import type { APIRoute } from "astro";
import { getRuntimeEnv } from "@lib/runtime-env";
import { sanitizeReturnTo } from "@lib/session.server";
import { getWorkOs, getWorkOsConfigGaps } from "@lib/workos.server";

export const prerender = false;

export const GET: APIRoute = ({ url, redirect }) => {
  const env = getRuntimeEnv();

  if (env.COMMAND_CENTER_AUTH_MODE !== "workos") {
    return redirect("/", 302);
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
