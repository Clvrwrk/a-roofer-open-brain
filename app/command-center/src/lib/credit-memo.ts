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

// ── Provenance (PEC-221) ────────────────────────────────────────────────────────
// A credit request is an accusation: "you charged us $27.75 for an item our agreement
// prices at $17.50." Before a human sends that to a vendor they have to be able to see
// the two source documents and the chain that says they belong together. The page used
// to show neither, so every claim was take-it-on-faith.
export interface CreditMemoAgreement {
  // recorded = the audit run wrote the citation down · derived = re-resolved just now
  // from the office-scoped price book · none = nothing to cite
  source: "recorded" | "derived" | "none";
  id: string | null;
  number: string | null;
  versionLabel: string | null;
  effective: string | null;
  expiry: string | null;
  branchName: string | null;
  officeName: string | null;
  sourceFile: string | null;
  ceoVerified: boolean | null;
  isQuote: boolean;
  pdfUrl: string | null;
}

export interface CreditMemoCheck {
  label: string;
  state: "pass" | "warn" | "fail" | "unknown";
  detail: string;
}

export interface CreditMemoProvenance {
  vendorSlug: string;
  invoiceDate: string;
  branchCode: string;
  branchName: string;
  officeName: string;
  invoicePdfUrl: string | null;
  agreement: CreditMemoAgreement;
  matchMethod: string | null;
  unitMatch: boolean | null;
  checks: CreditMemoCheck[];
}

export interface CreditMemoDetail {
  kind: "received" | "requested";
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
  provenance: CreditMemoProvenance | null;
}

