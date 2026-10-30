import type {SupabaseClient} from '@supabase/supabase-js';
// HailRecon is the Interactive Hail Maps (IHM) connection. It is event-driven:
// a quiet weather day is not a missed scheduled pull. Read receipt times only.
export async function loadHailReconReceipt(client:SupabaseClient|null,now=Date.now()){
 if(!client)return {light:'unknown' as const,headline:'Receipt lookup unavailable',lastAt:null};
 try{
  const [latest,pending]=await Promise.all([
   client.from('ihm_hail_alerts').select('created_at').order('created_at',{ascending:false}).limit(1).maybeSingle(),
   client.from('ihm_webhook_raw').select('received_at').eq('verified',true).eq('processed',false).lt('received_at',new Date(now-300000).toISOString()).order('received_at').limit(1).maybeSingle(),
  ]);
  if(latest.error||pending.error)return {light:'red' as const,headline:'HailRecon receipt lookup failed',lastAt:null};
  if(pending.data)return {light:'red' as const,headline:'HailRecon has an unprocessed webhook',lastAt:pending.data.received_at as string};
  if(!latest.data?.created_at)return {light:'unknown' as const,headline:'No accepted hail alert receipt yet',lastAt:null};
  if(!Number.isFinite(Date.parse(latest.data.created_at)))return {light:'red' as const,headline:'HailRecon receipt timestamp invalid',lastAt:null};
  return {light:'green' as const,headline:'Accepted hail alert receipt available',lastAt:latest.data.created_at as string};
 }catch{return {light:'red' as const,headline:'HailRecon receipt lookup failed',lastAt:null};}
}
