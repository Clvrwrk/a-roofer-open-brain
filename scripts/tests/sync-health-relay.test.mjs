import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {relay,relayToken,ENDPOINT} from '../sync-health-relay.mjs';
test('selects only the existing auditor credential without evaluating the file',()=>{
 assert.equal(relayToken('OTHER=ignored\nAGENT_SERVICE_TOKENS="ob-ops:other,ob-auditor:fixture"'),'fixture');
 assert.equal(relayToken('AGENT_SERVICE_TOKENS=ob-ops:other'),'');
});
test('uses the fixed destination, no watchdog impersonation, and validates monitor freshness',async()=>{
 const now=Date.now();let opts;const fetcher=async(url,o)=>{assert.equal(url,ENDPOINT);opts=o;return Response.json({healthy:true,monitorAt:new Date(now).toISOString(),health:[],pending:0,delivered:0});};
 assert.equal((await relay('fixture',fetcher,now)).status,'ok');assert.equal(opts.redirect,'error');assert.equal(opts.body,'{}');
 await assert.rejects(relay('fixture',async()=>Response.json({healthy:true,monitorAt:'2000-01-01'}),now));
 await assert.rejects(relay('',fetcher,now));
});
