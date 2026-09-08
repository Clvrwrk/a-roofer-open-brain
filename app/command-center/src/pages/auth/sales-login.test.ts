import {beforeEach, describe, expect, it, vi} from 'vitest';
const d=vi.hoisted(()=>({env:{} as Record<string,string>,authorize:vi.fn(),exchange:vi.fn(),authenticate:vi.fn()}));
vi.mock('@lib/runtime-env',()=>({getRuntimeEnv:()=>d.env}));
vi.mock('@lib/workos.server',()=>({getWorkOs:()=>({userManagement:{getAuthorizationUrl:d.authorize,authenticateWithCode:d.exchange}}),getWorkOsConfigGaps:()=>['WORKOS_API_KEY','WORKOS_CLIENT_ID','WORKOS_COOKIE_PASSWORD','WORKOS_REDIRECT_URI'].filter(k=>!d.env[k])}));
vi.mock('@lib/session.server',async(original)=>({...await original<object>(),authenticateSession:d.authenticate}));
import {GET as login} from './login';
import {GET as callback} from './callback';
import {createSalesLogin, SALES_LOGIN_COOKIE, SALES_LOGIN_COOKIE_OPTIONS, salesLoginConfig} from '../../lib/crm-sales-login.server';
const verified=()=>({status:'authenticated',user:{id:'user_synthetic',email:'rep@example.invalid',emailVerified:true},crmIdentity:{subject:'user_synthetic',organizationId:'org_synthetic',sessionId:'synthetic',accessToken:'never-logged'},refreshedSealedSession:null});
function context(route:string,stored?:string){
 const values=new Map<string,string>();if(stored!==undefined)values.set(SALES_LOGIN_COOKIE,stored);
 return {url:new URL(route,'https://cc.example'),cookies:{get:vi.fn((k:string)=>values.has(k)?{value:values.get(k)}:undefined),set:vi.fn((k:string,v:string)=>{values.set(k,v);}),delete:vi.fn((k:string)=>{values.delete(k);})},redirect:(location:string,status:number)=>new Response(null,{status,headers:{location}})};
}
beforeEach(()=>{
 vi.clearAllMocks();d.env={CRM_CANONICAL_ENABLED:'true',COMMAND_CENTER_AUTH_MODE:'workos',WORKOS_API_KEY:'synthetic-api-key',WORKOS_CLIENT_ID:'client_synthetic',CRM_WORKOS_ORGANIZATION_ID:'org_synthetic',WORKOS_COOKIE_PASSWORD:'synthetic-cookie-secret-with-at-least-thirty-two-characters',COMMAND_CENTER_PUBLIC_URL:'https://cc.example',WORKOS_REDIRECT_URI:'https://cc.example/auth/callback'};
 d.authorize.mockReturnValue('https://auth.example/authorize');d.exchange.mockResolvedValue({user:{id:'user_synthetic'},sealedSession:'sealed-synthetic'});d.authenticate.mockResolvedValue(verified());
});
describe('Sales-scoped AuthKit route hardening',()=>{
 it.each(['/sales','/sales/wip-ar?cycle=synthetic','/api/sales/v1/session'])('starts org-bound PKCE only for %s',async target=>{
  const c=context('/auth/login?returnTo='+encodeURIComponent(target));expect((await login(c as never)).status).toBe(302);
  expect(d.authorize).toHaveBeenCalledWith(expect.objectContaining({provider:'authkit',clientId:'client_synthetic',organizationId:'org_synthetic',redirectUri:'https://cc.example/auth/callback',screenHint:'sign-in',codeChallengeMethod:'S256',codeChallenge:expect.any(String),state:expect.stringMatching(/^cc-sales\./)}));
  expect(c.cookies.set).toHaveBeenCalledWith(SALES_LOGIN_COOKIE,expect.any(String),{...SALES_LOGIN_COOKIE_OPTIONS,maxAge:600});
 });
 it('preserves legacy back-office authorize/exchange only when canonical mode is explicitly disabled',async()=>{
  d.env.CRM_CANONICAL_ENABLED='false';
  const c=context('/auth/login?returnTo=%2Faccounting%2Ffriday-wip','superseded');await login(c as never);
  expect(c.cookies.delete).toHaveBeenCalledWith(SALES_LOGIN_COOKIE,SALES_LOGIN_COOKIE_OPTIONS);
  expect(d.authorize).toHaveBeenCalledWith({provider:'authkit',clientId:'client_synthetic',redirectUri:'https://cc.example/auth/callback',state:'/accounting/friday-wip'});
  const result=await callback(context('/auth/callback?code=legacy-code&state=%2Faccounting%2Ffriday-wip') as never);
  expect(result.headers.get('location')).toBe('/accounting/friday-wip');expect(result.status).toBe(302);expect(d.exchange).toHaveBeenCalledWith({clientId:'client_synthetic',code:'legacy-code',session:{sealSession:true,cookiePassword:d.env.WORKOS_COOKIE_PASSWORD}});expect(d.authenticate).not.toHaveBeenCalled();
 });
 it.each(['/','/accounting/friday-wip','/operations','/executive'])('canonical mode binds all login destinations including %s',async target=>{
  const c=context('/auth/login?returnTo='+encodeURIComponent(target));await login(c as never);
  expect(d.authorize).toHaveBeenCalledWith(expect.objectContaining({organizationId:'org_synthetic',codeChallengeMethod:'S256',state:expect.stringMatching(/^cc-sales\./)}));
  const flow=createSalesLogin(salesLoginConfig(d.env),target);const result=await callback(context('/auth/callback?code=c&state='+flow.state,flow.cookie) as never);
  expect(result.status).toBe(303);expect(result.headers.get('location')).toBe(target);expect(d.exchange).toHaveBeenCalledWith(expect.objectContaining({codeVerifier:expect.any(String)}));
 });
 it('canonical login with no return target binds root, and callback state cannot select a weaker exchange',async()=>{
  await login(context('/auth/login') as never);expect(d.authorize).toHaveBeenCalledWith(expect.objectContaining({codeChallengeMethod:'S256'}));
  for(const state of ['', '/', '/accounting/friday-wip', '/operations', 'arbitrary']){
   const c=context('/auth/callback?code=unbound&state='+encodeURIComponent(state));expect((await callback(c as never)).status).toBe(400);expect(c.cookies.set).not.toHaveBeenCalled();
  }
  expect(d.exchange).not.toHaveBeenCalled();
 });
 it('unset/invalid canonical mode cannot expose legacy login or callback exchange',async()=>{
  for(const flag of ['', 'invalid']){d.env.CRM_CANONICAL_ENABLED=flag;expect((await login(context('/auth/login') as never)).status).toBe(503);expect((await callback(context('/auth/callback?code=c&state=%2Faccounting') as never)).status).toBe(503);}
  expect(d.authorize).not.toHaveBeenCalled();expect(d.exchange).not.toHaveBeenCalled();
 });
 it('explicit disablement does not downgrade marked Sales callbacks missing their transaction',async()=>{
  d.env.CRM_CANONICAL_ENABLED='false';expect((await callback(context('/auth/callback?code=c&state=cc-sales.invalid') as never)).status).toBe(400);expect(d.exchange).not.toHaveBeenCalled();
 });
 it('fails Sales closed on bad configuration before provider call',async()=>{
  d.env.CRM_WORKOS_ORGANIZATION_ID='';const result=await login(context('/auth/login?returnTo=%2Fsales') as never);expect(result.status).toBe(503);expect(result.headers.get('cache-control')).toBe('no-store');expect(d.authorize).not.toHaveBeenCalled();
 });
 it('rejects encoded Sales target rather than downgrade to legacy',async()=>{
  const result=await login(context('/auth/login?returnTo='+encodeURIComponent('/%73ales/wip-ar')) as never);expect(result.status).toBe(503);expect(d.authorize).not.toHaveBeenCalled();
 });
 it('consumes flow before exchange, sends its verifier, verifies sealed identity then sets existing host-only cookie',async()=>{
  const flow=createSalesLogin(salesLoginConfig(d.env),'/sales/wip-ar?cycle=synthetic');const c=context('/auth/callback?code=one-time-code&state='+flow.state,flow.cookie);
  d.exchange.mockImplementation(async options=>{expect(c.cookies.delete).toHaveBeenCalled();expect(options.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);return {user:{id:'user_synthetic'},sealedSession:'sealed-synthetic'};});
  d.authenticate.mockResolvedValue({...verified(),refreshedSealedSession:'fresh-sealed'});
  const result=await callback(c as never);expect(result.status).toBe(303);expect(result.headers.get('location')).toBe('/sales/wip-ar?cycle=synthetic');expect(d.authenticate).toHaveBeenCalledWith('sealed-synthetic',d.env);
  expect(c.cookies.set).toHaveBeenCalledWith('wos-session','fresh-sealed',{path:'/',httpOnly:true,secure:true,sameSite:'lax'});
 });
 it('rejects missing/wrong state, missing/tampered cookie, stale path-state and missing code before exchange',async()=>{
  const f=createSalesLogin(salesLoginConfig(d.env),'/sales');
  for(const [state,cookie,code] of [[f.state,undefined,'c'],[f.state,f.cookie+'x','c'],['cc-sales.invalid',f.cookie,'c'],['/sales',undefined,'c'],['/accounting',f.cookie,'c'],['',f.cookie,'c'],[f.state,f.cookie,'']]){
   const c=context('/auth/callback?code='+code+'&state='+state,cookie);const result=await callback(c as never);expect(result.status).toBe(400);expect(result.headers.get('cache-control')).toBe('no-store');expect(c.cookies.set).not.toHaveBeenCalled();
  }
  expect(d.exchange).not.toHaveBeenCalled();
 });
 it('rejects wrong-org, unverified, mismatched-subject, foreign-user and failed sealed sessions',async()=>{
  const v=verified(),f=createSalesLogin(salesLoginConfig(d.env),'/sales');
  for(const value of [{...v,crmIdentity:{...v.crmIdentity,organizationId:'other'}},{...v,user:{...v.user,emailVerified:false}},{...v,crmIdentity:{...v.crmIdentity,subject:'other'}},{...v,user:{...v.user,id:'other'},crmIdentity:{...v.crmIdentity,subject:'other'}},{status:'unauthenticated',reason:'invalid'},{...v,crmIdentity:undefined}]){
   d.authenticate.mockResolvedValueOnce(value);const c=context('/auth/callback?code=c&state='+f.state,f.cookie);expect((await callback(c as never)).status).toBe(400);expect(c.cookies.set).not.toHaveBeenCalled();
  }
 });
 it('handles provider failure without leaking code, verifier, session or error details',async()=>{
  d.exchange.mockRejectedValue(new Error('SECRET'));const f=createSalesLogin(salesLoginConfig(d.env),'/sales'),c=context('/auth/callback?code=SECRET&state='+f.state,f.cookie);const result=await callback(c as never);
  expect(result.status).toBe(400);expect(await result.text()).not.toContain('SECRET');expect(c.cookies.set).not.toHaveBeenCalled();expect(d.authenticate).not.toHaveBeenCalled();
 });
});
