import {it,expect,vi} from 'vitest';
vi.mock('./supabase.server',()=>({createServerSupabaseClient:()=>({client:null,config:{missing:['fixture']}})}));
vi.mock('./betterstack.server',()=>({loadBetterStackSnapshot:async()=>({state:'ok',monitors:[{id:'existing',url:'https://cc.proexteriorsus.net/healthz',status:'up',paused:false}],heartbeats:[]})}));
vi.mock('./weather.server',()=>({loadOfficeWeather:async()=>({status:'unavailable',refreshedAt:'2026-10-24T12:00:00Z',offices:[]})}));
vi.mock('./edge-outcomes.server',()=>({loadEdgeOutcomes:async()=>[]}));
vi.mock('./integration-probes.server',()=>({expectedStatus:(s:any)=>s.expectAnon,probeIntegrations:vi.fn(async(specs:any[])=>specs.map(s=>({key:s.key,url:s.url,mode:'reachability',status:s.expectAnon,ok:true,ms:1,error:null,checkedAt:'2026-10-24T12:00:00Z'})))}));
import {loadRuntimeBoard} from './runtime-status';
import {probeIntegrations} from './integration-probes.server';
it('checks a missing photo route monitor even when other Better Stack monitors work',async()=>{
 const board=await loadRuntimeBoard({},Date.parse('2026-10-24T12:00:00Z'));
 const photo=board.groups.flatMap(g=>g.components).find(x=>x.key==='api.companycam.photos')!;
 expect(photo.light).toBe('green');expect(photo.headline).toContain('401');
 expect(vi.mocked(probeIntegrations).mock.calls.some(([specs])=>specs.some(s=>s.key==='api.companycam.photos'))).toBe(true);
});
