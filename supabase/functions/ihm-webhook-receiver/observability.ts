const SENTRY='https://o4511120856449024.ingest.us.sentry.io/api/4511599368798208/envelope/?sentry_key=64100fe85831a3ae8523eb6e810773af&sentry_version=7';
// Fixed component/destination and fixed codes only. Never send provider payloads,
// customer fields, signatures, credentials, database errors or request headers.
export async function reportIhmOutcome(client:any,ok:boolean,code:string|null,send:typeof fetch=fetch){
 try{
  const result=await client.rpc('record_integration_probe',{p_component:'edge:ihm-webhook-receiver',p_ok:ok,p_code:code}).abortSignal(AbortSignal.timeout(2500));
  if(!result.error)return;
 }catch{/* Database-outage delivery must have an independent path. */}
 const id=crypto.randomUUID().replaceAll('-','');
 const component=ok?'monitor:ihm-webhook-telemetry':'edge:ihm-webhook-receiver';
 const event={event_id:id,platform:'other',environment:'production',level:'error',logger:'integration-sync-health',
  message:'HailRecon webhook synchronization needs attention',fingerprint:['integration-sync-health',component],
  tags:{component,route:'/sync/'+component,surface:'sync-health',error_code:'provider_unavailable'},extra:{failure_code:ok?'telemetry_write_failed':code}};
 const body=[JSON.stringify({event_id:id}),JSON.stringify({type:'event'}),JSON.stringify(event),''].join('\n');
 try{const response=await send(SENTRY,{method:'POST',headers:{'Content-Type':'application/x-sentry-envelope'},body,signal:AbortSignal.timeout(5000)});if(!response.ok)console.error('ihm_health_delivery_failed');}catch{console.error('ihm_health_delivery_failed');}
}
// Raw data is already archived. Keep unsuccessful projection pending for review,
// acknowledge receipt to avoid unsafe provider replay, and emit a durable failure.
export async function completeStoredWebhook(client:any,rawId:number,project:()=>Promise<void>,report:(ok:boolean,code:string|null)=>Promise<void>){
 try{
  await project();
  await client.from('ihm_webhook_raw').update({processed:true}).eq('id',rawId).throwOnError();
 }catch{
  await report(false,'webhook_projection_failed');return false;
 }
 await report(true,null);return true;
}
