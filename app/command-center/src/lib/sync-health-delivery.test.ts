import {it,expect,vi} from 'vitest';
import {deliverSyncHealth} from './sync-health-delivery';
const events=[{event_id:'fixture'}];
const mock=(ackError:any=null,pending:any={pending:0,oldestPendingAt:null})=>({from:()=>({update:()=>({eq:async()=>({error:ackError})})}),rpc:async()=>({data:pending,error:null})});
it('fails the relay when Sentry rejects delivery',async()=>{expect((await deliverSyncHealth(events,mock(),async()=>false)).healthy).toBe(false);});
it('fails when provider accepted but durable acknowledgement failed',async()=>{expect((await deliverSyncHealth(events,mock({message:'db'}),async()=>true)).healthy).toBe(false);});
it('fails an aged queue even if the current batch delivered',async()=>{expect((await deliverSyncHealth(events,mock(null,{pending:1,oldestPendingAt:new Date(Date.now()-700000).toISOString()}),async()=>true)).healthy).toBe(false);});
it('accepts provider plus acknowledgement and a drained queue',async()=>{expect((await deliverSyncHealth(events,mock(),async()=>true)).healthy).toBe(true);});

it('never sends retired event history',async()=>{
 const send=vi.fn().mockResolvedValue(true);
 expect((await deliverSyncHealth([{event_id:'old',component_key:'runtime:systemd.openbrain-maya-gate'}],mock(),send)).healthy).toBe(true);
 expect(send).not.toHaveBeenCalled();
});
