import type { RuntimeEnv } from "@lib/runtime-env";
import { PEC78_CONTRACT_VERSION, pec78Mode } from "./contract";

export function getPec78Readiness(env: RuntimeEnv) {
  const mode = pec78Mode(env.PEC78_ADAPTER_MODE);
  const checks = [
    { id: "adapter_enabled", ok: mode === "enabled", code: mode },
    { id: "production_gate", ok: Boolean(env.PEC78_PRODUCTION_GATE_DIGEST), code: env.PEC78_PRODUCTION_GATE_DIGEST ? "configured" : "missing" },
    { id: "maya_public_key", ok: Boolean(env.PEC78_MAYA_PUBLIC_JWK && env.PEC78_MAYA_JWK_THUMBPRINT), code: env.PEC78_MAYA_PUBLIC_JWK ? "configured" : "missing" },
    { id: "registry_version", ok: Boolean(env.PEC78_REGISTRY_VERSION), code: env.PEC78_REGISTRY_VERSION ? "configured" : "missing" },
  ].map((check) => ({ ...check, observedAt: new Date().toISOString() }));
  // Installed-disabled has no authoritative DB probe/RPC. It is intentionally
  // impossible for configuration strings alone to produce a green readiness.
  return { contractVersion: PEC78_CONTRACT_VERSION, status: mode === "disabled" ? "stopped" : "degraded", observedAt: new Date().toISOString(), maxAgeSeconds: 60, checks, buildCommit: env.COMMAND_CENTER_BUILD_SHA ?? env.SOURCE_COMMIT ?? null, registryVersion: env.PEC78_REGISTRY_VERSION ?? null };
}
