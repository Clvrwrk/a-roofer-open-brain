// A provider acceptance without a durable acknowledgement remains a failed delivery.
export async function deliverSyncHealth(events:any[],client:any,send:(e:any)=>Promise<boolean>,now=Date.now()){
 let delivered=0,failed=0;
 for(const e of events){
  if(Date.now()-now>40000){failed++;break;}
  if(!await send(e)){failed++;continue;}
  const {error}=await client.from('integration_sync_events').update({delivered_at:new Date().toISOString()}).eq('event_id',e.event_id);
  if(error)failed++;else delivered++;
 }
 const {data,error}=await client.rpc('sync_health_delivery_status');
 if(error)return {delivered,failed:failed+1,pending:null,oldestPendingAt:null,healthy:false};
 const age=data?.oldestPendingAt?Date.now()-Date.parse(data.oldestPendingAt):0;
 return {delivered,failed,pending:data?.pending??0,oldestPendingAt:data?.oldestPendingAt??null,healthy:failed===0&&Number.isFinite(age)&&age<600000};
}
