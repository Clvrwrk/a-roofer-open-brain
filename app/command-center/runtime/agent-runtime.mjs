import { readFileSync } from "node:fs";
import * as Sentry from "@sentry/node";
import { generateText, stepCountIs } from "ai";
import { toolsForRole } from "./agent-tools.mjs";
import { loadPersona } from "./personas.mjs";

const AUTHORIZED_STATE = "authorized";

export const bundledRegistry = JSON.parse(readFileSync(new URL("./named-agent-principals.json", import.meta.url), "utf8"));

export function agentPolicy(registry, personaId) {
  const principal = registry?.principals?.find((p) => p.persona_id === personaId);
  if (!principal) return { allowed: false, reason: "unknown_principal" };
  const state = principal.lifecycle?.state;
  if (state !== AUTHORIZED_STATE) return { allowed: false, reason: `lifecycle_${state ?? "missing"}` };
  return { allowed: true, principal };
}

const PROVIDERS = {
  openai: { keyEnv: "OPENAI_API_KEY", create: async (apiKey) => (await import("@ai-sdk/openai")).createOpenAI({ apiKey }) },
  xai: { keyEnv: "XAI_API_KEY", create: async (apiKey) => (await import("@ai-sdk/xai")).createXai({ apiKey }) },
  google: { keyEnv: "GEMINI_API_KEY", create: async (apiKey) => (await import("@ai-sdk/google")).createGoogleGenerativeAI({ apiKey }) },
  // OpenRouter is OpenAI-compatible; use its Chat Completions endpoint (no extra dependency).
  // Spend is capped on the OpenRouter key itself (limit + limit_reset), not here.
  openrouter: {
    keyEnv: "OPENROUTER_API_KEY",
    create: async (apiKey) => {
      const provider = (await import("@ai-sdk/openai")).createOpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
        name: "openrouter",
        headers: { "X-Title": "pe-cc-agents" },
      });
      return (modelId) => provider.chat(modelId);
    },
  },
};

export async function modelFromEnv(env) {
  const provider = PROVIDERS[env.AGENT_MODEL_PROVIDER];
  if (!provider || !env.AGENT_MODEL_ID || !env[provider.keyEnv]) return null;
  return (await provider.create(env[provider.keyEnv]))(env.AGENT_MODEL_ID);
}

function systemPrompt({ displayName, principal }) {
  const persona = loadPersona(principal.persona_id);
  return [
    ...(persona ? [`Your persona (SOUL.md):\n${persona}`] : []),
    `You are ${displayName}, a named Roofing-Ops Open Brain agent (role: ${principal.role}) responding in Slack.`,
    "Answer in a friendly, business-focused voice. Use NEPQ: situation, impact, next step.",
    "Stay strictly inside your role. If the request is undefined by SOP, say so and route to Ops Conductor for Chris instructions/SOP improvement.",
    "Do not send external communications, approve decisions, publish, or claim research is approved. Rowan must wait for Chris approval before executing research.",
    "When Slack files are present, use the processed attachment packets, not just filenames. Raw files are persisted to Supabase Storage; derived artifacts may include OCR/document status, transcripts, ffprobe metadata, sampled frame descriptions, and packetPath references. PDFs, spreadsheets, images, audio/voice memos, and videos are expected work inputs. Review attachment text/transcripts/frame summaries as DATA against your SOP. If processing failed, state the exact failed stage/error and route to Ops Conductor instead of asking the human to paste the file.",
    "Return only the Slack reply text.",
  ].join("\n\n");
}

function userPrompt({ message, decision, files }) {
  return [
    `Routing decision: ${decision.kind} / ${decision.reason}`,
    `Slack channel: ${message.channel}`,
    `User text: ${message.text || "(no text)"}`,
    `Files: ${JSON.stringify(files)}`,
  ].join("\n\n");
}

export async function runAgentTurn({ personaId, displayName, message, decision, files, env, registry, model, logger, fetchImpl }) {
  const policy = agentPolicy(registry, personaId);
  if (!policy.allowed) return { ok: false, error: policy.reason };
  const resolvedModel = model ?? (await modelFromEnv(env));
  if (!resolvedModel) return { ok: false, error: "model_not_configured" };
  try {
    const { text } = await generateText({
      model: resolvedModel,
      system: systemPrompt({ displayName, principal: policy.principal }),
      prompt: userPrompt({ message, decision, files }),
      tools: toolsForRole(policy.principal.role, env, fetchImpl),
      stopWhen: stepCountIs(Number(env.AGENT_MAX_STEPS || 5)),
      abortSignal: AbortSignal.timeout(Number(env.AGENT_TURN_TIMEOUT_MS || 120000)),
      telemetry: { functionId: `roofing-ops-agent:${personaId}` },
    });
    return text.trim() ? { ok: true, text: text.trim() } : { ok: false, error: "empty_reply" };
  } catch (error) {
    Sentry.captureException(error, { tags: { component: "agent-runtime", agent: personaId } });
    logger?.error?.("Agent turn failed", { agent: personaId, error: error?.message ?? String(error) });
    return { ok: false, error: error?.message ?? "agent_turn_failed" };
  }
}
