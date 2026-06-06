import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

export const AGENTMAIL_DEFAULT_DOMAIN = "agentmail.proexteriorsus.net";
export const AGENTMAIL_DEFAULT_WEBHOOK_PATH = "/api/agentmail/webhook";

export const AGENTMAIL_WEBHOOK_EVENTS = [
  "message.received",
  "message.sent",
  "message.delivered",
  "message.bounced",
  "message.complained",
  "message.rejected",
] as const;

export type AgentMailWebhookEvent = (typeof AGENTMAIL_WEBHOOK_EVENTS)[number];

export interface AgentMailAgentInbox {
  id: string;
  agentName: string;
  agentType: "vertical" | "horizontal";
  username: string;
  displayName: string;
  slackHandle: string;
  charterPath: string;
  visibility: string;
  owns: string;
  clientId: string;
}

export interface AgentMailOmittedAgent {
  id: string;
  agentName: string;
  reason: string;
}

export interface AgentMailRuntimeConfig {
  configured: boolean;
  apiConfigured: boolean;
  webhookConfigured: boolean;
  domain: string;
  webhookUrl: string | null;
  webhookSecretCount: number;
  missing: string[];
}

export const AGENTMAIL_AGENT_ROSTER: AgentMailAgentInbox[] = [
  {
    id: "accounting",
    agentName: "Accounting",
    agentType: "vertical",
    username: "ob-accounting",
    displayName: "Open Brain Accounting",
    slackHandle: "@ob-accounting",
    charterPath: "agents/vertical/accounting/ROLE.md",
    visibility: "client-facing",
    owns: "invoicing, AR/AP, job costing, change orders, draws, insurance supplements, close",
    clientId: "pro-exteriors-open-brain-accounting-v1",
  },
  {
    id: "ops",
    agentName: "Operations",
    agentType: "vertical",
    username: "ob-ops",
    displayName: "Open Brain Operations",
    slackHandle: "@ob-ops",
    charterPath: "agents/vertical/ops/ROLE.md",
    visibility: "client-facing",
    owns: "scheduling, crews, subs, daily logs, materials, sequencing, safety, permits",
    clientId: "pro-exteriors-open-brain-ops-v1",
  },
  {
    id: "sales",
    agentName: "Sales",
    agentType: "vertical",
    username: "ob-sales",
    displayName: "Open Brain Sales",
    slackHandle: "@ob-sales",
    charterPath: "agents/vertical/sales/ROLE.md",
    visibility: "client-facing",
    owns: "leads, storm canvassing, estimates, insurance claims, proposals, follow-up, win/loss",
    clientId: "pro-exteriors-open-brain-sales-v1",
  },
  {
    id: "marketing",
    agentName: "Marketing",
    agentType: "vertical",
    username: "ob-marketing",
    displayName: "Open Brain Marketing",
    slackHandle: "@ob-marketing",
    charterPath: "agents/vertical/marketing/ROLE.md",
    visibility: "client-facing",
    owns: "content, reviews, photos, EEAT flywheel, schema.org, manufacturer-cert badges",
    clientId: "pro-exteriors-open-brain-marketing-v1",
  },
  {
    id: "exec",
    agentName: "Executive",
    agentType: "vertical",
    username: "ob-exec",
    displayName: "Open Brain Executive",
    slackHandle: "@ob-exec",
    charterPath: "agents/vertical/exec/ROLE.md",
    visibility: "client-facing",
    owns: "dashboards, KPIs, strategy, hiring, capacity",
    clientId: "pro-exteriors-open-brain-exec-v1",
  },
  {
    id: "capture",
    agentName: "Capture",
    agentType: "horizontal",
    username: "ob-capture",
    displayName: "Open Brain Capture",
    slackHandle: "@ob-capture",
    charterPath: "agents/horizontal/capture/ROLE.md",
    visibility: "dashboard-only",
    owns: "always-on atomization and dual-track debrief atomizer",
    clientId: "pro-exteriors-open-brain-capture-v1",
  },
  {
    id: "researcher",
    agentName: "Researcher",
    agentType: "horizontal",
    username: "ob-researcher",
    displayName: "Open Brain Researcher",
    slackHandle: "@ob-researcher",
    charterPath: "agents/horizontal/researcher/ROLE.md",
    visibility: "dashboard-only",
    owns: "external-only retrieval",
    clientId: "pro-exteriors-open-brain-researcher-v1",
  },
  {
    id: "conductor",
    agentName: "Conductor",
    agentType: "horizontal",
    username: "ob-conductor",
    displayName: "Open Brain Conductor",
    slackHandle: "@ob-conductor",
    charterPath: "agents/horizontal/conductor/ROLE.md",
    visibility: "digests and routing",
    owns: "routing, escalation, daily/weekly digests, PM-tool sync",
    clientId: "pro-exteriors-open-brain-conductor-v1",
  },
  {
    id: "innovator",
    agentName: "Innovator",
    agentType: "horizontal",
    username: "ob-innovator",
    displayName: "Open Brain Innovator",
    slackHandle: "@ob-innovator",
    charterPath: "agents/horizontal/innovator/ROLE.md",
    visibility: "A3 proposals",
    owns: "technology scouting and internal pattern proposals",
    clientId: "pro-exteriors-open-brain-innovator-v1",
  },
  {
    id: "maintenance",
    agentName: "Hermes / Maintenance",
    agentType: "horizontal",
    username: "hermes",
    displayName: "Hermes Maintenance",
    slackHandle: "@ob-hermes",
    charterPath: "agents/horizontal/maintenance/ROLE.md",
    visibility: "weekly hygiene and workspace front desk",
    owns: "brain hygiene, workspace navigation, import triage, and structural drift review",
    clientId: "pro-exteriors-open-brain-hermes-v1",
  },
];

