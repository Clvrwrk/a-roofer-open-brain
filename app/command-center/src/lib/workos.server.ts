import { WorkOS } from "@workos-inc/node";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

let cachedClient: WorkOS | null = null;
let cachedKeyFingerprint: string | null = null;

export function isWorkOsAuthEnabled(env: RuntimeEnv = getRuntimeEnv()) {
  return (
    env.COMMAND_CENTER_AUTH_MODE === "workos" &&
    Boolean(env.WORKOS_API_KEY && env.WORKOS_CLIENT_ID && env.WORKOS_COOKIE_PASSWORD)
  );
}

export function getWorkOsConfigGaps(env: RuntimeEnv = getRuntimeEnv()) {
  const required = ["WORKOS_API_KEY", "WORKOS_CLIENT_ID", "WORKOS_COOKIE_PASSWORD", "WORKOS_REDIRECT_URI"] as const;
  return required.filter((name) => !env[name]);
}

export function getWorkOs(env: RuntimeEnv = getRuntimeEnv()): WorkOS {
  const apiKey = env.WORKOS_API_KEY;
  const clientId = env.WORKOS_CLIENT_ID;

  if (!apiKey || !clientId) {
    throw new Error("WorkOS is not configured: WORKOS_API_KEY and WORKOS_CLIENT_ID are required.");
  }

  // Re-create the client if credentials rotate at runtime.
  const fingerprint = `${apiKey.slice(0, 8)}:${clientId}`;
  if (!cachedClient || cachedKeyFingerprint !== fingerprint) {
    cachedClient = new WorkOS(apiKey, { clientId });
    cachedKeyFingerprint = fingerprint;
  }

  return cachedClient;
}
