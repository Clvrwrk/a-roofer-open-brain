import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

export interface CommandCenterUser {
  name: string;
  role: string;
  authMode: "local" | "workos-ready";
}

export function isWorkOsConfigured(env: RuntimeEnv = getRuntimeEnv()) {
  return Boolean(env.WORKOS_CLIENT_ID && env.WORKOS_COOKIE_PASSWORD);
}

export function getCommandCenterUser(env: RuntimeEnv = getRuntimeEnv()): CommandCenterUser {
  if (isWorkOsConfigured(env) && env.COMMAND_CENTER_AUTH_MODE === "workos") {
    return {
      name: "Authenticated Operator",
      role: "WorkOS protected",
      authMode: "workos-ready",
    };
  }

  return {
    name: "Local Operator",
    role: "Phase 1 shell",
    authMode: "local",
  };
}
