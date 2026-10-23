// Independent runner: no database/admin credentials. Only the existing auditor
// service token; fixed app and Sentry destinations. Never log responses or tokens.
import {randomUUID} from 'node:crypto';
const URL='https://cc.proexteriorsus.net/api/system/sync-health';
const SENTRY='https://o4511120856449024.ingest.us.sentry.io/api/4511599368798208/envelope/?sentry_key=64100fe85831a3ae8523eb6e810773af&sentry_version=7';
try {
 if(!process.env.SYNC_HEALTH_SERVICE_TOKEN)throw new Error('monitor_credential_missing');
 const r=await fetch(URL,{method:'POST',headers:{Authorization:`Bearer ${process.env.SYNC_HEALTH_SERVICE_TOKEN}`},signal:AbortSignal.timeout(60000)});
 if(!r.ok)throw new Error('health_endpoint_failed');
 const d=await r.json();
 if(!d.health?.length || !d.monitorAt || Date.now()-Date.parse(d.monitorAt)>180000)throw new Error('database_monitor_stale');
 console.log(JSON.stringify({status:'ok',delivered:d.delivered,components:d.health.length,failing:d.health.filter(h=>h.consecutive_failures>0).length}));
} catch {
 const id=randomUUID().replaceAll('-','');
 const event={event_id:id,platform:'other',logger:'integration-sync-health',level:'error',environment:'production',message:'Sync health monitor unavailable',fingerprint:['sync-health-monitor-unavailable'],tags:{route:'/sync/monitor',surface:'sync-health',error_code:'provider_unavailable'}};
 const body=[JSON.stringify({event_id:id}),JSON.stringify({type:'event'}),JSON.stringify(event),''].join('\n');
 try{await fetch(SENTRY,{method:'POST',headers:{'Content-Type':'application/x-sentry-envelope'},body,signal:AbortSignal.timeout(10000)});}catch{}
 console.error('Sync health monitor unavailable; see Sentry.');process.exitCode=1;
}
