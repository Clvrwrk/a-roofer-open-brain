import {createHash, createHmac} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {consumeSalesLogin, createSalesLogin, isSalesLoginTarget, requiresSalesLogin, salesLoginConfig} from './crm-sales-login.server';
const env = {COMMAND_CENTER_AUTH_MODE:'workos',WORKOS_CLIENT_ID:'client_synthetic',CRM_WORKOS_ORGANIZATION_ID:'org_synthetic',WORKOS_COOKIE_PASSWORD:'synthetic-cookie-secret-with-at-least-thirty-two-characters',COMMAND_CENTER_PUBLIC_URL:'https://cc.example',WORKOS_REDIRECT_URI:'https://cc.example/auth/callback'};
const config=salesLoginConfig(env),now=1_800_000_000_000;
describe('Sales login transaction',()=>{
 it('binds random state and verifier to exact origin/client/org/target and ten-minute expiry',()=>{
  const a=createSalesLogin(config,'/sales/wip-ar?cycle=synthetic',now),b=createSalesLogin(config,'/sales',now);
  expect(a.state).not.toBe(b.state);expect(a.challenge).not.toBe(b.challenge);
  const consumed=consumeSalesLogin(config,a.cookie,a.state,now+599999);
  expect(consumed.returnTo).toBe('/sales/wip-ar?cycle=synthetic');expect(createHash('sha256').update(consumed.verifier).digest('base64url')).toBe(a.challenge);
  expect(a.cookie).not.toContain(consumed.verifier);expect(a.cookie.length).toBeLessThan(4096);
 });
 it.each(['/sales','/sales/wip-ar','/api/sales','/api/sales/v1/session','/x/../sales/wip-ar','/%73ales/wip-ar','/%2573ales/wip-ar'])('detects Sales target %s',value=>expect(isSalesLoginTarget(value)).toBe(true));
 it.each(['/accounting/friday-wip','/operations','/executive','/salesforce','/api/salesforce','/accounting?returnTo=/sales'])('does not change unrelated target %s',value=>expect(isSalesLoginTarget(value)).toBe(false));
 it.each(['https://evil.invalid/sales','//evil.invalid/sales','/%73ales/wip-ar','/auth/callback','/sales/../auth/callback','/sales\\evil','/sales\n','/sales/'+ 'x'.repeat(1025)])('rejects invalid Sales target %s',value=>expect(()=>createSalesLogin(config,value,now)).toThrow());
 it.each(['/','/accounting/friday-wip','/operations','/executive','/accounting?week=2026-09-11'])('binds a safe back-office destination %s identically',returnTo=>{
  const f=createSalesLogin(config,returnTo,now);expect(consumeSalesLogin(config,f.cookie,f.state,now).returnTo).toBe(returnTo);
 });
 it('rejects missing, wrong, tampered, oversized and expired/future flow before exchange',()=>{
  const f=createSalesLogin(config,'/sales',now);
  for(const cookie of [undefined,'',f.cookie+'x','x.'+f.cookie,'x'.repeat(4097)])expect(()=>consumeSalesLogin(config,cookie,f.state,now)).toThrow();
  for(const state of [null,'/sales',f.state+'x',createSalesLogin(config,'/sales',now).state])expect(()=>consumeSalesLogin(config,f.cookie,state,now)).toThrow();
  for(const time of [now-1,now+600000])expect(()=>consumeSalesLogin(config,f.cookie,f.state,time)).toThrow();
 });
 it('rejects changed client, organization, host or signing secret',()=>{
  const f=createSalesLogin(config,'/sales',now);
  for(const patch of [{clientId:'other'},{organizationId:'other'},{origin:'https://other.example'},{secret:'other'}])expect(()=>consumeSalesLogin({...config,...patch},f.cookie,f.state,now)).toThrow();
 });
 it('rejects correctly signed but malformed content and foreign return destinations',()=>{
  const f=createSalesLogin(config,'/sales',now),raw=JSON.parse(Buffer.from(f.cookie.split('.')[0],'base64url').toString());
  for(const patch of [{version:2},{extra:true},{verifier:'short'},{expires:now+600001},{issuedAt:now+1},{returnTo:'/auth/callback'},{returnTo:'//evil.invalid/sales'}]){
   const payload=Buffer.from(JSON.stringify({...raw,...patch})).toString('base64url'),cookie=payload+'.'+createHmac('sha256',config.secret).update(payload).digest('base64url');
   expect(()=>consumeSalesLogin(config,cookie,f.state,now)).toThrow();
  }
 });
 it('marks missing-cookie Sales states and obsolete path-states for strict handling',()=>{
  expect(requiresSalesLogin('cc-sales.invalid',undefined)).toBe(true);expect(requiresSalesLogin('/sales',undefined)).toBe(true);
  expect(requiresSalesLogin('/accounting','pending')).toBe(true);expect(requiresSalesLogin(null,'')).toBe(true);expect(requiresSalesLogin('/accounting',undefined)).toBe(false);
 });
 it('fails closed on insecure/incomplete configuration or callback mismatch',()=>{
  for(const patch of [{COMMAND_CENTER_AUTH_MODE:'local'},{CRM_WORKOS_ORGANIZATION_ID:''},{WORKOS_CLIENT_ID:''},{WORKOS_COOKIE_PASSWORD:'short'},{COMMAND_CENTER_PUBLIC_URL:'http://cc.example'},{COMMAND_CENTER_PUBLIC_URL:'https://cc.example/'},{WORKOS_REDIRECT_URI:'https://other.example/auth/callback'}])expect(()=>salesLoginConfig({...env,...patch})).toThrow();
 });
});
