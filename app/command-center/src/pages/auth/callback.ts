import type { APIRoute } from "astro";
import { getRuntimeEnv } from "@lib/runtime-env";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, sanitizeReturnTo } from "@lib/session.server";
import { getWorkOs, getWorkOsConfigGaps } from "@lib/workos.server";

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const env = getRuntimeEnv();

  if (env.COMMAND_CENTER_AUTH_MODE !== "workos" || getWorkOsConfigGaps(env).length > 0) {
    return redirect("/", 302);
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return redirect("/auth/login", 302);
  }

  try {
    const { sealedSession } = await getWorkOs(env).userManagement.authenticateWithCode({
      clientId: env.WORKOS_CLIENT_ID!,
      code,
      session: {
        sealSession: true,
        cookiePassword: env.WORKOS_COOKIE_PASSWORD!,
      },
    });

    if (!sealedSession) {
      return redirect("/auth/login", 302);
    }

    cookies.set(SESSION_COOKIE, sealedSession, SESSION_COOKIE_OPTIONS);

    return redirect(sanitizeReturnTo(url.searchParams.get("state")), 302);
  } catch {
    // Never log the code or session material.
    return redirect("/auth/login", 302);
  }
};
