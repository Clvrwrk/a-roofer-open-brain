import {beforeEach,expect,it,vi} from "vitest";
const client=vi.hoisted(()=>({create:vi.fn()}));
vi.mock("@lib/supabase.server",()=>({createServerSupabaseClient:client.create}));
vi.mock("@sentry/astro",()=>({captureException:vi.fn()}));
vi.mock("@lib/runtime-status",()=>({loadRuntimeBoard:vi.fn().mockResolvedValue({groups:[]})}));
import {POST} from "./sync-health";
beforeEach(()=>vi.clearAllMocks());
for(const actor of [undefined,{type:"human",id:"ob-auditor"},{type:"service_agent",id:"ob-researcher"}]) {
 it(`rejects ${actor?.type??"anonymous"} before privileged reads`,async()=>{
  const response=await POST({locals:{actor}} as any);
  expect(response.status).toBe(403);expect(client.create).not.toHaveBeenCalled();
 });
}

it('returns unavailable when an alert was accepted but the durable acknowledgement failed',async()=>{
 const events=[{event_id:'fixture',component_key:'fixture'}];
 const db={rpc:vi.fn().mockResolvedValue({data:{pending:1,oldestPendingAt:new Date().toISOString()},error:null}),from:(table:string)=>{
  if(table==='integration_sync_events')return {select:()=>({is:()=>({not:()=>({order:()=>({limit:async()=>({data:events,error:null})})})})}),update:()=>({eq:async()=>({error:{message:'fixture ack failure'}})})};
  return {select:()=>({order:async()=>({data:[],error:null})})};
 }};
 client.create.mockReturnValue({client:db});
 const sender=await import('@lib/sync-health');
 vi.spyOn(sender,'sendSyncHealthEvent').mockResolvedValue(true);
 const response=await POST({locals:{actor:{type:'service_agent',id:'ob-auditor'}}} as any);
 expect(response.status).toBe(503);expect((await response.json()).healthy).toBe(false);
});
