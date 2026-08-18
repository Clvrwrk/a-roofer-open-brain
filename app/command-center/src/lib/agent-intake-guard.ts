/**
 * agent-intake-guard.ts
 * Boundary guard for POST /api/agent/intake (PEC-149..158, PEC-167/169/170).
 *
 * Two failure modes filled the PE-CC-DevTeam queue with ~14 tickets that no
 * human ever needed to action individually:
 *
 *  1. SELF-RECEIPT LOOP — Maya's own receipt acknowledgement landed back in her
 *     mailbox and was re-classified as fresh accounting intake, which then
 *     generated another receipt. PEC-167/169/170 are that loop. Any message
 *     whose sender is an agent's own workspace address is not intake; it is the
 *     agent's own echo, and it is dropped here.
 *
 *  2. SECURITY-NOTICE FAN-OUT — one Google/WorkOS security notice per event
 *     became one Urgent ticket per event (ten of them across 6/6–6/25, each
 *     needing the same single human confirmation). These are folded into ONE
 *     rolling work item per calendar month by rewriting the orchestration key,
 *     which is what the existing work_key upsert converges on. Nothing is
 *     suppressed — every notice still appends its own audit row to the shared
 *     item, so the evidence trail stays complete.
 *
 * The guard is deliberately server-side: the classification field is supplied by
 * the caller (Maya's runtime), so a prompt-level fix would not hold if the
 * runtime changed. Fail closed at the boundary instead.
 */

/** Workspace domain for the named-agent roster (access-control.ts). */
const AGENT_WORKSPACE_DOMAIN = "@cc.proexteriorsus.net";

/** Senders that only ever emit account/security notices, never actionable accounting work. */
const SECURITY_NOTICE_SENDERS = [
  "no-reply@accounts.google.com",
  "noreply@accounts.google.com",
  "drive-shares-noreply@google.com",
  "drive-shares-dm-noreply@google.com",
  "access@workos-mail.com",
];

export type IntakeGuardVerdict =
  | { action: "accept" }
  | { action: "drop"; rule: string; reason: string }
  | { action: "fold"; rule: string; reason: string; orchestrationKey: string };

/** Extract a bare lowercase address from a possibly display-name-wrapped From header. */
export function normalizeSender(from: string): string {
  const angled = /<([^>]+)>/u.exec(from);
  return (angled ? angled[1] : from).trim().toLowerCase();
}

export function isAgentSelfSender(from: string): boolean {
  return normalizeSender(from).endsWith(AGENT_WORKSPACE_DOMAIN);
}

export function isSecurityNoticeSender(from: string): boolean {
  return SECURITY_NOTICE_SENDERS.includes(normalizeSender(from));
}

/**
 * Decide what the intake boundary does with a message.
 * `receivedAt` drives the monthly fold bucket so the rolling item rotates
 * predictably and an old notice never reopens a closed month.
 */
export function evaluateIntakeGuard(input: { from: string; receivedAt: string }): IntakeGuardVerdict {
  const sender = normalizeSender(input.from);

  if (isAgentSelfSender(input.from)) {
    return {
      action: "drop",
      rule: "self_receipt_loop",
      reason: `${sender} is an agent workspace address; this is the agent's own receipt echo, not intake.`,
    };
  }

  if (isSecurityNoticeSender(input.from)) {
    const parsed = Date.parse(input.receivedAt);
    const bucket = Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 7) : "undated";
    return {
      action: "fold",
      rule: "security_notice_fold",
      reason: `${sender} emits account/security notices; folded into the ${bucket} security-triage item.`,
      orchestrationKey: `security-notice:${bucket}`,
    };
  }

  return { action: "accept" };
}
