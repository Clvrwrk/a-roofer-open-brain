#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const API_BASE_URL = "https://api.agentmail.to/v0";
const DEFAULT_DOMAIN = "agentmail.proexteriorsus.net";
const DEFAULT_WEBHOOK_URL = "https://cc.proexteriorsus.net/api/agentmail/webhook";
const DEFAULT_OUTPUT = "deployment/remote/agentmail/pro-exteriors-agentmail-roster.json";
const DEFAULT_SECRET_OUTPUT = "/private/tmp/pro-exteriors-agentmail-webhooks.env";
const WEBHOOK_EVENTS = [
  "message.received",
  "message.sent",
  "message.delivered",
  "message.bounced",
  "message.complained",
  "message.rejected",
];

const ROSTER = [
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
    id: "historian",
    agentName: "Historian",
    agentType: "horizontal",
    username: "ob-historian",
    displayName: "Open Brain Historian",
    slackHandle: "@ob-historian",
    charterPath: "agents/horizontal/historian/ROLE.md",
    visibility: "via Conductor",
    owns: "internal-only retrieval with provenance",
    clientId: "pro-exteriors-open-brain-historian-v1",
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
    id: "auditor",
    agentName: "Auditor",
    agentType: "horizontal",
    username: "ob-auditor",
    displayName: "Open Brain Auditor",
    slackHandle: "@ob-auditor",
    charterPath: "agents/horizontal/auditor/ROLE.md",
    visibility: "gates work",
    owns: "per-work-product QA against the current standard",
    clientId: "pro-exteriors-open-brain-auditor-v1",
  },
  {
    id: "quality-control",
    agentName: "Quality Control",
    agentType: "horizontal",
    username: "ob-quality-control",
    displayName: "Open Brain Quality Control",
    slackHandle: "@ob-quality-control",
    charterPath: "agents/horizontal/quality-control/ROLE.md",
    visibility: "convenes reviews",
    owns: "cross-job standard-setting and trust-tier edits",
    clientId: "pro-exteriors-open-brain-quality-control-v1",
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

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function chunk(values, size) {
  const groups = [];
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size));
  }
  return groups;
}

