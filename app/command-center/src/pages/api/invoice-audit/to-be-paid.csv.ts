import { randomUUID } from "node:crypto";
import type { APIRoute } from "astro";
import {
  actorCanAccessDepartment,
  buildUnauthorizedResponse,
  hasPermission,
  serializeActor,
} from "@lib/access-control";
import { csvCell } from "@lib/agreement-export";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { invalidateInvoiceAuditSummaryCache, isInvoiceToBePaid, loadInvoiceAuditSummary, type Invoice } from "@lib/invoice-audit";

export const prerender = false;

interface AbcInvoicePayRow {
  invoice_number: string;
  invoice_date: string | null;
  total_amount: number | string | null;
  purchase_order_number: string | null;
  due_date: string | null;
  ar_total_due: number | string | null;
  raw: Record<string, unknown> | null;
}

function flattenInvoices(data: Awaited<ReturnType<typeof loadInvoiceAuditSummary>>) {
  return data.offices.flatMap((office) => office.branches.flatMap((branch) => branch.invoices));
}

function text(value: unknown) {
  const clean = String(value ?? "").trim();
  return clean || "";
}

function amount(value: unknown): number | null {
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

function formatFileStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "numeric",
    hour12: true,
    month: "2-digit",
    timeZone: "America/Denver",
    year: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")}-${get("day")}-${get("year")}-${get("hour")}${get("dayPeriod").toUpperCase()}`;
}

function csvRows(invoices: Invoice[], detailByInvoice: Map<string, AbcInvoicePayRow>) {
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

function renderCsv(rows: ReturnType<typeof csvRows>) {
  const header = ["INVOICE_NUMBER", "INVOICE_DATE", "TOTAL_DUE", "PO_NUMBER", "DISCOUNT_MESSAGE", "DUE_DATE", "TERMS", "DISCOUNT_AMOUNT", "Approved to Pay"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push([
      csvCell(row.invoiceNumber),
      csvCell(row.invoiceDate),
      formatMoney(row.totalDue),
      csvCell(row.poNumber),
      csvCell(row.discountMessage),
      csvCell(row.dueDate),
      csvCell(row.terms),
      formatMoney(row.discountAmount),
      csvCell(row.approvedToPay),
    ].join(","));
  }
  return lines.join("\r\n");
}

export const GET: APIRoute = async ({ locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();

  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return new Response("Forbidden", { status: 403 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) return new Response(`Supabase unconfigured: ${config.missing.join(", ")}`, { status: 503 });

  const data = await loadInvoiceAuditSummary(undefined, { force: true });
  const invoices = flattenInvoices(data).filter((invoice) => isInvoiceToBePaid(invoice));
  if (!invoices.length) return new Response("No fully reviewed invoices are ready to be paid.", { status: 404 });

  const invoiceNumbers = invoices.map((invoice) => invoice.invoiceNumber);
  const { data: invoiceRows, error: invoiceError } = await client
    .from("abc_invoices")
    .select("invoice_number,invoice_date,total_amount,purchase_order_number,due_date,ar_total_due,raw")
    .in("invoice_number", invoiceNumbers);
  if (invoiceError) return new Response(`abc_invoices: ${invoiceError.message}`, { status: 409 });

  const detailByInvoice = new Map<string, AbcInvoicePayRow>();
  for (const row of (invoiceRows ?? []) as AbcInvoicePayRow[]) detailByInvoice.set(row.invoice_number, row);

  const now = new Date();
  const nowIso = now.toISOString();
  const paidDate = nowIso.slice(0, 10);
  const batchId = randomUUID();
  const fileName = `ABC_Supply_invoices_to_be_paid_${formatFileStamp(now)}.csv`;
  const rows = csvRows(invoices, detailByInvoice);

  const actorPacket = serializeActor(actor);
  const { error: ledgerError } = await client.from("invoice_payment_processed").upsert(
    rows.map((row) => ({
      approved_to_pay: true,
      batch_id: batchId,
      csv_file_name: fileName,
      csv_row: row,
      discount_amount: row.discountAmount,
      discount_message: row.discountMessage || null,
      due_date: row.dueDate || null,
      invoice_date: row.invoiceDate || null,
      invoice_number: row.invoiceNumber,
      processed_at: nowIso,
      processed_by: actor.displayName,
      processed_by_actor: actorPacket,
      purchase_order_number: row.poNumber || null,
      terms: row.terms || null,
      total_due: row.totalDue,
      vendor: "ABC Supply",
    })),
    { onConflict: "invoice_number" },
  );
  if (ledgerError) return new Response(`invoice_payment_processed: ${ledgerError.message}`, { status: 409 });

  const { error: invoiceUpdateError } = await client
    .from("abc_invoices")
    .update({
      ar_source: "command_center_to_be_paid_csv",
      ar_status: "paid",
      ar_synced_at: nowIso,
      ar_total_due: 0,
      date_paid: paidDate,
      date_paid_is_proxy: false,
    })
    .in("invoice_number", invoiceNumbers);
  if (invoiceUpdateError) return new Response(`abc_invoices paid update: ${invoiceUpdateError.message}`, { status: 409 });

  const { error: documentUpdateError } = await client
    .from("invoice_documents")
    .update({
      gate_override: true,
      paid_at: nowIso,
      payment_blocked_reason: null,
      payment_status: "paid",
    })
    .in("invoice_number", invoiceNumbers);
  if (documentUpdateError) return new Response(`invoice_documents paid update: ${documentUpdateError.message}`, { status: 409 });

  await client.from("dashboard_action_log").insert({
    action_type: "invoice_to_be_paid_csv",
    actor_display_name: actor.displayName,
    actor_id: actor.id,
    actor_type: actor.type,
    decision: "process",
    department: "accounting",
    note: `Generated ${fileName} with ${rows.length} invoice(s).`,
    payload: { batchId, fileName, invoiceNumbers, source: "invoice-audit" },
    source_pk: batchId,
    source_table: "invoice_payment_processed",
    workflow: "invoice-payment-export",
  });

  invalidateInvoiceAuditSummaryCache();
  const csv = renderCsv(rows);
  return new Response(csv, {
    status: 200,
    headers: {
      "content-disposition": `attachment; filename="${fileName}"`,
      "content-type": "text/csv; charset=utf-8",
    },
  });
};
