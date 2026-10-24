import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isStale} from './fixtures/self-heal/heartbeat-age.mjs';
const now=Date.UTC(2026,9,23,22,0,0),max=60_000;
test('missing heartbeat timestamp is stale, never fresh',()=>{
 for(const missing of [undefined,null,NaN,'']) assert.equal(isStale(missing,now,max),true,`lastSeen=${String(missing)}`);
});
test('present timestamps keep age semantics',()=>{
 assert.equal(isStale(now-1_000,now,max),false);
 assert.equal(isStale(now-max,now,max),false);
 assert.equal(isStale(now-max-1,now,max),true);
});
