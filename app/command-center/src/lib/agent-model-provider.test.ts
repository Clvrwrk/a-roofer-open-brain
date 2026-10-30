import { describe, expect, it } from "vitest";
import { modelFromEnv } from "../../runtime/agent-runtime.mjs";

describe("modelFromEnv", () => {
  it("builds an OpenRouter chat model against the OpenRouter base URL", async () => {
    const model: any = await modelFromEnv({ AGENT_MODEL_PROVIDER: "openrouter", AGENT_MODEL_ID: "openai/gpt-5.4-mini", OPENROUTER_API_KEY: "sk-or-test" });
    expect(model).toBeTruthy();
    expect(model.modelId).toBe("openai/gpt-5.4-mini");
    expect(model.provider).toMatch(/^openrouter/);
    expect(model.config.url({ path: "/chat/completions", modelId: model.modelId })).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("returns null when the OpenRouter key is missing", async () => {
    expect(await modelFromEnv({ AGENT_MODEL_PROVIDER: "openrouter", AGENT_MODEL_ID: "x" })).toBeNull();
  });

  it("still returns null for an unknown provider", async () => {
    expect(await modelFromEnv({ AGENT_MODEL_PROVIDER: "nope", AGENT_MODEL_ID: "x", OPENROUTER_API_KEY: "k" })).toBeNull();
  });
});
