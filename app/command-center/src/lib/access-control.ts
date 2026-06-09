import { createHash, timingSafeEqual } from "node:crypto";
import type { DepartmentId, WorkDefinition } from "@lib/cadence";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

export type CommandCenterActorType = "human" | "named_agent" | "service_agent" | "local_operator";

export type CommandCenterPermission =
  | "command_center.read"
  | "work_queue.read"
  | "approval.decide"
  | "approval.request_more_evidence"
  | "evidence.attach"
  | "agent.resume"
  | "desktop.command_center_ui";

export type WorkQueueDecision =
  | "approve"
  | "reject"
  | "needs_more_evidence"
  | "resume_agent"
  | "assign"
  | "snooze"
  | "mark_done"
  | "external_sent"
  | "external_received";

export interface CommandCenterActor {
  id: string;
  type: CommandCenterActorType;
  displayName: string;
  email: string | null;
  source: "workos" | "service_token" | "local";
  roles: string[];
  permissions: CommandCenterPermission[];
  departmentAccess: DepartmentId[] | "all";
  desktopEnabled: boolean;
}

export interface NamedAgentIdentity {
  id: string;
  displayName: string;
  email: string;
  mapsTo: string[];
  desktopEnabled: boolean;
  departmentAccess: DepartmentId[];
  role: string;
}

export interface ServiceAgentIdentity {
  id: string;
  displayName: string;
  handle: string;
  departmentAccess: DepartmentId[] | "all";
  roles: string[];
}

export interface DesktopPersona {
  id: string;
  displayName: string;
  workspaceEmail: string;
  desktopEnabled: boolean;
  desktopName: string | null;
  primaryUse: string;
}

const HUMAN_PERMISSIONS: CommandCenterPermission[] = [
  "command_center.read",
  "work_queue.read",
  "approval.decide",
  "approval.request_more_evidence",
  "evidence.attach",
  "agent.resume",
  "desktop.command_center_ui",
];

const NAMED_AGENT_PERMISSIONS: CommandCenterPermission[] = [
  "command_center.read",
  "work_queue.read",
  "approval.request_more_evidence",
  "evidence.attach",
  "agent.resume",
  "desktop.command_center_ui",
];

const SERVICE_AGENT_PERMISSIONS: CommandCenterPermission[] = [
  "command_center.read",
  "work_queue.read",
  "approval.request_more_evidence",
  "evidence.attach",
  "agent.resume",
];

const VIEWER_PERMISSIONS: CommandCenterPermission[] = ["command_center.read", "work_queue.read"];

export const NAMED_AGENT_IDENTITIES: NamedAgentIdentity[] = [
  {
    id: "maya-chen",
    displayName: "Maya Chen",
    email: "maya.chen@cc.proexteriorsus.net",
    mapsTo: ["@ob-accounting", "Capture"],
    desktopEnabled: true,
    departmentAccess: ["accounting", "system"],
    role: "document-intake",
  },
  {
    id: "alex-rivers",
    displayName: "Alex Rivers",
    email: "alex.rivers@cc.proexteriorsus.net",
    mapsTo: ["@ob-accounting", "@ob-ops", "Auditor"],
    desktopEnabled: true,
    departmentAccess: ["accounting", "operations", "system"],
    role: "pricing-catalog",
  },
  {
    id: "casey-morgan",
    displayName: "Casey Morgan",
    email: "casey.morgan@cc.proexteriorsus.net",
    mapsTo: ["@ob-accounting", "Conductor"],
    desktopEnabled: true,
    departmentAccess: ["accounting", "system"],
    role: "vendor-draft",
  },
  {
    id: "jordan-price",
    displayName: "Jordan Price",
    email: "jordan.price@cc.proexteriorsus.net",
    mapsTo: ["@ob-accounting"],
    desktopEnabled: false,
    departmentAccess: ["accounting", "executive"],
    role: "finance-reporting",
  },
  {
    id: "lena-brooks",
    displayName: "Lena Brooks",
    email: "lena.brooks@cc.proexteriorsus.net",
    mapsTo: ["@ob-marketing"],
    desktopEnabled: true,
    departmentAccess: ["marketing"],
    role: "marketing-proof",
  },
  {
    id: "rowan-vale",
    displayName: "Rowan Vale",
    email: "rowan.vale@cc.proexteriorsus.net",
    mapsTo: ["Researcher"],
    desktopEnabled: true,
    departmentAccess: ["marketing", "executive", "system"],
    role: "external-research",
  },
  {
    id: "sam-torres",
    displayName: "Sam Torres",
    email: "sam.torres@cc.proexteriorsus.net",
    mapsTo: ["Auditor", "Quality Control", "Conductor"],
    desktopEnabled: false,
    departmentAccess: ["system", "executive", "accounting"],
    role: "qa-compliance",
  },
];

