import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isStale} from './fixtures/self-heal/heartbeat-age.mjs';
// PEC-777: a missing heartbeat timestamp must be stale, never treated as fresh.
test('missing or invalid heartbeat timestamp is stale',()=>{
 const now=1_000_000,max=60_000;
 for(const lastSeen of [undefined,null,NaN,'not-a-time']) assert.equal(isStale(lastSeen,now,max),true,String(lastSeen));
});
test('valid heartbeat timestamps keep their age semantics',()=>{
 const now=1_000_000,max=60_000;
 assert.equal(isStale(now-1_000,now,max),false);
 assert.equal(isStale(now-max,now,max),false);
 assert.equal(isStale(now-max-1,now,max),true);
});
