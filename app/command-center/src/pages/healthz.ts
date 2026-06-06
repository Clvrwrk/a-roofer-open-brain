import type { APIRoute } from "astro";
import { getAgentAuthRuntimeConfig } from "@lib/agent-auth";
import { isWorkOsConfigured } from "@lib/auth";
import { agentRuntimeStatuses, workDefinitions } from "@lib/cadence";
import { getRuntimeEnv } from "@lib/runtime-env";
import { getSupabaseRuntimeConfig } from "@lib/supabase.server";
import {
  AGENTMAIL_AGENT_ROSTER,
  AGENTMAIL_OMITTED_AGENT_ROSTER,
  getAgentMailRuntimeConfig,
} from "@lib/agentmail";

export const prerender = false;

export const GET: APIRoute = () => {
  const supabase = getSupabaseRuntimeConfig();
  const agentAuth = getAgentAuthRuntimeConfig();
  const agentMail = getAgentMailRuntimeConfig();
  const env = getRuntimeEnv();
  const slackRuntimeConfigured = Boolean(
    env.SLACK_BOT_TOKEN && env.SLACK_APP_TOKEN && env.SLACK_SIGNING_SECRET,
  );

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
        runtimeConfigured: Boolean(env.AGENT_RUNTIME_URL || slackRuntimeConfigured || agentMail.configured),
        slackRuntimeConfigured,
        agentMailConfigured: agentMail.configured,
        agentMailApiConfigured: agentMail.apiConfigured,
        agentMailWebhookConfigured: agentMail.webhookConfigured,
        agentMailDomain: agentMail.domain,
        agentMailAgentInboxes: AGENTMAIL_AGENT_ROSTER.length,
        agentMailOmittedAgents: AGENTMAIL_OMITTED_AGENT_ROSTER.length,
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
