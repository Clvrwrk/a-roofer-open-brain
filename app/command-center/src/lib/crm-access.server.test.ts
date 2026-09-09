import {describe, it, expect, vi} from 'vitest';
import {resolveCrmHumanAccess, salesOnlyRoute} from './crm-access.server';
import type {SessionResult} from './session.server';
const claims = {sub:'user-a',org_id:'org-a',sid:'session-a',role:'member',exp:Date.now()/1000+600};
const accessToken=`header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
const result:SessionResult={status:'authenticated',user:{id:'user-a',email:'rep@example.invalid',firstName:'Test',lastName:'Rep',emailVerified:true},refreshedSealedSession:null,crmIdentity:{accessToken,subject:claims.sub,organizationId:claims.org_id,sessionId:claims.sid}};
const env={COMMAND_CENTER_AUTH_MODE:'workos',CRM_CANONICAL_ENABLED:'true',CRM_SALES_WORKSPACE_ENABLED:'true',CRM_WORKOS_ORGANIZATION_ID:'org-a',COMMAND_CENTER_OPEN_ACCESS:'true',COMMAND_CENTER_VIEWER_DOMAINS:'example.invalid',WORKOS_COOKIE_PASSWORD:'a-synthetic-password-longer-than-32-characters',COMMAND_CENTER_PUBLIC_URL:'https://cc.example',CRM_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',CRM_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic'};
const membership={membership_id:'00000000-0000-4000-8000-000000000001',organization_id:'00000000-0000-4000-8000-000000000002',role:'sales_rep',capabilities:['wip_read'],design_system_version:'1.0.0'};
const response=(data:unknown,status=200)=>vi.fn(async()=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}})) as unknown as typeof fetch;
describe('canonical Sales access',()=>{
 it.each(['sales_rep','manager','project_manager'])('denies canonical %s on CC despite blanket/domain/explicit legacy admin grants',async(role)=>{
  for(const override of [{},{COMMAND_CENTER_HUMAN_ADMIN_EMAILS:result.user.email},{COMMAND_CENTER_ROLE_ACCOUNTING_EMAILS:result.user.email}]){
   const transport=response({...membership,role});expect(await resolveCrmHumanAccess(result,{...env,...override},transport)).toBeNull();expect(transport).toHaveBeenCalledOnce();
  }
 });
 it('gives the verified canonical global administrator full CC authority without an email roster',async()=>{
  const transport=response({...membership,role:'admin'});const access=await resolveCrmHumanAccess(result,{...env,COMMAND_CENTER_OPEN_ACCESS:'false',COMMAND_CENTER_VIEWER_DOMAINS:''},transport);
  expect(access?.salesOnly).toBe(false);expect(access?.actor.id).toBe(membership.membership_id);expect(access?.actor.departmentAccess).toBe('all');expect(access?.actor.roles).toContain('admin');expect(transport).toHaveBeenCalledOnce();
 });
 it('keeps an unlisted canonical operations reader within Sales',async()=>{
  const access=await resolveCrmHumanAccess(result,env,response({...membership,role:'operations'}));expect(access?.salesOnly).toBe(true);expect(access?.actor.departmentAccess).toEqual(['sales']);
 });
 it('rejects unverified email even on an explicit admin roster and rejects incompatible auth mode',async()=>{expect(await resolveCrmHumanAccess({...result,user:{...result.user,emailVerified:false}},{...env,COMMAND_CENTER_HUMAN_ADMIN_EMAILS:result.user.email},response(membership))).toBeNull();expect(await resolveCrmHumanAccess(result,{...env,COMMAND_CENTER_AUTH_MODE:'local'},response(membership))).toBeNull();});
 it('requires current canonical operations authority before retaining explicit back-office access',async()=>{
  const configured={...env,COMMAND_CENTER_HUMAN_ADMIN_EMAILS:result.user.email};
  expect(await resolveCrmHumanAccess(result,configured,response({code:'42501'},403))).toBeNull();
  const transport=response({...membership,role:'operations'});const access=await resolveCrmHumanAccess(result,configured,transport);
  expect(access?.salesOnly).toBe(false);expect(access?.actor.departmentAccess).toBe('all');expect(transport).toHaveBeenCalledOnce();
 });
 it.each(['COMMAND_CENTER_HUMAN_ADMIN_EMAILS','COMMAND_CENTER_ROLE_ACCOUNTING_EMAILS','COMMAND_CENTER_ROLE_PURCHASING_EMAILS'])('requires organization and subject continuity before explicit %s grants',async(key)=>{
  for(const identity of [undefined,{...result.crmIdentity!,organizationId:'other-org'},{...result.crmIdentity!,subject:'other-user'},{...result.crmIdentity!,sessionId:''}]){
   const transport=response(membership);
   expect(await resolveCrmHumanAccess({...result,crmIdentity:identity},{...env,[key]:result.user.email},transport)).toBeNull();
   expect(transport).not.toHaveBeenCalled();
  }
 });
 it.each([401,403,500])('fails closed on canonical %s including revoked membership',async(status)=>{expect(await resolveCrmHumanAccess(result,env,response({code:'42501'},status))).toBeNull();});
 it('fails closed on network errors and malformed successful responses',async()=>{
  expect(await resolveCrmHumanAccess(result,env,vi.fn(async()=>{throw Error('offline');}) as typeof fetch)).toBeNull();
  expect(await resolveCrmHumanAccess(result,env,response({role:'admin'}))).toBeNull();
 });
 it('requires exact organization, verified staff identity and enabled shared UI',async()=>{
  for(const override of [{CRM_WORKOS_ORGANIZATION_ID:'wrong'},{CRM_WORKOS_ORGANIZATION_ID:''},{CRM_SALES_WORKSPACE_ENABLED:'false'}]){const transport=response(membership);expect(await resolveCrmHumanAccess(result,{...env,...override},transport)).toBeNull();expect(transport).not.toHaveBeenCalled();}
  expect(await resolveCrmHumanAccess({...result,crmIdentity:undefined},env,response(membership))).toBeNull();
 });
 it('does not cache a formerly authorized member across requests',async()=>{const transport=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({...membership,role:'operations'}))).mockResolvedValueOnce(new Response(JSON.stringify({code:'42501'}),{status:403}));expect(await resolveCrmHumanAccess(result,env,transport)).not.toBeNull();expect(await resolveCrmHumanAccess(result,env,transport)).toBeNull();});
 it('allows only WIP and canonical API; rejects legacy department/unknown Sales/encoded paths',()=>{
  for(const path of ['/','/sales','/sales/'])expect(salesOnlyRoute(path)).toBe('redirect');
  for(const path of ['/sales/wip-ar','/sales/wip-ar/','/api/sales/v1/session'])expect(salesOnlyRoute(path)).toBe('allow');
  for(const path of ['/accounting','/api/accounting','/operations','/executive','/api/agent/work-queue','/sales/pipeline','/sales/unknown','/sales/wip-ar-other','/api/sales-other','/api/sales/%2e%2e/accounting','/sales%2fwip-ar','/sales//wip-ar','/sales\\wip-ar'])expect(salesOnlyRoute(path)).toBe('deny');
 });
});

it('denies implicit admin fallback and membership without WIP access',async()=>{expect(await resolveCrmHumanAccess({...result,user:{...result.user,email:'admin@cc.proexteriorsus.net'}},env,response({code:'42501'},403))).toBeNull();expect(await resolveCrmHumanAccess(result,env,response({...membership,role:'operations',capabilities:[]}))).toBeNull();});
