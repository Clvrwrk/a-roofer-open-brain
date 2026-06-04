export interface CommandCenterUser {
  name: string;
  role: string;
  authMode: "local" | "workos-ready";
}

export function isWorkOsConfigured(env: ImportMetaEnv = import.meta.env) {
  return Boolean(env.WORKOS_CLIENT_ID && env.WORKOS_COOKIE_PASSWORD);
}

export function getCommandCenterUser(env: ImportMetaEnv = import.meta.env): CommandCenterUser {
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
