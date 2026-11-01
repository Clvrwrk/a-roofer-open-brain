// acculynx-sync — lib/mappers.test.ts (Phase 7, plan 07-05 Task 2)
//
// Behavioral tests for the six raw->typed snake_case mappers.
// For each mapper: (1) a representative camelCase body maps to the exact expected
// snake_case keys, (2) an unknown API key does NOT appear as a top-level column
// (only inside `raw`), (3) missing fields become null.
//
// Financials test is anchored on the KS-11 ground truth:
//   approvedJobValue 30368.48 -> approved_job_value 30368.48
//   balanceDue 17532.48 -> balance_due 17532.48
//
// Run: deno test supabase/functions/acculynx-sync/lib/mappers.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import {
  mapInvoiceHeader,
  mapInvoiceLine,
  mapJobContact,
  mapJobFinancials,
  mapJobInsurance,
  mapMilestoneHistoryItem,
  mapWorksheetItems,
  worksheetPath,
} from "./mappers.ts";

const CTX = {
  account_key: "kansas_city",
  market: "sedgwick_ks",
  now: "2026-07-01T00:00:00.000Z",
  job_id: "job-11",
  invoice_id: "inv-11",
};

// ---------------------------------------------------------------------------
// mapJobContact
// ---------------------------------------------------------------------------

Deno.test("mapJobContact — maps camelCase body to exact snake_case keys", () => {
  const raw = {
    id: "jc-1",
    contact: { id: "contact-9" },
    isPrimary: true,
    relationToPrimary: "homeowner",
    unknownField: "should-not-leak",
  };
  const row = mapJobContact(raw, CTX);
  assertEquals(row, {
    id: "jc-1",
    job_id: "job-11",
    contact_id: "contact-9",
    is_primary: true,
    relation_to_primary: "homeowner",
    account_key: "kansas_city",
    market: "sedgwick_ks",
    last_seen_by_api: CTX.now,
    synced_at: CTX.now,
    raw,
  });
});

Deno.test("mapJobContact — unknown API key does not appear as a top-level column", () => {
  const raw = { id: "jc-2", contact: { id: "c-2" }, weirdApiField: "xyz" };
  const row = mapJobContact(raw, CTX);
  assertEquals((row as Record<string, unknown>)["weirdApiField"], undefined);
  assertEquals((row.raw as Record<string, unknown>)["weirdApiField"], "xyz");
});

Deno.test("mapJobContact — missing fields default to null", () => {
  const row = mapJobContact({}, CTX);
  assertEquals(row.id, null);
  assertEquals(row.contact_id, null);
  assertEquals(row.is_primary, null);
  assertEquals(row.relation_to_primary, null);
});

// ---------------------------------------------------------------------------
// mapJobFinancials — KS-11 ground truth
// ---------------------------------------------------------------------------

Deno.test("mapJobFinancials — KS-11 ground truth values", () => {
  const raw = {
    approvedJobValue: 30368.48,
    balanceDue: 17532.48,
    worksheetTotal: 1000,
    changeOrderTotal: 2000,
    insuranceClaimTotal: 3000,
    upgradeTotal: 400,
    discountTotal: 50,
    supplementTotal: 600,
    workNotDoingTotal: 0,
    amendments: [{ id: "a-1" }],
  };
  const row = mapJobFinancials(raw, CTX);
  assertEquals(row.approved_job_value, 30368.48);
  assertEquals(row.balance_due, 17532.48);
  assertEquals(row.worksheet_total, 1000);
  assertEquals(row.change_order_total, 2000);
  assertEquals(row.insurance_claim_total, 3000);
  assertEquals(row.upgrade_total, 400);
  assertEquals(row.discount_total, 50);
  assertEquals(row.supplement_total, 600);
  assertEquals(row.work_not_doing_total, 0);
  assertEquals(row.amendments, [{ id: "a-1" }]);
  assertEquals(row.job_id, "job-11");
  assertEquals(row.raw, raw);
});

Deno.test("mapJobFinancials — unknown API key does not appear as a top-level column", () => {
  const raw = { approvedJobValue: 100, someNewApiField: "abc" };
  const row = mapJobFinancials(raw, CTX);
  assertEquals((row as Record<string, unknown>)["someNewApiField"], undefined);
  assertEquals((row.raw as Record<string, unknown>)["someNewApiField"], "abc");
});

