import type { RoofingOpsFileSummary } from "./roofing-agent-scope";

export type RoofingOpsEscalationKind = "bug" | "feature" | "enhancement";

export interface RoofingOpsEscalationInput {
  kind: RoofingOpsEscalationKind;
  summary: string;
  slackChannelId: string;
  slackThreadTs?: string;
  slackUserId?: string;
  requestText: string;
  fileSummaries?: RoofingOpsFileSummary[];
  reason: string;
}

export interface RoofingOpsLinearPayload {
  team: "PE-CC-DevTeam";
  project: "PE-CC-DevEngine";
  title: string;
  description: string;
  labels: string[];
}

function sanitizeSummary(summary: string): string {
  return summary.replace(/\s+/g, " ").trim().slice(0, 120) || "Review unsupported Roofing-Ops agent request";
}

function formatFiles(files: RoofingOpsFileSummary[] | undefined): string {
  if (!files?.length) return "None";
  return files
    .map((file) => `- ${file.name ?? "unnamed"} (${file.mimetype ?? file.filetype ?? "unknown"}) — Slack file ID ${file.id}`)
    .join("\n");
}

export function buildRoofingOpsLinearEscalation(input: RoofingOpsEscalationInput): RoofingOpsLinearPayload {
  const title = `[roofing ops intake][${input.kind}] ${sanitizeSummary(input.summary)}`;
  const description = [
    "## Source",
    `- Slack channel: ${input.slackChannelId}`,
    `- Thread/message TS: ${input.slackThreadTs ?? "unknown"}`,
    `- Requesting user: ${input.slackUserId ?? "unknown"}`,
    "- Agent that escalated: Ops Conductor",
    "",
    "## User request",
    input.requestText || "(No text supplied)",
    "",
    "## Attachments",
    formatFiles(input.fileSummaries),
    "",
    "## Why this needs DevTeam review",
    input.reason,
    "",
    "## Suggested next step",
    "Triage and schedule through Open Engine / DevTeam. If this is a missing SOP rather than a software change, route back to Chris for instructions and SOP improvement.",
  ].join("\n");

  return {
    team: "PE-CC-DevTeam",
    project: "PE-CC-DevEngine",
    title,
    description,
    labels: ["agent-instructions", "roofing-ops-intake"],
  };
}

export interface ChrisAdminNotificationInput {
  title: string;
  linearUrl: string;
  reason: string;
}

export function buildChrisAdminNotification(input: ChrisAdminNotificationInput): string {
  return [
    "🛠️ Ops Conductor created a DevTeam review item",
    "",
    `SITUATION: A Roofing-Ops agent request could not be handled safely by the current SOP/tool set (${input.reason}).`,
    "IMPACT: This may need a bug fix, feature, enhancement, or SOP improvement before agents can handle it autonomously.",
    `TICKET: ${input.linearUrl}`,
    "",
    "No action needed unless you want to reprioritize it — I routed it for DevTeam review and kept the public thread human-readable.",
  ].join("\n");
}