export const DESKTOP_PERSONAS: DesktopPersona[] = NAMED_AGENT_IDENTITIES.map((agent) => ({
  id: agent.id,
  displayName: agent.displayName,
  workspaceEmail: agent.email,
  desktopEnabled: agent.desktopEnabled,
  desktopName: agent.desktopEnabled ? `pe-${agent.id}` : null,
  primaryUse:
    agent.id === "maya-chen"
      ? "Invoice/order/PDF intake, Drive, and approved vendor portal downloads"
      : agent.id === "alex-rivers"
        ? "Price agreements, SKU/UOM evidence, and product catalog checks"
        : agent.id === "casey-morgan"
          ? "Vendor challenge drafts and human-approved send packets"
          : agent.id === "lena-brooks"
            ? "Reviews, Google Business Profile, YouTube/Drive media, and content workflows"
            : agent.id === "rowan-vale"
              ? "External-only newsletters, source monitoring, and public research signups"
              : "Workspace identity without persistent desktop",
}));

export const SERVICE_AGENT_IDENTITIES: ServiceAgentIdentity[] = [
  {
    id: "ob-accounting",
    displayName: "Accounting",
    handle: "@ob-accounting",
    departmentAccess: ["accounting"],
    roles: ["vertical", "accounting"],
  },
  {
    id: "ob-ops",
    displayName: "Operations",
    handle: "@ob-ops",
    departmentAccess: ["operations"],
    roles: ["vertical", "operations"],
  },
  {
    id: "ob-sales",
    displayName: "Sales",
    handle: "@ob-sales",
    departmentAccess: ["sales"],
    roles: ["vertical", "sales"],
  },
  {
    id: "ob-marketing",
    displayName: "Marketing",
    handle: "@ob-marketing",
    departmentAccess: ["marketing"],
    roles: ["vertical", "marketing"],
  },
  {
    id: "ob-exec",
    displayName: "Executive",
    handle: "@ob-exec",
    departmentAccess: ["executive"],
    roles: ["vertical", "executive"],
  },
  {
    id: "ob-capture",
    displayName: "Capture",
    handle: "@ob-capture",
    departmentAccess: ["system"],
    roles: ["horizontal", "capture"],
  },
  {
    id: "ob-researcher",
    displayName: "Researcher",
    handle: "@ob-researcher",
    departmentAccess: ["marketing", "executive", "system"],
    roles: ["horizontal", "researcher", "external-only"],
  },
  {
    id: "ob-conductor",
    displayName: "Conductor",
    handle: "@ob-conductor",
    departmentAccess: "all",
    roles: ["horizontal", "conductor", "router"],
  },
  {
    id: "ob-innovator",
    displayName: "Innovator",
    handle: "@ob-innovator",
    departmentAccess: ["executive", "system"],
    roles: ["horizontal", "innovator"],
  },
  {
    id: "ob-historian",
    displayName: "Historian",
    handle: "@ob-historian",
    departmentAccess: ["system"],
    roles: ["horizontal", "historian", "internal-only"],
  },
  {
    id: "ob-auditor",
    displayName: "Auditor",
    handle: "@ob-auditor",
    departmentAccess: "all",
    roles: ["horizontal", "auditor"],
  },
  {
    id: "ob-quality-control",
    displayName: "Quality Control",
    handle: "@ob-quality-control",
    departmentAccess: "all",
    roles: ["horizontal", "quality-control"],
  },
  {
    id: "hermes",
    displayName: "Hermes / Maintenance",
    handle: "@ob-hermes",
    departmentAccess: ["system"],
    roles: ["horizontal", "maintenance", "internal-only"],
  },
];

function splitCsv(value?: string) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseServiceTokenEnv(value?: string) {
  return splitCsv(value).map((entry) => {
    const [agentId, ...tokenParts] = entry.split(":");
    return {
      agentId: agentId?.trim(),
      token: tokenParts.join(":").trim(),
    };
  });
}

