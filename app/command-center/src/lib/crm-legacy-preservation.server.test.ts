import {describe, it, expect, vi} from 'vitest';
import {resolvePreservedLegacyHuman} from './crm-legacy-preservation.server';
import {resolveActorFromSessionUser} from './access-control';
import {resolveCrmHumanAccess} from './crm-access.server';
import {attachCrmStaffSession} from './crm-staff.server';
import {canonicalHttp} from '@proexteriors/crm-server';
import type {SessionResult} from './session.server';

const entry = {subject: 'user-a', organization_id: 'org-a', email: 'existing@example.invalid'};
const roster = (identities: unknown[] = [entry]) => JSON.stringify({version: 1, identities});
const env = {COMMAND_CENTER_AUTH_MODE: 'workos', CRM_CANONICAL_ENABLED: 'true', CRM_WORKOS_ORGANIZATION_ID: 'org-a', COMMAND_CENTER_OPEN_ACCESS: 'true', CRM_LEGACY_BACKOFFICE_IDENTITIES: roster()};
const result: Extract<SessionResult, {status: 'authenticated'}> = {
  status: 'authenticated', user: {id: entry.subject, email: entry.email, firstName: 'Existing', lastName: 'User', emailVerified: true},
  refreshedSealedSession: null, crmIdentity: {subject: entry.subject, organizationId: entry.organization_id, sessionId: 'sid-a', accessToken: 'not-used-by-preservation'},
};

