// Fixed Sentry destination; event contents are an explicit non-PII allowlist.
export const SYNC_SENTRY_URL = "https://o4511120856449024.ingest.us.sentry.io/api/4511599368798208/envelope/?sentry_key=64100fe85831a3ae8523eb6e810773af&sentry_version=7";
export async function sendSyncHealthEvent(e: {event_id:string;component_key:string;failures:number;failure_code:string;incident_id:string}, fetcher=fetch): Promise<boolean> {
  const id=e.event_id.replaceAll("-","");
  const event={event_id:id,platform:"other",environment:"production",level:"error",
    logger:"integration-sync-health",message:`Integration sync failure: ${e.component_key}`,
    fingerprint:["integration-sync-health",e.component_key],tags:{surface:"sync-health",component:e.component_key,error_code:e.failure_code==="auth_denied"?"unauthorized":e.failure_code==="schema_error"?"42P01":"provider_unavailable"},
    extra:{consecutive_failures:e.failures,incident_id:e.incident_id}};
  const body=[JSON.stringify({event_id:id,sent_at:new Date().toISOString()}),JSON.stringify({type:"event"}),JSON.stringify(event),""].join("\n");
  try {const r=await fetcher(SYNC_SENTRY_URL,{method:"POST",headers:{"Content-Type":"application/x-sentry-envelope"},body,signal:AbortSignal.timeout(10000)});return r.ok;} catch{return false;}
}
