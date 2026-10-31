/**
 * Pure routing for the Linear webhook: decides whether an event wakes an agent lane.
 * Triggers: a comment @mentioning "PE Dev Agents", or the `agent-go` label being added.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const REPLAY_WINDOW_MS = 60_000;
/** Lanes whose pickup would start a metered vendor session; these are queue-only. */
export const QUEUE_ONLY_LANES = new Set(["cw-cursor", "cw-codex"]);
export const PAID_SESSION_LANES = new Set(["cw-grok", "cw-claude", "cw-cowork", "sentinel", "accounting", "linear-manager"]);

export function verifyLinearSignature(raw: string, signature: string | null, secret: string, nowMs = Date.now()) {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const ts = Number((JSON.parse(raw) as { webhookTimestamp?: unknown }).webhookTimestamp);
    return Number.isFinite(ts) && Math.abs(nowMs - ts) <= REPLAY_WINDOW_MS;
  } catch {
    return false;
  }
}

export function mentionsAgentsApp(body: string) {
  return /@pe[-\s]dev[-\s]agents\b/i.test(body) || /linear\.app\/[^/\s]+\/profiles\/pe-dev-agents/i.test(body);
}

export interface LinearWebhookEvent {
  type?: string;
  action?: string;
  data?: Record<string, unknown>;
  updatedFrom?: Record<string, unknown>;
}

export type DispatchDecision =
  | { kind: "dispatch"; lane: string; trigger: "mention" | "agent-go"; issueId: string; sourceId: string; paidSession: boolean }
  | { kind: "unrouted"; trigger: "mention" | "agent-go"; issueId: string; laneLabels: string[] }
  | { kind: "ignore"; reason: string };

/** Which issue + trigger the event concerns, before labels are known. */
export function triggerOf(event: LinearWebhookEvent, appUserId: string | null) {
  const data = event.data ?? {};
  if (event.type === "Comment" && event.action === "create") {
    if (appUserId && data.userId === appUserId) return { ignore: "self_authored" } as const;
    if (!mentionsAgentsApp(String(data.body ?? ""))) return { ignore: "no_trigger" } as const;
    const issueId = String(data.issueId ?? (data.issue as { id?: string } | undefined)?.id ?? "");
    return issueId ? ({ trigger: "mention", issueId, sourceId: String(data.id ?? "") } as const) : ({ ignore: "no_issue" } as const);
  }
  if (event.type === "Issue" && event.action === "update") {
    const labels = (data.labels as { id: string; name: string }[] | undefined) ?? [];
    const go = labels.find((l) => l.name.toLowerCase() === "agent-go");
    const before = event.updatedFrom?.labelIds;
    if (!go || !Array.isArray(before) || before.includes(go.id)) return { ignore: "no_trigger" } as const;
    return { trigger: "agent-go", issueId: String(data.id ?? ""), sourceId: String(data.id ?? ""), labelNames: labels.map((l) => l.name) } as const;
  }
  return { ignore: "no_trigger" } as const;
}

export function decideDispatch(
  event: LinearWebhookEvent,
  { issueLabelNames, appUserId }: { issueLabelNames?: string[]; appUserId: string | null },
): DispatchDecision {
  const t = triggerOf(event, appUserId);
  if ("ignore" in t) return { kind: "ignore", reason: t.ignore! };
  const names = ("labelNames" in t ? t.labelNames : issueLabelNames) ?? [];
  const lanes = names.filter((n) => n.toLowerCase().startsWith("lane:")).map((n) => n.slice(5).toLowerCase());
  if (lanes.length !== 1) return { kind: "unrouted", trigger: t.trigger, issueId: t.issueId, laneLabels: lanes };
  const lane = lanes[0];
  return { kind: "dispatch", lane, trigger: t.trigger, issueId: t.issueId, sourceId: t.sourceId, paidSession: !QUEUE_ONLY_LANES.has(lane) };
}
