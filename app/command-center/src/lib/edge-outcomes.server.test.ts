import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('./integration-probes.server',()=>({probeIntegrations:vi.fn()}));
import {probeIntegrations} from './integration-probes.server';
import {loadEdgeOutcomes} from './edge-outcomes.server';
const client=(data:any[]=[],error:any=null)=>({from:()=>({select:()=>({like:async()=>({data,error})})})}) as any;
beforeEach(()=>{vi.clearAllMocks();vi.mocked(probeIntegrations).mockResolvedValue(['webhook','read-sweep','write-sweep','write-action'].map(n=>({key:`edge.acculynx-${n}`,ok:true,checkedAt:'2026-10-24T12:00:00Z'})) as any);});
it('distinguishes idle readiness from successful/failed executions',async()=>{
 const a=await loadEdgeOutcomes(client([{component_key:'api.edge.acculynx-write-action',consecutive_failures:1,last_observed_at:'2026-10-24T10:00:00Z'}]),{});
 expect(a.find(x=>x.key==='edge.acculynx-write-action')?.light).toBe('red');
 const idle=a.find(x=>x.key==='edge.acculynx-read-sweep')!;expect(idle.light).toBe('green');expect(idle.headline).toContain('no observed POST');
 expect(idle.monitorKey).toBe('api.edge-health.acculynx-read-sweep');
});
it('never reports a missing observer or receipt access failure healthy',async()=>{
 vi.mocked(probeIntegrations).mockResolvedValue([]);expect((await loadEdgeOutcomes(client(),{})).every(x=>x.light==='red')).toBe(true);
 expect((await loadEdgeOutcomes(client([],{}),{})).every(x=>x.light==='red')).toBe(true);
});
