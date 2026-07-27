import type { APIRoute } from "astro";
import { getRuntimeEnv } from "@lib/runtime-env";

export const prerender = false;

function firstSet(...values: Array<string | undefined>) {
  return values.find((value) => value && value !== "__set_me__") ?? null;
}

// Public liveness only. Dependency and credential details belong on authenticated
// readiness surfaces; exposing them here previously created both leakage and false green.
export const GET: APIRoute = async () => {
  const env = getRuntimeEnv();
  return new Response(JSON.stringify({
    status: "ok",
    service: "open-brain-command-center",
    timestamp: new Date().toISOString(),
    buildCommit: firstSet(env.COMMAND_CENTER_BUILD_SHA, env.SOURCE_COMMIT, env.COOLIFY_GIT_COMMIT, env.GIT_COMMIT, env.RAILWAY_GIT_COMMIT_SHA, env.VERCEL_GIT_COMMIT_SHA),
  }), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
};
