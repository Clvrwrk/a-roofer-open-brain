import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

export type GapSurfaceStatus = "live" | "degraded" | "unconfigured";
export type GapSeverity = "critical" | "blocked" | "review";

interface AgreementRow {
  id: string;
  branch_number: string | null;
  region_code: string | null;
  agreement_number: string | null;
  version_label: string | null;
  effective_date: string | null;
  expiry_date: string | null;
  source_file: string | null;
  ceo_verified: boolean | null;
  staleness_status: string | null;
}

interface PriceListItemRow {
  id: string;
  agreement_id: string | null;
  item_number: string | null;
  description: string | null;
  unit: string | null;
  unit_price: number | string | null;
  approval_status: string | null;
}

interface InvoiceRow {
  invoice_number: string;
  invoice_date: string | null;
  order_number: string | null;
  ship_to_number: string | null;
  purchase_order_number: string | null;
  order_name: string | null;
  total_amount: number | string | null;
}

interface InvoiceLineRow {
  invoice_number: string;
  line_key: string | null;
  line_number: string | null;
  item_number: string | null;
  item_description: string | null;
  raw: Record<string, unknown> | null;
}

interface OrderRow {
  order_number: string;
  branch_number: string | null;
  order_name: string | null;
  purchase_order_number: string | null;
  ship_to_number: string | null;
}

interface BranchRow {
  branch_number: string;
  branch_name: string | null;
  city: string | null;
  state: string | null;
  region_code: string | null;
}

interface BranchMatchRow {
  ship_to_number: string | null;
  branch_number: string | null;
  abc_price_agreement_id: string | null;
  match_type: string | null;
  confidence_score: number | string | null;
}

interface ShipToBranchRow {
  ship_to_number: string | null;
  branch_number: string | null;
  home_branch: boolean | null;
  branch_name: string | null;
}

interface InvoiceDocumentRow {
  id: string;
  invoice_number: string | null;
  payment_status: string | null;
  original_filename: string | null;
  extraction_status: string | null;
}

interface Candidate {
  item: PriceListItemRow;
  agreement: AgreementRow;
  scope: "branch" | "ship-to match" | "region";
}

export interface GapReason {
  code: string;
  label: string;
}

export type PriceAgreementEvidenceStatus =
  | "pdf_mapped"
  | "no_pdf_api_match"
  | "no_pdf_api_mismatch"
  | "no_pdf_api_missing"
  | "no_pdf_no_api_agreement"
  | "no_reference_agreement"
  | "no_price_line";

export interface AgreementGapRow {
  id: string;
  severity: GapSeverity;
  invoiceNumber: string;
  invoiceDate: string | null;
  lineNumber: string;
  itemNumber: string;
  itemDescription: string;
  branchNumber: string;
  branchName: string;
  branchRegion: string;
  orderName: string;
  purchaseOrderNumber: string;
  paymentStatus: string;
  vendorName: string;
  acculynxJobNumber: string;
  invoiceEvidenceLabel: string;
  invoiceEvidenceStatus: string;
  quantity: number | null;
  invoiceUom: string;
  invoicePrice: number | null;
  referencePrice: number | null;
  variance: number | null;
  variancePct: number | null;
  pastAgreement: string;
  currentAgreement: string;
  referenceAgreement: string;
  agreementSource: string;
  evidenceStatus: PriceAgreementEvidenceStatus;
  evidenceStatusLabel: string;
  gapReasons: GapReason[];
  humanAction: string;
  escalationPayload: string;
}

export interface BranchGapSummary {
  branchNumber: string;
  branchName: string;
  gapRows: number;
  criticalRows: number;
  blockedRows: number;
  reviewRows: number;
  absoluteVariance: number;
}

export interface AgreementGapSurface {
  status: GapSurfaceStatus;
  generatedAt: string;
  missingConfig: string[];
  errors: string[];
  totals: {
    invoiceLines: number;
    gapRows: number;
    criticalRows: number;
    blockedRows: number;
    reviewRows: number;
    missingPriceListItems: number;
    missingBranchAgreements: number;
    missingFixedAgreements: number;
    expiredAgreements: number;
    futureAgreements: number;
    unverifiedAgreements: number;
    varianceRows: number;
    absoluteVariance: number;
  };
  rows: AgreementGapRow[];
  branches: BranchGapSummary[];
}

