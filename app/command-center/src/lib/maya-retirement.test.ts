import {describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {NAMED_AGENT_IDENTITIES,resolveServiceActorFromToken} from './access-control';
import {resolveRegistryServiceActorFromBearer} from './agent-service-token.server';
import {SYSTEMD_JOBS,AGENTS} from './runtime-registry';
import {resolveAgentToken} from './slack-agents';
import {ALL as runtime} from '../pages/api/agent/runtime/v1/[...path]';
import {POST as webhook} from '../pages/api/integrations/composio/v1/webhook';
import {POST as send} from '../pages/api/accounting/friday-wip/send';
describe('Maya retirement',()=>{
 it('rejects all old env credentials and removes monitored jobs and identity',()=>{
  const token='synthetic-retired-token';
  expect(resolveServiceActorFromToken(token,{AGENT_SERVICE_TOKEN_SHA256_MAYA_CHEN:createHash('sha256').update(token).digest('hex'),AGENT_SERVICE_TOKENS:`maya-chen:${token}`})).toBeNull();
  expect(NAMED_AGENT_IDENTITIES.some(x=>x.id==='maya-chen')).toBe(false);
  expect([...SYSTEMD_JOBS,...AGENTS].some(x=>x.key.includes('maya'))).toBe(false);
  expect(resolveAgentToken('maya').token).toBeUndefined();
 });
 it('rejects a still-active old registry digest',async()=>{
  const lookup=vi.fn(async()=>({agent_id:'maya-chen',state:'active' as const,not_before:null,expires_at:null}));
  expect(await resolveRegistryServiceActorFromBearer(new Request('https://test.invalid/api/agent/intake',{headers:{authorization:'Bearer synthetic-retired-token'}}),{},lookup)).toBeNull();
 });
 it('tombstones runtime, webhook and email paths before effects',async()=>{
  for(const route of [runtime,webhook,send]){const response=await route({} as never);expect(response.status).toBe(410);expect(await response.json()).toEqual({error:'maya_retired'});}
 });
});
