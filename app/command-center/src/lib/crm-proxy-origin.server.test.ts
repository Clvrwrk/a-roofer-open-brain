import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {createRequest} from 'astro/app/node';
import {canonicalHttp} from '@proexteriors/crm-server';
const configText=readFileSync(new URL('../../astro.config.mjs',import.meta.url),'utf8');
const allowedDomains=[{hostname:'cc.proexteriorsus.net',protocol:'https'}];
function incoming(host:string,proto='https',port?:string){return {method:'GET',url:'/api/sales/v1/session',headers:{host:'cc.proexteriorsus.net','x-forwarded-host':host,'x-forwarded-proto':proto,...(port?{'x-forwarded-port':port}:{})},socket:new EventEmitter(),on(){},off(){}} as never;}
const options={apiBase:'/api/sales',session:{accessToken:'e30.'+Buffer.from(JSON.stringify({role:'member',sub:'fixture',org_id:'fixture-org',exp:Date.now()/1000+3600})).toString('base64url')+'.synthetic',csrfToken:'synthetic-only'},config:{enabled:true,url:'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',publishableKey:'sb_publishable_fixture',publicOrigin:'https://cc.proexteriorsus.net'}};
describe('Command Center TLS proxy origin',()=>{
 it('pins the deployed host in Astro configuration without a wildcard',()=>{
  expect(configText).toMatch(/allowedDomains:\s*\[\{hostname: "cc\.proexteriorsus\.net", protocol: "https"\}\]/);
 });
 it('reproduces the previous authenticated 403 before any RPC',async()=>{
  const transport=vi.fn();const request=createRequest(incoming('cc.proexteriorsus.net'));
  expect(new URL(request.url).protocol).toBe('http:');
  expect((await canonicalHttp({...options,request,transport})).status).toBe(403);expect(transport).not.toHaveBeenCalled();
 });
 it.each([undefined,'443'])('accepts exact public HTTPS origin (forwarded port %s)',async port=>{
  const request=createRequest(incoming('cc.proexteriorsus.net','https',port),{allowedDomains});
  expect(new URL(request.url).origin).toBe(options.config.publicOrigin);
  const transport=vi.fn(async()=>new Response(JSON.stringify({code:'42501'}),{status:403}));
  await canonicalHttp({...options,request,transport});expect(transport).toHaveBeenCalledOnce();
 });
 it.each(['evil.example','cc.proexteriorsus.net.evil.example','cc.proexteriorsus.net:8443'])('never restores an attacker supplied host %s',host=>{
  const request=createRequest(incoming(host),{allowedDomains});
  expect(new URL(request.url).hostname).not.toBe('evil.example');
  expect(new URL(request.url).hostname).not.toBe('cc.proexteriorsus.net.evil.example');
  if(host.endsWith(':8443'))expect(new URL(request.url).origin).not.toBe(options.config.publicOrigin);
 });
 it('keeps cross-site requests rejected on the accepted HTTPS origin',async()=>{
  const request=createRequest(incoming('cc.proexteriorsus.net'),{allowedDomains});request.headers.set('sec-fetch-site','cross-site');const transport=vi.fn();
  expect((await canonicalHttp({...options,request,transport})).status).toBe(403);expect(transport).not.toHaveBeenCalled();
 });
});
