import type { APIRoute } from "astro";
import { getAgentAuthRuntimeConfig } from "@lib/agent-auth";
import { isWorkOsConfigured } from "@lib/auth";
import { agentRuntimeStatuses, workDefinitions } from "@lib/cadence";
import { getSupabaseRuntimeConfig } from "@lib/supabase.server";

export const prerender = false;

export const GET: APIRoute = () => {
  const supabase = getSupabaseRuntimeConfig();
  const agentAuth = getAgentAuthRuntimeConfig();

  return new Response(
    JSON.stringify(
      {
        status: "ok",
        service: "open-brain-command-center",
        phase: "phase-1-walking-skeleton",
        timestamp: new Date().toISOString(),
        workDefinitions: workDefinitions.length,
        trackedAgents: agentRuntimeStatuses.length,
        workOsConfigured: isWorkOsConfigured(),
        supabaseConfigured: supabase.configured,
        supabaseProjectRef: supabase.projectRef,
        runtimeConfigured: Boolean(import.meta.env.AGENT_RUNTIME_URL),
        agentAuthIssuer: agentAuth.issuer,
        agentAuthDiscovery: true,
      },
      null,
      2,
    ),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
};
