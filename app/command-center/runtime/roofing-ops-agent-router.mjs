import { spawn } from "node:child_process";

const HUMAN_OPERATIONAL_CHANNEL_IDS = new Set(["C0BCUF29G1H", "C0BD4EW4RU4", "C0BCYNW98RL"]);

const AGENT_IDENTITIES = {
  maya: { displayName: "Maya Chen", tokenEnvKey: "MAYA_CHEN_BOT_TOKEN", keywords: ["invoice", "upload", "pdf", "ap", "ar", "credit memo", "creditmemos", "price agreement", "vendor document", "intake", "payroll", "hr"] },
  alex: { displayName: "Alex Rivers", tokenEnvKey: "ALEX_RIVERS_BOT_TOKEN", keywords: ["sku", "uom", "abc", "price agreement", "catalog", "overcharge", "variance", "bundle", "square", "pricing", "open invoice", "open invoices", "vendor invoice", "vendor invoices", "invoice audit", "abc invoice", "invoice line", "invoice lines", "not-to-be-paid"] },
  casey: { displayName: "Casey Morgan", tokenEnvKey: "CASEY_MORGAN_BOT_TOKEN", keywords: ["draft", "vendor email", "dispute", "follow up", "follow-up", "credit request", "send to vendor", "letter"] },
  jordan: { displayName: "Jordan Price", tokenEnvKey: "JORDAN_PRICE_BOT_TOKEN", keywords: ["aging", "cash", "finance", "p&l", "pnl", "job cost", "margin", "month end", "receivable", "ar aging", "ap aging"] },
  sam: { displayName: "Sam Torres", tokenEnvKey: "SAM_TORRES_BOT_TOKEN", keywords: ["qa", "audit", "check accuracy", "standard", "compliance", "sample", "wrong", "mistake", "verify", "quality"] },
  rowan: { displayName: "Rowan Vale", tokenEnvKey: "ROWAN_VALE_BOT_TOKEN", approval: "chris_required_before_execution", keywords: ["research", "look up", "storm", "weather", "code update", "carrier bulletin", "manufacturer", "gaf", "owens corning", "public source", "xactimate"] },
  lena: { displayName: "Lena Brooks", tokenEnvKey: "LENA_BROOKS_BOT_TOKEN", keywords: ["review", "google business", "photo", "photos", "content", "eeat", "schema", "marketing", "testimonial", "reputation"] },
  ops: { displayName: "Ops Conductor", tokenEnvKey: "OPS_CONDUCTOR_BOT_TOKEN", keywords: ["bug", "feature", "enhancement", "not working", "broken", "can you build", "route this", "who owns", "devteam", "dev team", "support", "not sure", "undefined sop"] },
};

const OUT_OF_DOMAIN_PHRASES = ["bake a cake", "cake recipe", "fantasy football", "movie recommendation"];
const UNDEFINED_OPERATIONAL_PHRASES = ["can the agents", "new supplier", "new file type", "unsupported", "not sure what", "undefined sop", "no sop", "doesn't know", "does not know"];
const UNCLEAR_FILE_PHRASES = ["what is this", "what's this", "what am i looking at", "can the agents process this", "handle this"];
const RESEARCH_APPROVAL_PHRASES = ["approve research", "approved research", "rowan approved", "approve rowan"];

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/[“”]/g, '"').replace(/[’]/g, "'");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordMatches(body, keyword) {
  const normalized = normalize(keyword);
  if (normalized.length <= 3) return new RegExp(`(^|\\W)${escapeRegex(normalized)}(\\W|$)`).test(body);
  return body.includes(normalized);
}

function fileText(files = []) {
  return files.map((file) => `${file.name ?? ""} ${file.title ?? ""} ${file.mimetype ?? ""} ${file.filetype ?? ""}`).join(" ");
}

