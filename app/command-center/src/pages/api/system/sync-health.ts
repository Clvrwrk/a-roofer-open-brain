import {shouldMonitorComponent,syncScope} from "@lib/sync-scope";
import type { APIRoute } from "astro";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { captureException } from "@sentry/astro";
import { loadRuntimeBoard } from "@lib/runtime-status";
import { deliverSyncHealth } from "@lib/sync-health-delivery";
import { sendSyncHealthEvent } from "@lib/sync-health";
export const prerender = false;
// Narrow relay: the auditor's existing service credential can read health and
// relay sanitized event records; it cannot supply event text, destinations or SQL.
export const POST: APIRoute = async ({locals,request}) => {
  if (locals.actor?.type !== "service_agent" || locals.actor.id !== "ob-auditor") {
    return jsonApiResponse({error:"forbidden"},{status:403});
  }
  const {client} = createServerSupabaseClient();
  if (!client) return jsonApiResponse({error:"unconfigured"},{status:503});
  // Exercise the established read-only provider/API probes and feed contracts on
  // a schedule, rather than only when somebody opens the runtime dashboard.
  const input=request?await request.json().catch(()=>({})):{};
  if(input.expectedCommit!==undefined||input.runId!==undefined){
    if(!/^[a-f0-9]{40}$/.test(input.expectedCommit??'')||!/^\d{1,20}$/.test(input.runId??''))return jsonApiResponse({error:'invalid_watchdog_observation'},{status:400});
    const {error}=await client.rpc('record_sync_watchdog',{p_commit:input.expectedCommit,p_run_id:input.runId});
    if(error)return jsonApiResponse({error:'watchdog_record_failed'},{status:503});
  }
  const board = await loadRuntimeBoard();
  for (const c of board.groups.flatMap(g=>g.components).filter(shouldMonitorComponent)) {
    const {error:probeError}=await client.rpc("record_integration_probe",{p_component:c.key,p_ok:c.light==="green",p_code:c.light==="unknown"?"probe_unverified":"probe_failed"});
    if(probeError)return jsonApiResponse({error:"probe_record_failed"},{status:503});
  }
  const {data,error} = await client.from("integration_sync_events")
    .select("event_id,component_key,failures,failure_code,incident_id,occurred_at")
    .is("delivered_at",null).not("component_key","in","(runtime:systemd.openbrain-jt-sentinel,int.jobtread)").order("created_at").limit(20);
  if(error) { captureException(new Error("sync_health_outbox_unavailable")); return jsonApiResponse({error:"health_unavailable"},{status:503}); }
  const delivery=await deliverSyncHealth(data??[],client,sendSyncHealthEvent);
  const {data:health,error:healthError}=await client.from("integration_sync_health").select("component_key,consecutive_failures,failure_code,updated_at").order("component_key");
  if(healthError)return jsonApiResponse({error:"health_unavailable"},{status:503});
  const activeHealth=health?.filter(h=>!['runtime:systemd.openbrain-jt-sentinel','int.jobtread'].includes(h.component_key));
  return jsonApiResponse({status:delivery.healthy?'ok':'relay_failed',...delivery,scope:syncScope(),health:activeHealth,buildCommit:board.deploy?.buildCommit,monitorAt:health?.find(h=>h.component_key==='monitor:integration-sync-health')?.updated_at},{status:delivery.healthy?200:503});
};
