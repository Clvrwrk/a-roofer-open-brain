// Detail loader for a single credit memo: header (v_credit_memo_audit) + per-line unit-price
// match vs the resolved original invoice + the current disposition (credit_memo_requests).
import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

export interface CreditMemoLine {
  itemNumber: string;
  itemDescription: string;
  quantity: number;
  uom: string;
  cmUnitPrice: number;
  originalUnitPrice: number | null;
  matchStatus: "match" | "mismatch" | "no_original";
}

export interface CreditMemoDetail {
  invoiceNumber: string;
  invoiceDate: string;
  creditAmount: number;
  branchName: string;
  shipTo: string;
  originalInvoiceNumber: string | null;
  originalReference: string | null;
  matchStatus: string;
  matchedLines: number;
  mismatchLines: number;
  unmatchedLines: number;
  lineCount: number;
  lines: CreditMemoLine[];
  disposition: { status: string; approvedBy: string; note: string; decidedAt: string } | null;
}

export async function loadCreditMemo(invoiceNumber: string, env: RuntimeEnv = getRuntimeEnv()): Promise<CreditMemoDetail | null> {
  const { client } = createServerSupabaseClient(env);
  if (!client || !invoiceNumber) return null;

  const { data: head } = await client.from("v_credit_memo_audit").select("*").eq("invoice_number", invoiceNumber).maybeSingle();
  if (!head) return null;
  const h = head as any;
  const originalInvoiceNumber: string | null = h.original_invoice_number ?? null;

  const [{ data: cmRows }, { data: origRows }, { data: dispRows }] = await Promise.all([
    client.from("abc_invoice_lines").select("item_number,item_description,quantity,uom,unit_price").eq("invoice_number", invoiceNumber),
    originalInvoiceNumber
      ? client.from("abc_invoice_lines").select("item_number,unit_price").eq("invoice_number", originalInvoiceNumber)
      : Promise.resolve({ data: [] as any[] }),
    client.from("credit_memo_requests").select("status,approved_by,packet,updated_at").eq("invoice_number", invoiceNumber).maybeSingle(),
  ]);

  const origByItem = new Map<string, number>();
  for (const o of (origRows as any[] | null) ?? []) if (o.unit_price != null) origByItem.set(o.item_number, num(o.unit_price));

  const lines: CreditMemoLine[] = ((cmRows as any[] | null) ?? []).map((l) => {
    const orig = origByItem.has(l.item_number) ? origByItem.get(l.item_number)! : null;
    const cmUnit = num(l.unit_price);
    const matchStatus: CreditMemoLine["matchStatus"] =
      orig == null ? "no_original" : Math.round(cmUnit * 100) === Math.round(orig * 100) ? "match" : "mismatch";
    return {
      itemNumber: l.item_number ?? "",
      itemDescription: l.item_description ?? "",
      quantity: num(l.quantity),
      uom: l.uom ?? "",
      cmUnitPrice: cmUnit,
      originalUnitPrice: orig,
      matchStatus,
    };
  });

  const disp = dispRows as any;
  return {
    invoiceNumber,
    invoiceDate: h.invoice_date ? String(h.invoice_date).slice(0, 10) : "",
    creditAmount: Math.abs(num(h.credit_amount)),
    branchName: h.branch_name ?? "",
    shipTo: h.ship_to_number ?? "",
    originalInvoiceNumber,
    originalReference: h.original_invoice_reference ?? null,
    matchStatus: h.match_status ?? "no_reference",
    matchedLines: num(h.matched_lines),
    mismatchLines: num(h.mismatch_lines),
    unmatchedLines: num(h.unmatched_lines),
    lineCount: num(h.line_count),
    lines,
    disposition: disp ? { status: disp.status, approvedBy: disp.approved_by ?? "", note: disp.packet?.note ?? "", decidedAt: disp.packet?.decided_at ?? disp.updated_at ?? "" } : null,
  };
}
