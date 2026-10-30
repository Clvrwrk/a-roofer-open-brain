// Independent runner: no database/admin credentials. Only the existing auditor
// service token; fixed app and Sentry destinations. Never log responses or tokens.
import {updateDeliveryFallback} from './sync-health-fallback.mjs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const URL='https://cc.proexteriorsus.net/api/system/sync-health';
const SENTRY='https://o4511120856449024.ingest.us.sentry.io/api/4511599368798208/envelope/?sentry_key=64100fe85831a3ae8523eb6e810773af&sentry_version=7';
try {
 if(!process.env.SYNC_HEALTH_SERVICE_TOKEN)throw new Error('monitor_credential_missing');
 const r=await fetch(URL,{method:'POST',headers:{Authorization:`Bearer ${process.env.SYNC_HEALTH_SERVICE_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({expectedCommit:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID}),signal:AbortSignal.timeout(60000)});
 if(!r.ok)throw new Error('health_endpoint_failed');
 const d=await r.json();
 if(!Array.isArray(d.health)||!d.health.length||!Number.isFinite(Date.parse(d.monitorAt))||Date.now()-Date.parse(d.monitorAt)>180000||Date.parse(d.monitorAt)>Date.now()+60000||d.healthy===false)throw new Error('database_monitor_stale');
 const commitAge=Date.now()-Number(execFileSync('git',['show','-s','--format=%ct','HEAD'],{encoding:'utf8'}).trim())*1000;
 if(process.env.GITHUB_SHA&&d.buildCommit!==process.env.GITHUB_SHA&&commitAge>600000)throw new Error('deploy_drift');
 await updateDeliveryFallback(true,process.env.GITHUB_TOKEN);
 console.log(JSON.stringify({status:'ok',delivered:d.delivered,components:d.health.length,failing:d.health.filter(h=>h.consecutive_failures>0).length}));
} catch {
 try{await updateDeliveryFallback(false,process.env.GITHUB_TOKEN);}catch{console.error('Independent GitHub delivery incident could not be recorded.');}
 const id=randomUUID().replaceAll('-','');
 const event={event_id:id,platform:'other',logger:'integration-sync-health',level:'error',environment:'production',message:'Sync health monitor unavailable',fingerprint:['sync-health-monitor-unavailable'],tags:{route:'/sync/monitor',surface:'sync-health',error_code:'provider_unavailable'}};
 const body=[JSON.stringify({event_id:id}),JSON.stringify({type:'event'}),JSON.stringify(event),''].join('\n');
 try{await fetch(SENTRY,{method:'POST',headers:{'Content-Type':'application/x-sentry-envelope'},body,signal:AbortSignal.timeout(10000)});}catch{}
 console.error('Sync health monitor unavailable; see Sentry.');process.exitCode=1;
}
