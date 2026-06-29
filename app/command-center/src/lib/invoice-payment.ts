// Invoice "To Be Paid" -> QuickBooks CSV helpers, shared by the export
// (process-batch), download, confirm-paid, return, and reconcile routes.
//
// The QuickBooks column contract is fixed (confirmed against accounting's live
// import file): INVOICE_NUMBER, INVOICE_DATE, TOTAL_DUE, PO_NUMBER,
// DISCOUNT_MESSAGE, DUE_DATE, TERMS, DISCOUNT_AMOUNT, Approved to Pay.
// Do not reorder or rename columns without re-confirming with accounting.

import { csvCell } from "@lib/agreement-export";
import type { Invoice } from "@lib/invoice-audit";

export const PAYMENT_LEDGER_TABLE = "invoice_payment_processed";

export interface AbcInvoicePayRow {
  invoice_number: string;
  invoice_date: string | null;
  total_amount: number | string | null;
  purchase_order_number: string | null;
  due_date: string | null;
  ar_total_due: number | string | null;
  raw: Record<string, unknown> | null;
}

export interface ProcessedCsvRow {
  invoiceNumber: string;
  invoiceDate: string;
  totalDue: number | null;
  poNumber: string;
  discountMessage: string;
  dueDate: string;
  terms: string;
  discountAmount: number | null;
  approvedToPay: string;
}

