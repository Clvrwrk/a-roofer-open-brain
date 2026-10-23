import type { APIRoute } from "astro";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { captureException } from "@sentry/astro";
import { loadRuntimeBoard } from "@lib/runtime-status";
import { sendSyncHealthEvent } from "@lib/sync-health";
export const prerender = false;
// Narrow relay: the auditor's existing service credential can read health and
// relay sanitized event records; it cannot supply event text, destinations or SQL.
export const POST: APIRoute = async ({locals}) => {
  if (locals.actor?.type !== "service_agent" || locals.actor.id !== "ob-auditor") {
    return jsonApiResponse({error:"forbidden"},{status:403});
  }
  const {client} = createServerSupabaseClient();
  if (!client) return jsonApiResponse({error:"unconfigured"},{status:503});
  // Exercise the established read-only provider/API probes and feed contracts on
  // a schedule, rather than only when somebody opens the runtime dashboard.
  const board = await loadRuntimeBoard();
  for (const c of board.groups.flatMap(g=>g.components).filter(c=>["integrations","feeds","site"].includes(c.group))) {
    const {error:probeError}=await client.rpc("record_integration_probe",{p_component:c.key,p_ok:c.light==="green",p_code:c.light==="unknown"?"probe_unverified":"probe_failed"});
    if(probeError)return jsonApiResponse({error:"probe_record_failed"},{status:503});
  }
  const {data,error} = await client.from("integration_sync_events")
    .select("event_id,component_key,failures,failure_code,incident_id")
    .is("delivered_at",null).order("created_at").limit(20);
  if(error) { captureException(new Error("sync_health_outbox_unavailable")); return jsonApiResponse({error:"health_unavailable"},{status:503}); }
  let delivered=0;
  for(const e of data??[]) {
    if(await sendSyncHealthEvent(e)) {
      const {error:ack}=await client.from("integration_sync_events").update({delivered_at:new Date().toISOString()}).eq("event_id",e.event_id);
      if(!ack)delivered++;
    }
  }
  const {data:health,error:healthError}=await client.from("integration_sync_health").select("component_key,consecutive_failures,failure_code,updated_at").order("component_key");
  if(healthError)return jsonApiResponse({error:"health_unavailable"},{status:503});
  return jsonApiResponse({status:"ok",delivered,health,monitorAt:health?.find(h=>h.component_key==="monitor:integration-sync-health")?.updated_at});
};
