// GET /api/credit-memos/weekly-csv?kind=detail|tracker
// Invoice Audit v2 R2 (docs/82): downloads for the weekly credit-memo request view.
// detail  = the reconciliation spreadsheet (line-level, cross-vendor)
// tracker = this week's CM invoices only (per docs/81 decision 8)
// Both build from APPROVED requests (drafts are excluded from the vendor packet).

import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { cmVendorBySlug } from "@lib/cm-vendor-roster";
import { createServerSupabaseClient } from "@lib/supabase.server";

const VENDOR_LABEL: Record<string, string> = { "abc-supply": "ABC Supply", srs: "SRS Distribution", qxo: "QXO" };

export const prerender = false;

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const GET: APIRoute = async ({ locals, url }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot download credit memo files." }, { status: 403 });
  }
  const kind = url.searchParams.get("kind") === "tracker" ? "tracker" : "detail";
  // Multi-vendor pill (docs/88): ?vendor=<slug> scopes both downloads to one vendor.
  const vendorParam = cmVendorBySlug(url.searchParams.get("vendor"))?.slug ?? null;

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  let reqQuery = client
    .from("credit_memo_requests")
    .select("vendor_slug,invoice_number, expected_credit, packet")
    .eq("request_kind", "requested")
    .eq("status", "approved");
  if (vendorParam) reqQuery = reqQuery.eq("vendor_slug", vendorParam);
  const { data: requests, error: reqError } = await reqQuery.limit(1000);
  if (reqError) return jsonApiResponse({ error: "credit_memo_requests", error_description: reqError.message }, { status: 409 });
  const vendorOf = new Map((requests ?? []).map((r) => [r.invoice_number, VENDOR_LABEL[(r as any).vendor_slug ?? "abc-supply"] ?? "ABC Supply"]));
  const invoices = [...vendorOf.keys()];
  const today = new Date().toISOString().slice(0, 10);

  let csv: string;
  if (kind === "tracker") {
    csv = "Vendor,Invoice #,Requested Credit Memo Total,Date Credit Memo Email Generated\n";
    for (const r of requests ?? []) {
      csv += [vendorOf.get(r.invoice_number), r.invoice_number, Number(r.expected_credit ?? 0).toFixed(2), today].map(csvCell).join(",") + "\n";
    }
  } else {
    // latest re-audit run per invoice supplies the line detail
    let lineQuery = invoices.length
      ? client
          .from("invoice_line_reaudit")
          .select("run_label, invoice_number, item_number, item_description, quantity, uom, invoiced_price, office_name, office_price, variance_ext, agreement_number, agreement_effective, agreement_expiry, match_method, paexp_tag, created_at")
          .in("invoice_number", invoices)
          .eq("classification", "discrepancy")
      : null;
    // Silo (docs/87): scope the line fetch too — a colliding invoice number must
    // not pull another vendor's claim lines into this vendor's packet.
    if (lineQuery && vendorParam) lineQuery = lineQuery.eq("vendor_slug", vendorParam);
    const { data: lines, error: lineError } = lineQuery
      ? await lineQuery.order("created_at", { ascending: false }).limit(2000)
      : { data: [], error: null };
    if (lineError) return jsonApiResponse({ error: "invoice_line_reaudit", error_description: lineError.message }, { status: 409 });
    const latestRun = new Map<string, string>();
    for (const l of lines ?? []) if (!latestRun.has(l.invoice_number)) latestRun.set(l.invoice_number, l.run_label);
    csv = "Vendor,Invoice #,PE Office,Item #,Item Description,Qty,UOM,Invoiced Price,Agreement Price,Line Credit,Agreement #,Agreement Effective,Agreement Expiry,Match Method,PAEXP Tag\n";
    for (const l of lines ?? []) {
      if (latestRun.get(l.invoice_number) !== l.run_label) continue;
      if (Number(l.variance_ext ?? 0) < 0.05) continue;
      csv += [vendorOf.get(l.invoice_number), l.invoice_number, l.office_name, l.item_number, l.item_description,
        Number(l.quantity), l.uom, Number(l.invoiced_price).toFixed(2), Number(l.office_price).toFixed(2),
        Number(l.variance_ext).toFixed(2), l.agreement_number ?? "", l.agreement_effective ?? "", l.agreement_expiry ?? "",
        l.match_method, l.paexp_tag ?? ""].map(csvCell).join(",") + "\n";
    }
  }

  const vendorTag = vendorParam ? `${vendorParam.replace(/[^a-z0-9]+/gi, "_")}_` : "";
  const name = kind === "tracker" ? `credit_memo_request_tracker_${vendorTag}${today}.csv` : `credit_memo_reconciliation_${vendorTag}${today}.csv`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
    },
  });
};