describe('exact existing-user back-office preservation', () => {
  it.each([
    {COMMAND_CENTER_OPEN_ACCESS: 'true'},
    {COMMAND_CENTER_OPEN_ACCESS: 'true', COMMAND_CENTER_ROLE_ACCOUNTING_EMAILS: entry.email},
    {COMMAND_CENTER_OPEN_ACCESS: 'false', COMMAND_CENTER_ROLE_ACCOUNTING_EMAILS: entry.email},
    {COMMAND_CENTER_OPEN_ACCESS: 'false', COMMAND_CENTER_ROLE_PURCHASING_EMAILS: entry.email},
    {COMMAND_CENTER_OPEN_ACCESS: 'false', COMMAND_CENTER_VIEWER_DOMAINS: 'example.invalid'},
  ])('retains exactly the effective prior actor for %j', override => {
    const configured = {...env, ...override};
    const actor = resolvePreservedLegacyHuman(result, configured);
    expect(actor).toEqual(resolveActorFromSessionUser(result.user, {...configured, CRM_CANONICAL_ENABLED: 'false'}));
    expect(actor?.roles).not.toContain('admin');
    expect(actor?.permissions).not.toContain('approval.decide_prod_write');
  });

  it('retains existing explicit production-write permission only when independently listed', () => {
    const configured = {...env, PROD_WRITE_APPROVER_EMAILS: entry.email};
    expect(resolvePreservedLegacyHuman(result, configured)).toEqual(resolveActorFromSessionUser(result.user, configured));
    expect(resolvePreservedLegacyHuman(result, env)?.permissions).not.toContain('approval.decide_prod_write');
  });

  it('cannot create a role when the legacy resolver denies access or revive the implicit default admin', () => {
    expect(resolvePreservedLegacyHuman(result, {...env, COMMAND_CENTER_OPEN_ACCESS: 'false'})).toBeNull();
    const admin = {...entry, email: 'admin@cc.proexteriorsus.net'};
    expect(resolvePreservedLegacyHuman({...result, user: {...result.user, email: admin.email}}, {...env, COMMAND_CENTER_OPEN_ACCESS: 'false', CRM_LEGACY_BACKOFFICE_IDENTITIES: roster([admin])})).toBeNull();
  });

  it.each([
    {...result, user: {...result.user, id: 'different-user'}},
    {...result, user: {...result.user, email: 'other@example.invalid'}},
    {...result, user: {...result.user, email: 'EXISTING@example.invalid'}},
    {...result, user: {...result.user, emailVerified: false}},
    {...result, user: {...result.user, emailVerified: undefined}},
    {...result, crmIdentity: undefined},
    {...result, crmIdentity: {...result.crmIdentity!, subject: 'different-user'}},
    {...result, crmIdentity: {...result.crmIdentity!, organizationId: 'other-org'}},
    {...result, crmIdentity: {...result.crmIdentity!, sessionId: ''}},
    {status: 'unauthenticated', reason: 'no_cookie'} as SessionResult,
  ])('rejects an untrusted or nonmatching identity %#', candidate => {
    expect(resolvePreservedLegacyHuman(candidate, env)).toBeNull();
  });

  it.each([
    {COMMAND_CENTER_AUTH_MODE: 'local'}, {CRM_CANONICAL_ENABLED: 'false'},
    {CRM_WORKOS_ORGANIZATION_ID: ''}, {CRM_WORKOS_ORGANIZATION_ID: 'other-org'},
  ])('requires configured verified WorkOS organization %j', override => {
    expect(resolvePreservedLegacyHuman(result, {...env, ...override})).toBeNull();
  });

  it.each([
    undefined, '', '{', 'null', '[]', '{}', JSON.stringify({version: 2, identities: [entry]}),
    '{"version":2,"version":1,"identities":[' + JSON.stringify(entry) + ']}',
    '{"version":2,"ver\\u0073ion":1,"identities":[' + JSON.stringify(entry) + ']}',
    '{"version":1,"identities":[{"subject":"other","subject":"user-a","organization_id":"org-a","email":"existing@example.invalid"}]}',
    JSON.stringify({version: 1, identities: [entry], extra: true}),
    roster([]), roster([entry, entry]), roster([entry, {...entry, subject: 'different-user'}]),
    roster([entry, {...entry, email: 'other@example.invalid'}]),
    roster([{...entry, role: 'admin'}]), roster([{...entry, subject: '*'}]),
    roster([{...entry, organization_id: '*'}]), roster([{...entry, email: '*@example.invalid'}]),
    roster([{...entry, email: '@example.invalid'}]), roster([{...entry, email: 'Existing@example.invalid'}]),
    roster([{...entry, email: ' existing@example.invalid'}]), roster([entry, null]),
    roster([entry, {...entry, subject: 'other-user', email: 'bad email'}]),
    roster(Array(201).fill(entry)), ' '.repeat(65_537),
  ])('does not grant from invalid, empty or ambiguous config %#', raw => {
    expect(resolvePreservedLegacyHuman(result, {...env, CRM_LEGACY_BACKOFFICE_IDENTITIES: raw})).toBeNull();
  });

  it('does not cache a removed preservation entry', () => {
    expect(resolvePreservedLegacyHuman(result, env)).not.toBeNull();
    expect(resolvePreservedLegacyHuman(result, {...env, CRM_LEGACY_BACKOFFICE_IDENTITIES: roster([])})).toBeNull();
  });

  it('never bypasses a missing canonical membership through a preserved roster', async () => {
    const transport=vi.fn(async()=>new Response(JSON.stringify({code:'42501'}),{status:403}));
    const claims={sub:entry.subject,org_id:entry.organization_id,sid:'sid-a',role:'member',exp:Date.now()/1000+600};
    const signed={...result,crmIdentity:{...result.crmIdentity!,accessToken:`header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`}};
    const configured={...env,CRM_SALES_WORKSPACE_ENABLED:'true',WORKOS_COOKIE_PASSWORD:'synthetic-cookie-password-longer-than-32-characters',COMMAND_CENTER_PUBLIC_URL:'https://cc.example',CRM_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',CRM_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',COMMAND_CENTER_HUMAN_ADMIN_EMAILS:entry.email};
    expect(await resolveCrmHumanAccess(signed,configured,transport)).toBeNull();expect(transport).toHaveBeenCalledOnce();
  });
  it('preserves exact existing back-office rights only after current operations verification, without returning token data',async()=>{
    const claims={sub:entry.subject,org_id:entry.organization_id,sid:'sid-a',role:'member',exp:Date.now()/1000+600};
    const signed={...result,crmIdentity:{...result.crmIdentity!,accessToken:`header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`}};
    const configured={...env,CRM_SALES_WORKSPACE_ENABLED:'true',WORKOS_COOKIE_PASSWORD:'synthetic-cookie-password-longer-than-32-characters',COMMAND_CENTER_PUBLIC_URL:'https://cc.example',CRM_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',CRM_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic'};
    const transport=vi.fn(async()=>new Response(JSON.stringify({membership_id:'00000000-0000-4000-8000-000000000001',organization_id:'00000000-0000-4000-8000-000000000002',role:'operations',capabilities:['wip_read'],design_system_version:'1.0.0'})));
    const access=await resolveCrmHumanAccess(signed,configured,transport);expect(access?.salesOnly).toBe(false);expect(access?.actor.id).toBe(entry.email);expect(access?.actor.roles).toEqual(['human','member']);expect(transport).toHaveBeenCalledOnce();expect(JSON.stringify(access)).not.toContain(signed.crmIdentity.accessToken);expect(access).not.toHaveProperty('crmStaffSession');
    const session=attachCrmStaffSession('/api/sales/v1/session',access!.actor,signed,configured);expect(session).toBeDefined();
    const denied=vi.fn(async()=>new Response(JSON.stringify({code:'42501'}),{status:403}));
    const response=await canonicalHttp({request:new Request('https://cc.example/api/sales/v1/session'),apiBase:'/api/sales',session,config:{enabled:true,url:configured.CRM_SUPABASE_URL,publishableKey:configured.CRM_SUPABASE_PUBLISHABLE_KEY,publicOrigin:'https://cc.example'},transport:denied});expect(response.status).toBe(403);expect(denied).toHaveBeenCalledOnce();
  });
});
