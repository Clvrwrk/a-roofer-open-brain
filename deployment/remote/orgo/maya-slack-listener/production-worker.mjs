import { Composio } from "@composio/core";
import { createHash } from "node:crypto";
import { createPec78Client } from "./cc-client.mjs";
import { TOOL_SLUG, TOOL_VERSION, buildReply, buildSendArguments, classifyError, hashId } from "./core.mjs";
import { APPROVED, HERMES_MODEL } from "./policy.mjs";
import { composioSendRequestOptions } from "./request-options.mjs";
import { runHermes } from "./hermes-runner.mjs";

const required = ["COMPOSIO_API_KEY", "OPENROUTER_API_KEY", "PEC78_MAYA_PRIVATE_JWK", "PEC78_CREDENTIAL_ID", "PEC78_RUNTIME_INSTANCE_ID"];
for (const name of required) if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);

const client = createPec78Client({
  privateJwk: JSON.parse(process.env.PEC78_MAYA_PRIVATE_JWK),
  credentialId: process.env.PEC78_CREDENTIAL_ID,
  runtimeInstanceId: process.env.PEC78_RUNTIME_INSTANCE_ID,
});
const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY, toolkitVersions: { slackbot: TOOL_VERSION } });
let stopping = false;
process.once("SIGTERM", () => { stopping = true; });

log("worker_started", { account_hash: hashId(APPROVED.connectedAccountId), channel_hash: hashId(APPROVED.channelId) });
while (!stopping) {
  const claim = await client.request("slack.receive.christopher", "/api/agent/runtime/v1/events/slack/claim", {});
  if (claim.status === "empty") { await delay(5_000); continue; }
  await processClaim(claim);
}
log("worker_stopped");

async function processClaim(claim) {
  const payload = claim?.payload;
  if (!payload || payload.teamId !== APPROVED.teamId || payload.channelId !== APPROVED.channelId || payload.ownerUserId !== APPROVED.ownerUserId ||
      typeof payload.messageText !== "string" || typeof payload.threadTs !== "string" || typeof claim.eventId !== "string" ||
      typeof claim.leaseId !== "string" || !Number.isSafeInteger(claim.leaseEpoch)) throw new Error("Claimed event identity mismatch");
  const common = { eventId: claim.eventId, leaseId: claim.leaseId, leaseEpoch: claim.leaseEpoch };
  let effectId;
  let providerIoAuthorized = false;
  try {
    const answer = await runHermes(payload.messageText, AbortSignal.timeout(60_000));
    const reply = buildReply(answer);
    const reserved = await client.request("slack.send.christopher", "/api/agent/runtime/v1/effects/slack/reserve", {
      ...common, channelId: payload.channelId, threadTs: payload.threadTs, text: reply, modelRouteId: HERMES_MODEL,
    }, digest(`${claim.eventId}|slack-reply`));
    effectId = reserved.effectId;
    if (typeof effectId !== "string") throw new Error("Effect reservation missing");
    const executing = await client.request("slack.send.christopher", "/api/agent/runtime/v1/effects/slack/executing", { effectId, leaseId: claim.leaseId, leaseEpoch: claim.leaseEpoch });
    if (executing.providerIoAuthorized !== true || executing.replayed === true) throw new Error("Provider I/O was not uniquely authorized");
    providerIoAuthorized = true;
    const result = await composio.tools.execute(TOOL_SLUG, {
      userId: APPROVED.composioUserId,
      connectedAccountId: APPROVED.connectedAccountId,
      version: TOOL_VERSION,
      arguments: buildSendArguments(payload.channelId, payload.threadTs, reply),
    }, composioSendRequestOptions());
    if (!result?.successful || !result?.data?.ok || !/^\d{10}\.\d{6}$/.test(result.data.ts ?? "")) throw new Error("Composio Slack send outcome unknown");
    await client.request("slack.send.christopher", "/api/agent/runtime/v1/effects/slack/reconcile", { effectId, leaseId: claim.leaseId, leaseEpoch: claim.leaseEpoch, outcome: "succeeded", providerMessageId: result.data.ts });
    log("send_confirmed", { event_hash: hashId(claim.eventId), provider_message_hash: hashId(result.data.ts) });
  } catch (error) {
    const errorClass = classifyError(error);
    if (effectId && providerIoAuthorized) {
      try { await client.request("slack.send.christopher", "/api/agent/runtime/v1/effects/slack/reconcile", { effectId, leaseId: claim.leaseId, leaseEpoch: claim.leaseEpoch, outcome: "unknown", providerMessageId: null }); }
      catch { /* Original provider ambiguity remains authoritative. */ }
    }
    try { await client.request("slack.receive.christopher", "/api/agent/runtime/v1/events/slack/complete", { ...common, outcome: "quarantined", code: effectId ? "provider_outcome_unknown" : "inference_or_reservation_failed" }); }
    catch { /* The database lease/effect remains fail-closed for operator reconciliation. */ }
    log("event_quarantined", { event_hash: hashId(claim.eventId), error_class: errorClass });
    stopping = true;
  }
}

function digest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function log(event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), event, ...fields })}\n`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
