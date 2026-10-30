import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {observeEdgeHandler} from './edge-observer.ts';
function db(){return {rpc:async(...args:unknown[])=>{calls.push(args);return {error:null};},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})})};}
let calls:unknown[][]=[];
test('health probe checks its database but never invokes business logic or clears a failure',async()=>{
 calls=[];let invoked=0;const h=observeEdgeHandler('acculynx-write-action',async()=>{invoked++;return new Response();},db());
 const r=await h(new Request('https://example.test/acculynx-write-action?health=1'));
 assert.equal(r.status,200);assert.equal((await r.json()).observer,'invocation-outcome-v1');assert.equal(invoked,0);assert.equal(calls.length,0);
});
test('captures successful and failed POST outcomes without recording an expected gate response',async()=>{
 calls=[];
 for(const status of [200,503,401,403,405]){
  const h=observeEdgeHandler('acculynx-read-sweep',async()=>new Response(null,{status}),db());
  assert.equal((await h(new Request('https://example.test/',{method:'POST'}))).status,status);
 }
 assert.equal(calls.length,2);assert.deepEqual(calls.map(c=>(c[1] as any).p_ok),[true,false]);
 assert.equal((calls[0][1] as any).p_component,'api.edge.acculynx-read-sweep');
});
test('records thrown handler errors and returns a sanitized error',async()=>{
 calls=[];const h=observeEdgeHandler('acculynx-webhook',async()=>{throw Error('SECRET fixture');},db());
 const r=await h(new Request('https://example.test/',{method:'POST'}));assert.equal(r.status,500);assert.ok(!(await r.text()).includes('SECRET'));assert.equal((calls[0][1] as any).p_ok,false);
});
test('telemetry failure does not turn a completed provider write into a retryable failure',async()=>{
 const broken={...db(),rpc:async()=>{throw Error('secret');}};
 const h=observeEdgeHandler('acculynx-write-action',async()=>new Response('done'),broken,async()=>{});
 assert.equal((await h(new Request('https://example.test/',{method:'POST'}))).status,200);
});
test('a successful HTTP envelope cannot conceal a failed write or downstream enqueue',async()=>{
 calls=[];
 const failed=observeEdgeHandler('acculynx-write-action',async()=>Response.json({status:'failed',result:{status:503}}),db());
 assert.equal((await failed(new Request('https://example.test/',{method:'POST'}))).status,200);
 assert.equal((calls[0][1] as any).p_ok,false);
 calls=[];
 const enqueue=observeEdgeHandler('acculynx-webhook',async(_req,outcome)=>{outcome.fail();return Response.json({status:'ok'});},db());
 assert.equal((await enqueue(new Request('https://example.test/',{method:'POST'}))).status,200);
 assert.equal((calls[0][1] as any).p_ok,false);
});
test('previews and replay acknowledgements do not clear a failed execution',async()=>{
 calls=[];
 for(const status of ['preview','already_executed','replay-ack']){
  const h=observeEdgeHandler('acculynx-write-action',async()=>Response.json({status}),db());
  await h(new Request('https://example.test/',{method:'POST'}));
 }
 assert.equal(calls.length,0);
});