function extractList(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${requiredEnv("AGENTMAIL_API_KEY")}`,
      accept: "application/json",
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = payload?.error?.message ?? payload?.message ?? response.statusText;
    const error = new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${message}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function listInboxes() {
  return extractList(await request("/inboxes?limit=100"), "inboxes");
}

async function listWebhooks() {
  return extractList(await request("/webhooks?limit=100"), "webhooks");
}

async function getWebhook(webhookId) {
  return request(`/webhooks/${encodeURIComponent(webhookId)}`);
}

async function createInbox(agent, domain, existingInboxes) {
  const email = `${agent.username}@${domain}`;
  const existing = existingInboxes.find(
    (inbox) => inbox.client_id === agent.clientId || inbox.email?.toLowerCase() === email.toLowerCase(),
  );

  if (existing) return { ...existing, status: "existing" };

  try {
    const created = await request("/inboxes", {
      method: "POST",
      body: JSON.stringify({
        username: agent.username,
        domain,
        display_name: agent.displayName,
        client_id: agent.clientId,
        metadata: {
          client: "pro-exteriors",
          brain: "open-brain",
          managed_by: "codex",
          agent_id: agent.id,
          agent_type: agent.agentType,
          slack_handle: agent.slackHandle,
          charter_path: agent.charterPath,
          visibility: agent.visibility,
        },
      }),
    });

    return { ...created, status: "created" };
  } catch (error) {
    if (error.status === 403 && /limit/i.test(error.message)) {
      return {
        email,
        display_name: agent.displayName,
        client_id: agent.clientId,
        inbox_id: null,
        status: "pending_inbox_limit",
      };
    }

    throw error;
  }
}

async function createWebhook(index, inboxIds, webhookUrl, existingWebhooks) {
  const clientId = `pro-exteriors-open-brain-agentmail-webhook-${index + 1}-v1`;
  const existing = existingWebhooks.find((webhook) => webhook.client_id === clientId);

  if (existing?.webhook_id) {
    const fetched = await getWebhook(existing.webhook_id);
    return { ...fetched, status: "existing" };
  }

  const created = await request("/webhooks", {
    method: "POST",
    body: JSON.stringify({
      url: webhookUrl,
      event_types: WEBHOOK_EVENTS,
      inbox_ids: inboxIds,
      client_id: clientId,
    }),
  });

  return { ...created, status: "created" };
}

async function writeJson(path, value) {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 });
  return absolutePath;
}

async function writeSecretEnv(path, values) {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(
    absolutePath,
    [
      "# Local-only AgentMail webhook signing secrets.",
      "# Do not commit this file.",
      `AGENTMAIL_WEBHOOK_SECRETS=${values.join(",")}`,
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  return absolutePath;
}

async function main() {
  const domain = process.env.AGENTMAIL_DOMAIN?.trim() || DEFAULT_DOMAIN;
  const webhookUrl = process.env.AGENTMAIL_WEBHOOK_URL?.trim() || DEFAULT_WEBHOOK_URL;
  const output = process.env.AGENTMAIL_OUTPUT?.trim() || DEFAULT_OUTPUT;
  const secretOutput = process.env.AGENTMAIL_SECRET_OUTPUT?.trim() || DEFAULT_SECRET_OUTPUT;

  const domains = extractList(await request("/domains?limit=100"), "domains");
  const domainRecord = domains.find((item) => item.domain === domain);
  if (!domainRecord) {
    throw new Error(`Domain ${domain} is not available in AgentMail`);
  }
  if (domainRecord.status && domainRecord.status !== "VERIFIED") {
    throw new Error(`Domain ${domain} status is ${domainRecord.status}; expected VERIFIED`);
  }

  const existingInboxes = await listInboxes();
  const inboxes = [];
  for (const agent of ROSTER) {
    const inbox = await createInbox(agent, domain, existingInboxes);
    if (inbox.inbox_id) existingInboxes.push(inbox);
    inboxes.push({
      id: agent.id,
      agentName: agent.agentName,
      agentType: agent.agentType,
      email: inbox.email,
      username: agent.username,
      displayName: inbox.display_name ?? agent.displayName,
      slackHandle: agent.slackHandle,
      charterPath: agent.charterPath,
      visibility: agent.visibility,
      owns: agent.owns,
      clientId: inbox.client_id ?? agent.clientId,
      inboxId: inbox.inbox_id,
      status: inbox.status,
    });
  }

  const existingWebhooks = await listWebhooks();
  const webhooks = [];
  const liveInboxes = inboxes.filter((inbox) => inbox.inboxId);
  for (const [index, inboxGroup] of chunk(liveInboxes, 10).entries()) {
    const webhook = await createWebhook(
      index,
      inboxGroup.map((inbox) => inbox.inboxId),
      webhookUrl,
      existingWebhooks,
    );
    existingWebhooks.push(webhook);
    webhooks.push({
      webhookId: webhook.webhook_id,
      clientId: webhook.client_id,
      url: webhook.url,
      enabled: webhook.enabled,
      eventTypes: webhook.event_types,
      inboxIds: webhook.inbox_ids,
      status: webhook.status,
      hasSecret: Boolean(webhook.secret),
    });
  }

  const rosterPath = await writeJson(output, {
    generatedAt: new Date().toISOString(),
    domain,
    webhookUrl,
    eventTypes: WEBHOOK_EVENTS,
    inboxes,
    webhooks,
  });

  const secrets = webhooks
    .map((webhook) => existingWebhooks.find((item) => item.webhook_id === webhook.webhookId)?.secret)
    .filter(Boolean);

  const secretPath = secrets.length > 0 ? await writeSecretEnv(secretOutput, secrets) : null;
  const createdInboxes = inboxes.filter((item) => item.status === "created").length;
  const pendingInboxes = inboxes.filter((item) => item.status === "pending_inbox_limit").length;
  const createdWebhooks = webhooks.filter((item) => item.status === "created").length;

  console.log(
    JSON.stringify(
      {
        status: pendingInboxes > 0 ? "partial" : "ok",
        domain,
        inboxes: {
          total: inboxes.length,
          live: liveInboxes.length,
          created: createdInboxes,
          existing: liveInboxes.length - createdInboxes,
          pendingInboxLimit: pendingInboxes,
        },
        webhooks: {
          total: webhooks.length,
          created: createdWebhooks,
          existing: webhooks.length - createdWebhooks,
          secretFile: secretPath,
        },
        output: rosterPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        status: "error",
        message: error.message,
        statusCode: error.status ?? null,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
