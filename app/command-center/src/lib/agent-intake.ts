/**
 * agent-intake.ts
 * Helpers for Maya-style agent email intake → dashboard_work_items + dashboard_action_log row pairs.
 * Used by POST /api/agent/intake and by the Gmail polling worker.
 */
import type { CommandCenterActor } from "@lib/access-control";

export interface AgentIntakeMessage {
  /** Gmail message ID or AgentMail message ID — used as source_pk. */
  messageId: string;
  /** The alias address the email was sent to, e.g. invoices@cc.proexteriorsus.net */
  alias: string;
  /** Classification derived from the alias + content: invoice | credit_memo | price_agreement | ap_order_or_bill | ar_remittance | hr_sensitive_escalate | payroll_sensitive_escalate | unknown */
  classification: string;
  subject: string;
  from: string;
  receivedAt: string;
  attachments: string[];
  gmailLabels: string[];
  /** Channel ID the Slack notification was posted to (may be empty string if not posted). */
  slackChannelId: string;
  /** Thread timestamp from the Slack post (may be empty string). */
  slackThreadTs: string;
}

export interface AgentIntakeRows {
  workItem: Record<string, unknown>;
  actionLog: Record<string, unknown>;
}

const ALIAS_PRIORITY: Record<string, "critical" | "high" | "normal"> = {
  ap_order_or_bill: "critical",    // Draft orders — catch before processing
  invoice: "high",
  credit_memo: "high",
  price_agreement: "normal",
  ar_remittance: "normal",
  hr_sensitive_escalate: "high",
  payroll_sensitive_escalate: "high",
  unknown: "normal",
};

const ALIAS_TITLE_PREFIX: Record<string, string> = {
  ap_order_or_bill: "AP / Order intake",
  invoice: "Invoice intake",
  credit_memo: "Credit memo intake",
  price_agreement: "Price agreement intake",
  ar_remittance: "AR remittance intake",
  hr_sensitive_escalate: "HR document intake",
  payroll_sensitive_escalate: "Payroll document intake",
  unknown: "Document intake",
};

export function buildAgentIntakeRows(
  msg: AgentIntakeMessage,
  actor: CommandCenterActor,
): AgentIntakeRows {
  const workKey = `accounting:email-intake:${msg.messageId}`;
  const priority = ALIAS_PRIORITY[msg.classification] ?? "normal";
  const titlePrefix = ALIAS_TITLE_PREFIX[msg.classification] ?? "Document intake";
  const spamFlag = msg.gmailLabels.includes("SPAM");

  const evidence: Array<{ text: string }> = [
    { text: `From: ${msg.from}` },
    { text: `Alias: ${msg.alias}` },
    { text: `Received: ${msg.receivedAt}` },
    ...msg.attachments.map((fn) => ({ text: `Attachment: ${fn}` })),
  ];
  if (spamFlag) {
    evidence.push({ text: "⚠️ Gmail marked as SPAM — verify vendor sender before processing." });
  }
  if (msg.classification.includes("sensitive")) {
    evidence.push({ text: "⚠️ PII-sensitive document type. Do not extract content into atoms without human review." });
  }

  const workItem: Record<string, unknown> = {
    work_key: workKey,
    department: "accounting",
    workflow: "email-intake",
    source_system: "gmail",
    source_table: "gmail_messages",
    source_pk: msg.messageId,
    title: `${titlePrefix} / ${msg.subject}`,
    summary: `${msg.classification} document received via ${msg.alias} from ${msg.from}. ${msg.attachments.length} attachment(s). Requires extraction and human verification.`,
    priority,
    status: "needs_more_evidence",
    approval_required: true,
    primary_human: "Lucinda",
    assigned_to: "@ob-accounting",
    slack_channel_id: msg.slackChannelId || null,
    slack_thread_ts: msg.slackThreadTs || null,
    created_by: actor.id,
    value_at_risk: 0,
    evidence,
    source_data: {
      alias: msg.alias,
      classification: msg.classification,
      from: msg.from,
      gmailLabels: msg.gmailLabels,
      receivedAt: msg.receivedAt,
      spamFlag,
      subject: msg.subject,
    },
  };

  const actionLog: Record<string, unknown> = {
    work_key: workKey,
    department: "accounting",
    workflow: "email-intake",
    action_type: "agent_intake",
    decision: null,
    actor_id: actor.id,
    actor_type: actor.type,
    actor_display_name: actor.displayName,
    note: `Maya intake: ${msg.classification} via ${msg.alias}. ${msg.attachments.length} attachment(s). Slack: ${msg.slackThreadTs || "none"}.`,
    payload: {
      alias: msg.alias,
      attachments: msg.attachments,
      classification: msg.classification,
      from: msg.from,
      gmailLabels: msg.gmailLabels,
      messageId: msg.messageId,
      receivedAt: msg.receivedAt,
      slackChannelId: msg.slackChannelId,
      slackThreadTs: msg.slackThreadTs,
      spamFlag,
      subject: msg.subject,
    },
    source_table: "gmail_messages",
    source_pk: msg.messageId,
    slack_channel_id: msg.slackChannelId || null,
    slack_thread_ts: msg.slackThreadTs || null,
  };

  return { workItem, actionLog };
}
