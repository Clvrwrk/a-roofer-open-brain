import { createHash, timingSafeEqual } from "node:crypto";
import type { APIRoute } from "astro";
import { getRuntimeEnv } from "@lib/runtime-env";
import { pec78Json, pec78Mode } from "@lib/pec78/contract";
import { verifyPec78Request } from "@lib/pec78/auth.server";
import { getPec78Readiness } from "@lib/pec78/readiness.server";

export const prerender = false;

function readinessAuthorized(request: Request, expectedDigest: string | undefined): boolean {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token || !expectedDigest?.startsWith("sha256:")) return false;
  const actual = `sha256:${createHash("sha256").update(token).digest("hex")}`;
  const a = Buffer.from(actual); const b = Buffer.from(expectedDigest);
  return a.length === b.length && timingSafeEqual(a, b);
}

const handle: APIRoute = async ({ request, url }) => {
  const env = getRuntimeEnv();
  if (request.method === "GET" && url.pathname === "/api/agent/runtime/v1/readiness") {
    if (!readinessAuthorized(request, env.PEC78_READINESS_TOKEN_SHA256)) return pec78Json(401, "authentication_required");
    const report = getPec78Readiness(env);
    return new Response(JSON.stringify(report), { status: report.status === "ready" ? 200 : 503, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }
  if (pec78Mode(env.PEC78_ADAPTER_MODE) === "disabled") return pec78Json(423, "adapter_stopped");
  const result = await verifyPec78Request(request, env);
  if (!result.ok) return pec78Json(result.status, result.code);
  // Installed-disabled/shadow includes the complete auth boundary but no mutable
  // store or provider adapter. Authenticated calls still deny until reviewed RPCs exist.
  return pec78Json(503, "authorization_state_unavailable");
};

export const GET = handle;
export const POST = handle;
