import type { APIRoute } from "astro";
import { getRuntimeEnv } from "@lib/runtime-env";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, sanitizeReturnTo } from "@lib/session.server";
import { getWorkOs, getWorkOsConfigGaps } from "@lib/workos.server";

import {consumeSalesLogin, requiresSalesLogin, SALES_LOGIN_COOKIE, SALES_LOGIN_COOKIE_OPTIONS, salesLoginConfig} from '@lib/crm-sales-login.server';
import {authenticateSession} from '@lib/session.server';

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const env = getRuntimeEnv();

  const flowCookie = cookies.get(SALES_LOGIN_COOKIE)?.value;
  const state = url.searchParams.get('state');
  if (env.CRM_CANONICAL_ENABLED === 'true' || requiresSalesLogin(state, flowCookie)) {
    // Consume before any await. A missing/invalid Sales transaction never falls back.
    cookies.delete(SALES_LOGIN_COOKIE, SALES_LOGIN_COOKIE_OPTIONS);
    try {
      if (getWorkOsConfigGaps(env).length) throw new Error('sales_login_unconfigured');
      const config = salesLoginConfig(env), flow = consumeSalesLogin(config, flowCookie, state);
      const code = url.searchParams.get('code');
      if (!code || code.length > 4096) throw new Error('sales_login_code_invalid');
      const result = await getWorkOs(env).userManagement.authenticateWithCode({clientId: config.clientId, code, codeVerifier: flow.verifier,
        session: {sealSession: true, cookiePassword: config.secret}});
      if (!result.sealedSession) throw new Error('sales_login_session_missing');
      const verified = await authenticateSession(result.sealedSession, env);
      if (verified.status !== 'authenticated' || verified.user.emailVerified !== true || !verified.crmIdentity ||
          verified.crmIdentity.subject !== verified.user.id || verified.crmIdentity.organizationId !== config.organizationId ||
          verified.user.id !== result.user.id) throw new Error('sales_login_identity_invalid');
      cookies.set(SESSION_COOKIE, verified.refreshedSealedSession ?? result.sealedSession, SESSION_COOKIE_OPTIONS);
      return redirect(flow.returnTo, 303);
    } catch {
      return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Staff sign-in interrupted</title><main><h1>We could not complete sign-in</h1><p>Your login link may have expired or been replaced. Start again to sign in securely.</p><a href="/auth/login">Start sign-in again</a></main></html>', {status: 400, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
    }
  }
  if (env.CRM_CANONICAL_ENABLED !== 'false') return new Response('Staff sign-in configuration is unavailable.', {status: 503, headers: {'Cache-Control': 'no-store'}});
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
