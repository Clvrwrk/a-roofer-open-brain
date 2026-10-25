// Independent minute relay on the approved agent host. Uses its EXISTING auditor map;
// no token is moved from GitHub/1Password and no database/admin credential is loaded.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export const ENDPOINT='https://cc.proexteriorsus.net/api/system/sync-health';
export function relayToken(source){
 const line=source.split(/\r?\n/).find(l=>/^(?:export )?AGENT_SERVICE_TOKENS=/.test(l));
 const value=(line?.slice(line.indexOf('=')+1)??'').trim().replace(/^(["'])(.*)\1$/,'$2');
 return value.split(',').find(x=>x.startsWith('ob-auditor:'))?.slice('ob-auditor:'.length)??'';
}
export async function relay(token,fetcher=fetch,now=Date.now()){
 if(!token)throw Error('relay_credential_missing');
 const r=await fetcher(ENDPOINT,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(60000)});
 if(!r.ok)throw Error('relay_endpoint_failed');
 const d=await r.json();const age=now-Date.parse(d.monitorAt??'');
 if(d.healthy!==true||!Number.isFinite(age)||age>180000||age< -60000)throw Error('relay_unhealthy');
 return {status:'ok',delivered:d.delivered,pending:d.pending,components:d.health?.length};
}
async function reportUnavailable(){
 const event_id=crypto.randomUUID().replaceAll('-','');
 const event={event_id,platform:'other',environment:'production',level:'error',message:'Independent sync relay unavailable',fingerprint:['sync-health-host-relay-unavailable'],tags:{surface:'sync-health',route:'/sync/host-relay',error_code:'provider_unavailable'}};
 const body=[JSON.stringify({event_id}),JSON.stringify({type:'event'}),JSON.stringify(event),''].join('\n');
 try{await fetch('https://o4511120856449024.ingest.us.sentry.io/api/4511599368798208/envelope/?sentry_key=64100fe85831a3ae8523eb6e810773af&sentry_version=7',{method:'POST',headers:{'Content-Type':'application/x-sentry-envelope'},body,signal:AbortSignal.timeout(5000)});}catch{}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const path=process.argv[process.argv.indexOf('--env-file')+1];
  const token=process.env.SYNC_HEALTH_SERVICE_TOKEN||relayToken(readFileSync(path,'utf8'));
  console.log(JSON.stringify(await relay(token)));
 }catch{console.error('Independent sync relay failed; see monitoring.');await reportUnavailable();process.exitCode=1;}
}