function classify(text, files = []) {
  const body = normalize(`${text ?? ""} ${fileText(files)}`);
  if (!body.trim()) return { kind: "ignore", reason: "empty_request" };
  if (OUT_OF_DOMAIN_PHRASES.some((phrase) => body.includes(phrase))) return { kind: "ignore", reason: "out_of_domain" };
  if (RESEARCH_APPROVAL_PHRASES.some((phrase) => body.includes(phrase))) return { kind: "research_approved", agent: "rowan", reason: "research_approved_by_chris" };

  const hasFiles = files.length > 0;
  if (hasFiles && UNCLEAR_FILE_PHRASES.some((phrase) => body.includes(phrase))) return { kind: "ops_escalation", agent: "ops", reason: "unclear_file_request" };

  const scored = Object.entries(AGENT_IDENTITIES)
    .map(([agent, identity]) => ({
      agent,
      score: identity.keywords.filter((keyword) => keywordMatches(body, keyword)).reduce((total, keyword) => total + Math.max(1, keyword.split(/\s+/).length), 0),
      approval: identity.approval,
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    if (hasFiles || UNDEFINED_OPERATIONAL_PHRASES.some((phrase) => body.includes(phrase))) return { kind: "ops_escalation", agent: "ops", reason: "undefined_sop_or_unsupported_request" };
    return { kind: "ignore", reason: "no_sop_match" };
  }

  const top = scored[0];
  if (scored.length > 1 && scored[1].score >= Math.max(1, top.score - 1)) return { kind: "ops_overlap", candidates: scored.map((candidate) => candidate.agent), reason: "overlapping_sop_match" };
  if (top.agent === "rowan" && top.approval) return { kind: "research_approval_required", agent: "rowan", reason: "research_requires_chris_approval" };
  return { kind: "single_agent", agent: top.agent, reason: "single_sop_match" };
}

function runtimeAgent(env) {
  return env.ROOFING_OPS_RUNTIME_AGENT || "ops";
}

function runtimeMayHandle(decision, env) {
  const runtime = runtimeAgent(env);
  if (runtime === "ops") return decision.kind !== "single_agent" || decision.agent === "ops";
  return decision.kind === "single_agent" && decision.agent === runtime;
}

function getAgentToken(agent, env) {
  const identity = AGENT_IDENTITIES[agent];
  if (!identity) return undefined;
  const namedToken = env[identity.tokenEnvKey];
  if (namedToken) return namedToken;
  // In per-agent runtimes, the agent's own bot token is stored as SLACK_BOT_TOKEN.
  // This is not a cross-agent fallback: only allow it when the runtime identity
  // matches the agent being posted as.
  if (runtimeAgent(env) === agent && env.SLACK_BOT_TOKEN) return env.SLACK_BOT_TOKEN;
  return undefined;
}

function channelTypeFromMessage(message) {
  return message.channel_type === "im" ? "im" : message.channel_type === "mpim" ? "mpim" : message.channel_type === "group" ? "group" : "channel";
}

function fileSummariesFromMessage(message) {
  return (message.files ?? []).map((file) => ({ id: file.id, name: file.name, title: file.title, mimetype: file.mimetype, filetype: file.filetype }));
}

async function fileSummaryFromSlack(client, env, fileId) {
  const token = getAgentToken("ops", env);
  if (!token) return { id: fileId, name: fileId, mimetype: "unknown" };
  try {
    const info = await client.files.info({ token, file: fileId });
    const file = info.file ?? {};
    return { id: fileId, name: file.name, title: file.title, mimetype: file.mimetype, filetype: file.filetype };
  } catch {
    return { id: fileId, name: fileId, mimetype: "unknown" };
  }
}

async function postAsAgent({ client, env, agent, channel, threadTs, text, logger }) {
  const runtime = runtimeAgent(env);
  if (runtime !== "ops" && runtime !== agent) throw new Error(`Runtime ${runtime} is not authorized to post as ${agent}`);
  const token = getAgentToken(agent, env);
  if (!token) throw new Error(`Missing token for ${agent}; refusing fallback identity post`);
  const result = await client.chat.postMessage({ token, channel, thread_ts: threadTs, text, unfurl_links: false });
  logger?.info?.("Roofing-Ops Slack post", { agent, channel, ok: result.ok, ts: result.ts, error: result.error });
  return result;
}

function agentName(agent) {
  return (AGENT_IDENTITIES[agent] ?? AGENT_IDENTITIES.ops).displayName;
}

function buildLinearEscalationPayload(message, decision) {
  const summary = String(message.text ?? "Unsupported Roofing-Ops request").replace(/\s+/g, " ").trim().slice(0, 100) || "Unsupported Roofing-Ops request";
  return {
    title: `[roofing ops intake][enhancement] ${summary}`,
    description: [
      "## Source",
      `- Slack channel: ${message.channel}`,
      `- Thread/message TS: ${message.thread_ts ?? message.ts ?? "unknown"}`,
      `- Requesting user: ${message.user ?? "unknown"}`,
      "- Agent that escalated: Ops Conductor",
      "",
      "## User request",
      message.text || "(No text supplied)",
      "",
      "## Attachments",
      fileSummariesFromMessage(message).map((file) => `- ${file.name ?? file.title ?? "unnamed"} (${file.mimetype ?? file.filetype ?? "unknown"}) — ${file.id}`).join("\n") || "None",
      "",
      "## Why this needs DevTeam review",
      decision.reason,
      "",
      "## Suggested next step",
      "Triage through Open Engine. If this is a missing SOP, route back to Chris for instructions and SOP improvement.",
    ].join("\n"),
  };
}

async function createLinearEscalation(env, payload) {
  if (!env.LINEAR_API_KEY) return { ok: false, skipped: true, reason: "LINEAR_API_KEY missing" };
  const query = `mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url title } } }`;
  const input = {
    teamId: env.LINEAR_DEV_TEAM_ID || "f7fd2005-aa04-4de7-a17d-ddae528b5e4a",
    projectId: env.LINEAR_DEV_PROJECT_ID || "ba9edb00-077d-47cc-9f69-d2ac04bfc6c9",
    stateId: env.LINEAR_AGENT_TODO_STATE_ID || "286ecb7c-e682-4c67-884e-88d620036e02",
    labelIds: [env.LINEAR_AGENT_INSTRUCTIONS_LABEL_ID || "b4b8107c-66d5-472e-84d2-ffef92d2b1a5"],
    title: payload.title,
    description: payload.description,
  };
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { authorization: env.LINEAR_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { input } }),
  });
  const data = await res.json();
  if (!res.ok || data.errors?.length || !data.data?.issueCreate?.success) return { ok: false, error: data.errors?.[0]?.message ?? `linear_http_${res.status}` };
  return { ok: true, issue: data.data.issueCreate.issue };
}

