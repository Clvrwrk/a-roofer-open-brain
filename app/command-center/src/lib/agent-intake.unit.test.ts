import { describe, expect, it } from "vitest";
import { buildAgentIntakeRows } from "./agent-intake";
import type { CommandCenterActor } from "./access-control";

const mayaActor: CommandCenterActor = {
  id: "ob-accounting",
  type: "service_agent",
  displayName: "Accounting",
  email: null,
  source: "service_token",
  roles: ["vertical", "accounting"],
  permissions: ["command_center.read", "work_queue.read", "approval.request_more_evidence", "evidence.attach", "agent.resume"],
  departmentAccess: ["accounting"],
  desktopEnabled: false,
};

describe("buildAgentIntakeRows", () => {
  it("maps an invoices@ Gmail message into durable dashboard work rows", () => {
    const rows = buildAgentIntakeRows(
      {
        messageId: "gmail-msg-123",
        alias: "invoices@cc.proexteriorsus.net",
        classification: "invoice",
        subject: "ABC invoice 123",
        from: "vendor@example.com",
        receivedAt: "2026-06-25T00:00:00.000Z",
        attachments: ["invoice.pdf"],
        gmailLabels: ["UNREAD", "SPAM"],
        slackChannelId: "C0BCUF29G1H",
        slackThreadTs: "1782355940.754729",
      },
      mayaActor,
    );

    expect(rows.workItem).toMatchObject({
      work_key: "accounting:email-intake:gmail-msg-123",
      department: "accounting",
      workflow: "email-intake",
      source_system: "gmail",
      source_table: "gmail_messages",
      source_pk: "gmail-msg-123",
      title: "Invoice intake / ABC invoice 123",
      priority: "high",
      status: "needs_more_evidence",
      approval_required: true,
      primary_human: "Lucinda",
      assigned_to: "@ob-accounting",
      slack_channel_id: "C0BCUF29G1H",
      slack_thread_ts: "1782355940.754729",
      created_by: "ob-accounting",
    });
    expect(rows.workItem.evidence).toContainEqual({ text: "Attachment: invoice.pdf" });
    expect(rows.workItem.source_data).toMatchObject({
      alias: "invoices@cc.proexteriorsus.net",
      classification: "invoice",
      gmailLabels: ["UNREAD", "SPAM"],
      spamFlag: true,
    });

    expect(rows.actionLog).toMatchObject({
      work_key: "accounting:email-intake:gmail-msg-123",
      department: "accounting",
      workflow: "email-intake",
      action_type: "agent_intake",
      actor_id: "ob-accounting",
      actor_type: "service_agent",
      actor_display_name: "Accounting",
      source_table: "gmail_messages",
      source_pk: "gmail-msg-123",
      slack_channel_id: "C0BCUF29G1H",
      slack_thread_ts: "1782355940.754729",
    });
  });
});
