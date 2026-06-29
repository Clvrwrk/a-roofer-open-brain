// Per-agent Slack bot identity registry.
//
// Each vertical agent has its own Slack app + bot user in the pe-command-center
// workspace (Alex Rivers, Casey Morgan, …). To post AS a given agent, the
// running app needs that agent's bot token (xoxb-…) in env under the key below.
//
// IMPORTANT (Slack security boundary): a Slack *config* token (xoxe-…) can create
// and manage apps but CANNOT read or mint bot tokens. Each agent app must be
// installed to the workspace once (human click → "Install to Workspace") and its
// Bot User OAuth Token pasted into the env var named here. Until then, posting as
// that agent transparently falls back to the shared @openbrain bot
// (SLACK_BOT_TOKEN) so nothing breaks.
//
// canonicalAppId is the ONE app we keep per agent (duplicates get deleted). It is
// recorded here as the source of truth so the dedup + install steps are
// unambiguous. Leave it null until the canonical app is confirmed.
import { getRuntimeEnv } from "@lib/runtime-env";

export interface SlackAgentIdentity {
  /** Stable slug, matches agents/profiles/<slug>.yaml. */
  slug: string;
  /** Display name / bot user handle. */
  displayName: string;
  /** Env var holding this agent's xoxb bot token. */
  tokenEnvKey: string;
  /** Canonical Slack app id (A…) — the one kept after dedup. null = unconfirmed. */
  canonicalAppId: string | null;
}

// Vertical (client-facing) agents + the Ops Conductor. Dev-side bots are added
// when their delivery path goes live. canonicalAppId values are provisional
// (from the api.slack.com "Your Apps" list) and must be confirmed by which app
// actually holds the installed bot token before any duplicate is deleted.
export const SLACK_AGENTS: Record<string, SlackAgentIdentity> = {
  alex: { slug: "alex-rivers", displayName: "Alex Rivers", tokenEnvKey: "ALEX_RIVERS_BOT_TOKEN", canonicalAppId: "A0BD4C9SUPP" },
  casey: { slug: "casey-morgan", displayName: "Casey Morgan", tokenEnvKey: "CASEY_MORGAN_BOT_TOKEN", canonicalAppId: "A0BD85UG23C" },
  jordan: { slug: "jordan-price", displayName: "Jordan Price", tokenEnvKey: "JORDAN_PRICE_BOT_TOKEN", canonicalAppId: "A0BE2EMAA8Y" },
  maya: { slug: "maya-chen", displayName: "Maya Chen", tokenEnvKey: "MAYA_CHEN_BOT_TOKEN", canonicalAppId: "A0BD0PAEU2E" },
  lena: { slug: "lena-brooks", displayName: "Lena Brooks", tokenEnvKey: "LENA_BROOKS_BOT_TOKEN", canonicalAppId: "A0BD1RH3FPD" },
  rowan: { slug: "rowan-vale", displayName: "Rowan Vale", tokenEnvKey: "ROWAN_VALE_BOT_TOKEN", canonicalAppId: "A0BD1RMHFBM" },
  sam: { slug: "sam-torres", displayName: "Sam Torres", tokenEnvKey: "SAM_TORRES_BOT_TOKEN", canonicalAppId: "A0BD86ATVHQ" },
  conductor: { slug: "ops-conductor", displayName: "Ops Conductor", tokenEnvKey: "OPS_CONDUCTOR_BOT_TOKEN", canonicalAppId: "A0BDG2CCCAJ" },
};

export interface AgentTokenResolution {
  token: string | undefined;
  /** "agent" if the agent's own token was found, "fallback" if using @openbrain, "none" if neither. */
  source: "agent" | "fallback" | "none";
  identity: SlackAgentIdentity | null;
}

/**
 * Resolve the bot token to post as `agent` (a slug like "alex" or "alex-rivers").
 * Falls back to the shared @openbrain token (SLACK_BOT_TOKEN) when the agent's
 * own token is unset, so delivery never hard-fails during rollout.
 */
export function resolveAgentToken(agent?: string): AgentTokenResolution {
  const env = getRuntimeEnv();
  const shared = env.SLACK_BOT_TOKEN?.trim() || undefined;
  if (!agent) return { token: shared, source: shared ? "fallback" : "none", identity: null };

  const key = agent.toLowerCase();
  const identity =
    SLACK_AGENTS[key] ?? Object.values(SLACK_AGENTS).find((a) => a.slug === key) ?? null;
  if (!identity) return { token: shared, source: shared ? "fallback" : "none", identity: null };

  const own = (env as Record<string, string | undefined>)[identity.tokenEnvKey]?.trim() || undefined;
  if (own) return { token: own, source: "agent", identity };
  return { token: shared, source: shared ? "fallback" : "none", identity };
}
