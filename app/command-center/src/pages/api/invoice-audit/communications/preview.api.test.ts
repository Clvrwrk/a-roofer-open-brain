import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateServerSupabaseClient = vi.fn();
const mockUpsertPreview = vi.fn();

vi.mock("@lib/supabase.server", () => ({
  createServerSupabaseClient: (...args: unknown[]) => mockCreateServerSupabaseClient(...args),
}));

vi.mock("@lib/invoice-audit-communications", () => ({
  upsertInvoiceAuditCommunicationPreview: (...args: unknown[]) => mockUpsertPreview(...args),
  deriveAuditStatus: (triggerAction: string) =>
    triggerAction === "credit-flag" || triggerAction === "credit-noflag" ? "disputed" : "passed",
}));

describe("POST /api/invoice-audit/communications/preview", () => {
  beforeEach(() => {
    mockCreateServerSupabaseClient.mockReset();
    mockUpsertPreview.mockReset();
  });

  it("returns unauthorized without actor", async () => {
    const { POST } = await import("./preview");
    const response = await POST({
      request: new Request("http://localhost/api/invoice-audit/communications/preview", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      locals: {},
    } as any);
    expect(response.status).toBe(401);
  });

  it("returns forbidden without approval permission", async () => {
    const { POST } = await import("./preview");
    const response = await POST({
      request: new Request("http://localhost/api/invoice-audit/communications/preview", {
        method: "POST",
        body: JSON.stringify({
          invoiceLineId: "11111111-1111-4111-8111-111111111111",
          invoiceNumber: "INV-1",
          triggerAction: "accept-neg",
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

  it("creates preview payload for valid request", async () => {
    const { POST } = await import("./preview");
    const client = {
      from: (table: string) => {
        if (table !== "v_invoice_audit_line") throw new Error(`Unexpected table ${table}`);
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    line_id: "11111111-1111-4111-8111-111111111111",
                    invoice_number: "INV-1",
                    item_number: "ITEM-1",
                    item_description: "Description",
                    unit_price: 10,
                    negotiated_price: 9,
                    variance_pct: 11,
                    variance_ext: 1,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        };
      },
    };
    mockCreateServerSupabaseClient.mockReturnValue({
      client,
      config: { missing: [] },
    });
    mockUpsertPreview.mockResolvedValue({
      threadId: "9ba5f7ef-8d44-4d40-9d82-896dfaa82966",
      status: "awaiting_internal_approval",
      subject: "Subject",
      validationState: "ready",
      validationErrors: [],
      messages: [],
    });
    const response = await POST({
      request: new Request("http://localhost/api/invoice-audit/communications/preview", {
        method: "POST",
        body: JSON.stringify({
          invoiceLineId: "11111111-1111-4111-8111-111111111111",
          invoiceNumber: "INV-1",
          triggerAction: "accept-neg",
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
    expect(payload.preview.threadId).toBe("9ba5f7ef-8d44-4d40-9d82-896dfaa82966");
    expect(mockUpsertPreview).toHaveBeenCalledTimes(1);
  });
});
