import type { CommandCenterActor } from "@lib/access-control";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

export interface CommandCenterUser {
  name: string;
  role: string;
  email: string | null;
  authMode: "local" | "workos";
}

export function isWorkOsConfigured(env: RuntimeEnv = getRuntimeEnv()) {
  return Boolean(env.WORKOS_API_KEY && env.WORKOS_CLIENT_ID && env.WORKOS_COOKIE_PASSWORD);
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin / CEO",
  purchasing: "Purchasing",
  accounting: "Accounting",
  viewer: "Viewer",
  member: "Team Member",
  "named-agent": "Named Agent",
};

function roleLabel(actor: CommandCenterActor) {
  for (const role of actor.roles) {
    if (ROLE_LABELS[role]) return ROLE_LABELS[role];
  }
  return actor.roles[0] ?? "Operator";
}

/** Derive the shell identity from the middleware-resolved actor. */
export function getCommandCenterUser(actor?: CommandCenterActor | null): CommandCenterUser {
  if (actor && actor.source === "workos") {
    return {
      name: actor.displayName,
      role: roleLabel(actor),
      email: actor.email,
      authMode: "workos",
    };
  }

  return {
    name: "Local Operator",
    role: "Phase 1 shell",
    email: null,
    authMode: "local",
  };
}
