import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../app/command-center/package.json',import.meta.url));
const CachePolicy=require('http-cache-semantics');

test('Astro image caching never uses the unresolved max-stale hit path or returns private cookies',async()=>{
 const {loadRemoteImage,revalidateRemoteImage}=await import(new URL('../app/command-center/node_modules/astro/dist/assets/build/remote.js',import.meta.url));
 const original=new Map();
 for(const name of ['evaluateRequest','satisfiesWithoutRevalidation']){
  original.set(name,CachePolicy.prototype[name]);
  assert.equal(typeof original.get(name),'function');
  CachePolicy.prototype[name]=()=>{throw new Error('Unresolved cache-hit advisory path reached: '+name);};
 }
 const requests=[];
 const headers={'cache-control':'private, max-age=0','set-cookie':'synthetic-test-only=1','etag':'test-etag'};
 try{
  const fetchFn=async request=>{requests.push(request);return new Response(new Uint8Array([1,2,3]),{status:200,headers});};
  const loaded=await loadRemoteImage('https://images.example.test/fixture.png',fetchFn);
  assert.ok(loaded.expires<=Date.now(),'private responses must have no reusable TTL');
  assert.equal('headers' in loaded,false,'cookies must not escape through the helper result');
  const revalidated=await revalidateRemoteImage('https://images.example.test/fixture.png',loaded,async request=>{
   requests.push(request);return new Response(null,{status:304,headers});
  });
  assert.ok(revalidated.expires<=Date.now());
  assert.equal(revalidated.data,null);
  assert.equal('headers' in revalidated,false);
  for(const request of requests){
   assert.equal(request.headers.get('cookie'),null);
   assert.equal(request.headers.get('authorization'),null);
   assert.equal(request.headers.get('cache-control'),null);
  }
 }finally{
  for(const [name,fn] of original)CachePolicy.prototype[name]=fn;
 }
});
