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
            invoice_date: "2026-01-15", // ≥60d old → in the actionable scope
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
            invoice_date: "2026-01-16",
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
    expect(data.totals.actionableInvoices).toBe(1); // OPEN-1 only (≥60d, unpaid, non-CM)
    expect(invoices.find((invoice) => invoice.invoiceNumber === "OPEN-1")?.actionable).toBe(true);
    expect(invoices.find((invoice) => invoice.invoiceNumber === "PAID-1")?.actionable).toBe(false);
    expect(invoices.find((invoice) => invoice.invoiceNumber === "OPEN-1")?.paid).toBe(false);
    expect(invoices.find((invoice) => invoice.invoiceNumber === "PAID-1")?.paid).toBe(true);
  });

  it("uses current line audit status for summary progress rollups", async () => {
    const lineRows = Array.from({ length: 10 }, (_, index) => ({
      invoice_number: "DONE-1",
      line_id: `line-${index + 1}`,
      is_auditable: true,
    }));
    mockCreateServerSupabaseClient.mockReturnValue({
      client: makeClient({
        v_invoice_audit_invoice: [
          {
            invoice_number: "DONE-1",
            invoice_date: "2026-01-15", // ≥60d old → actionable, so its rollups land in the audit KPIs
            total_amount: 3896,
            branch_number: "49",
            branch_name: "Denver, CO",
            office: "Denver",
            line_count: 10,
            no_price_lines: 10,
            flagged_lines: 0,
            at_risk: 0,
            credit_memo_amount: 0,
            worst_pct: 0,
          },
        ],
        roof_system_category: [],
        abc_invoices: [{ invoice_number: "DONE-1", ar_status: "open", date_paid: null }],
        v_invoice_audit_line: lineRows,
        v_invoice_line_audit_current: lineRows.map((line) => ({
          invoice_line_id: line.line_id,
          audit_status: "passed",
        })),
      }),
    });

    const { loadInvoiceAuditSummary } = await import("./invoice-audit");
    const data = await loadInvoiceAuditSummary(undefined, { force: true });
    const invoice = data.offices[0]?.branches[0]?.invoices[0];

    expect(invoice?.auditedLines).toBe(10);
    expect(invoice?.pendingLines).toBe(0);
    expect(invoice?.toBePaid).toBe(true);
    expect(data.offices[0]?.pending).toBe(0);
    expect(data.offices[0]?.toBePaid).toBe(1);
    expect(data.totals.audited).toBe(10);
    expect(data.totals.pending).toBe(0);
    expect(data.totals.toBePaid).toBe(1);
  });

  function reviewedInvoiceWithLedger(invoiceNumber: string, ledgerStatus: string) {
    const lineRows = Array.from({ length: 4 }, (_, i) => ({ invoice_number: invoiceNumber, line_id: `${invoiceNumber}-l${i}`, is_auditable: true }));
    return makeClient({
      v_invoice_audit_invoice: [{
        invoice_number: invoiceNumber,
        invoice_date: "2026-06-01",
        total_amount: 100,
        branch_number: "49",
        branch_name: "Denver, CO",
        office: "Denver",
        line_count: 4,
        no_price_lines: 0,
        flagged_lines: 0,
        at_risk: 0,
        credit_memo_amount: 0,
        worst_pct: 0,
      }],
      roof_system_category: [],
      abc_invoices: [{ invoice_number: invoiceNumber, ar_status: "open", date_paid: null }],
      v_invoice_audit_line: lineRows,
      v_invoice_line_audit_current: lineRows.map((line) => ({ invoice_line_id: line.line_id, audit_status: "passed" })),
      invoice_payment_processed: [{ invoice_number: invoiceNumber, processed_at: "2026-06-26T10:00:00Z", status: ledgerStatus }],
    });
  }

  it("two-phase: exported invoices leave To-Be-Paid and become Awaiting Payment", async () => {
    mockCreateServerSupabaseClient.mockReturnValue({ client: reviewedInvoiceWithLedger("EXP-1", "exported") });
    const { loadInvoiceAuditSummary } = await import("./invoice-audit");
    const data = await loadInvoiceAuditSummary(undefined, { force: true });
    const inv = data.offices[0]?.branches[0]?.invoices[0];

    expect(inv?.toBePaid).toBe(false);
    expect(inv?.awaitingPayment).toBe(true);
    expect(inv?.paymentStatus).toBe("exported");
    expect(data.totals.toBePaid).toBe(0);
    expect(data.totals.awaitingPayment).toBe(1);
    expect(data.offices[0]?.awaitingPayment).toBe(1);
  });

  it("two-phase: returned invoices are eligible for To-Be-Paid again", async () => {
    mockCreateServerSupabaseClient.mockReturnValue({ client: reviewedInvoiceWithLedger("RET-1", "returned") });
    const { loadInvoiceAuditSummary } = await import("./invoice-audit");
    const data = await loadInvoiceAuditSummary(undefined, { force: true });
    const inv = data.offices[0]?.branches[0]?.invoices[0];

    expect(inv?.toBePaid).toBe(true);
    expect(inv?.awaitingPayment).toBe(false);
    expect(data.totals.toBePaid).toBe(1);
    expect(data.totals.awaitingPayment).toBe(0);
  });

  it("processing scope = all open + non-credit-memo (every age); dueNow = ≥60d; KPIs + scope metadata follow it", async () => {
    const iso = (daysAgo: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - daysAgo);
      return d.toISOString().slice(0, 10);
    };
    const inv = (overrides: Record<string, unknown>) => ({
      total_amount: 100, branch_number: "49", branch_name: "Denver, CO", office: "Denver",
      line_count: 1, no_price_lines: 1, flagged_lines: 1, at_risk: 10, credit_memo_amount: 0, worst_pct: 5,
      ...overrides,
    });
    mockCreateServerSupabaseClient.mockReturnValue({
      client: makeClient({
        v_invoice_audit_invoice: [
          inv({ invoice_number: "OLD-OPEN", invoice_date: iso(90), at_risk: 10 }),   // actionable + dueNow
          inv({ invoice_number: "RECENT-OPEN", invoice_date: iso(10), at_risk: 20 }), // actionable, NOT dueNow (<60d)
          inv({ invoice_number: "OLD-PAID", invoice_date: iso(120), at_risk: 40 }),   // paid → excluded
          inv({ invoice_number: "OLD-CM", invoice_date: iso(100), is_credit_memo: true, at_risk: 80 }), // CM → excluded
        ],
        roof_system_category: [],
        abc_invoices: [
          { invoice_number: "OLD-OPEN", ar_status: "open", date_paid: null },
          { invoice_number: "RECENT-OPEN", ar_status: "open", date_paid: null },
          { invoice_number: "OLD-PAID", ar_status: "paid", date_paid: iso(5) },
          { invoice_number: "OLD-CM", ar_status: "open", date_paid: null },
        ],
      }),
    });

    const { loadInvoiceAuditSummary, SCOPE_MIN_AGE_DAYS, scopeCutoffDate } = await import("./invoice-audit");
    const data = await loadInvoiceAuditSummary(undefined, { force: true });
    const byNo = (n: string) => data.offices.flatMap((o) => o.branches.flatMap((b) => b.invoices)).find((i) => i.invoiceNumber === n);

    expect(byNo("OLD-OPEN")?.actionable).toBe(true);
    expect(byNo("RECENT-OPEN")?.actionable).toBe(true); // all open → actionable (processing decoupled from due date)
    expect(byNo("OLD-PAID")?.actionable).toBe(false);    // paid gate
    expect(byNo("OLD-CM")?.actionable).toBe(false);      // non-credit-memo gate
    expect(data.totals.actionableInvoices).toBe(2);      // both open non-CM invoices
    // dueNow = ≥60d (payment due): OLD-OPEN only; RECENT-OPEN is processed but not yet due.
    expect(byNo("OLD-OPEN")?.dueNow).toBe(true);
    expect(byNo("RECENT-OPEN")?.dueNow).toBe(false);
    expect(data.totals.dueNow).toBe(1);
    // $ At Risk is processing-scoped → OLD-OPEN(10) + RECENT-OPEN(20), not the paid/CM risk.
    expect(data.totals.atRisk).toBe(30);
    // Open/paid counts keep their open-set semantics (3 open incl. CM + recent, 1 paid).
    expect(data.totals.openInvoices).toBe(3);
    expect(data.totals.paidInvoices).toBe(1);
    // Scope metadata: cutoff = today−60d (actionable age bound). Default date window =
    // oldest OPEN invoice_date → today (2026-06-28 change). OLD-CM is open (unpaid) at iso(100),
    // making it the oldest open date even though it is excluded from the actionable set.
    expect(data.scope.minAgeDays).toBe(SCOPE_MIN_AGE_DAYS);
    expect(data.scope.cutoff).toBe(scopeCutoffDate());
    expect(data.scope.defaultTo).toBe(iso(0));
    expect(data.scope.defaultFrom).toBe(iso(100));
  });

  it("two-phase: ledger-paid invoices are neither To-Be-Paid nor Awaiting Payment", async () => {
    mockCreateServerSupabaseClient.mockReturnValue({ client: reviewedInvoiceWithLedger("PAID-L", "paid") });
    const { loadInvoiceAuditSummary } = await import("./invoice-audit");
    const data = await loadInvoiceAuditSummary(undefined, { force: true });
    const inv = data.offices[0]?.branches[0]?.invoices[0];

    expect(inv?.toBePaid).toBe(false);
    expect(inv?.awaitingPayment).toBe(false);
    expect(data.totals.toBePaid).toBe(0);
    expect(data.totals.awaitingPayment).toBe(0);
  });

  it("transferred (Commercial) invoices are auto-approved → payable, pendingLines=0, still in invoice scope (docs/63 Change 2)", async () => {
    const iso = (daysAgo: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - daysAgo); return d.toISOString().slice(0, 10); };
    mockCreateServerSupabaseClient.mockReturnValue({
      client: makeClient({
        v_invoice_audit_invoice: [
          { invoice_number: "COMM-1", invoice_date: iso(5), total_amount: 500, branch_number: "49", branch_name: "Denver, CO", office: "Denver", line_count: 2, no_price_lines: 1, flagged_lines: 1, at_risk: 30, credit_memo_amount: 0, worst_pct: 9 },
        ],
        roof_system_category: [],
        abc_invoices: [{ invoice_number: "COMM-1", ar_status: "open", date_paid: null }],
        service_warranty_audit_queue: [{ invoice_number: "COMM-1", status: "queued" }],
      }),
    });
    const { loadInvoiceAuditSummary } = await import("./invoice-audit");
    const data = await loadInvoiceAuditSummary(undefined, { force: true });
    const inv = data.offices.flatMap((o) => o.branches.flatMap((b) => b.invoices)).find((i) => i.invoiceNumber === "COMM-1");

    expect(inv?.transferred).toBe(true);
    expect(inv?.pendingLines).toBe(0);   // auto-approved → no review needed
    expect(inv?.toBePaid).toBe(true);    // payable (was dropped from the CSV before Change 2)
    expect(inv?.actionable).toBe(false); // not in the audit/review set
    expect(data.totals.toBePaid).toBe(1);
    expect(data.totals.transferred).toBe(1);
  });

  it("credit-flag line → held invoice: approvedToPay=false, 'Hold — credit memo', excluded from payment (docs/63 Change 1b)", async () => {
    const lineRows = [
      { invoice_number: "HELD-1", line_id: "h-1", is_auditable: true },
      { invoice_number: "HELD-1", line_id: "h-2", is_auditable: true },
    ];
    mockCreateServerSupabaseClient.mockReturnValue({
      client: makeClient({
        v_invoice_audit_invoice: [
          { invoice_number: "HELD-1", invoice_date: "2026-01-15", total_amount: 800, branch_number: "49", branch_name: "Denver, CO", office: "Denver", line_count: 2, no_price_lines: 0, flagged_lines: 1, at_risk: 75, credit_memo_amount: 75, worst_pct: 12 },
        ],
        roof_system_category: [],
        abc_invoices: [{ invoice_number: "HELD-1", ar_status: "open", date_paid: null }],
        v_invoice_audit_line: lineRows,
        v_invoice_line_audit_current: [
          { invoice_line_id: "h-1", audit_status: "passed" },
          { invoice_line_id: "h-2", audit_status: "disputed", decision: "credit-flag" },
        ],
      }),
    });
    const { loadInvoiceAuditSummary, isInvoicePayable } = await import("./invoice-audit");
    const data = await loadInvoiceAuditSummary(undefined, { force: true });
    const inv = data.offices.flatMap((o) => o.branches.flatMap((b) => b.invoices)).find((i) => i.invoiceNumber === "HELD-1");

    expect(inv?.held).toBe(true);
    expect(inv?.approvedToPay).toBe(false);
    expect(inv?.disposition).toBe("Hold — credit memo");
    expect(inv?.toBePaid).toBe(false);            // a disputed (held) line keeps it out of to-be-paid
    expect(isInvoicePayable(inv!)).toBe(false);   // excluded from the Payment CSV
  });
});

