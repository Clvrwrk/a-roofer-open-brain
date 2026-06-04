// index.ts — the internal brain MCP server (MCP container on Hetzner entry).
// Deno runtime. Auth via a per-container access key (one key per boundary, see
// SECURITY.md). Reaches PostgREST as service_role using env secrets only.
//
// Deploy: trigger the brain-mcp Coolify app deploy hook or redeploy from Coolify.
// Local:  deno task serve   (reads .env via --allow-env)

import { createBrainDb } from "./functions/db.ts";
import { callTool, listTools } from "./functions/tools.ts";

interface RpcRequest {
  method?: string; // "tools/list" | "tools/call"
  // convenience form:
  tool?: string;
  args?: Record<string, unknown>;
  // MCP-ish form:
  params?: { name?: string; arguments?: Record<string, unknown> };
}

function env(key: string): string {
  // deno-lint-ignore no-explicit-any
  const v = (globalThis as any).Deno?.env?.get(key);
  if (!v) throw new Error(`missing env: ${key}`);
  return v;
}

/** Constant-time-ish access-key comparison. */
function keyOk(provided: string | null, expected: string): boolean {
  if (!provided || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const expectedKey = env("OB_ACCESS_KEY_HISTORIAN");
  if (!keyOk(req.headers.get("x-ob-access-key"), expectedKey)) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: RpcRequest;
  try {
    payload = (await req.json()) as RpcRequest;
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const method = payload.method ?? (payload.tool ? "tools/call" : "tools/list");
  if (method === "tools/list") {
    return json({ ok: true, tools: listTools() });
  }

  if (method === "tools/call") {
    const name = payload.tool ?? payload.params?.name ?? "";
    const args = payload.args ?? payload.params?.arguments ?? {};
    const db = createBrainDb({
      url: env("SUPABASE_URL"),
      serviceRoleKey: env("SUPABASE_SERVICE_ROLE_KEY"),
    });
    const result = await callTool(db, name, args);
    return json(result, result.ok ? 200 : 400);
  }

  return json({ error: `unknown method: ${method}` }, 400);
}

// Boot the server when run directly (Deno.serve exists in the Edge runtime).
// deno-lint-ignore no-explicit-any
const D = (globalThis as any).Deno;
if (D?.serve) {
  D.serve(handle);
}
