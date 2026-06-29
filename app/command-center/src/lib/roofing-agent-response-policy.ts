import { classifyRoofingOpsRequest, requiresChrisApproval, type RoofingAgentId, type RoofingOpsFileSummary } from "./roofing-agent-scope";

export type SlackChannelType = "channel" | "group" | "im" | "mpim";

export interface RoofingOpsResponseInput {
  channelId: string;
  channelType: SlackChannelType;
  userId?: string;
  text?: string;
  files?: RoofingOpsFileSummary[];
  targetAgent?: RoofingAgentId;
  adminUserIds?: Set<string>;
}

export type RoofingOpsRoutingDecision =
  | { kind: "single_agent"; agent: RoofingAgentId; replyMode: "thread"; reason: string }
  | { kind: "research_approval_required"; agent: "rowan"; replyMode: "thread"; reason: string }
  | { kind: "ops_overlap"; candidates: RoofingAgentId[]; replyMode: "thread"; reason: string }
  | { kind: "ops_escalation"; reason: string; replyMode: "thread" }
  | { kind: "dm_redirect"; reason: string; replyMode: "ephemeral_or_dm" }
  | { kind: "ignore"; reason: string };

function isDm(channelType: SlackChannelType): boolean {
  return channelType === "im" || channelType === "mpim";
}

function isChrisOrAdmin(userId: string | undefined, adminUserIds: Set<string> | undefined): boolean {
  return Boolean(userId && adminUserIds?.has(userId));
}

export function decideRoofingOpsResponse(input: RoofingOpsResponseInput): RoofingOpsRoutingDecision {
  if (isDm(input.channelType)) {
    if (input.targetAgent === "ops" && isChrisOrAdmin(input.userId, input.adminUserIds)) {
      return { kind: "single_agent", agent: "ops", replyMode: "thread", reason: "ops_chris_dm_allowed" };
    }
    return { kind: "dm_redirect", reason: "no_agent_dm_public_channel_required", replyMode: "ephemeral_or_dm" };
  }

  const classification = classifyRoofingOpsRequest({ text: input.text, files: input.files });

  if (classification.outOfDomain) {
    return { kind: "ignore", reason: classification.reason };
  }

  if (classification.reason === "unclear_file_request") {
    return { kind: "ops_escalation", reason: classification.reason, replyMode: "thread" };
  }

  if (classification.requiresOpsResolution) {
    return {
      kind: "ops_overlap",
      candidates: classification.candidates.map((candidate) => candidate.agent),
      replyMode: "thread",
      reason: classification.reason,
    };
  }

  const primary = classification.primary;
  if (!primary) return { kind: "ignore", reason: "no_primary_candidate" };

  if (primary.agent === "rowan" && requiresChrisApproval(primary)) {
    return { kind: "research_approval_required", agent: "rowan", replyMode: "thread", reason: "research_requires_chris_approval" };
  }

  return { kind: "single_agent", agent: primary.agent, replyMode: "thread", reason: classification.reason };
}

export function buildHumanReadableRoutingReply(decision: RoofingOpsRoutingDecision): string | null {
  switch (decision.kind) {
    case "single_agent":
      return null;
    case "research_approval_required":
      return [
        "🔎 Rowan can help with this research lane.",
        "Because research changes what we treat as outside evidence, I’m going to get Chris’s approval before Rowan runs with it.",
        "→ Chris can reply `approve research` and Rowan will take it from there.",
      ].join("\n");
    case "ops_overlap":
      return [
        "I see this touches more than one lane, so I’m going to route it before anyone half-answers.",
        `Likely owners: ${decision.candidates.join(", ")}.`,
        "→ Ops Conductor will choose the clean handoff in this thread.",
      ].join("\n");
    case "ops_escalation":
      return [
        "I’m not fully confident the current SOP/tooling covers this request yet.",
        "I’m going to turn it into a DevTeam review item so we can improve the agent workflow instead of guessing in public.",
        "→ I’ll notify Chris once the ticket is created.",
      ].join("\n");
    case "dm_redirect":
      return "To keep agent work visible and auditable, please post this in the relevant public/operational channel. Ops Conductor can help route it there.";
    case "ignore":
      return null;
  }
}
