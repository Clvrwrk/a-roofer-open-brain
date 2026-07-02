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
import { getAgentAccessRuntimeConfig } from "@lib/access-control";
import { loadCommandCenterSurface } from "@lib/live-work";

export const prerender = false;

function firstSet(...values: Array<string | undefined>) {
  return values.find((value) => value && value !== "__set_me__") ?? null;
}

export const GET: APIRoute = async () => {
  const supabase = getSupabaseRuntimeConfig();
  const agentAuth = getAgentAuthRuntimeConfig();
  const agentMail = getAgentMailRuntimeConfig();
  const agentAccess = getAgentAccessRuntimeConfig();
  const env = getRuntimeEnv();
  const slackRuntimeConfigured = Boolean(
    env.SLACK_BOT_TOKEN && env.SLACK_APP_TOKEN && env.SLACK_SIGNING_SECRET,
  );
  const liveSurface = supabase.configured
    ? await loadCommandCenterSurface(env).catch((error) => ({
        errors: [error instanceof Error ? error.message : "Live command-center surface failed"],
        items: [],
        status: "degraded" as const,
      }))
    : null;

  return new Response(
    JSON.stringify(
      {
        status: "ok",
        service: "open-brain-command-center",
        phase: "live-command-center",
        timestamp: new Date().toISOString(),
        buildCommit: firstSet(
          env.COMMAND_CENTER_BUILD_SHA,
          env.SOURCE_COMMIT,
          env.COOLIFY_GIT_COMMIT,
          env.GIT_COMMIT,
          env.RAILWAY_GIT_COMMIT_SHA,
          env.VERCEL_GIT_COMMIT_SHA,
        ),
        workDefinitions: workDefinitions.length,
        liveWorkItems: liveSurface?.items.length ?? 0,
        liveSurfaceStatus: liveSurface?.status ?? (supabase.configured ? "degraded" : "unconfigured"),
        liveSurfaceErrors: liveSurface?.errors ?? [],
        requiredRoutes: ["/", "/executive/pipeline", "/api/agent/work-queue"],
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
        agentServiceAuthConfigured: agentAccess.serviceAuthConfigured,
        agentServiceTokenCount: agentAccess.serviceTokenCount,
        namedAgentWorkspaceAccounts: agentAccess.namedAgentCount,
        desktopEnabledNamedAgents: agentAccess.desktopEnabledNamedAgents,
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