function serviceAgentToActor(agent: ServiceAgentIdentity): CommandCenterActor {
  return {
    id: agent.id,
    type: "service_agent",
    displayName: agent.displayName,
    email: null,
    source: "service_token",
    roles: agent.roles,
    permissions: SERVICE_AGENT_PERMISSIONS,
    departmentAccess: agent.departmentAccess,
    desktopEnabled: false,
  };
}

function namedAgentToActor(agent: NamedAgentIdentity): CommandCenterActor {
  return {
    id: agent.id,
    type: "named_agent",
    displayName: agent.displayName,
    email: agent.email,
    source: "workos",
    roles: ["named-agent", agent.role],
    permissions: NAMED_AGENT_PERMISSIONS,
    departmentAccess: agent.departmentAccess,
    desktopEnabled: agent.desktopEnabled,
  };
}

function humanActor(
  email: string,
  displayName: string,
  roles: string[],
  permissions: CommandCenterPermission[],
  departmentAccess: DepartmentId[] | "all",
): CommandCenterActor {
  return {
    id: email,
    type: "human",
    displayName,
    email,
    source: "workos",
    roles,
    permissions,
    departmentAccess,
    desktopEnabled: false,
  };
}

export function localActor(): CommandCenterActor {
  return {
    id: "local-operator",
    type: "local_operator",
    displayName: "Local Operator",
    email: null,
    source: "local",
    roles: ["local", "admin"],
    permissions: HUMAN_PERMISSIONS,
    departmentAccess: "all",
    desktopEnabled: false,
  };
}

function isHumanAdminEmail(email: string | null, env: RuntimeEnv) {
  const adminEmails = splitCsv(env.COMMAND_CENTER_HUMAN_ADMIN_EMAILS);
  const normalized = cleanEmail(email);
  const allowlist = adminEmails.length > 0 ? adminEmails : ["admin@cc.proexteriorsus.net"];
  return Boolean(normalized && allowlist.map((item) => item.toLowerCase()).includes(normalized));
}

function isEmailOnList(email: string, listCsv?: string) {
  return splitCsv(listCsv)
    .map((item) => item.toLowerCase())
    .includes(email);
}