describe("invoice-payment CSV", () => {
  it("renders the locked QuickBooks column contract", async () => {
    const { renderCsv } = await import("./invoice-payment");
    const csv = renderCsv([
      {
        invoiceNumber: "2011016277-001",
        invoiceDate: "2026-06-22",
        totalDue: 8317.2,
        poNumber: "KS-169-1",
        discountMessage: "You may deduct 230.87 if paid by 08/31/26",
        dueDate: "2026-08-31",
        terms: "3% 2nd End of Month",
        discountAmount: 230.87,
        approvedToPay: "Yes",
      },
    ]);
    const [header, row] = csv.split("\r\n");
    expect(header).toBe("INVOICE_NUMBER,INVOICE_DATE,TOTAL_DUE,PO_NUMBER,DISCOUNT_MESSAGE,DUE_DATE,TERMS,DISCOUNT_AMOUNT,Approved to Pay");
    expect(row.startsWith("2011016277-001,2026-06-22,8317.20,KS-169-1,")).toBe(true);
    expect(row.endsWith(",230.87,Yes")).toBe(true);
  });

  it("builds the [vendor]-invoices-to-be-paid-[timestamp] file name (one per vendor)", async () => {
    const { buildVendorFileName, vendorSlug } = await import("./invoice-payment");
    expect(vendorSlug("ABC Supply")).toBe("abc-supply");
    expect(vendorSlug("SRS Distribution, Inc.")).toBe("srs-distribution-inc");
    const name = buildVendorFileName("ABC Supply", new Date("2026-06-26T15:23:00-06:00"));
    expect(name).toBe("abc-supply-invoices-to-be-paid-2026-06-26-1523.csv");
  });
});