function buildAdminNotification(linearResult) {
  const ticket = linearResult.ok ? linearResult.issue.url : `Linear creation pending (${linearResult.reason ?? linearResult.error ?? "unknown"})`;
  return [
    "🛠️ Ops Conductor created a DevTeam review item",
    "",
    "SITUATION: A Roofing-Ops request could not be handled safely by the current SOP/tool set.",
    "IMPACT: This may need a bug fix, feature, enhancement, or SOP improvement before agents can handle it autonomously.",
    `TICKET: ${ticket}`,
    "",
    "No action needed unless you want to reprioritize it — I routed it for DevTeam review and kept the public thread human-readable.",
  ].join("\n");
}

function stripHermesCliOutput(output) {
  const lines = output.split(/\r?\n/).map((line) => line.replace(/\u001b\[[0-9;]*m/g, ""));
  const noisy = /^(Query:|Initializing agent|Resume this session|Session:|Duration:|Messages:|[╭╰─│]|\s*⚠|\s*$)/;
  const kept = lines.filter((line) => !noisy.test(line.trim())).map((line) => line.replace(/^\s{2,}/, "").trim()).filter(Boolean);
  return kept.join("\n").trim();
}

function buildHermesPrompt({ agent, message, decision }) {
  return [
    `You are ${agentName(agent)}, a named Roofing-Ops Open Brain agent responding in Slack.`,
    "Answer in a friendly, business-focused voice matching your SOUL.md. Use NEPQ: situation, impact, next step.",
    "Stay strictly inside your SOP/profile lane. If the request is undefined by SOP, say so and route to Ops Conductor for Chris instructions/SOP improvement.",
    "Do not send external communications, approve decisions, publish, or claim research is approved. Rowan must wait for Chris approval before executing research.",
    `Routing decision: ${decision.kind} / ${decision.reason}`,
    `Slack channel: ${message.channel}`,
    `User text: ${message.text || "(no text)"}`,
    `Files: ${JSON.stringify(fileSummariesFromMessage(message))}`,
    "Return only the Slack reply text. No headers, no markdown table unless helpful, no tool transcript.",
  ].join("\n\n");
}

async function runHermesForAgent(agent, message, decision, env, logger) {
  const home = `/opt/openbrain/hermes-homes/${agent}`;
  const prompt = buildHermesPrompt({ agent, message, decision });
  const childEnv = { ...process.env, ...env, HERMES_HOME: home, PATH: `/usr/local/bin:/opt/node22/bin:${process.env.PATH ?? ""}` };
  return await new Promise((resolve) => {
    const child = spawn("/usr/local/bin/hermes", ["chat", "-q", prompt, "-t", "file,web,terminal", "--provider", "openrouter", "--model", "anthropic/claude-sonnet-4-5", "--quiet"], {
      cwd: "/opt/openbrain/a-roofers-open-brain",
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ ok: false, text: "", error: "hermes_timeout" });
    }, Number(env.HERMES_SLACK_TIMEOUT_MS || 120000));
    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      const text = stripHermesCliOutput(stdout);
      if (code === 0 && text) resolve({ ok: true, text });
      else {
        logger?.error?.("Hermes invocation failed", { agent, code, stderr: stderr.slice(-500), stdout: stdout.slice(-500) });
        resolve({ ok: false, text, error: stderr.slice(-300) || `exit_${code}` });
      }
    });
  });
}

