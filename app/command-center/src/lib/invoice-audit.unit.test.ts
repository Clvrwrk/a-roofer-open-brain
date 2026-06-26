import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateServerSupabaseClient = vi.fn();

vi.mock("@lib/supabase.server", () => ({
  createServerSupabaseClient: (...args: unknown[]) => mockCreateServerSupabaseClient(...args),
}));

function makeRangeResult(rows: any[]) {
  return {
    range: async () => ({ data: rows, error: null }),
  };
}

function makeClient(tables: Record<string, any[]>) {
  return {
    from: (table: string) => ({
      select: () => ({
        order: () => makeRangeResult(tables[table] ?? []),
        range: async () => ({ data: tables[table] ?? [], error: null }),
      }),
    }),
  };
}

describe("loadInvoiceAuditSummary", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreateServerSupabaseClient.mockReset();
  });

  it("uses ABC AR status to keep paid invoices out of the open-invoice default scope", async () => {
    mockCreateServerSupabaseClient.mockReturnValue({
      client: makeClient({
        v_invoice_audit_invoice: [
          {
            invoice_number: "OPEN-1",
            invoice_date: "2026-06-01",
            total_amount: 100,
            branch_number: "49",
            branch_name: "Denver, CO",
            office: "Denver",
            line_count: 1,
            no_price_lines: 1,
            flagged_lines: 1,
            at_risk: 25,
            credit_memo_amount: 0,
            worst_pct: 5,
          },
          {
            invoice_number: "PAID-1",
            invoice_date: "2026-06-02",
            total_amount: 200,
            branch_number: "49",
            branch_name: "Denver, CO",
            office: "Denver",
            line_count: 1,
            no_price_lines: 1,
            flagged_lines: 1,
            at_risk: 50,
            credit_memo_amount: 0,
            worst_pct: 8,
          },
        ],
        roof_system_category: [],
        abc_invoices: [
          { invoice_number: "OPEN-1", ar_status: "open", date_paid: null },
          { invoice_number: "PAID-1", ar_status: "paid", date_paid: "2026-06-10" },
        ],
      }),
    });

    const { loadInvoiceAuditSummary } = await import("./invoice-audit");
    const data = await loadInvoiceAuditSummary(undefined, { force: true });
    const invoices = data.offices.flatMap((office) => office.branches.flatMap((branch) => branch.invoices));

    expect(data.totals.openInvoices).toBe(1);
    expect(data.totals.paidInvoices).toBe(1);
    expect(data.totals.atRisk).toBe(25);
    expect(invoices.find((invoice) => invoice.invoiceNumber === "OPEN-1")?.paid).toBe(false);
    expect(invoices.find((invoice) => invoice.invoiceNumber === "PAID-1")?.paid).toBe(true);
  });
});