export const CSV_HEADER = [
  "INVOICE_NUMBER",
  "INVOICE_DATE",
  "TOTAL_DUE",
  "PO_NUMBER",
  "DISCOUNT_MESSAGE",
  "DUE_DATE",
  "TERMS",
  "DISCOUNT_AMOUNT",
  "Approved to Pay",
] as const;

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function amount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function nested(record: Record<string, unknown> | null | undefined, path: string[]) {
  let value: unknown = record;
  for (const key of path) {
    if (!value || typeof value !== "object") return null;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function firstRaw(raw: Record<string, unknown> | null, paths: string[][]) {
  for (const path of paths) {
    const value = path.length === 1 ? raw?.[path[0]] : nested(raw, path);
    const clean = text(value);
    if (clean) return clean;
  }
  return "";
}

function formatMoney(value: number | null) {
  return value == null ? "" : value.toFixed(2);
}

// Sortable, filesystem-safe stamp: YYYY-MM-DD-HHMM, America/Denver.
export function formatFileStamp(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "America/Denver",
    year: "numeric",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour"); // some ICU emit 24 for midnight
  return `${get("year")}-${get("month")}-${get("day")}-${hour}${get("minute")}`;
}

// Vendor token for the file name: lowercase, hyphen-separated (e.g. "ABC Supply" -> "abc-supply").
export function vendorSlug(vendor: string) {
  return (vendor || "vendor").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "vendor";
}

// Naming convention (accounting): [vendor]-invoices-to-be-paid-[timestamp].csv.
// One file per vendor — a batch spanning N vendors produces N files.
export function buildVendorFileName(vendor: string, date: Date) {
  return `${vendorSlug(vendor)}-invoices-to-be-paid-${formatFileStamp(date)}.csv`;
}

// Vendor that owns an invoice. Today the invoice-audit pipeline is ABC Supply
// only; this is the single seam to generalize when other vendor pipelines land.
export function invoiceVendor(_invoice: Invoice) {
  return "ABC Supply";
}

export function csvRows(invoices: Invoice[], detailByInvoice: Map<string, AbcInvoicePayRow>): ProcessedCsvRow[] {
  return invoices.map((invoice) => {
    const detail = detailByInvoice.get(invoice.invoiceNumber);
    const raw = detail?.raw ?? null;
    const totalDue = amount(detail?.ar_total_due) ?? amount(detail?.total_amount) ?? invoice.totalAmount;
    const discountAmount = amount(firstRaw(raw, [["discountAmount"], ["discount_amount"], ["discount", "amount"]]));
    return {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: detail?.invoice_date ? String(detail.invoice_date).slice(0, 10) : invoice.invoiceDate,
      totalDue,
      poNumber: text(detail?.purchase_order_number) || invoice.po,
      discountMessage: firstRaw(raw, [["discountMessage"], ["discount_message"], ["discount", "message"]]),
      dueDate: detail?.due_date ? String(detail.due_date).slice(0, 10) : firstRaw(raw, [["dueDate"], ["due_date"]]),
      terms: firstRaw(raw, [["terms"], ["paymentTerms"], ["payment_terms"], ["payment", "terms"]]),
      discountAmount,
      approvedToPay: "Yes",
    };
  });
}

// Render rows to CSV. Accepts either freshly-built rows or stored csv_row
// payloads (re-download), so a downloaded batch is byte-stable.
export function renderCsv(rows: ProcessedCsvRow[]) {
  const lines = [CSV_HEADER.join(",")];
  for (const row of rows) {
    lines.push([
      csvCell(row.invoiceNumber),
      csvCell(row.invoiceDate),
      formatMoney(row.totalDue ?? null),
      csvCell(row.poNumber),
      csvCell(row.discountMessage),
      csvCell(row.dueDate),
      csvCell(row.terms),
      formatMoney(row.discountAmount ?? null),
      csvCell(row.approvedToPay),
    ].join(","));
  }
  return lines.join("\r\n");
}

// One ledger row per exported invoice (status='exported'). Confirm-paid /
// return / reconcile routes update status in place (unique on invoice_number).
export function buildLedgerRows(
  rows: ProcessedCsvRow[],
  ctx: { batchId: string; fileName: string; vendor: string; processedBy: string; actorPacket: unknown; nowIso: string },
) {
  return rows.map((row) => ({
    approved_to_pay: true,
    batch_id: ctx.batchId,
    csv_file_name: ctx.fileName,
    csv_row: row,
    discount_amount: row.discountAmount,
    discount_message: row.discountMessage || null,
    due_date: row.dueDate || null,
    invoice_date: row.invoiceDate || null,
    invoice_number: row.invoiceNumber,
    paid_at: null,
    paid_confirmed_actor: null,
    paid_confirmed_by: null,
    paid_source: null,
    processed_at: ctx.nowIso,
    processed_by: ctx.processedBy,
    processed_by_actor: ctx.actorPacket,
    reconciled_at: null,
    returned_at: null,
    returned_reason: null,
    status: "exported",
    total_due: row.totalDue,
    updated_at: ctx.nowIso,
    vendor: ctx.vendor,
  }));
}

// ── Register CSV (docs/63 Change 1b) ─────────────────────────────────────────────
// The QuickBooks REGISTER export: every fully-processed invoice (incl. do-not-pay holds
// and Service/Warranty transfers), loaded once as an incurred expense. Same 9 columns as
// the payment file PLUS a dynamic "Approved to Pay" (Yes/No) and a "Disposition" label.
// Accounting maps columns manually on import, so the extra column is safe.

export const REGISTER_EXPORT_TABLE = "invoice_register_export";

export interface RegisterCsvRow extends ProcessedCsvRow {
  disposition: string;
}

export const REGISTER_CSV_HEADER = [...CSV_HEADER, "Disposition"] as const;

// One register file per vendor: [vendor]-invoices-register-[timestamp].csv.
export function buildRegisterFileName(vendor: string, date: Date) {
  return `${vendorSlug(vendor)}-invoices-register-${formatFileStamp(date)}.csv`;
}

export function registerCsvRows(invoices: Invoice[], detailByInvoice: Map<string, AbcInvoicePayRow>): RegisterCsvRow[] {
  const base = csvRows(invoices, detailByInvoice);
  return base.map((row, i) => ({
    ...row,
    approvedToPay: invoices[i].approvedToPay ? "Yes" : "No",
    disposition: invoices[i].disposition || "",
  }));
}

export function renderRegisterCsv(rows: RegisterCsvRow[]) {
  const lines = [REGISTER_CSV_HEADER.join(",")];
  for (const row of rows) {
    lines.push([
      csvCell(row.invoiceNumber),
      csvCell(row.invoiceDate),
      formatMoney(row.totalDue ?? null),
      csvCell(row.poNumber),
      csvCell(row.discountMessage),
      csvCell(row.dueDate),
      csvCell(row.terms),
      formatMoney(row.discountAmount ?? null),
      csvCell(row.approvedToPay),
      csvCell(row.disposition),
    ].join(","));
  }
  return lines.join("\r\n");
}

// One register-ledger row per exported invoice (load-once, unique on invoice_number).
export function buildRegisterLedgerRows(
  rows: RegisterCsvRow[],
  ctx: { batchId: string; fileName: string; vendor: string; exportedBy: string; actorPacket: unknown; nowIso: string },
) {
  return rows.map((row) => ({
    invoice_number: row.invoiceNumber,
    register_exported_at: ctx.nowIso,
    batch_id: ctx.batchId,
    vendor: ctx.vendor,
    csv_file_name: ctx.fileName,
    csv_row: row,
    disposition: row.disposition || null,
    approved_to_pay: row.approvedToPay === "Yes",
    exported_by: ctx.exportedBy,
    exported_by_actor: ctx.actorPacket,
  }));
}