function buildAgentAcknowledgement(agent) {
  const name = agentName(agent);
  if (agent === "maya") return `📥 ${name} here — I can help with this intake/document lane. I’ll keep this threaded and flag anything that needs a human decision.`;
  if (agent === "alex") return `🔍 ${name} here — this looks like pricing/catalog/UOM territory. I’ll work from the agreement/catalog evidence and keep the answer practical.`;
  if (agent === "casey") return `✉️ ${name} here — I can help shape the vendor-facing draft, but I’ll keep it internal until a human approves sending.`;
  if (agent === "jordan") return `📊 ${name} here — I can help with the finance/job-cost angle and keep the numbers tied back to evidence.`;
  if (agent === "sam") return `✅ ${name} here — I’ll look at this through the QA/compliance lens and call out what passes, what doesn’t, and what needs a standard update.`;
  if (agent === "lena") return `🌟 ${name} here — this fits the marketing/proof lane. I’ll keep it useful, specific, and approval-safe.`;
  if (agent === "ops") return `🧭 ${name} here — I’ll route this cleanly and make sure we don’t have agents stepping on each other.`;
  if (agent === "rowan") return `🔎 ${name} here — this is a research lane, so I’ll frame the question and wait for Chris approval before running outside-source research.`;
  return `${name} here — I can help with this within my SOP lane.`;
}

export function buildRoutingMessage(decision) {
  if (decision.kind === "single_agent") return buildAgentAcknowledgement(decision.agent);
  if (decision.kind === "research_approved") return "🔎 Research approved — Rowan can proceed with outside-source research and will cite sources/retrieved dates in-thread.";
  if (decision.kind === "research_approval_required") {
    return [
      "🔎 Rowan can help with this research lane.",
      "Because research changes what we treat as outside evidence, I’m going to get Chris’s approval before Rowan runs with it.",
      "→ Chris can reply `approve research` and Rowan will take it from there.",
    ].join("\n");
  }
  if (decision.kind === "ops_overlap") {
    return [
      "I see this touches more than one lane, so I’m going to route it before anyone half-answers.",
      `Likely owners: ${decision.candidates.join(", ")}.`,
      "→ Ops Conductor will choose the clean handoff in this thread.",
    ].join("\n");
  }
  if (decision.kind === "ops_escalation") {
    return [
      "I’m not fully confident the current SOP/tooling covers this request yet.",
      "I’m going to turn it into a DevTeam review item so we can improve the agent workflow instead of guessing in public.",
      "→ I’ll notify Chris once the ticket is created.",
    ].join("\n");
  }
  if (decision.kind === "dm_redirect") return "To keep agent work visible and auditable, please post this in the relevant public/operational channel. Ops Conductor can help route it there.";
  return null;
}