Deno.test("mapJobFinancials — missing fields default to null", () => {
  const row = mapJobFinancials({}, CTX);
  assertEquals(row.approved_job_value, null);
  assertEquals(row.balance_due, null);
  assertEquals(row.worksheet_total, null);
  assertEquals(row.amendments, null);
});

// ---------------------------------------------------------------------------
// mapJobInsurance
// ---------------------------------------------------------------------------

Deno.test("mapJobInsurance — maps camelCase body to exact snake_case keys", () => {
  const raw = {
    insuranceCompany: { id: "ic-1", name: "State Farm" },
    customInsuranceCompanyName: null,
    damageLocation: "roof",
    dateOfLoss: "2026-05-01T00:00:00.000Z",
    claimFiled: true,
    claimFiledDate: "2026-05-02T00:00:00.000Z",
    claimNumber: "CLM-123",
    hasPaperwork: true,
  };
  const row = mapJobInsurance(raw, CTX);
  assertEquals(row, {
    job_id: "job-11",
    insurance_company_id: "ic-1",
    insurance_company_name: "State Farm",
    custom_insurance_company_name: null,
    damage_location: "roof",
    date_of_loss: "2026-05-01T00:00:00.000Z",
    claim_filed: true,
    claim_filed_date: "2026-05-02T00:00:00.000Z",
    claim_number: "CLM-123",
    has_paperwork: true,
    account_key: "kansas_city",
    market: "sedgwick_ks",
    last_seen_by_api: CTX.now,
    synced_at: CTX.now,
    raw,
  });
});

Deno.test("mapJobInsurance — unknown API key does not appear as a top-level column", () => {
  const raw = { claimNumber: "CLM-2", futureField: 42 };
  const row = mapJobInsurance(raw, CTX);
  assertEquals((row as Record<string, unknown>)["futureField"], undefined);
  assertEquals((row.raw as Record<string, unknown>)["futureField"], 42);
});

Deno.test("mapJobInsurance — missing fields default to null", () => {
  const row = mapJobInsurance({}, CTX);
  assertEquals(row.insurance_company_id, null);
  assertEquals(row.insurance_company_name, null);
  assertEquals(row.claim_filed, null);
  assertEquals(row.has_paperwork, null);
});

Deno.test("mapJobInsurance — 07-09 live-fix: empty-string dateOfLoss/claimFiledDate normalize to null", () => {
  const raw = { dateOfLoss: "", claimFiledDate: "", claimNumber: "CLM-1" };
  const row = mapJobInsurance(raw, CTX);
  assertEquals(row.date_of_loss, null);
  assertEquals(row.claim_filed_date, null);
  assertEquals(row.claim_number, "CLM-1");
});

// ---------------------------------------------------------------------------
// mapMilestoneHistoryItem
// ---------------------------------------------------------------------------

Deno.test("mapMilestoneHistoryItem — maps camelCase body to exact snake_case keys (07-09: id omitted, live column is GENERATED ALWAYS IDENTITY)", () => {
  const raw = { id: 555, milestoneName: "Approved", milestoneDate: "2026-06-01T00:00:00.000Z" };
  const row = mapMilestoneHistoryItem(raw, CTX);
  assertEquals(row, {
    job_id: "job-11",
    milestone_name: "Approved",
    milestone_date: "2026-06-01T00:00:00.000Z",
    account_key: "kansas_city",
    market: "sedgwick_ks",
    last_seen_by_api: CTX.now,
    synced_at: CTX.now,
  });
});

Deno.test("mapMilestoneHistoryItem — 07-09 live-fix: REAL AccuLynx field shape is {date, name}, not {milestoneDate, milestoneName}", () => {
  // Copied verbatim shape from the live acculynx_raw payload for job
  // 7993f5eb-13e1-47d8-91a1-c592568a7239 (07-09 wichita backfill probe): {"date":
  // "2025-09-09T01:25:04Z", "name": "Lead"} -- confirms {milestoneDate, milestoneName} was
  // never the real API shape, only the design-time assumption.
  const raw = { date: "2025-09-09T01:25:04Z", name: "Lead" };
  const row = mapMilestoneHistoryItem(raw, CTX);
  assertEquals(row.milestone_name, "Lead");
  assertEquals(row.milestone_date, "2025-09-09T01:25:04Z");
});

Deno.test("mapMilestoneHistoryItem — unknown API key does not appear as a top-level column", () => {
  const raw = { id: 556, milestoneName: "Closed", extraneous: "drop-me" };
  const row = mapMilestoneHistoryItem(raw, CTX);
  assertEquals((row as Record<string, unknown>)["extraneous"], undefined);
});

