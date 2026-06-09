import type { APIRoute } from "astro";
import {
  DESKTOP_PERSONAS,
  NAMED_AGENT_IDENTITIES,
  SERVICE_AGENT_IDENTITIES,
  buildUnauthorizedResponse,
  getAgentAccessRuntimeConfig,
  serializeActor,
} from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { getRuntimeEnv } from "@lib/runtime-env";

export const prerender = false;

export const GET: APIRoute = ({ locals }) => {
  const env = getRuntimeEnv();
  const actor = locals.actor;

  if (!actor) return buildUnauthorizedResponse();

  return jsonApiResponse({
    status: "ok",
    actor: serializeActor(actor),
    access: {
      humanPath: "WorkOS-authenticated browser session",
      namedAgentPath: "WorkOS-authenticated desktop browser session using cc.proexteriorsus.net Workspace identity",
      serviceAgentPath: "Authorization: Bearer <agent service token>",
    },
    roster: {
      namedAgents: NAMED_AGENT_IDENTITIES.map((agent) => ({
        id: agent.id,
        displayName: agent.displayName,
        email: agent.email,
        desktopEnabled: agent.desktopEnabled,
        mapsTo: agent.mapsTo,
        departmentAccess: agent.departmentAccess,
      })),
      serviceAgents: SERVICE_AGENT_IDENTITIES.map((agent) => ({
        id: agent.id,
        displayName: agent.displayName,
        handle: agent.handle,
        roles: agent.roles,
        departmentAccess: agent.departmentAccess,
      })),
      desktops: DESKTOP_PERSONAS,
    },
    runtime: getAgentAccessRuntimeConfig(env),
  });
};