const TODAY = new Date("2026-06-06T00:00:00Z");
const PAGE_SIZE = 1000;
const MONEY_FORMATTER = new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" });
const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");
const ABC_VENDOR_NAME = "ABC Supply Co.";

async function selectAll<T extends Record<string, unknown>>(
  client: SupabaseClient,
  table: string,
  columns: string,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await client.from(table).select(columns).range(from, to);
    if (error) throw new Error(`${table}: ${error.message}`);

    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
    from += batch.length;
  }
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["value", "amount", "price", "unitPrice", "unit_price", "pricePerUnitAmount", "extendedPriceAmount"]) {
      const parsed = toNumber(record[key]);
      if (parsed !== null) return parsed;
    }
  }

  return null;
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateTime(value: string | null | undefined): number {
  return toDate(value)?.getTime() ?? Number.NEGATIVE_INFINITY;
}

function hasFixedWindow(agreement: AgreementRow) {
  return Boolean(agreement.effective_date && agreement.expiry_date);
}

function agreementSourceText(agreement: AgreementRow | null | undefined) {
  return compact(agreement?.source_file, "No source file mapped");
}

function isPdfAgreement(agreement: AgreementRow | null | undefined) {
  return /\.pdf(?:$|[?#])/i.test(agreementSourceText(agreement));
}

function isApiAgreement(agreement: AgreementRow | null | undefined) {
  const source = `${agreement?.source_file ?? ""} ${agreement?.version_label ?? ""} ${agreement?.agreement_number ?? ""}`;
  return /\bapi\b/i.test(source);
}

function isActiveOn(agreement: AgreementRow, date: Date | null) {
  if (!date || !hasFixedWindow(agreement)) return false;
  const effective = toDate(agreement.effective_date);
  const expiry = toDate(agreement.expiry_date);
  return Boolean(effective && expiry && effective <= date && date <= expiry);
}

function compact(value: unknown, fallback = "Unknown") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function normalizePaymentStatus(value: string | null | undefined) {
  return compact(value, "unpaid").toLowerCase();
}

function isPaidPaymentStatus(value: string | null | undefined) {
  const normalized = normalizePaymentStatus(value);
  if (normalized.includes("unpaid") || normalized.includes("not paid")) return false;
  return normalized === "paid" || normalized.includes(" paid");
}

function normalizeOfficePrefix(value: string | null | undefined) {
  const normalized = compact(value, "job").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (normalized === "colorado") return "co";
  if (normalized === "kansas") return "ks";
  if (normalized === "texas") return "tx";
  return normalized.slice(0, 2) || "job";
}

function extractAcculynxJobNumber(values: Array<string | null | undefined>, regionCode: string) {
  const prefix = normalizeOfficePrefix(regionCode);
  const explicitPattern = /\b([a-z]{2})[-\s_]?(\d{2,})\b/i;
  const numberPattern = /\b(\d{2,})\b/;

  for (const value of values) {
    const text = compact(value, "");
    const explicit = text.match(explicitPattern);
    if (explicit) return `${explicit[1].toLowerCase()}-${explicit[2]}`;
  }

  for (const value of values) {
    const text = compact(value, "");
    const number = text.match(numberPattern);
    if (number) return `${prefix}-${number[1]}`;
  }

  return `needs ${prefix}-##`;
}

function formatMoney(value: number | null) {
  return value === null ? "Missing" : MONEY_FORMATTER.format(value);
}

function formatAgreement(candidate: Candidate | null, empty = "None found") {
  if (!candidate) return empty;
  const agreement = candidate.agreement;
  const label = compact(agreement.agreement_number ?? agreement.version_label, "Agreement");
  const start = compact(agreement.effective_date, "missing start");
  const end = isApiAgreement(agreement) ? "current API price" : compact(agreement.expiry_date, "missing end");
  const verified = agreement.ceo_verified ? "CEO verified" : "not CEO verified";
  const price = formatMoney(toNumber(candidate.item.unit_price));
  return `${label} / ${start} to ${end} / ${price} / ${verified}`;
}

function formatAgreementSource(candidate: Candidate | null) {
  return agreementSourceText(candidate?.agreement);
}

function agreementSortDesc(a: Candidate, b: Candidate) {
  return dateTime(b.agreement.expiry_date ?? b.agreement.effective_date) - dateTime(a.agreement.expiry_date ?? a.agreement.effective_date);
}

function agreementSortAsc(a: Candidate, b: Candidate) {
  return dateTime(a.agreement.effective_date ?? a.agreement.expiry_date) - dateTime(b.agreement.effective_date ?? b.agreement.expiry_date);
}

function uniqueReasons(reasons: GapReason[]) {
  const seen = new Set<string>();
  return reasons.filter((reason) => {
    if (seen.has(reason.code)) return false;
    seen.add(reason.code);
    return true;
  });
}

function chooseSeverity(reasons: GapReason[]): GapSeverity {
  const codes = new Set(reasons.map((reason) => reason.code));
  if (
    codes.has("missing_invoice_price") ||
    codes.has("no_price_list_item") ||
    codes.has("no_branch_agreement") ||
    codes.has("no_fixed_agreement") ||
    codes.has("no_pdf_api_mismatch") ||
    codes.has("no_pdf_api_missing") ||
    codes.has("no_pdf_no_api_agreement")
  ) {
    return "critical";
  }
  if (codes.has("expired_agreement") || codes.has("future_agreement") || codes.has("unverified_agreement")) return "blocked";
  return "review";
}

function chooseHumanAction(reasons: GapReason[]) {
  const codes = new Set(reasons.map((reason) => reason.code));
  if (codes.has("no_pdf_api_match")) return "Approve or deny the API-backed match: no PDF is mapped, but the ABC API price matches this invoice line.";
  if (codes.has("no_pdf_api_mismatch")) return "Human intervention: API price does not match invoice. Decide credit-memo path or request current PDF agreement evidence.";
  if (codes.has("no_pdf_api_missing")) return "Human intervention: no PDF is mapped and the API price is missing. Request branch/SKU price evidence.";
  if (codes.has("no_pdf_no_api_agreement")) return "Map/upload the PDF agreement product file or request API-backed branch/SKU pricing.";
  if (codes.has("no_price_list_item")) return "Create or fetch the branch/SKU price line from PDF or API evidence.";
  if (codes.has("no_branch_agreement")) return "Map this branch and region to a PDF agreement or API-backed agreement.";
  if (codes.has("no_fixed_agreement")) return "Add a fixed agreement window for this branch/SKU.";
  if (codes.has("expired_agreement")) return "Renew the agreement or confirm backdated pricing.";
  if (codes.has("future_agreement")) return "Confirm whether the future agreement should cover this invoice.";
  if (codes.has("unverified_agreement")) return "CEO-verify the referenced agreement before agents can rely on it.";
  if (codes.has("price_variance")) return "Approve the variance or correct the agreement price.";
  if (codes.has("uom_mismatch")) return "Confirm UOM conversion and normalize the agreement unit.";
  return "Review agreement guardrail.";
}

function priceMatches(invoicePrice: number | null, referencePrice: number | null) {
  return invoicePrice !== null && referencePrice !== null && Math.abs(invoicePrice - referencePrice) <= 0.005;
}

function evidenceStatusFrom(reasons: GapReason[], referenceAgreement: Candidate | null): {
  status: PriceAgreementEvidenceStatus;
  label: string;
} {
  const codes = new Set(reasons.map((reason) => reason.code));

  if (codes.has("no_pdf_api_match")) {
    return { status: "no_pdf_api_match", label: "No PDF mapped; ABC API price matched invoice" };
  }

  if (codes.has("no_pdf_api_mismatch")) {
    return { status: "no_pdf_api_mismatch", label: "No PDF mapped; ABC API price does not match invoice" };
  }

  if (codes.has("no_pdf_api_missing")) {
    return { status: "no_pdf_api_missing", label: "No PDF mapped; ABC API price missing" };
  }

  if (codes.has("no_pdf_no_api_agreement")) {
    return { status: "no_pdf_no_api_agreement", label: "No PDF/API agreement mapped for branch and SKU" };
  }

  if (codes.has("no_price_list_item")) {
    return { status: "no_price_line", label: "No PDF/API product price line mapped" };
  }

  if (!referenceAgreement) {
    return { status: "no_reference_agreement", label: "No branch/region agreement reference" };
  }

  if (isApiAgreement(referenceAgreement?.agreement)) {
    return { status: "no_pdf_api_match", label: "ABC API agreement used as reference evidence" };
  }

  return { status: "pdf_mapped", label: "PDF price agreement mapped" };
}

function getInvoiceQuantity(raw: Record<string, unknown> | null) {
  return toNumber(raw?.shippedQty) ?? toNumber(raw?.orderedQty) ?? toNumber(raw?.priceQty);
}

function getInvoiceUom(raw: Record<string, unknown> | null) {
  const priceQty = raw?.priceQty;
  if (priceQty && typeof priceQty === "object") {
    const uom = (priceQty as Record<string, unknown>).uom;
    if (uom) return String(uom);
  }
  return "Missing";
}

function getInvoicePrice(raw: Record<string, unknown> | null) {
  return toNumber(raw?.pricePerUnitAmount);
}

function toBranchLabel(branch: BranchRow | undefined, branchNumber: string | null | undefined) {
  const number = compact(branchNumber, "No branch");
  const name = branch?.branch_name ? ` - ${branch.branch_name}` : "";
  const location = [branch?.city, branch?.state].filter(Boolean).join(", ");
  return `${number}${name}${location ? ` (${location})` : ""}`;
}

function summarizeBranches(rows: AgreementGapRow[]): BranchGapSummary[] {
  const byBranch = new Map<string, BranchGapSummary>();

  for (const row of rows) {
    const key = row.branchNumber || "Unknown";
    const summary = byBranch.get(key) ?? {
      branchNumber: row.branchNumber,
      branchName: row.branchName,
      gapRows: 0,
      criticalRows: 0,
      blockedRows: 0,
      reviewRows: 0,
      absoluteVariance: 0,
    };

    summary.gapRows += 1;
    summary.absoluteVariance += Math.abs(row.variance ?? 0);
    if (row.severity === "critical") summary.criticalRows += 1;
    if (row.severity === "blocked") summary.blockedRows += 1;
    if (row.severity === "review") summary.reviewRows += 1;
    byBranch.set(key, summary);
  }

  return Array.from(byBranch.values()).sort((a, b) => b.gapRows - a.gapRows || b.absoluteVariance - a.absoluteVariance);
}

export function formatCurrency(value: number | null | undefined) {
  return value === null || value === undefined ? "Missing" : MONEY_FORMATTER.format(value);
}

export function formatNumber(value: number) {
  return NUMBER_FORMATTER.format(value);
}

export async function loadAgreementGapSurface(env: RuntimeEnv = getRuntimeEnv()): Promise<AgreementGapSurface> {
  const { client, config } = createServerSupabaseClient(env);

  if (!client) {
    return {
      status: "unconfigured",
      generatedAt: new Date().toISOString(),
      missingConfig: config.missing,
      errors: [],
      totals: {
        invoiceLines: 0,
        gapRows: 0,
        criticalRows: 0,
        blockedRows: 0,
        reviewRows: 0,
        missingPriceListItems: 0,
        missingBranchAgreements: 0,
        missingFixedAgreements: 0,
        expiredAgreements: 0,
        futureAgreements: 0,
        unverifiedAgreements: 0,
        varianceRows: 0,
        absoluteVariance: 0,
      },
      rows: [],
      branches: [],
    };
  }

  try {
    const [agreements, priceItems, invoices, invoiceLines, orders, branches, branchMatches, shipToBranches, invoiceDocuments] =
      await Promise.all([
        selectAll<AgreementRow>(
          client,
          "abc_price_agreements",
          "id,branch_number,region_code,agreement_number,version_label,effective_date,expiry_date,source_file,ceo_verified,staleness_status",
        ),
        selectAll<PriceListItemRow>(
          client,
          "abc_price_list_items",
          "id,agreement_id,item_number,description,unit,unit_price,approval_status",
        ),
        selectAll<InvoiceRow>(
          client,
          "abc_invoices",
          "invoice_number,invoice_date,order_number,ship_to_number,purchase_order_number,order_name,total_amount",
        ),
        selectAll<InvoiceLineRow>(
          client,
          "abc_invoice_lines",
          "invoice_number,line_key,line_number,item_number,item_description,raw",
        ),
        selectAll<OrderRow>(client, "abc_orders", "order_number,branch_number,order_name,purchase_order_number,ship_to_number"),
        selectAll<BranchRow>(client, "abc_vendor_branches", "branch_number,branch_name,city,state,region_code"),
        selectAll<BranchMatchRow>(
          client,
          "abc_price_agreement_branch_matches",
          "ship_to_number,branch_number,abc_price_agreement_id,match_type,confidence_score",
        ),
        selectAll<ShipToBranchRow>(client, "abc_ship_to_branch_access", "ship_to_number,branch_number,home_branch,branch_name"),
        selectAll<InvoiceDocumentRow>(client, "invoice_documents", "id,invoice_number,payment_status,original_filename,extraction_status"),
      ]);

    const agreementById = new Map(agreements.map((agreement) => [agreement.id, agreement]));
    const invoiceByNumber = new Map(invoices.map((invoice) => [invoice.invoice_number, invoice]));
    const orderByNumber = new Map(orders.map((order) => [order.order_number, order]));
    const branchByNumber = new Map(branches.map((branch) => [branch.branch_number, branch]));
    const documentByInvoice = new Map(invoiceDocuments.map((document) => [document.invoice_number, document]));
    const itemsBySku = new Map<string, PriceListItemRow[]>();
    const shipToBranchByShipTo = new Map<string, ShipToBranchRow>();
    const branchMatchIds = new Map<string, Set<string>>();

    for (const item of priceItems) {
      if (!item.item_number) continue;
      const list = itemsBySku.get(item.item_number) ?? [];
      list.push(item);
      itemsBySku.set(item.item_number, list);
    }

    for (const branchAccess of shipToBranches) {
      if (!branchAccess.ship_to_number) continue;
      const existing = shipToBranchByShipTo.get(branchAccess.ship_to_number);
      if (!existing || branchAccess.home_branch) shipToBranchByShipTo.set(branchAccess.ship_to_number, branchAccess);
    }

    for (const match of branchMatches) {
      if (!match.ship_to_number || !match.branch_number || !match.abc_price_agreement_id) continue;
      const key = `${match.ship_to_number}|${match.branch_number}`;
      const ids = branchMatchIds.get(key) ?? new Set<string>();
      ids.add(match.abc_price_agreement_id);
      branchMatchIds.set(key, ids);
    }

    const rows: AgreementGapRow[] = [];
    let reviewedInvoiceLineCount = 0;

    for (const line of invoiceLines) {
      const invoice = invoiceByNumber.get(line.invoice_number);
      const invoiceDocument = documentByInvoice.get(line.invoice_number);
      const paymentStatus = compact(invoiceDocument?.payment_status, "unpaid");
      if (isPaidPaymentStatus(paymentStatus)) continue;
      reviewedInvoiceLineCount += 1;
      const order = invoice?.order_number ? orderByNumber.get(invoice.order_number) : undefined;
      const fallbackBranch = invoice?.ship_to_number ? shipToBranchByShipTo.get(invoice.ship_to_number) : undefined;
      const branchNumber = order?.branch_number ?? fallbackBranch?.branch_number ?? "Unknown";
      const branch = branchByNumber.get(branchNumber);
      const branchRegion = branch?.region_code ?? "Unknown";
      const invoiceDate = toDate(invoice?.invoice_date);
      const itemNumber = compact(line.item_number, "Missing SKU");
      const skuItems = itemsBySku.get(itemNumber) ?? [];
      const matchedAgreementIds = branchMatchIds.get(`${invoice?.ship_to_number ?? ""}|${branchNumber}`) ?? new Set<string>();

      const candidates: Candidate[] = skuItems
        .map((item) => {
          const agreement = item.agreement_id ? agreementById.get(item.agreement_id) : undefined;
          if (!agreement) return null;
          let scope: Candidate["scope"] | null = null;
          if (agreement.branch_number === branchNumber) scope = "branch";
          else if (matchedAgreementIds.has(agreement.id)) scope = "ship-to match";
          else if (agreement.region_code && branch?.region_code && agreement.region_code === branch.region_code) scope = "region";
          return scope ? { agreement, item, scope } : null;
        })
        .filter((candidate): candidate is Candidate => Boolean(candidate));

      const pdfCandidates = candidates.filter((candidate) => isPdfAgreement(candidate.agreement));
      const apiCandidates = candidates
        .filter((candidate) => isApiAgreement(candidate.agreement))
        .sort((a, b) => {
          const scopeRank: Record<Candidate["scope"], number> = { branch: 0, "ship-to match": 1, region: 2 };
          return scopeRank[a.scope] - scopeRank[b.scope] || dateTime(b.agreement.effective_date) - dateTime(a.agreement.effective_date);
        });
      const fixedCandidates = pdfCandidates.filter((candidate) => hasFixedWindow(candidate.agreement));
      const activeAtInvoice = fixedCandidates.find((candidate) => isActiveOn(candidate.agreement, invoiceDate));
      const activeToday = fixedCandidates.find((candidate) => isActiveOn(candidate.agreement, TODAY));
      const pastAgreement =
        fixedCandidates
          .filter((candidate) => {
            const expiry = toDate(candidate.agreement.expiry_date);
            return Boolean(expiry && invoiceDate && expiry < invoiceDate);
          })
          .sort(agreementSortDesc)[0] ?? null;
      const futureAgreement =
        fixedCandidates
          .filter((candidate) => {
            const effective = toDate(candidate.agreement.effective_date);
            return Boolean(effective && invoiceDate && effective > invoiceDate);
          })
          .sort(agreementSortAsc)[0] ?? null;
      const apiReference = apiCandidates[0] ?? null;
      const nonFixedAgreement =
        candidates.find((candidate) => !hasFixedWindow(candidate.agreement) && !isApiAgreement(candidate.agreement)) ?? null;
      const referenceAgreement = activeAtInvoice ?? activeToday ?? pastAgreement ?? futureAgreement ?? apiReference ?? nonFixedAgreement;
      const invoicePrice = getInvoicePrice(line.raw);
      const referencePrice = toNumber(referenceAgreement?.item.unit_price);
      const variance = invoicePrice !== null && referencePrice !== null ? invoicePrice - referencePrice : null;
      const variancePct = variance !== null && referencePrice ? variance / referencePrice : null;
      const invoiceUom = getInvoiceUom(line.raw);
      const agreementUom = compact(referenceAgreement?.item.unit, "");
      const reasons: GapReason[] = [];

      if (invoicePrice === null) reasons.push({ code: "missing_invoice_price", label: "Missing invoice price" });
      if (!skuItems.length) reasons.push({ code: "no_price_list_item", label: "No price-list item" });
      else if (!candidates.length) reasons.push({ code: "no_branch_agreement", label: "No branch agreement" });

      if (!pdfCandidates.length && skuItems.length && candidates.length) {
        if (apiReference) {
          reasons.push({ code: "no_pdf_price_agreement", label: "No PDF mapped" });
          if (invoicePrice === null || referencePrice === null) {
            reasons.push({ code: "no_pdf_api_missing", label: "No PDF and missing API price" });
          } else if (priceMatches(invoicePrice, referencePrice)) {
            reasons.push({ code: "no_pdf_api_match", label: "API price matches invoice" });
          } else {
            reasons.push({ code: "no_pdf_api_mismatch", label: "API price does not match invoice" });
          }
        } else {
          reasons.push({ code: "no_pdf_no_api_agreement", label: "No PDF/API agreement" });
        }
      }

      if (!fixedCandidates.length && skuItems.length && !apiReference) {
        reasons.push({ code: "no_fixed_agreement", label: "No fixed date window" });
      } else if (fixedCandidates.length && !activeAtInvoice) {
        if (pastAgreement) reasons.push({ code: "expired_agreement", label: "Expired at invoice date" });
        else if (futureAgreement) reasons.push({ code: "future_agreement", label: "Future-dated agreement" });
        else reasons.push({ code: "no_fixed_agreement", label: "No fixed date window" });
      }

      const fixedReference = activeAtInvoice ?? activeToday;
      if (fixedReference && !fixedReference.agreement.ceo_verified) {
        reasons.push({ code: "unverified_agreement", label: "Not CEO verified" });
      }

      if (variance !== null && Math.abs(variance) > 0.005) {
        reasons.push({ code: "price_variance", label: "Price variance" });
      }

      if (agreementUom && invoiceUom !== "Missing" && agreementUom.toLowerCase() !== invoiceUom.toLowerCase()) {
        reasons.push({ code: "uom_mismatch", label: "UOM mismatch" });
      }

      const gapReasons = uniqueReasons(reasons);
      if (!gapReasons.length) continue;

      const severity = chooseSeverity(gapReasons);
      const orderName = compact(order?.order_name ?? invoice?.order_name, "Missing order name");
      const purchaseOrderNumber = compact(order?.purchase_order_number ?? invoice?.purchase_order_number, "Missing PO");
      const branchName = toBranchLabel(branch, branchNumber);
      const humanAction = chooseHumanAction(gapReasons);
      const evidenceStatus = evidenceStatusFrom(gapReasons, referenceAgreement);
      const invoiceEvidenceLabel = compact(invoiceDocument?.original_filename, `Invoice PDF metadata missing for ${line.invoice_number}`);
      const invoiceEvidenceStatus = compact(invoiceDocument?.extraction_status, "document not linked");
      const acculynxJobNumber = extractAcculynxJobNumber(
        [purchaseOrderNumber, orderName, invoice?.order_number, invoice?.order_name],
        branchRegion,
      );

      rows.push({
        id: `${line.invoice_number}-${line.line_key ?? line.line_number ?? itemNumber}`,
        severity,
        invoiceNumber: line.invoice_number,
        invoiceDate: invoice?.invoice_date ?? null,
        lineNumber: compact(line.line_number ?? line.line_key, "Line"),
        itemNumber,
        itemDescription: compact(line.item_description ?? line.raw?.itemDescription, "Missing description"),
        branchNumber,
        branchName,
        branchRegion,
        orderName,
        purchaseOrderNumber,
        paymentStatus,
        vendorName: ABC_VENDOR_NAME,
        acculynxJobNumber,
        invoiceEvidenceLabel,
        invoiceEvidenceStatus,
        quantity: getInvoiceQuantity(line.raw),
        invoiceUom,
        invoicePrice,
        referencePrice,
        variance,
        variancePct,
        pastAgreement: formatAgreement(pastAgreement, "No past fixed agreement"),
        currentAgreement: formatAgreement(activeToday, "No current fixed agreement"),
        referenceAgreement: formatAgreement(referenceAgreement, "No agreement reference"),
        agreementSource: formatAgreementSource(referenceAgreement),
        evidenceStatus: evidenceStatus.status,
        evidenceStatusLabel: evidenceStatus.label,
        gapReasons,
        humanAction,
        escalationPayload: `${humanAction} Branch ${branchNumber}, SKU ${itemNumber}, invoice ${line.invoice_number}, PO ${purchaseOrderNumber}.`,
      });
    }

    rows.sort((a, b) => {
      const severityRank: Record<GapSeverity, number> = { critical: 0, blocked: 1, review: 2 };
      return (
        severityRank[a.severity] - severityRank[b.severity] ||
        (a.paymentStatus === "unpaid" ? -1 : 0) - (b.paymentStatus === "unpaid" ? -1 : 0) ||
        Math.abs(b.variance ?? 0) - Math.abs(a.variance ?? 0) ||
        dateTime(b.invoiceDate) - dateTime(a.invoiceDate)
      );
    });

    const hasReason = (code: string) => rows.filter((row) => row.gapReasons.some((reason) => reason.code === code)).length;
    const branchesSummary = summarizeBranches(rows);

    return {
      status: "live",
      generatedAt: new Date().toISOString(),
      missingConfig: [],
      errors: [],
      totals: {
        invoiceLines: reviewedInvoiceLineCount,
        gapRows: rows.length,
        criticalRows: rows.filter((row) => row.severity === "critical").length,
        blockedRows: rows.filter((row) => row.severity === "blocked").length,
        reviewRows: rows.filter((row) => row.severity === "review").length,
        missingPriceListItems: hasReason("no_price_list_item"),
        missingBranchAgreements: hasReason("no_branch_agreement"),
        missingFixedAgreements: hasReason("no_fixed_agreement"),
        expiredAgreements: hasReason("expired_agreement"),
        futureAgreements: hasReason("future_agreement"),
        unverifiedAgreements: hasReason("unverified_agreement"),
        varianceRows: hasReason("price_variance"),
        absoluteVariance: rows.reduce((sum, row) => sum + Math.abs(row.variance ?? 0), 0),
      },
      rows,
      branches: branchesSummary,
    };
  } catch (error) {
    return {
      status: "degraded",
      generatedAt: new Date().toISOString(),
      missingConfig: [],
      errors: [error instanceof Error ? error.message : "Unknown price-agreement gap error"],
      totals: {
        invoiceLines: 0,
        gapRows: 0,
        criticalRows: 0,
        blockedRows: 0,
        reviewRows: 0,
        missingPriceListItems: 0,
        missingBranchAgreements: 0,
        missingFixedAgreements: 0,
        expiredAgreements: 0,
        futureAgreements: 0,
        unverifiedAgreements: 0,
        varianceRows: 0,
        absoluteVariance: 0,
      },
      rows: [],
      branches: [],
    };
  }
}
