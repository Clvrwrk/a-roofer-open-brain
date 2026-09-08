import {createHash, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import type {RuntimeEnv} from './runtime-env';

export const SALES_LOGIN_COOKIE = '__Host-cc-sales-login';
export const SALES_LOGIN_COOKIE_OPTIONS = {path: '/', httpOnly: true, secure: true, sameSite: 'lax' as const};
const PREFIX = 'cc-sales.';
const TTL = 600_000;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export type SalesLoginConfig = {secret: string; clientId: string; organizationId: string; origin: string; redirectUri: string};

/** Detect Sales even when a malformed/encoded target must subsequently be rejected. */
export function isSalesLoginTarget(value: string | null | undefined): boolean {
  if (!value) return false;
  let candidate = value;
  for (let i = 0; i < 3; i++) {
    try {
      const pathname = new URL(candidate, 'https://cc.invalid').pathname;
      if (/^\/(?:api\/)?sales(?:\/|$)/.test(pathname)) return true;
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) return false;
      candidate = decoded;
    } catch { return false; }
  }
  return false;
}

export function salesLoginConfig(env: RuntimeEnv): SalesLoginConfig {
  const origin = env.COMMAND_CENTER_PUBLIC_URL ?? 'https://cc.proexteriorsus.net';
  const url = new URL(origin);
  if (env.COMMAND_CENTER_AUTH_MODE !== 'workos' || !env.WORKOS_CLIENT_ID || !env.CRM_WORKOS_ORGANIZATION_ID ||
      !env.WORKOS_COOKIE_PASSWORD || env.WORKOS_COOKIE_PASSWORD.length < 32 || url.protocol !== 'https:' || url.origin !== origin ||
      env.WORKOS_REDIRECT_URI !== origin + '/auth/callback') throw new Error('sales_login_configuration_invalid');
  return {secret: env.WORKOS_COOKIE_PASSWORD, clientId: env.WORKOS_CLIENT_ID, organizationId: env.CRM_WORKOS_ORGANIZATION_ID, origin, redirectUri: env.WORKOS_REDIRECT_URI};
}

function target(value: unknown): string {
  if (typeof value !== 'string' || value.length > 1024 || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20\x7f]/.test(value)) throw new Error('sales_login_target_invalid');
  const url = new URL(value, 'https://cc.invalid');
  if (url.origin !== 'https://cc.invalid' || url.pathname.includes('%') || /^\/(?:auth|login)(?:\/|$)/.test(url.pathname)) throw new Error('sales_login_target_invalid');
  return url.pathname + url.search;
}
const mac = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('base64url');
function equal(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createSalesLogin(config: SalesLoginConfig, returnTo: string, now = Date.now()) {
  const state = PREFIX + randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const payload = Buffer.from(JSON.stringify({version: 1, state, verifier, returnTo: target(returnTo), issuedAt: now, expires: now + TTL,
    clientId: config.clientId, organizationId: config.organizationId, origin: config.origin})).toString('base64url');
  return {state, challenge: createHash('sha256').update(verifier).digest('base64url'), cookie: payload + '.' + mac(payload, config.secret)};
}

/** Marked, pending or old unbound Sales states never use legacy exchange, even after disablement. Canonical mode requires this flow for all destinations. */
export function requiresSalesLogin(state: string | null, cookie: string | undefined): boolean {
  return cookie !== undefined || state?.startsWith(PREFIX) === true || isSalesLoginTarget(state);
}

export function consumeSalesLogin(config: SalesLoginConfig, cookie: string | undefined, state: string | null, now = Date.now()): {verifier: string; returnTo: string} {
  if (!cookie || cookie.length > 4096 || !state || !state.startsWith(PREFIX) || !TOKEN.test(state.slice(PREFIX.length))) throw new Error('sales_login_state_invalid');
  const [payload, signature, ...extra] = cookie.split('.');
  if (extra.length || !payload || !signature || !equal(signature, mac(payload, config.secret))) throw new Error('sales_login_state_invalid');
  const flow: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (!flow || typeof flow !== 'object' || Array.isArray(flow)) throw new Error('sales_login_state_invalid');
  const allowed = ['version', 'state', 'verifier', 'returnTo', 'issuedAt', 'expires', 'clientId', 'organizationId', 'origin'];
  if (Object.keys(flow).length !== allowed.length || Object.keys(flow).some(key => !allowed.includes(key)) ||
      !('version' in flow) || flow.version !== 1 || !('state' in flow) || typeof flow.state !== 'string' || !equal(flow.state, state) ||
      !('verifier' in flow) || typeof flow.verifier !== 'string' || !TOKEN.test(flow.verifier) ||
      !('issuedAt' in flow) || typeof flow.issuedAt !== 'number' || !Number.isSafeInteger(flow.issuedAt) || flow.issuedAt > now ||
      !('expires' in flow) || typeof flow.expires !== 'number' || !Number.isSafeInteger(flow.expires) || flow.expires <= now || flow.expires - flow.issuedAt !== TTL ||
      !('clientId' in flow) || flow.clientId !== config.clientId || !('organizationId' in flow) || flow.organizationId !== config.organizationId ||
      !('origin' in flow) || flow.origin !== config.origin || !('returnTo' in flow)) throw new Error('sales_login_state_invalid');
  return {verifier: flow.verifier, returnTo: target(flow.returnTo)};
}
