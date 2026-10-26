// Independent minute relay on the approved agent host. Uses its EXISTING auditor map;
// no token is moved from GitHub/1Password and no database/admin credential is loaded.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const ENDPOINT='https://cc.proexteriorsus.net/api/system/sync-health';
const SENTRY_ENVELOPE='https://o4511120856449024.ingest.us.sentry.io/api/4511599368798208/envelope/?sentry_key=64100fe85831a3ae8523eb6e810773af&sentry_version=7';

export function relayToken(source){
 const line=source.split(/\r?\n/).find(l=>/^(?:export )?AGENT_SERVICE_TOKENS=/.test(l));
 const value=(line?.slice(line.indexOf('=')+1)??'').trim().replace(/^(["'])(.*)\1$/,'$2');
 return value.split(',').find(x=>x.startsWith('ob-auditor:'))?.slice('ob-auditor:'.length)??'';
}

/** @typedef {{code:string,causeClass?:string,httpStatus?:number,elapsedMs:number,attempt:number,detail?:string}} RelayFailureInfo */

export class RelayFailure extends Error{
 /** @param {string} code @param {Omit<RelayFailureInfo,'code'> & {elapsedMs?:number,attempt?:number}} meta */
 constructor(code,{causeClass,httpStatus,elapsedMs=0,attempt=1,detail}={}){
  super(code);
  this.name='RelayFailure';
  this.code=code;
  this.causeClass=causeClass;
  this.httpStatus=httpStatus;
  this.elapsedMs=elapsedMs;
  this.attempt=attempt;
  this.detail=detail;
 }
 /** @returns {RelayFailureInfo} */
 toInfo(){return {code:this.code,causeClass:this.causeClass,httpStatus:this.httpStatus,elapsedMs:this.elapsedMs,attempt:this.attempt,detail:this.detail};}
}

/** @param {unknown} err @param {number} attempt @param {number} elapsedMs */
export function normalizeRelayFailure(err,attempt=1,elapsedMs=0){
 if(err instanceof RelayFailure){
  err.attempt=attempt;
  if(!err.elapsedMs)err.elapsedMs=elapsedMs;
  return err;
 }
 const causeClass=err&&typeof err==='object'&&'name' in err?String(err.name):undefined;
 const code=err instanceof Error&&err.message?err.message:'relay_unknown';
 return new RelayFailure(code,{causeClass,elapsedMs,attempt});
}

/** @param {RelayFailure} failure */
export function isRetriableRelayFailure(failure){
 if(failure.code==='relay_credential_missing')return false;
 if(failure.code==='relay_unhealthy')return false;
 if(typeof failure.httpStatus==='number'){
  if(failure.httpStatus===401||failure.httpStatus===403||failure.httpStatus===404)return false;
  if(failure.httpStatus>=500||failure.httpStatus===429||failure.httpStatus===408)return true;
  if(failure.httpStatus>=400)return false;
 }
 if(failure.causeClass==='AbortError'||failure.causeClass==='TimeoutError')return true;
 if(failure.code==='relay_endpoint_failed'||failure.code==='relay_response_invalid')return true;
 return failure.causeClass==='TypeError'; // DNS/TLS/network
}

/** @param {RelayFailureInfo} info */
export function formatRelayFailureLog(info){
 return JSON.stringify({message:'Independent sync relay failed',failure_code:info.code,cause_class:info.causeClass??null,http_status:info.httpStatus??null,elapsed_ms:info.elapsedMs,attempt:info.attempt,detail:info.detail??null});
}

/** @param {RelayFailureInfo} info */
export function buildUnavailableSentryEvent(info){
 const event_id=crypto.randomUUID().replaceAll('-','');
 const tags={surface:'sync-health',route:'/sync/host-relay',error_code:'provider_unavailable',relay_failure_code:info.code};
 if(info.httpStatus!=null)tags.http_status=String(info.httpStatus);
 if(info.causeClass)tags.cause_class=info.causeClass;
 const extra={elapsed_ms:info.elapsedMs,attempt:info.attempt};
 if(info.detail)extra.failure_detail=info.detail;
 return {event_id,platform:'other',environment:'production',level:'error',message:'Independent sync relay unavailable',fingerprint:['sync-health-host-relay-unavailable'],tags,extra};
}

/** @param {RelayFailureInfo} info @param {typeof fetch} fetcher */
export async function reportUnavailable(info,fetcher=fetch){
 const event=buildUnavailableSentryEvent(info);
 const body=[JSON.stringify({event_id:event.event_id}),JSON.stringify({type:'event'}),JSON.stringify(event),''].join('\n');
 try{await fetcher(SENTRY_ENVELOPE,{method:'POST',headers:{'Content-Type':'application/x-sentry-envelope'},body,signal:AbortSignal.timeout(5000)});}catch{}
}

function unhealthyDetail(body,now){
 if(body.healthy!==true)return 'healthy_not_true';
 if(!Array.isArray(body.health)||body.health.length===0)return 'health_empty';
 const age=now-Date.parse(body.monitorAt??'');
 if(!Number.isFinite(age))return 'monitor_at_invalid';
 if(age>180000)return 'monitor_stale';
 if(age<-60000)return 'monitor_future';
 return 'unknown';
}

export async function relay(token,fetcher=fetch,now=Date.now(),attempt=1){
 if(!token)throw new RelayFailure('relay_credential_missing',{attempt});
 const started=Date.now();
 let response;
 try{
  response=await fetcher(ENDPOINT,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(60000)});
 }catch(err){
  throw normalizeRelayFailure(err,attempt,Date.now()-started);
 }
 const elapsedMs=Date.now()-started;
 if(!response.ok)throw new RelayFailure('relay_endpoint_failed',{httpStatus:response.status,elapsedMs,attempt});
 let body;
 try{body=await response.json();}catch{
  throw new RelayFailure('relay_response_invalid',{httpStatus:response.status,elapsedMs,attempt,detail:'json_parse_failed'});
 }
 const detail=unhealthyDetail(body,now);
 if(detail!=='unknown')throw new RelayFailure('relay_unhealthy',{elapsedMs,attempt,detail});
 return {status:'ok',delivered:body.delivered,pending:body.pending,components:body.health?.length};
}

/** @param {string} token @param {typeof fetch} fetcher @param {number} now */
export async function relayWithRetry(token,fetcher=fetch,now=Date.now()){
 let last;
 for(let attempt=1;attempt<=2;attempt++){
  try{return await relay(token,fetcher,now,attempt);}catch(err){
   last=normalizeRelayFailure(err,attempt);
   if(attempt===1&&isRetriableRelayFailure(last))continue;
   throw last;
  }
 }
 throw last;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const fileIndex=process.argv.indexOf('--credential-file');
  const envIndex=process.argv.indexOf('--env-file');
  if(fileIndex<0&&envIndex<0&&!process.env.SYNC_HEALTH_SERVICE_TOKEN)throw new RelayFailure('relay_credential_missing',{attempt:1});
  const token=process.env.SYNC_HEALTH_SERVICE_TOKEN||(fileIndex>=0?readFileSync(process.argv[fileIndex+1],'utf8').trim():relayToken(readFileSync(process.argv[envIndex+1],'utf8')));
  console.log(JSON.stringify(await relayWithRetry(token)));
 }catch(err){
  const failure=normalizeRelayFailure(err);
  console.error(formatRelayFailureLog(failure.toInfo()));
  await reportUnavailable(failure.toInfo());
  process.exitCode=1;
 }
}
