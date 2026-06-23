import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateServerSupabaseClient = vi.fn();
const mockGetRuntimeEnv = vi.fn();
const mockValidateCommunicationThread = vi.fn();
const mockSetCommunicationThreadStatus = vi.fn();
const mockParseThreadMetadata = vi.fn();
const mockUpdateCommunicationMessageDraft = vi.fn();

vi.mock("@lib/supabase.server", () => ({
  createServerSupabaseClient: (...args: unknown[]) => mockCreateServerSupabaseClient(...args),
}));

vi.mock("@lib/runtime-env", () => ({
  getRuntimeEnv: (...args: unknown[]) => mockGetRuntimeEnv(...args),
}));

vi.mock("@lib/invoice-audit-communications", () => ({
  validateCommunicationThread: (...args: unknown[]) => mockValidateCommunicationThread(...args),
  setCommunicationThreadStatus: (...args: unknown[]) => mockSetCommunicationThreadStatus(...args),
  parseThreadMetadata: (...args: unknown[]) => mockParseThreadMetadata(...args),
  updateCommunicationMessageDraft: (...args: unknown[]) => mockUpdateCommunicationMessageDraft(...args),
}));

function createClientStub() {
  const calls: Array<{ table: string; action: string; payload?: unknown }> = [];
  const tableActions = {
    communication_threads: {
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              id: "thread-1",
              trigger_action: "accept-neg",
              invoice_line_id: "11111111-1111-4111-8111-111111111111",
              invoice_number: "INV-1",
              item_number: "ITEM-1",
              metadata: {},
              subject: "Subject",
              status: "awaiting_internal_approval",
            },
            error: null,
          }),
        }),
      }),
    },
    invoice_line_audit: {
      insert: (payload: unknown) => {
        calls.push({ table: "invoice_line_audit", action: "insert", payload });
        return {
          select: () => ({
            single: async () => ({
              data: { id: "audit-1", decided_at: new Date().toISOString(), approved_by: "Actor One" },
              error: null,
            }),
          }),
        };
      },
    },
    communication_messages: {
      select: () => ({
        eq: async () => ({
          data: [
            {
              id: "msg-1",
              channel_type: "slack",
              subject: "Slack Subject",
              body_html: "<p>body</p>",
              recipients: ["C123"],
              route_id: "route-1",
            },
            {
              id: "msg-2",
              channel_type: "email",
              subject: "Email Subject",
              body_html: "<p>body</p>",
              recipients: ["lucinda@proexteriorsus.com"],
              route_id: "route-2",
            },
          ],
          error: null,
        }),
      }),
    },
    communication_routes: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: "route-1",
              target_channel_id: "C123",
              target_email: "lucinda@proexteriorsus.com",
              target_agent: "@ob-accounting",
            },
            error: null,
          }),
        }),
      }),
    },
    communication_delivery_attempts: {
      insert: (payload: unknown) => {
        calls.push({ table: "communication_delivery_attempts", action: "insert", payload });
        return {
          select: () => ({
            single: async () => ({ data: { id: "delivery-1" }, error: null }),
          }),
        };
      },
    },
    slack_mirror_events: {
      insert: async (payload: unknown) => {
        calls.push({ table: "slack_mirror_events", action: "insert", payload });
        return { data: null, error: null };
      },
    },
    dashboard_action_log: {
      insert: async (payload: unknown) => {
        calls.push({ table: "dashboard_action_log", action: "insert", payload });
        return { data: null, error: null };
      },
    },
    v_invoice_line_audit_current: {
      select: () => ({
        eq: () => ({
          in: async () => ({ data: [], error: null }),
        }),
      }),
    },
  } as Record<string, any>;

  return {
    calls,
    client: {
      from(table: string) {
        const action = tableActions[table];
        if (!action) throw new Error(`Unexpected table access in test: ${table}`);
        return action;
      },
    },
  };
}

describe("POST /api/invoice-audit/communications/action approve workflow", () => {
  beforeEach(() => {
    mockCreateServerSupabaseClient.mockReset();
    mockGetRuntimeEnv.mockReset();
    mockValidateCommunicationThread.mockReset();
    mockSetCommunicationThreadStatus.mockReset();
    mockParseThreadMetadata.mockReset();
    mockUpdateCommunicationMessageDraft.mockReset();
  });

  it("approves validated communication and queues internal delivery records", async () => {
    const { client, calls } = createClientStub();
    mockCreateServerSupabaseClient.mockReturnValue({
      client,
      config: { missing: [] },
    });
    mockGetRuntimeEnv.mockReturnValue({
      SLACK_ACCOUNTING_CREDIT_MEMOS_CHANNEL_ID: "C123",
      SLACK_OB_CONDUCTOR_DIGEST_CHANNEL_ID: "C999",
    });
    mockValidateCommunicationThread.mockResolvedValue({
      validationState: "ready",
      validationErrors: [],
    });
    mockSetCommunicationThreadStatus.mockResolvedValue({
      status: "queued_for_release",
    });
    mockParseThreadMetadata.mockReturnValue({
      auditStatus: "passed",
      note: "Approved",
      invoiceNumber: "INV-1",
      itemNumber: "ITEM-1",
    });

    const { POST } = await import("./action");
    const response = await POST({
      request: new Request("http://localhost/api/invoice-audit/communications/action", {
        method: "POST",
        body: JSON.stringify({
          threadId: "11111111-1111-4111-8111-111111111111",
          action: "approve",
        }),
      }),
      locals: {
        actor: {
          id: "actor-1",
          type: "human",
          displayName: "Actor One",
          permissions: ["approval.decide"],
          departmentAccess: ["accounting"],
        },
      },
    } as any);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(calls.some((entry) => entry.table === "invoice_line_audit")).toBe(true);
    expect(calls.some((entry) => entry.table === "communication_delivery_attempts")).toBe(true);
    expect(calls.some((entry) => entry.table === "slack_mirror_events")).toBe(true);
    expect(calls.some((entry) => entry.table === "dashboard_action_log")).toBe(true);
  });

  it("rejects actors without approval permission", async () => {
    const { client } = createClientStub();
    mockCreateServerSupabaseClient.mockReturnValue({
      client,
      config: { missing: [] },
    });
    const { POST } = await import("./action");
    const response = await POST({
      request: new Request("http://localhost/api/invoice-audit/communications/action", {
        method: "POST",
        body: JSON.stringify({
          threadId: "11111111-1111-4111-8111-111111111111",
          action: "approve",
        }),
      }),
      locals: {
        actor: {
          id: "viewer-1",
          type: "human",
          displayName: "Read Only",
          permissions: [],
          departmentAccess: ["accounting"],
        },
      },
    } as any);
    expect(response.status).toBe(403);
  });
});