Deno.test("mapMilestoneHistoryItem — omits id (live GENERATED ALWAYS IDENTITY column) and defaults missing fields to null", () => {
  const row = mapMilestoneHistoryItem({}, CTX);
  assertEquals((row as Record<string, unknown>)["id"], undefined);
  assertEquals(row.milestone_name, null);
  assertEquals(row.milestone_date, null);
});

// ---------------------------------------------------------------------------
// mapInvoiceHeader
// ---------------------------------------------------------------------------

Deno.test("mapInvoiceHeader — maps camelCase body to exact snake_case keys", () => {
  const raw = {
    id: "inv-11",
    invoiceNumber: "INV-11",
    invoiceSequence: 1,
    invoiceName: "Final Invoice",
    invoiceDate: "2026-06-10T00:00:00.000Z",
    dueDate: "2026-06-24",
    currentInvoiceState: "sent",
    totalPrice: 5000,
    balanceDue: 0,
    createdDate: "2026-06-09T00:00:00.000Z",
    sortIndex: 0,
  };
  const row = mapInvoiceHeader(raw, CTX);
  assertEquals(row, {
    id: "inv-11",
    job_id: "job-11",
    invoice_number: "INV-11",
    invoice_sequence: 1,
    invoice_name: "Final Invoice",
    invoice_date: "2026-06-10T00:00:00.000Z",
    due_date: "2026-06-24",
    current_invoice_state: "sent",
    total_price: 5000,
    balance_due: 0,
    created_date: "2026-06-09T00:00:00.000Z",
    sort_index: 0,
    account_key: "kansas_city",
    market: "sedgwick_ks",
    last_seen_by_api: CTX.now,
    synced_at: CTX.now,
    raw,
  });
});

Deno.test("mapInvoiceHeader — unknown API key does not appear as a top-level column", () => {
  const raw = { id: "inv-12", invoiceNumber: "INV-12", brandNewField: true };
  const row = mapInvoiceHeader(raw, CTX);
  assertEquals((row as Record<string, unknown>)["brandNewField"], undefined);
  assertEquals((row.raw as Record<string, unknown>)["brandNewField"], true);
});

Deno.test("mapInvoiceHeader — missing fields default to null", () => {
  const row = mapInvoiceHeader({}, CTX);
  assertEquals(row.id, null);
  assertEquals(row.invoice_number, null);
  assertEquals(row.total_price, null);
  assertEquals(row.balance_due, null);
});

Deno.test("mapInvoiceHeader — 07-09 live-fix: empty-string invoiceDate/createdDate normalize to null (void invoices), dueDate (text column) passes '' through unchanged", () => {
  const raw = {
    id: "inv-13",
    invoiceDate: "",
    dueDate: "",
    createdDate: "",
    currentInvoiceState: "Void",
  };
  const row = mapInvoiceHeader(raw, CTX);
  assertEquals(row.invoice_date, null);
  assertEquals(row.created_date, null);
  assertEquals(row.due_date, "");
});

// ---------------------------------------------------------------------------
// mapInvoiceLine
// ---------------------------------------------------------------------------

Deno.test("mapInvoiceLine — maps camelCase body to exact snake_case keys", () => {
  const raw = {
    id: "line-1",
    sectionId: "sec-1",
    sectionType: "materials",
    itemName: "Shingles",
    price: 100,
    totalPrice: 500,
    hierarchySortOrder: 3,
    referenceType: "estimate_line",
  };
  const row = mapInvoiceLine(raw, CTX);
  assertEquals(row, {
    id: "line-1",
    invoice_id: "inv-11",
    section_id: "sec-1",
    section_type: "materials",
    item_name: "Shingles",
    price: 100,
    total_price: 500,
    hierarchy_sort_order: 3,
    reference_type: "estimate_line",
    account_key: "kansas_city",
    market: "sedgwick_ks",
    last_seen_by_api: CTX.now,
    synced_at: CTX.now,
    raw,
  });
});

Deno.test("mapInvoiceLine — unknown API key does not appear as a top-level column", () => {
  const raw = { id: "line-2", itemName: "Underlayment", newApiKey: "x" };
  const row = mapInvoiceLine(raw, CTX);
  assertEquals((row as Record<string, unknown>)["newApiKey"], undefined);
  assertEquals((row.raw as Record<string, unknown>)["newApiKey"], "x");
});

