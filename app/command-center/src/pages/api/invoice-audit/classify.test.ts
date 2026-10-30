import { describe, expect, it, vi } from "vitest";
const { inserted, createClient } = vi.hoisted(() => ({ inserted: [] as any[], createClient: vi.fn() }));
vi.mock("@lib/supabase.server", () => ({ createServerSupabaseClient: createClient }));
vi.mock("@lib/invoice-audit", () => ({ invalidateInvoiceAuditSummaryCache: vi.fn() }));
import { POST } from "./classify";

describe("SRS classification line identity", () => {
  it("accepts an existing deterministic PostgreSQL UUID with non-RFC version bits", async () => {
    const id = "b8598ffe-c8cc-fd8c-004c-9c23859e1ef4";
    inserted.length = 0;
    createClient.mockReturnValue({ client: { from: (table: string) => ({
      select: () => ({ eq: () => ({ limit: async () => ({ data: [{ vendor_slug: "srs" }] }) }), in: async () => ({ data: [{ line_id: id, invoice_number: "SRS-TEST" }] }) }),
      insert: (rows: any[]) => { inserted.push(...rows); return { select: async () => ({ data: rows, error: null }) }; },
    }) } });
    const request = new Request("https://example.test/api/invoice-audit/classify", { method: "POST", body: JSON.stringify({ invoiceNumber: "SRS-TEST", lines: [{ invoiceLineId: id, classification: "discrepancy" }] }) });
    const response = await POST({ request, locals: { actor: { type: "service_agent", displayName: "Auditor" } } } as any);
    expect(response.status).toBe(200);
    expect(inserted).toMatchObject([{ invoice_line_id: id, invoice_number: "SRS-TEST", vendor_slug: "srs" }]);
  });
  it("still refuses a malformed line ID before any insert", async () => {
    inserted.length = 0;
    const request = new Request("https://example.test/api/invoice-audit/classify", { method: "POST", body: JSON.stringify({ invoiceNumber: "SRS-TEST", invoiceLineId: "not-a-uuid", classification: "valid" }) });
    const response = await POST({ request, locals: { actor: { type: "service_agent" } } } as any);
    expect(response.status).toBe(400);
    expect(inserted).toHaveLength(0);
  });
});
