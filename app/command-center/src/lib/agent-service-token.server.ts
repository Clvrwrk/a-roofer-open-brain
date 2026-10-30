import {
  getServiceBearerToken,
  hashServiceToken,
  resolveNamedAgentServiceActor,
  type CommandCenterActor,
} from "@lib/access-control";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";
import { createServerSupabaseClient } from "@lib/supabase.server";

interface RegistryTokenRow {
  agent_id: string;
  state: "active" | "revoked";
  not_before: string | null;
  expires_at: string | null;
}

export type RegistryTokenLookup = (tokenHash: string) => Promise<RegistryTokenRow | null>;

function isUsable(row: RegistryTokenRow, now = Date.now()) {
  if (row.state !== "active") return false;
  const notBefore = row.not_before ? Date.parse(row.not_before) : null;
  const expiresAt = row.expires_at ? Date.parse(row.expires_at) : null;
  if ((notBefore !== null && !Number.isFinite(notBefore)) || (expiresAt !== null && !Number.isFinite(expiresAt))) {
    return false;
  }
  return (notBefore === null || notBefore <= now) && (expiresAt === null || now < expiresAt);
}

function buildRegistryLookup(env: RuntimeEnv): RegistryTokenLookup {
  return async (tokenHash) => {
    const { client } = createServerSupabaseClient(env);
    if (!client) return null;

    const { data, error } = await client
      .from("agent_service_token_registry")
      .select("agent_id,state,not_before,expires_at")
      .eq("token_sha256", tokenHash)
      .maybeSingle();

    if (error || !data) return null;
    return data as RegistryTokenRow;
  };
}

/**
 * Resolve a named-agent bearer through the server-only Supabase hash registry.
 * The raw token is never stored in Supabase, logged, or returned to callers.
 */
export async function resolveRegistryServiceActorFromBearer(
  request: Request,
  env: RuntimeEnv = getRuntimeEnv(),
  lookup: RegistryTokenLookup = buildRegistryLookup(env),
): Promise<CommandCenterActor | null> {
  const token = getServiceBearerToken(request);
  if (!token) return null;

  const row = await lookup(hashServiceToken(token));
  if (!row || !isUsable(row)) return null;
  return resolveNamedAgentServiceActor(row.agent_id);
}