describe("attributeAuditActor (docs/59 Task 5)", () => {
  it("maps an automated price-agreement match to the Alex agent", async () => {
    const { attributeAuditActor } = await import("./invoice-audit");
    expect(attributeAuditActor("System", "auto_match")).toEqual({ label: "Alex", kind: "agent", persona: "Alex" });
  });

  it("treats the System backfill seed as system, not an agent", async () => {
    const { attributeAuditActor } = await import("./invoice-audit");
    expect(attributeAuditActor("System", "backfill")).toEqual({ label: "System", kind: "system", persona: null });
  });

  it("renders a named person as a human", async () => {
    const { attributeAuditActor } = await import("./invoice-audit");
    expect(attributeAuditActor("Lucinda", "backfill")).toEqual({ label: "Lucinda", kind: "human", persona: null });
    expect(attributeAuditActor("Chris Hussey", "manual")).toEqual({ label: "Chris Hussey", kind: "human", persona: null });
    expect(attributeAuditActor("accounting@proexteriorsus.com", "manual")).toEqual({ label: "accounting@proexteriorsus.com", kind: "human", persona: null });
  });

  it("does not confuse the human 'Maya Chen' with the Maya agent", async () => {
    const { attributeAuditActor } = await import("./invoice-audit");
    expect(attributeAuditActor("Maya Chen", "manual")).toEqual({ label: "Maya Chen", kind: "human", persona: null });
  });

  it("maps an explicit agent persona write to the right agent", async () => {
    const { attributeAuditActor } = await import("./invoice-audit");
    expect(attributeAuditActor("Alex", "auto_match")).toEqual({ label: "Alex", kind: "agent", persona: "Alex" });
    expect(attributeAuditActor("Maya", "agent_intake")).toEqual({ label: "Maya", kind: "agent", persona: "Maya" });
  });

  it("falls back to system for empty/unknown records", async () => {
    const { attributeAuditActor } = await import("./invoice-audit");
    expect(attributeAuditActor("", "")).toEqual({ label: "System", kind: "system", persona: null });
    expect(attributeAuditActor(null, null)).toEqual({ label: "System", kind: "system", persona: null });
  });
});
