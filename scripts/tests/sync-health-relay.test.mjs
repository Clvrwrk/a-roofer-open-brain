import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {
 relay,relayToken,ENDPOINT,RelayFailure,normalizeRelayFailure,isRetriableRelayFailure,
 formatRelayFailureLog,buildUnavailableSentryEvent,reportUnavailable,relayWithRetry,
} from '../sync-health-relay.mjs';

test('selects only the existing auditor credential without evaluating the file',()=>{
 assert.equal(relayToken('OTHER=ignored\nAGENT_SERVICE_TOKENS="ob-ops:other,ob-auditor:fixture"'),'fixture');
 assert.equal(relayToken('AGENT_SERVICE_TOKENS=ob-ops:other'),'');
});

test('uses the fixed destination, no watchdog impersonation, and validates monitor freshness',async()=>{
 const now=Date.now();let opts;const fetcher=async(url,o)=>{assert.equal(url,ENDPOINT);opts=o;return Response.json({healthy:true,monitorAt:new Date(now).toISOString(),health:[{component_key:'fixture'}],pending:0,delivered:0});};
 assert.equal((await relay('fixture',fetcher,now)).status,'ok');assert.equal(opts.redirect,'error');assert.equal(opts.body,'{}');
 const stale=await relay('fixture',async()=>Response.json({healthy:true,monitorAt:'2000-01-01',health:[{component_key:'fixture'}]}),now).catch(e=>e);
 assert.ok(stale instanceof RelayFailure);assert.equal(stale.code,'relay_unhealthy');assert.equal(stale.detail,'monitor_stale');
 await assert.rejects(relay('',fetcher,now),/relay_credential_missing/);
});

test('relay_endpoint_failed carries http status and elapsed time',async()=>{
 const fetcher=async()=>new Response('nope',{status:503});
 const err=await relay('t',fetcher).catch(e=>e);
 assert.equal(err.code,'relay_endpoint_failed');assert.equal(err.httpStatus,503);assert.ok(err.elapsedMs>=0);
});

test('network errors record cause class',async()=>{
 const err=await relay('t',async()=>{throw Object.assign(new Error('fetch failed'),{name:'TypeError'});}).catch(e=>e);
 assert.equal(err.causeClass,'TypeError');
});

test('retriable vs non-retriable failures',()=>{
 assert.equal(isRetriableRelayFailure(new RelayFailure('relay_endpoint_failed',{httpStatus:503})),true);
 assert.equal(isRetriableRelayFailure(new RelayFailure('relay_unhealthy',{detail:'monitor_stale'})),false);
 assert.equal(isRetriableRelayFailure(new RelayFailure('relay_credential_missing')),false);
 assert.equal(isRetriableRelayFailure(new RelayFailure('relay_endpoint_failed',{httpStatus:403})),false);
});

test('relayWithRetry succeeds on second attempt after transient 503',async()=>{
 let calls=0;
 const fetcher=async()=>{
  calls++;
  if(calls===1)return new Response('',{status:503});
  return Response.json({healthy:true,monitorAt:new Date().toISOString(),health:[{}],pending:0,delivered:0});
 };
 const out=await relayWithRetry('t',fetcher);
 assert.equal(out.status,'ok');assert.equal(calls,2);
});

test('relayWithRetry does not retry unhealthy payloads',async()=>{
 let calls=0;
 const fetcher=async()=>{calls++;return Response.json({healthy:false,monitorAt:new Date().toISOString(),health:[{}]});};
 const err=await relayWithRetry('t',fetcher).catch(e=>e);
 assert.equal(calls,1);assert.equal(err.code,'relay_unhealthy');
});

test('failure log and sentry event include diagnosis fields without secrets',()=>{
 const info={code:'relay_endpoint_failed',causeClass:'TypeError',httpStatus:502,elapsedMs:1200,attempt:2,detail:'json_parse_failed'};
 const log=formatRelayFailureLog(info);
 assert.ok(log.includes('relay_endpoint_failed'));assert.ok(!log.includes('Bearer'));
 const event=buildUnavailableSentryEvent(info);
 assert.equal(event.tags.relay_failure_code,'relay_endpoint_failed');
 assert.equal(event.tags.http_status,'502');
 assert.equal(event.extra.elapsed_ms,1200);
 assert.equal(event.extra.attempt,2);
 assert.equal(event.tags.error_code,'provider_unavailable');
});

test('reportUnavailable posts envelope to sentry',async()=>{
 let posted;
 const fetcher=async(_url,{body})=>{posted=body;return new Response('',{status:200});};
 await reportUnavailable({code:'relay_endpoint_failed',httpStatus:504,elapsedMs:99,attempt:1},fetcher);
 assert.ok(posted.includes('relay_failure_code'));assert.ok(posted.includes('504'));
});
