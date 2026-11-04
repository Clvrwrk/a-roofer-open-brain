import { syncHealthErrorCode } from "./sync-health-error-code";

// Fixed Sentry destination; event contents are an explicit non-PII allowlist.
export const SYNC_SENTRY_URL = "https://o4511120856449024.ingest.us.sentry.io/api/4511599368798208/envelope/?sentry_key=64100fe85831a3ae8523eb6e810773af&sentry_version=7";
export async function sendSyncHealthEvent(e: {event_id:string;component_key:string;failures:number;failure_code:string;incident_id:string;occurred_at?:string|null;created_at?:string|null}, fetcher=fetch): Promise<boolean> {
  const occurredAt=e.occurred_at??e.created_at??null;
  const timestamp=occurredAt?Date.parse(occurredAt)/1000:NaN;
  const id=e.event_id.replaceAll("-","");
  const errorCode=syncHealthErrorCode(e.failure_code);
  const event={event_id:id,...(Number.isFinite(timestamp)?{timestamp}:{}),platform:"other",environment:"production",level:"error",
    logger:"integration-sync-health",message:`Integration sync failure: ${e.component_key}`,
    fingerprint:["integration-sync-health",e.component_key],tags:{route:`/sync/${e.component_key}`,surface:"sync-health",component:e.component_key,error_code:errorCode},
    extra:{failure_code:e.failure_code,occurred_at:occurredAt,consecutive_failures:e.failures,incident_id:e.incident_id}};
  const body=[JSON.stringify({event_id:id,sent_at:new Date().toISOString()}),JSON.stringify({type:"event"}),JSON.stringify(event),""].join("\n");
  try {const r=await fetcher(SYNC_SENTRY_URL,{method:"POST",headers:{"Content-Type":"application/x-sentry-envelope"},body,signal:AbortSignal.timeout(10000)});return r.ok;} catch{return false;}
}
