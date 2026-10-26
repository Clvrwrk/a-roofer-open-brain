import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localActor } from "./access-control";
import { GET } from "../pages/api/accounting/qb-bank-csv";

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, any>>>,
  failOriginalRead: false,
}));

vi.mock("./supabase.server", () => ({
  createServerSupabaseClient: () => ({
    config: { missing: [] },
    client: {
      from(table: string) {
        if (!(table in state.tables)) throw new Error(`Unexpected table: ${table}`);
        let rows = [...state.tables[table]];
        let originalRead = false;
        const query: any = {
          select: () => query,
          eq: (key: string, value: unknown) => { rows = rows.filter(r => r[key] === value); return query; },
          gte: (key: string, value: string) => { rows = rows.filter(r => String(r[key]) >= value); return query; },
          not: (key: string, op: string, value: unknown) => {
            if (op !== "is" || value !== null) throw new Error("Unexpected not filter");
            rows = rows.filter(r => r[key] !== null && r[key] !== undefined); return query;
          },
          in: (key: string, values: string[]) => {
            originalRead ||= table === "abc_invoices" && key === "invoice_number";
            rows = rows.filter(r => values.includes(String(r[key]))); return query;
          },
          order: (key: string) => { rows.sort((a,b) => String(a[key]).localeCompare(String(b[key]))); return query; },
          range: (from: number, to: number) => { rows = rows.slice(from, to + 1); return query; },
          limit: (n: number) => { rows = rows.slice(0, n); return query; },
          then: (resolve: Function, reject: Function) => Promise.resolve(
            originalRead && state.failOriginalRead
              ? { data: null, error: { message: "Synthetic original read failure" } }
              : { data: rows, error: null },
          ).then(resolve as any, reject as any),
        };
        for (const method of ["insert", "upsert", "update", "delete", "rpc"]) {
          query[method] = () => { throw new Error(`Forbidden write: ${table}.${method}`); };
        }
        return query;
      },
    },
  }),
}));

beforeEach(() => {
  state.failOriginalRead = false;
  state.tables = {
    qb_bank_export_log: [], credit_memo_receipts: [], acculynx_jobs: [], credit_memo_requests: [],
    v_invoice_acculynx_match: [
      { invoice_number: "ORIGINAL-1", pe_job_number: "Commercial", canonical_po: null, client_name: "Synthetic original" },
      { invoice_number: "CM-1", pe_job_number: "Commercial", canonical_po: null, client_name: "Synthetic CM" },
      { invoice_number: "NONCOMM-1", pe_job_number: "TX-701", canonical_po: null, client_name: "Synthetic customer" },
    ],
    abc_invoices: [
      { invoice_number: "ORIGINAL-1", invoice_date: "2026-07-20", ship_to_name: "Commercial", purchase_order_number: "  original-po-123456  ", total_amount: 100, is_credit_memo: false },
      { invoice_number: "CM-1", invoice_date: "2026-08-20", ship_to_name: "Commercial", purchase_order_number: "CM-OWN-99", total_amount: -10, is_credit_memo: true },
      { invoice_number: "NONCOMM-1", invoice_date: "2026-08-21", ship_to_name: "DFW Account", purchase_order_number: "DO-NOT-ADOPT", total_amount: 125, is_credit_memo: false },
    ],
    v_credit_memo_audit: [{ invoice_number: "CM-1", original_invoice_number: "ORIGINAL-1" }],
  };
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network permitted in route fixture"); }));
});
afterEach(() => vi.unstubAllGlobals());

const preview = () => GET({
  locals: { actor: localActor() },
  url: new URL("https://fixture.invalid/api/accounting/qb-bank-csv?vendor=abc-supply&mode=preview&since=2026-08-01"),
} as any);
const original = () => state.tables.abc_invoices[0];
const originalMatch = () => state.tables.v_invoice_acculynx_match[0];
const noncommercialRow = "2026-08-21,TX-701,ABC-INV#NONCOMM-1 - Synthetic customer,125.00,\n";

describe("ABC QB bank preview credit-memo original reference", () => {
  it("inherits an outside-window Commercial original PO, capped at 12, and leaves the noncommercial row byte-identical", async () => {
    const response = await preview();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(
      "Date,Check No,Description,Spent,Received\n" +
      "2026-08-20,ORIGINAL-PO-,CMINV#CM-1-OriginalINV#ORIGINAL-1 - Synthetic original,,10.00\n" + noncommercialRow,
    );
  });

  it("keeps the original standard resolution when its Commercial PO is blank", async () => {
    original().purchase_order_number = "   ";
    originalMatch().pe_job_number = "KS-42";
    const response = await preview();
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("2026-08-20,KS-42,CMINV#CM-1-OriginalINV#ORIGINAL-1 - Synthetic original,,10.00\n");
  });

  it("does not adopt a noncommercial original PO or the CM own PO", async () => {
    original().ship_to_name = "DFW Account";
    original().purchase_order_number = "DIFFERENT-PO";
    originalMatch().pe_job_number = "KS-42";
    const response = await preview();
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("2026-08-20,KS-42,CMINV#CM-1-OriginalINV#ORIGINAL-1 - Synthetic original,,10.00\n");
  });

  it("does not export the CM own PO when the referenced original is missing", async () => {
    state.tables.abc_invoices = state.tables.abc_invoices.filter(r => r.invoice_number !== "ORIGINAL-1");
    const response = await preview();
    expect(response.status).toBe(409);
    expect(await response.text()).toContain("abc_original_invoices");
  });

  it("fails closed if the outside-window original cannot be read", async () => {
    state.failOriginalRead = true;
    const response = await preview();
    expect(response.status).toBe(409);
    expect(await response.text()).toContain("abc_original_invoices");
  });
});
