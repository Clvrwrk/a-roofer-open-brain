import type { APIRoute } from "astro";
import { isWorkOsConfigured } from "@lib/auth";
import { agentRuntimeStatuses, workDefinitions } from "@lib/cadence";

export const prerender = false;

export const GET: APIRoute = () => {
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
        runtimeConfigured: Boolean(import.meta.env.AGENT_RUNTIME_URL),
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