Deno.test("mapInvoiceLine — missing fields default to null", () => {
  const row = mapInvoiceLine({}, CTX);
  assertEquals(row.id, null);
  assertEquals(row.section_id, null);
  assertEquals(row.price, null);
  assertEquals(row.total_price, null);
});

// ---------------------------------------------------------------------------
// F2 — section totals live under worksheetSectionTotals in the live API (KS-258)
// ---------------------------------------------------------------------------

Deno.test("mapJobFinancials — F2 KS-258: totals come from worksheetSectionTotals", () => {
  const raw = {
    approvedJobValue: 21424.86,
    balanceDue: 21424.86,
    worksheet: { id: "e194e192-d43e-4922-8d31-c434986e74b1", _link: "https://api.acculynx.com/api/v2/financial/e194e192-d43e-4922-8d31-c434986e74b1/worksheet" },
    worksheetSectionTotals: {
      worksheetTotal: 0, changeOrderTotal: 0, insuranceClaimTotal: 21424.86, upgradeTotal: 0,
      discountTotal: 0, supplementTotal: 0, workNotDoingTotal: 0,
    },
  };
  const row = mapJobFinancials(raw, CTX);
  assertEquals(row.insurance_claim_total, 21424.86);
  assertEquals(row.worksheet_total, 0);
  assertEquals(row.supplement_total, 0);
  assertEquals(row.approved_job_value, 21424.86);
});

Deno.test("mapJobFinancials — F2: a non-numeric nested total maps to null, never a string", () => {
  const row = mapJobFinancials({ approvedJobValue: 1, balanceDue: 1, worksheetSectionTotals: { insuranceClaimTotal: "x" } }, CTX);
  assertEquals(row.insurance_claim_total, null);
  assertEquals(row.upgrade_total, null);
});

Deno.test("worksheetPath — F2: the financials row links its worksheet", () => {
  assertEquals(worksheetPath({ worksheet: { id: "e194e192-d43e-4922-8d31-c434986e74b1", _link: "https://api.acculynx.com/api/v2/financial/e194e192-d43e-4922-8d31-c434986e74b1/worksheet" } }), "/financials/e194e192-d43e-4922-8d31-c434986e74b1/worksheet"); // the _link's singular /financial/ path answers 404 in prod (2026-11-01); the documented GET is /financials/{id}/worksheet
  assertEquals(worksheetPath({ worksheet: { id: "e194e192-d43e-4922-8d31-c434986e74b1" } }), "/financials/e194e192-d43e-4922-8d31-c434986e74b1/worksheet");
  assertEquals(worksheetPath({ worksheet: { _link: "https://evil.example/api/v2/financial/x/worksheet" } }), null);
  assertEquals(worksheetPath({}), null);
});

Deno.test("mapWorksheetItems — F2: one row per section line, a section row when empty", () => {
  const ws = {
    id: "fin-1", jobId: "job-1", currentState: "Approved", totalPrice: 21424.86, title: "Insurance",
    sections: [
      { id: "s-1", sectionType: "Insurance Claim", totalPrice: 21424.86, items: [
        { id: "i-1", itemName: "Roofing System", price: 18000, totalPrice: 18000, parentItemId: null, hierarchySortOrder: 1, tradeId: "t-roof" },
        { id: "i-2", itemName: "Gutter System", price: 3424.86, totalPrice: 3424.86, parentItemId: null, hierarchySortOrder: 2, tradeId: "t-gut" },
      ] },
      { id: "s-2", sectionType: "Supplements", totalPrice: 0, items: [] },
    ],
  };
  const rows = mapWorksheetItems(ws, { ...CTX, job_id: "job-1" });
  assertEquals(rows.length, 3);
  assertEquals(rows[0], {
    job_id: "job-1", financial_id: "fin-1", worksheet_state: "Approved", worksheet_total: 21424.86,
    section_id: "s-1", section_type: "Insurance Claim", section_total: 21424.86, item_key: "i-1",
    item_name: "Roofing System", price: 18000, total_price: 18000, parent_item_id: null, sort_order: 1, trade_id: "t-roof",
    account_key: CTX.account_key, market: CTX.market, synced_at: CTX.now,
  });
  assertEquals(rows[2].item_key, "section");
  assertEquals(rows[2].item_name, null);
  assertEquals(rows.reduce((s, r) => s + (r.section_type === "Insurance Claim" ? Number(r.total_price) : 0), 0), 21424.86);
  assertEquals(mapWorksheetItems({ error: "nope" }, CTX), []);
});
