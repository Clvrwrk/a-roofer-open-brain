import type {SupabaseClient} from '@supabase/supabase-js';
import type {RuntimeEnv} from './runtime-env';
import {probeIntegrations} from './integration-probes.server';
import {EDGE_FUNCTIONS} from './runtime-registry';
export async function loadEdgeOutcomes(client:SupabaseClient|null,env:RuntimeEnv,now=Date.now()){
 const names=EDGE_FUNCTIONS.filter(f=>f.name!=='acculynx-sync');
 const specs=names.map(f=>({key:f.key,label:f.label,purpose:f.purpose,url:`{SUPABASE_URL}/functions/v1/${f.name}?health=1`,expectAnon:200,expectAuthed:200,authEnv:'SUPABASE_SERVICE_ROLE_KEY',auth:'apikey' as const,expectBody:'invocation-outcome-v1'}));
 const [probes,receipts]=await Promise.all([
  probeIntegrations(specs,env,now),
  client?client.from('integration_sync_health').select('component_key,consecutive_failures,failure_code,last_observed_at').like('component_key','api.edge.%'):Promise.resolve({data:null,error:{message:'unconfigured'}}),
 ]);
 return names.map(f=>{
  const probe=probes.find(p=>p.key===f.key);const receipt=receipts.data?.find(h=>h.component_key===`api.edge.${f.name}`);
  const light=receipts.error||!probe?.ok?'red':receipt?.consecutive_failures?'red':'green';
  return {key:f.key,monitorKey:`api.edge-health.${f.name}`,group:'edge',kind:'edge_function' as const,label:f.label,purpose:f.purpose,light:light as 'green'|'red',
   headline:receipts.error?'Outcome receipt lookup failed':!probe?.ok?'Read-only edge health check failed':receipt?.consecutive_failures?`Latest observed POST failed · ${receipt.consecutive_failures} consecutive failures`:receipt?'Ready · latest observed POST succeeded':'Ready · no observed POST yet',
   detail:'Read-only handler/database health plus durable POST outcome receipts. On-demand functions have no scheduled freshness requirement. Health checks and rejected requests never clear a failed execution.',
   cadenceLabel:'health every 5 min · outcomes per invocation',lastAt:receipt?.last_observed_at??probe?.checkedAt??null,evidence:[`observer: ${probe?.ok?'invocation-outcome-v1':'unverified'}`,...receipt?.failure_code?[`failure: ${receipt.failure_code}`]:[]]};
 });
}
