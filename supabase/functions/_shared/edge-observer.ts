// Monitoring never executes a provider call. Gate rejections/health GETs cannot clear a failed POST.
type Database={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{error:unknown}>;from:(name:string)=>any};
async function fallback(name:string){
 console.error(JSON.stringify({code:'edge_outcome_record_failed',component:name}));
 const event_id=crypto.randomUUID().replaceAll('-','');
 const event={event_id,platform:'other',level:'error',environment:'production',message:`Edge outcome recording unavailable: ${name}`,fingerprint:['edge-outcome-recording',name],tags:{component:`api.edge.${name}`,surface:'sync-health',error_code:'provider_unavailable'}};
 const body=[JSON.stringify({event_id}),JSON.stringify({type:'event'}),JSON.stringify(event),''].join('\n');
 try{await fetch('https://o4511120856449024.ingest.us.sentry.io/api/4511599368798208/envelope/?sentry_key=64100fe85831a3ae8523eb6e810773af&sentry_version=7',{method:'POST',headers:{'Content-Type':'application/x-sentry-envelope'},body,signal:AbortSignal.timeout(2000)});}catch{/* Never change a completed write's response because monitoring failed. */}
}
export interface EdgeObservation {fail:()=>void;skip:()=>void;}
export function observeEdgeHandler(name:string,handler:(req:Request,outcome:EdgeObservation)=>Promise<Response>,db:Database,onTelemetryError:(name:string)=>Promise<void>=fallback){
 if(!/^acculynx-(webhook|read-sweep|write-sweep|write-action)$/.test(name))throw Error('unsupported_edge_component');
 return async(req:Request):Promise<Response>=>{
  if(req.method==='GET'&&new URL(req.url).searchParams.get('health')==='1'){
   try{
    const {error}=await db.from('integration_sync_health').select('component_key').eq('component_key',`api.edge.${name}`).maybeSingle();
    if(error)throw Error('unavailable');
    return Response.json({status:'ok',function:name,observer:'invocation-outcome-v1',mode:'read_only_health'});
   }catch{return Response.json({error:'edge_health_unavailable'},{status:503});}
  }
  let failed=false,skip=false;const outcome={fail:()=>{failed=true;},skip:()=>{skip=true;}};
  let response:Response;
  try{response=await handler(req,outcome);}catch{response=Response.json({error:'edge_handler_failed'},{status:500});}
  if(req.method==='POST'&&response.status<300&&response.headers.get('content-type')?.includes('json')){
   const body=await response.clone().json().catch(()=>null);
   if(body?.status==='failed'||body?.error)failed=true;
   if(['preview','already_executed','replay-ack'].includes(body?.status))skip=true;
  }
  if(req.method==='POST'&&((response.status<300&&(!skip||failed))||response.status>=500)){
   try{
    const {error}=await db.rpc('record_integration_probe',{p_component:`api.edge.${name}`,p_ok:response.status<300&&!failed,p_code:'probe_failed'});
    if(error)throw Error('unavailable');
   }catch{await onTelemetryError(name).catch(()=>{});}
  }
  return response;
 };
}
