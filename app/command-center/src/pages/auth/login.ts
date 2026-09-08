import type { APIRoute } from "astro";
import { getRuntimeEnv } from "@lib/runtime-env";
import { sanitizeReturnTo } from "@lib/session.server";
import { getWorkOs, getWorkOsConfigGaps } from "@lib/workos.server";

import {createSalesLogin, isSalesLoginTarget, SALES_LOGIN_COOKIE, SALES_LOGIN_COOKIE_OPTIONS, salesLoginConfig} from '@lib/crm-sales-login.server';

export const prerender = false;

export const GET: APIRoute = ({ url, cookies, redirect }) => {
  const env = getRuntimeEnv();

  const requestedTarget = url.searchParams.get("returnTo");
  if (env.CRM_CANONICAL_ENABLED === 'true' || isSalesLoginTarget(requestedTarget)) {
    cookies.delete(SALES_LOGIN_COOKIE, SALES_LOGIN_COOKIE_OPTIONS);
    try {
      if (getWorkOsConfigGaps(env).length) throw new Error('sales_login_unconfigured');
      const config = salesLoginConfig(env), flow = createSalesLogin(config, requestedTarget ?? '/');
      const destination = getWorkOs(env).userManagement.getAuthorizationUrl({provider: 'authkit', clientId: config.clientId,
        redirectUri: config.redirectUri, organizationId: config.organizationId, screenHint: 'sign-in', state: flow.state,
        codeChallenge: flow.challenge, codeChallengeMethod: 'S256'});
      cookies.set(SALES_LOGIN_COOKIE, flow.cookie, {...SALES_LOGIN_COOKIE_OPTIONS, maxAge: 600});
      return redirect(destination, 302);
    } catch {
      return new Response('Staff sign-in configuration is unavailable.', {status: 503, headers: {'Cache-Control': 'no-store'}});
    }
  }
  // Legacy exchange exists only under explicit disablement, never an unset/invalid flag.
  if (env.CRM_CANONICAL_ENABLED !== 'false') return new Response('Staff sign-in configuration is unavailable.', {status: 503, headers: {'Cache-Control': 'no-store'}});
  // An explicitly legacy back-office login supersedes an unfinished bound flow.
  cookies.delete(SALES_LOGIN_COOKIE, SALES_LOGIN_COOKIE_OPTIONS);
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
