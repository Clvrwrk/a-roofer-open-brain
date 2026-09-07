import {describe,it,expect,vi} from 'vitest';
import vm from 'node:vm';
import {GET} from '../pages/sw.js';
import {ALL} from '../pages/api/sales/[...path]';
import {parseSalesRoute,salesPath} from '@proexteriors/sales-workspace';
async function workerHarness(){
 const listeners:Record<string,Function>={},deleted:string[]=[];
 const cache={keys:vi.fn(async()=>[{url:'https://cc.example/sales/efforts/123'},{url:'https://cc.example/accounting/friday-wip'}]),delete:vi.fn(async(request:any)=>{deleted.push(request.url);return true}),put:vi.fn(),match:vi.fn()};
 const caches={keys:vi.fn(async()=>['cc-page-cache-old:pages:rep','unrelated']),open:vi.fn(async()=>cache),delete:vi.fn()};
 const self={location:{origin:'https://cc.example'},addEventListener:(name:string,fn:Function)=>{listeners[name]=fn},clients:{claim:vi.fn(async()=>{})},skipWaiting:vi.fn()};
 const fetch=vi.fn();const response=await GET({} as any);
 vm.runInNewContext(await response.text(),{self,caches,URL,Request,Response,fetch,console});
 return {listeners,deleted,cache,caches,fetch};
}
describe('shared sales host boundary',()=>{
 it('does not substitute local or agent authority for CRM staff credentials',async()=>{
  for(const actor of [null,{type:'local_operator',source:'local'},{type:'service_agent',source:'service_token'}]){
   const response=await ALL({locals:{actor}} as any);expect(response.status).toBe(401);expect(response.headers.get('cache-control')).toBe('no-store');
  }
  const response=await ALL({locals:{actor:{type:'human',source:'workos'}}} as any);expect(response.status).toBe(503);expect(await response.json()).not.toHaveProperty('csrf_token');
 });
 it('uses the shared route contract for direct customer links',()=>{
  const route={page:'Pipeline' as const,effortId:'12345678-1234-1234-1234-123456789abc',tab:'Review' as const};
  const url=new URL(salesPath(route),'https://cc.example');expect(parseSalesRoute(url.pathname,url.search)).toEqual(route);
 });
 it('bypasses cached sales navigation and refuses rendered draft snapshots',async()=>{
  const h=await workerHarness();
  for(const path of ['/sales','/sales/pipeline','/sales/efforts/test','/api/sales/v1/efforts']){
   const respondWith=vi.fn();h.listeners.fetch({request:{method:'GET',mode:'navigate',url:'https://cc.example'+path},respondWith});expect(respondWith).not.toHaveBeenCalled();
  }
  let pending:Promise<unknown>|undefined;
  h.listeners.message({data:{type:'CACHE_RENDERED_PAGE',path:'/sales/pipeline',html:'x'.repeat(3000)},waitUntil:(value:Promise<unknown>)=>{pending=value}});await pending;
  expect(h.cache.put).not.toHaveBeenCalled();expect(h.fetch).not.toHaveBeenCalled();
 });
 it('purges old sales snapshots while retaining other department entries',async()=>{
  const h=await workerHarness();let pending:Promise<unknown>|undefined;h.listeners.activate({waitUntil:(value:Promise<unknown>)=>{pending=value}});await pending;
  expect(h.deleted).toEqual(['https://cc.example/sales/efforts/123']);expect(h.caches.delete).not.toHaveBeenCalled();
 });
});