function isViewerDomain(email: string, env: RuntimeEnv) {
  const domain = email.split("@")[1];
  if (!domain) return false;
  return splitCsv(env.COMMAND_CENTER_VIEWER_DOMAINS)
    .map((item) => item.toLowerCase().replace(/^@/, ""))
    .includes(domain);
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function getServiceTokenHashEnvKey(agentId: string) {
  return `AGENT_SERVICE_TOKEN_SHA256_${agentId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

export function getAgentAccessRuntimeConfig(env: RuntimeEnv = getRuntimeEnv()) {
  const configuredCsvTokens = parseServiceTokenEnv(env.AGENT_SERVICE_TOKENS).filter(
    (entry) => entry.agentId && entry.token,
  ).length;
  const configuredHashedTokens = SERVICE_AGENT_IDENTITIES.filter(
    (agent) => env[getServiceTokenHashEnvKey(agent.id)],
  ).length;

  return {
    serviceAuthConfigured: configuredCsvTokens + configuredHashedTokens > 0,
    serviceTokenCount: configuredCsvTokens + configuredHashedTokens,
    namedAgentCount: NAMED_AGENT_IDENTITIES.length,
    desktopEnabledNamedAgents: NAMED_AGENT_IDENTITIES.filter((agent) => agent.desktopEnabled).length,
    serviceAgentCount: SERVICE_AGENT_IDENTITIES.length,
  };
}

export function resolveServiceActorFromToken(token: string | null, env: RuntimeEnv = getRuntimeEnv()) {
  if (!token) return null;

  for (const entry of parseServiceTokenEnv(env.AGENT_SERVICE_TOKENS)) {
    if (!entry.agentId || !entry.token) continue;
    if (safeEqual(hashToken(token), hashToken(entry.token))) {
      const agent = SERVICE_AGENT_IDENTITIES.find((candidate) => candidate.id === entry.agentId);
      if (agent) return serviceAgentToActor(agent);
    }
  }

  const tokenHash = hashToken(token);
  for (const agent of SERVICE_AGENT_IDENTITIES) {
    const configuredHash = env[getServiceTokenHashEnvKey(agent.id)]?.trim();
    if (configuredHash && safeEqual(tokenHash, configuredHash)) {
      return serviceAgentToActor(agent);
    }
  }

  return null;
}

/** Bearer-token resolution for service agents (no header-based identity trust). */
export function resolveServiceActorFromBearer(request: Request, env: RuntimeEnv = getRuntimeEnv()) {
  return resolveServiceActorFromToken(getBearerToken(request), env);
}

export interface WorkOsSessionIdentity {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * Map a verified WorkOS session identity to a Command Center actor.
 * Order: named agent roster -> admin allowlist -> purchasing -> accounting -> viewer domain.
 * Returns null for authenticated-but-unauthorized identities (middleware sends those to /auth/denied).
 *
 * Identity headers (x-workos-user-email and friends) are intentionally NOT consulted
 * anywhere: the only trusted human identity source is the sealed WorkOS session.
 */
export function resolveActorFromSessionUser(
  user: WorkOsSessionIdentity,
  env: RuntimeEnv = getRuntimeEnv(),
): CommandCenterActor | null {
  const email = cleanEmail(user.email);
  if (!email) return null;

  const namedAgent = NAMED_AGENT_IDENTITIES.find((agent) => agent.email === email);
  if (namedAgent) return namedAgentToActor(namedAgent);

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || email;

  if (isHumanAdminEmail(email, env)) {
    return humanActor(email, displayName, ["human", "admin", "ceo"], HUMAN_PERMISSIONS, "all");
  }

  if (isEmailOnList(email, env.COMMAND_CENTER_ROLE_PURCHASING_EMAILS)) {
    return humanActor(email, displayName, ["human", "purchasing"], HUMAN_PERMISSIONS, ["accounting", "operations"]);
  }

  if (isEmailOnList(email, env.COMMAND_CENTER_ROLE_ACCOUNTING_EMAILS)) {
    return humanActor(email, displayName, ["human", "accounting"], HUMAN_PERMISSIONS, ["accounting"]);
  }

  if (isViewerDomain(email, env)) {
    return humanActor(email, displayName, ["human", "viewer"], VIEWER_PERMISSIONS, "all");
  }

  return null;
}

export function hasPermission(actor: CommandCenterActor, permission: CommandCenterPermission) {
  return actor.permissions.includes(permission);
}

export function actorCanAccessDepartment(actor: CommandCenterActor, department: DepartmentId) {
  return actor.departmentAccess === "all" || actor.departmentAccess.includes(department);
}

export function actorCanAccessWork(actor: CommandCenterActor, work: WorkDefinition) {
  return hasPermission(actor, "work_queue.read") && actorCanAccessDepartment(actor, work.department);
}

export function getAllowedDecisions(actor: CommandCenterActor, work: WorkDefinition): WorkQueueDecision[] {
  const decisions: WorkQueueDecision[] = [];

  if (work.approval !== "none" && hasPermission(actor, "approval.decide")) {
    decisions.push("approve", "reject");
  }

  if (hasPermission(actor, "approval.decide")) {
    decisions.push("assign", "snooze", "mark_done", "external_sent", "external_received");
  }

  if (hasPermission(actor, "approval.request_more_evidence")) {
    decisions.push("needs_more_evidence");
  }

  if (hasPermission(actor, "agent.resume")) {
    decisions.push("resume_agent");
  }

  return decisions;
}

export function canSubmitDecision(actor: CommandCenterActor, work: WorkDefinition, decision: WorkQueueDecision) {
  return actorCanAccessWork(actor, work) && getAllowedDecisions(actor, work).includes(decision);
}

export function serializeActor(actor: CommandCenterActor) {
  return {
    id: actor.id,
    type: actor.type,
    displayName: actor.displayName,
    email: actor.email,
    source: actor.source,
    roles: actor.roles,
    permissions: actor.permissions,
    departmentAccess: actor.departmentAccess,
    desktopEnabled: actor.desktopEnabled,
  };
}

export function buildUnauthorizedResponse() {
  return new Response(
    JSON.stringify(
      {
        error: "unauthorized",
        error_description:
          "Use a WorkOS-authenticated Command Center session or an agent service bearer token.",
      },
      null,
      2,
    ),
    {
      status: 401,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "www-authenticate": 'Bearer realm="open-brain-command-center"',
      },
    },
  );
}
