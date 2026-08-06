import type { APIRoute } from "astro";
import {
  buildUnauthorizedResponse,
  hasPermission,
  serializeActor,
} from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import {
  ensureAccountingLinearPair,
  parseAccountingLinearPairInput,
} from "@lib/linear-accounting.server";
import { getRuntimeEnv } from "@lib/runtime-env";

export const prerender = false;

/**
 * Create or repair one immutable CODEX AGENT TEAM source and its linked
 * PE-CC-DevTeam accounting child. Team, parent, project, states, and assignee
 * are server-pinned; callers cannot use this as an arbitrary Linear writer.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (
    !["maya-chen", "ob-accounting", "local-operator"].includes(actor.id)
    || (actor.departmentAccess !== "all" && !actor.departmentAccess.includes("accounting"))
    || !hasPermission(actor, "evidence.attach")
  ) {
    return jsonApiResponse(
      { error: "forbidden", error_description: "The authenticated actor cannot create accounting Linear orchestration." },
      { status: 403 },
    );
  }

  let payload;
  try {
    payload = parseAccountingLinearPairInput(await request.json());
  } catch (error) {
    return jsonApiResponse(
      { error: "invalid_body", error_description: error instanceof Error ? error.message : "Invalid request body." },
      { status: 400 },
    );
  }

  const apiKey = getRuntimeEnv().LINEAR_API_KEY?.trim();
  if (!apiKey) {
    return jsonApiResponse(
      { error: "service_unavailable", error_description: "Linear orchestration is not configured." },
      { status: 503 },
    );
  }

  try {
    const pair = await ensureAccountingLinearPair(payload, { apiKey });
    return jsonApiResponse({
      status: "accepted",
      source: {
        id: pair.source.id,
        identifier: pair.source.identifier,
        url: pair.source.url,
        created: pair.source.created,
      },
      work: {
        id: pair.work.id,
        identifier: pair.work.identifier,
        url: pair.work.url,
        created: pair.work.created,
        parentRepaired: pair.work.parentRepaired,
      },
      actor: serializeActor(actor),
    });
  } catch (error) {
    console.error("[agent-linear-orchestration] provider-confirmed pair failed:", error instanceof Error ? error.message : "unknown");
    return jsonApiResponse(
      { error: "linear_error", error_description: "Linear did not confirm the CAT-first accounting pair." },
      { status: 502 },
    );
  }
};
