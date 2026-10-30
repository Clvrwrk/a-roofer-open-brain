import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();
vi.mock("@sentry/node", () => ({ captureException: (...args: unknown[]) => captureException(...args) }));

const { handleRoofingOpsMessage } = await import("../../runtime/roofing-ops-agent-router.mjs");

const repoRegistryPath = resolve(__dirname, "../../../../agents/registry/named-agent-principals.json");
const runtimeRegistryPath = resolve(__dirname, "../../runtime/named-agent-principals.json");

function registryWith(states: Record<string, string>) {
  const registry = JSON.parse(readFileSync(runtimeRegistryPath, "utf8"));
  for (const principal of registry.principals) {
    if (states[principal.persona_id]) principal.lifecycle.state = states[principal.persona_id];
  }
  return registry;
}

function replyModel(text: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

function failingModel() {
  return new MockLanguageModelV4({
    doGenerate: async () => {
      throw new Error("provider exploded");
    },
  });
}

function slackClient() {
  const posts: Array<{ text: string; token: string }> = [];
  return { posts, chat: { postMessage: async (payload: { text: string; token: string }) => (posts.push(payload), { ok: true, ts: "1.2" }) } };
}

const alexEnv = { ROOFING_OPS_RUNTIME_AGENT: "ops", OPS_CONDUCTOR_BOT_TOKEN: "xoxb-ops", ALEX_RIVERS_BOT_TOKEN: "xoxb-alex" };
const alexMessage = { channel: "C0BCUF29G1H", channel_type: "channel", text: "Check the UOM variance on this ABC invoice", ts: "1.1", user: "U1" };

describe("in-process agent runtime", () => {
  beforeEach(() => captureException.mockReset());

  it("an authorized agent answers with the model's reply as its own identity", async () => {
    const client = slackClient();
    const model = replyModel("Alex here. The UOM is off by 2 squares.");
    await handleRoofingOpsMessage({ client, env: alexEnv, logger: console, message: alexMessage, model, registry: registryWith({ "alex-rivers": "authorized" }) });

    expect(client.posts).toHaveLength(1);
    expect(client.posts[0]).toMatchObject({ text: "Alex here. The UOM is off by 2 squares.", token: "xoxb-alex" });
    expect(JSON.stringify(model.doGenerateCalls[0].prompt)).toContain("Alex Rivers");
  });

  it("a planned agent makes no model call and posts the canned acknowledgement", async () => {
    const client = slackClient();
    const model = replyModel("should never be used");
    await handleRoofingOpsMessage({ client, env: alexEnv, logger: console, message: alexMessage, model, registry: registryWith({ "alex-rivers": "planned" }) });

    expect(model.doGenerateCalls).toHaveLength(0);
    expect(client.posts[0].text).toContain("Alex Rivers here");
  });

  it("a revoked Ops Conductor DM makes no model call", async () => {
    const client = slackClient();
    const model = replyModel("should never be used");
    await handleRoofingOpsMessage({
      client,
      env: alexEnv,
      logger: console,
      message: { channel: "D1", channel_type: "im", text: "hello", ts: "1.1", user: "U1" },
      model,
      registry: registryWith({ "ops-conductor": "revoked" }),
    });

    expect(model.doGenerateCalls).toHaveLength(0);
    expect(client.posts[0].text).toContain("Ops Conductor here");
  });

  it("an agent missing from the registry is denied", async () => {
    const client = slackClient();
    const model = replyModel("should never be used");
    const registry = registryWith({});
    registry.principals = registry.principals.filter((p: { persona_id: string }) => p.persona_id !== "alex-rivers");
    await handleRoofingOpsMessage({ client, env: alexEnv, logger: console, message: alexMessage, model, registry });

    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("with no model configured an authorized agent falls back to the canned acknowledgement", async () => {
    const client = slackClient();
    await handleRoofingOpsMessage({ client, env: alexEnv, logger: console, message: alexMessage, registry: registryWith({ "alex-rivers": "authorized" }) });

    expect(client.posts[0].text).toContain("Alex Rivers here");
  });

  it("a model failure posts the canned fallback and reports to Sentry", async () => {
    const client = slackClient();
    await handleRoofingOpsMessage({ client, env: alexEnv, logger: console, message: alexMessage, model: failingModel(), registry: registryWith({ "alex-rivers": "authorized" }) });

    expect(client.posts[0].text).toContain("Alex Rivers here");
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("the bundled runtime registry matches agents/registry", () => {
    expect(readFileSync(runtimeRegistryPath, "utf8")).toBe(readFileSync(repoRegistryPath, "utf8"));
  });
});