export async function loadCreditMemo(invoiceNumber: string, env: RuntimeEnv = getRuntimeEnv()): Promise<CreditMemoDetail | null> {
  const { client } = createServerSupabaseClient(env);
  if (!client || !invoiceNumber) return null;

  const { data: head } = await client.from("v_credit_memo_audit").select("*").eq("invoice_number", invoiceNumber).maybeSingle();
  if (!head) return loadRequestedCreditMemo(client, invoiceNumber);
  const h = head as any;
  const originalInvoiceNumber: string | null = h.original_invoice_number ?? null;

  const [{ data: cmRows }, { data: origRows }, { data: dispRows }] = await Promise.all([
    // v_invoice_lines_complete: full line set for API-truncated invoices (ABC 10-line cap, docs/47 #2)
    client.from("v_invoice_lines_complete").select("item_number,item_description,price_qty,price_uom,price_per_uom").eq("invoice_number", invoiceNumber),
    originalInvoiceNumber
      ? client.from("v_invoice_lines_complete").select("item_number,price_per_uom").eq("invoice_number", originalInvoiceNumber)
      : Promise.resolve({ data: [] as any[] }),
    // An invoice can carry BOTH a 'requested' and a 'received' row — .maybeSingle()
    // would error on multiple rows (docs/84 W3). Take the most recently updated.
    client.from("credit_memo_requests").select("status,approved_by,packet,updated_at").eq("invoice_number", invoiceNumber).order("updated_at", { ascending: false }).limit(1),
  ]);

  const origByItem = new Map<string, number>();
  for (const o of (origRows as any[] | null) ?? []) if (o.price_per_uom != null) origByItem.set(o.item_number, num(o.price_per_uom));

  const lines: CreditMemoLine[] = ((cmRows as any[] | null) ?? []).map((l) => {
    const orig = origByItem.has(l.item_number) ? origByItem.get(l.item_number)! : null;
    const cmUnit = num(l.price_per_uom);
    const matchStatus: CreditMemoLine["matchStatus"] =
      orig == null ? "no_original" : Math.round(cmUnit * 100) === Math.round(orig * 100) ? "match" : "mismatch";
    return {
      itemNumber: l.item_number ?? "",
      itemDescription: l.item_description ?? "",
      quantity: num(l.price_qty),
      uom: l.price_uom ?? "",
      cmUnitPrice: cmUnit,
      originalUnitPrice: orig,
      matchStatus,
    };
  });

  const disp = ((dispRows as any[] | null) ?? [])[0] ?? null;
  const provenance = await loadProvenance(client, invoiceNumber, [], lines.map((l) => l.itemNumber).filter(Boolean));
  return {
    kind: "received",
    provenance,
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

const QUOTE_RE = /\bquote\b/i;

// Resolve the two source documents behind a claim, plus the chain that says they belong
// together. Everything here is scoped to ONE invoice, so the extra reads are cheap.
//
// Agreement citation comes from invoice_line_reaudit when the audit run recorded one
// (every ABC claim line has it). The SRS runs wrote office/agreement onto their 'valid'
// and 'no_price' rows but left them NULL on 'discrepancy' rows — the only rows that turn
// into money — so those fall through to a live re-derivation against the same
// office-scoped price book the pricing views use, and are labelled as re-derived rather
// than passed off as what the auditor actually cited.
async function loadProvenance(
  client: any,
  invoiceNumber: string,
  reauditRows: any[],
  itemNumbers: string[],
): Promise<CreditMemoProvenance | null> {
  const [{ data: head }, { data: vend }, { data: doc }] = await Promise.all([
    client.from("v_invoice_audit_invoice").select("invoice_date,branch_number,branch_name,office,ship_to_number").eq("invoice_number", invoiceNumber).maybeSingle(),
    client.from("v_invoice_audit_invoice_vendor").select("vendor_slug").eq("invoice_number", invoiceNumber).maybeSingle(),
    client.from("invoice_documents").select("storage_path").eq("invoice_number", invoiceNumber).not("storage_path", "is", null).limit(1).maybeSingle(),
  ]);
  if (!head) return null;
  const h = head as any;
  const vendorSlug = String((vend as any)?.vendor_slug ?? "abc-supply");
  const invoiceDate = h.invoice_date ? String(h.invoice_date).slice(0, 10) : "";
  const officeName = String(h.office ?? "");

  const cited = reauditRows.find((r) => r.agreement_id) ?? null;
  const method = reauditRows.find((r) => r.match_method && r.match_method !== "none") ?? null;

  let agreement: CreditMemoAgreement = {
    source: "none", id: null, number: null, versionLabel: null, effective: null, expiry: null,
    branchName: null, officeName: null, sourceFile: null, ceoVerified: null, isQuote: false, pdfUrl: null,
  };

  if (cited) {
    agreement = {
      source: "recorded",
      id: String(cited.agreement_id),
      number: cited.agreement_number ?? null,
      versionLabel: null,
      effective: cited.agreement_effective ? String(cited.agreement_effective).slice(0, 10) : null,
      expiry: cited.agreement_expiry ? String(cited.agreement_expiry).slice(0, 10) : null,
      branchName: null,
      officeName: cited.office_name ?? null,
      sourceFile: null,
      ceoVerified: null,
      isQuote: false,
      pdfUrl: null,
    };
    // ABC agreement ids are integer keys into abc_price_agreements; fill in the rest.
    if (/^\d+$/.test(agreement.id!)) {
      const { data: abc } = await client.from("abc_price_agreements")
        .select("agreement_number,version_label,effective_date,expiry_date,ceo_verified,source_file,pdf_storage_path")
        .eq("id", agreement.id).maybeSingle();
      const a = abc as any;
      if (a) {
        agreement.number = a.agreement_number ?? agreement.number;
        agreement.versionLabel = a.version_label ?? null;
        agreement.effective = a.effective_date ? String(a.effective_date).slice(0, 10) : agreement.effective;
        agreement.expiry = a.expiry_date ? String(a.expiry_date).slice(0, 10) : agreement.expiry;
        agreement.ceoVerified = a.ceo_verified ?? null;
        agreement.sourceFile = a.source_file ?? null;
        agreement.isQuote = QUOTE_RE.test(`${a.version_label ?? ""} ${a.source_file ?? ""}`);
        if (a.pdf_storage_path) agreement.pdfUrl = `/api/price-agreement/pdf/${encodeURIComponent(agreement.id!)}`;
      }
    }
  } else if (itemNumbers.length) {
    const derived = await deriveVendorAgreement(client, invoiceNumber, invoiceDate, itemNumbers);
    if (derived) agreement = derived;
  }

  // ── the validation chain, stated rather than implied ──────────────────────────
  const checks: CreditMemoCheck[] = [];
  const branchLabel = [h.branch_number, h.branch_name].filter(Boolean).join(" · ") || "unknown branch";

  checks.push(officeName && officeName !== "Unassigned"
    ? { label: "Invoice → PE office", state: "pass", detail: `${branchLabel} maps to ${officeName} via vendor_branches.pricing_territory_office_id.` }
    : { label: "Invoice → PE office", state: "fail", detail: `${branchLabel} has no PE pricing office assigned, so no agreement can be office-matched to it.` });

  if (agreement.source === "none") {
    checks.push({ label: "Agreement → same PE office", state: "fail", detail: "No agreement is cited for this claim and none could be resolved from the office price book. There is nothing to check the invoice price against." });
  } else if (!agreement.officeName) {
    checks.push({ label: "Agreement → same PE office", state: "unknown", detail: "The cited agreement has no office recorded against it." });
  } else if (agreement.officeName === officeName) {
    checks.push({ label: "Agreement → same PE office", state: "pass", detail: `Agreement priced for ${agreement.officeName}, the same office the invoice branch belongs to. Prices never cross PE offices.` });
  } else {
    checks.push({ label: "Agreement → same PE office", state: "fail", detail: `Agreement is priced for ${agreement.officeName} but the invoice branch belongs to ${officeName}. Cross-office pricing is not a valid basis for a claim.` });
  }

  if (agreement.source !== "none") {
    if (!invoiceDate || !agreement.effective) {
      checks.push({ label: "In force on the invoice date", state: "unknown", detail: "Missing an invoice date or an agreement effective date, so the window cannot be checked." });
    } else if (invoiceDate < agreement.effective) {
      checks.push({ label: "In force on the invoice date", state: "fail", detail: `Invoice dated ${invoiceDate} predates the agreement's effective date of ${agreement.effective}.` });
    } else if (agreement.expiry && invoiceDate > agreement.expiry) {
      checks.push({ label: "In force on the invoice date", state: "warn", detail: `Agreement expired ${agreement.expiry}, before the invoice date of ${invoiceDate}. It is still the latest version on file for this office — no superseding version exists — but the claim rests on lapsed paper.` });
    } else {
      checks.push({ label: "In force on the invoice date", state: "pass", detail: `Invoice dated ${invoiceDate} falls inside ${agreement.effective} → ${agreement.expiry ?? "open-ended"}.` });
    }

    checks.push(agreement.isQuote
      ? { label: "Document type", state: "warn", detail: "The cited document is a QUOTE, not a signed agreement. A quote is not an agreement (docs/93) — claims resting on one fail closed on re-audit." }
      : { label: "Document type", state: "pass", detail: `Priced from an agreement${agreement.sourceFile ? ` (${agreement.sourceFile})` : ""}.` });
  }

  const m = method?.match_method ?? null;
  if (m === "item_number") checks.push({ label: "Item match", state: "pass", detail: "Matched on the vendor's own item number — exact." });
  else if (m) checks.push({ label: "Item match", state: "warn", detail: `Matched by ${m.replace(/_/g, " ")}, not by item number. A fuzzy match can price the wrong product.` });
  else checks.push({ label: "Item match", state: "unknown", detail: "No match method recorded for this line." });

  const um = method?.unit_match ?? null;
  // unit_match is true-or-null in this table; null means "not recorded", never "mismatched".
  checks.push(um === true
    ? { label: "UOM alignment", state: "pass", detail: "Invoice and agreement price the item in the same unit of measure, so the two prices are directly comparable." }
    : { label: "UOM alignment", state: "unknown", detail: "UOM alignment was not recorded for this line. Compare in the agreement's pricing UOM before sending." });

  checks.push(agreement.source === "recorded"
    ? { label: "Citation provenance", state: "pass", detail: "The audit run recorded this agreement against the line at the time the claim was raised." }
    : agreement.source === "derived"
      ? { label: "Citation provenance", state: "warn", detail: "The audit run recorded NO agreement on this line. This citation was re-derived just now from the office price book — verify it before sending." }
      : { label: "Citation provenance", state: "fail", detail: "No agreement was recorded and none could be re-derived." });

  return {
    vendorSlug,
    invoiceDate,
    branchCode: String(h.branch_number ?? h.ship_to_number ?? ""),
    branchName: String(h.branch_name ?? ""),
    officeName,
    invoicePdfUrl: doc ? `/api/invoice-audit/pdf/${encodeURIComponent(invoiceNumber)}` : null,
    agreement,
    matchMethod: m,
    unitMatch: um,
    checks,
  };
}

// SRS / vendor_invoices fallback: reproduce the office-scoped resolution used by
// v_invoice_audit_invoice — an agreement counts only if its branch sits in the SAME
// pricing territory office as the invoice's branch, and was effective by the invoice date.
async function deriveVendorAgreement(
  client: any,
  invoiceNumber: string,
  invoiceDate: string,
  itemNumbers: string[],
): Promise<CreditMemoAgreement | null> {
  const { data: inv } = await client.from("vendor_invoices").select("vendor_id,vendor_branch_id").eq("invoice_number", invoiceNumber).maybeSingle();
  if (!inv?.vendor_branch_id) return null;

  const { data: branch } = await client.from("vendor_branches").select("pricing_territory_office_id").eq("id", inv.vendor_branch_id).maybeSingle();
  const officeId = (branch as any)?.pricing_territory_office_id;
  if (!officeId) return null;

  const [{ data: siblings }, { data: office }] = await Promise.all([
    client.from("vendor_branches").select("id,branch_name").eq("pricing_territory_office_id", officeId),
    client.from("office").select("name").eq("id", officeId).maybeSingle(),
  ]);
  const branchIds = ((siblings as any[] | null) ?? []).map((b) => b.id);
  if (!branchIds.length) return null;
  const branchNameById = new Map(((siblings as any[] | null) ?? []).map((b) => [b.id, b.branch_name]));

  let agrQuery = client.from("price_agreements")
    .select("id,agreement_number,version_label,effective_date,expiry_date,ceo_verified,source_file,source_pdf_url,vendor_branch_id")
    .eq("vendor_id", inv.vendor_id)
    .in("vendor_branch_id", branchIds)
    .not("is_active", "is", false);
  if (invoiceDate) agrQuery = agrQuery.or(`effective_date.is.null,effective_date.lte.${invoiceDate}`);
  const { data: agreements } = await agrQuery;
  const agrs = (agreements as any[] | null) ?? [];
  if (!agrs.length) return null;

  const { data: items } = await client.from("price_agreement_items")
    .select("agreement_id,raw_item_number,negotiated_price")
    .in("agreement_id", agrs.map((a) => a.id))
    .in("raw_item_number", itemNumbers);
  const hit = ((items as any[] | null) ?? [])[0];
  if (!hit) return null;

  const a = agrs.find((x) => x.id === hit.agreement_id);
  if (!a) return null;
  return {
    source: "derived",
    id: String(a.id),
    number: a.agreement_number ?? null,
    versionLabel: a.version_label ?? null,
    effective: a.effective_date ? String(a.effective_date).slice(0, 10) : null,
    expiry: a.expiry_date ? String(a.expiry_date).slice(0, 10) : null,
    branchName: branchNameById.get(a.vendor_branch_id) ?? null,
    officeName: (office as any)?.name ?? null,
    sourceFile: a.source_file ?? null,
    ceoVerified: a.ceo_verified ?? null,
    isQuote: QUOTE_RE.test(`${a.version_label ?? ""} ${a.source_file ?? ""}`),
    pdfUrl: a.source_pdf_url ? String(a.source_pdf_url) : null,
  };
}

// Requested credit memo (we asked the vendor) — no received CM doc exists; the "invoice" is
// the over-priced invoice whose credit-flagged lines we're disputing. Detail = those lines
// (invoice price vs negotiated) + the request lifecycle status.
async function loadRequestedCreditMemo(client: any, invoiceNumber: string): Promise<CreditMemoDetail | null> {
  const { data: reqRow } = await client.from("credit_memo_requests").select("status,approved_by,expected_credit,line_count,packet,created_at,updated_at").eq("invoice_number", invoiceNumber).eq("request_kind", "requested").maybeSingle();
  if (!reqRow) return null;
  const req = reqRow as any;

  // v2 (docs/82): disputed lines come from the invoice's LATEST re-audit run
  // (invoice_line_reaudit) — the disposition decisions that used to feed this are gone.
  // Legacy credit-flag decisions remain as a fallback for pre-v2 requests.
  let lineRows: any[] = [];
  const { data: reauditRows } = await client
    .from("invoice_line_reaudit")
    .select("run_label,item_number,item_description,quantity,uom,invoiced_price,office_price,variance_ext,created_at,office_id,office_name,agreement_id,agreement_number,agreement_effective,agreement_expiry,match_method,unit_match")
    .eq("invoice_number", invoiceNumber)
    .eq("classification", "discrepancy")
    .order("created_at", { ascending: false });
  const reaudit = (reauditRows as any[] | null) ?? [];
  if (reaudit.length) {
    const latestRun = reaudit[0].run_label;
    lineRows = reaudit
      .filter((r) => r.run_label === latestRun && num(r.variance_ext) >= 0.05)
      .map((r) => ({ item_number: r.item_number, item_description: r.item_description, quantity: r.quantity, uom: r.uom, unit_price: r.invoiced_price, negotiated_price: r.office_price }));
  } else {
    const { data: flagged } = await client.from("v_invoice_line_audit_current").select("invoice_line_id").eq("invoice_number", invoiceNumber).in("decision", ["credit-flag", "credit-noflag"]);
    const ids = ((flagged as any[] | null) ?? []).map((r) => r.invoice_line_id);
    if (ids.length) {
      const { data } = await client.from("v_invoice_audit_line").select("item_number,item_description,quantity,uom,unit_price,negotiated_price").in("line_id", ids);
      lineRows = (data as any[] | null) ?? [];
    }
  }
  const lines: CreditMemoLine[] = lineRows.map((l) => ({
    itemNumber: l.item_number ?? "",
    itemDescription: l.item_description ?? "",
    quantity: num(l.quantity),
    uom: l.uom ?? "",
    cmUnitPrice: num(l.unit_price),
    originalUnitPrice: l.negotiated_price == null ? null : num(l.negotiated_price),
    matchStatus: "mismatch",
  }));

  // Provenance reads the SAME re-audit rows the claim lines came from, so the citation on
  // screen is the one the auditor actually used (or is explicitly labelled re-derived).
  const claimRows = reaudit.length ? reaudit.filter((r) => r.run_label === reaudit[0].run_label) : [];
  const provenance = await loadProvenance(client, invoiceNumber, claimRows, lines.map((l) => l.itemNumber).filter(Boolean));

  return {
    kind: "requested",
    provenance,
    invoiceNumber,
    invoiceDate: "",
    creditAmount: num(req.expected_credit),
    branchName: "",
    shipTo: "",
    originalInvoiceNumber: invoiceNumber,
    originalReference: null,
    matchStatus: "requested",
    matchedLines: 0,
    mismatchLines: lines.length,
    unmatchedLines: 0,
    lineCount: num(req.line_count) || lines.length,
    lines,
    disposition: { status: req.status, approvedBy: req.approved_by ?? "", note: req.packet?.note ?? "", decidedAt: req.packet?.requested_at ?? req.updated_at ?? "" },
  };
}