export async function handleRoofingOpsMessage({ message, client, env, logger }) {
  if (message.subtype || message.bot_id) return null;
  const channelType = channelTypeFromMessage(message);
  const channelId = message.channel;

  let decision;
  if (channelType === "im" || channelType === "mpim") {
    const runtime = runtimeAgent(env);
    if (runtime === "ops") {
      decision = { kind: "single_agent", agent: "ops", reason: "ops_human_dm_allowed" };
    } else {
      const dmClassification = classify(message.text, fileSummariesFromMessage(message));
      if (dmClassification.kind === "ignore" && dmClassification.reason === "out_of_domain") {
        decision = dmClassification;
      } else if (dmClassification.kind === "ops_escalation") {
        decision = dmClassification;
      } else {
        // Direct human DM to a named app is allowed; agent-to-agent/bot DMs are already ignored via bot_id above.
        decision = { kind: "single_agent", agent: runtime, reason: dmClassification.reason === "no_sop_match" ? "direct_human_dm_to_agent" : dmClassification.reason };
      }
    }
  } else {
    if (!HUMAN_OPERATIONAL_CHANNEL_IDS.has(channelId)) return null;
    decision = classify(message.text, fileSummariesFromMessage(message));
  }

  logger?.info?.("Roofing-Ops routing decision", { kind: decision.kind, reason: decision.reason, channel: channelId, runtimeAgent: runtimeAgent(env) });
  if (decision.kind === "ignore" || !runtimeMayHandle(decision, env)) return decision;

  const agent = decision.kind === "single_agent" ? decision.agent : "ops";
  let text = buildRoutingMessage(decision);
  if (decision.kind === "single_agent" || decision.kind === "research_approved") {
    const hermes = await runHermesForAgent(agent, message, decision, env, logger);
    if (hermes.ok) text = hermes.text;
    else text = text || `${agentName(agent)} is online, but I hit a runtime issue before I could produce a full answer. Ops Conductor should review this.`;
  }
  if (!text) return decision;

  await postAsAgent({ client, env, agent, channel: channelId, threadTs: message.thread_ts ?? message.ts, text, logger });

  if (decision.kind === "ops_escalation") {
    const payload = buildLinearEscalationPayload(message, decision);
    const linearResult = await createLinearEscalation(env, payload);
    const notification = buildAdminNotification(linearResult);
    if (env.SLACK_CH_OPS_CONDUCTOR) await postAsAgent({ client, env, agent: "ops", channel: env.SLACK_CH_OPS_CONDUCTOR, threadTs: undefined, text: notification });
    if (env.ADMIN_NOTIFICATION_EMAIL) logger?.info?.("Admin email notification requested", { email: env.ADMIN_NOTIFICATION_EMAIL, title: payload.title, linearCreated: linearResult.ok });
  }

  return decision;
}

export async function handleRoofingOpsFileShared({ event, client, env, logger }) {
  const channelId = event.channel_id || event.channel;
  if (!channelId || !HUMAN_OPERATIONAL_CHANNEL_IDS.has(channelId)) return null;
  const summary = await fileSummaryFromSlack(client, env, event.file_id);
  const pseudoMessage = {
    channel: channelId,
    channel_type: "channel",
    user: event.user_id,
    text: event.initial_comment?.comment || "",
    ts: event.event_ts,
    files: [summary],
  };
  return handleRoofingOpsMessage({ message: pseudoMessage, client, env, logger });
}
