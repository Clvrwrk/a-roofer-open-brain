import {CanonicalCrmClient} from '@proexteriors/crm-server';
import {resolveActorFromSessionUser, type CommandCenterActor} from './access-control';
import {attachCrmStaffSession} from './crm-staff.server';
import type {SessionResult} from './session.server';
import type {RuntimeEnv} from './runtime-env';

export type HumanAccess = {actor: CommandCenterActor; salesOnly: boolean};
/** Canonical Sales users cannot inherit the legacy open-access or domain grant.
 * Explicit existing back-office and named-agent rosters retain their permissions. */
export async function resolveCrmHumanAccess(result: SessionResult, env: RuntimeEnv, transport: typeof fetch = fetch): Promise<HumanAccess | null> {
  if (result.status !== 'authenticated') return null;
  if (env.CRM_CANONICAL_ENABLED !== 'true') {
    const actor = resolveActorFromSessionUser(result.user, env);
    return actor ? {actor, salesOnly: false} : null;
  }
  if (env.COMMAND_CENTER_AUTH_MODE !== 'workos' || result.user.emailVerified !== true) return null;
  const explicit = resolveActorFromSessionUser(result.user, {...env, COMMAND_CENTER_OPEN_ACCESS: 'false', COMMAND_CENTER_VIEWER_DOMAINS: ''});
  if (explicit) return {actor: explicit, salesOnly: false};
  if (env.CRM_SALES_WORKSPACE_ENABLED !== 'true' || !env.CRM_WORKOS_ORGANIZATION_ID || result.crmIdentity?.organizationId !== env.CRM_WORKOS_ORGANIZATION_ID) return null;
  const staff = attachCrmStaffSession('/api/sales/v1/session', {type: 'human', source: 'workos'}, result, env);
  if (!staff) return null;
  try {
    const session = await new CanonicalCrmClient({url: env.CRM_SUPABASE_URL ?? '', publishableKey: env.CRM_SUPABASE_PUBLISHABLE_KEY ?? '', accessToken: staff.accessToken}, transport).session(staff.csrfToken);
    if (!session.capabilities.includes('wip_read')) return null;
    return {salesOnly: true, actor: {
      id: session.membership_id, type: 'human', source: 'workos',
      displayName: [result.user.firstName, result.user.lastName].filter(Boolean).join(' ') || result.user.email,
      email: result.user.email, roles: ['human', session.role],
      permissions: ['command_center.read', 'desktop.command_center_ui'],
      departmentAccess: ['sales'], desktopEnabled: true,
    }};
  } catch { return null; }
}

/** Deliberately only the canonical WIP release. Unknown Sales routes must not
 * fall through to legacy service-role-backed department readers. */
export function salesOnlyRoute(path: string): 'allow' | 'redirect' | 'deny' {
  if (path.includes('%') || path.includes('\\') || path.includes('//')) return 'deny';
  if (path === '/' || path === '/sales' || path === '/sales/') return 'redirect';
  if (path === '/sales/wip-ar' || path === '/sales/wip-ar/' || path.startsWith('/api/sales/')) return 'allow';
  return 'deny';
}