export const AGENTMAIL_OMITTED_AGENT_ROSTER: AgentMailOmittedAgent[] = [
  {
    id: "historian",
    agentName: "Historian",
    reason: "Internal-only retrieval boundary; should not receive external email directly.",
  },
  {
    id: "auditor",
    agentName: "Auditor",
    reason: "Gates work products through dashboard and Slack review queues; no direct inbox needed yet.",
  },
  {
    id: "quality-control",
    agentName: "Quality Control",
    reason: "Convenes standards reviews internally; email can route through Conductor until volume proves a need.",
  },
];

function cleanOrigin(value?: string) {
  const normalized = value?.trim().replace(/\/+$/, "");
  return normalized || null;
}

function cleanDomain(value?: string) {
  const normalized = value?.trim().toLowerCase();
  return normalized || AGENTMAIL_DEFAULT_DOMAIN;
}

function splitSecrets(value?: string) {
  return String(value ?? "")
    .split(",")
    .map((secret) => secret.trim())
    .filter(Boolean);
}

export function buildAgentMailAddress(agent: AgentMailAgentInbox, domain = AGENTMAIL_DEFAULT_DOMAIN) {
  return `${agent.username}@${domain}`;
}

export function getAgentMailWebhookSecrets(env: RuntimeEnv = getRuntimeEnv()) {
  const secrets = splitSecrets(env.AGENTMAIL_WEBHOOK_SECRETS);
  if (secrets.length > 0) return secrets;

  return splitSecrets(env.AGENTMAIL_WEBHOOK_SECRET);
}

export function getAgentMailRuntimeConfig(env: RuntimeEnv = getRuntimeEnv()): AgentMailRuntimeConfig {
  const domain = cleanDomain(env.AGENTMAIL_DOMAIN);
  const issuerOrigin = cleanOrigin(env.COMMAND_CENTER_PUBLIC_URL ?? env.AGENT_AUTH_ISSUER);
  const webhookUrl =
    cleanOrigin(env.AGENTMAIL_WEBHOOK_URL) ??
    (issuerOrigin ? `${issuerOrigin}${AGENTMAIL_DEFAULT_WEBHOOK_PATH}` : null);
  const apiConfigured = Boolean(env.AGENTMAIL_API_KEY?.trim());
  const webhookSecretCount = getAgentMailWebhookSecrets(env).length;
  const webhookConfigured = webhookSecretCount > 0;
  const missing: string[] = [];

  if (!apiConfigured) missing.push("AGENTMAIL_API_KEY");
  if (!domain) missing.push("AGENTMAIL_DOMAIN");
  if (!webhookUrl) missing.push("AGENTMAIL_WEBHOOK_URL or COMMAND_CENTER_PUBLIC_URL");
  if (!webhookConfigured) missing.push("AGENTMAIL_WEBHOOK_SECRET or AGENTMAIL_WEBHOOK_SECRETS");

  return {
    configured: apiConfigured && Boolean(domain) && Boolean(webhookUrl) && webhookConfigured,
    apiConfigured,
    webhookConfigured,
    domain,
    webhookUrl,
    webhookSecretCount,
    missing,
  };
}
