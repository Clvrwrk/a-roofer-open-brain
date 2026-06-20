// Price Agreement Audit — PE Office → Vendor/Branch → Item Category → Item drill-down
// over the negotiated ABC price agreements (abc_price_agreements + abc_price_list_items),
// matched to branches via abc_price_agreement_branch_matches and rolled up to the PE
// office that services each branch (vendor_branches.pricing_territory_office_id).
//
// Mirrors the Invoice Audit hierarchy so the two dashboards read the same way. Items
// carry the roof-system category (schema 114). API price lists (agreement_number
// 'API-%') are non-negotiated: they flag a branch but never contribute drill-down items.
//
// KPIs: branch-coverage rate per office (branches with a CURRENT negotiated agreement /
// total branches assigned to the office), averaged across offices; expired; expiring ≤30d.

import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

export type PaLifecycle = "active" | "expiring" | "expired" | "no_expiry";

export interface PaItem {
  itemNumber: string;
  description: string;
  uom: string;
  unitPrice: number;        // negotiated price (0 if API-only, not in the agreement)
  hasNegotiated: boolean;   // the branch's agreement covers this item
  apiPrice: number | null;  // current ABC API price at this branch (monthly seed, migration 134)
  apiUom: string;
  variancePct: number | null; // (negotiated - api) / api * 100, when both exist
  categoryKey: string;
}

export interface PaCategory {
  key: string;
  label: string;
  sortOrder: number;
  itemCount: number;
  items: PaItem[];
}

export interface PaBranch {
  branchCode: string;
  branchName: string;
  office: string;
  agreementId: number | null;
  agreementNumber: string;
  versionLabel: string;
  effective: string;
  expiry: string;
  lifecycle: PaLifecycle;
  daysToExpiry: number | null;
  ceoVerified: boolean;
  salesRep: string;
  itemCount: number;
  covered: boolean; // has a current (non-expired) negotiated agreement
  apiNonNegotiated: boolean; // branch also/only carries an API (non-negotiated) price list
  needsAction: boolean; // priced + expired/expiring
  renewalRequested: boolean;
  renewalRequestedAt: string;
  agreementPdfUrl: string; // source file for the purple Agreement pill → PDF
  categories: PaCategory[];
}

export interface PaOffice {
  office: string;
  totalBranches: number; // denominator: branches assigned to this office
  coveredBranches: number; // branches with a current negotiated agreement
  coverageRate: number; // 0..1
  matchedBranchCount: number;
  itemCount: number;
  expired: number;
  expiring: number;
  apiBranches: number;
  branches: PaBranch[];
}

export interface PriceAgreementAudit {
  status: "live" | "unconfigured";
  generatedAt: string;
  offices: PaOffice[];
  categories: { key: string; label: string; sortOrder: number }[];
  totals: {
    coverageAvg: number; // 0..1, averaged across offices with a denominator
    expired: number;
    expiring: number;
    negotiatedAgreements: number;
    branchesCovered: number;
    items: number;
    apiBranches: number;
    needsAction: number;
    gpaItems: number;          // size of the Global Price Agreement item set (the scope)
    apiCoveragePct: number;    // 0..1 — GPA items with a live API price / gpaItems
    negotiatedPct: number;     // 0..1 — GPA items with a negotiated price / gpaItems
    avgVariancePct: number | null; // mean |negotiated - api| / api across covered cells
  };
}

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const d10 = (v: unknown) => (v ? String(v).slice(0, 10) : "");
const normBranch = (v: unknown) => String(v ?? "").trim().replace(/^0+/, "") || String(v ?? "").trim();
const isApiAgreement = (number: string | null) => /^API-/i.test(number ?? "");

function lifecycleOf(expiry: string): { lifecycle: PaLifecycle; daysToExpiry: number | null } {
  if (!expiry) return { lifecycle: "no_expiry", daysToExpiry: null };
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  const exp = new Date(expiry + "T00:00:00Z").getTime();
  const days = Math.round((exp - today) / 86400000);
  if (days < 0) return { lifecycle: "expired", daysToExpiry: days };
  if (days <= 30) return { lifecycle: "expiring", daysToExpiry: days };
  return { lifecycle: "active", daysToExpiry: days };
}

export async function loadPriceAgreementAudit(env: RuntimeEnv = getRuntimeEnv()): Promise<PriceAgreementAudit> {
  const empty: PriceAgreementAudit = {
    status: "unconfigured",
    generatedAt: new Date().toISOString(),
    offices: [],
    categories: [],
    totals: { coverageAvg: 0, expired: 0, expiring: 0, negotiatedAgreements: 0, branchesCovered: 0, items: 0, apiBranches: 0, needsAction: 0, gpaItems: 0, apiCoveragePct: 0, negotiatedPct: 0, avgVariancePct: null },
  };
  const { client } = createServerSupabaseClient(env);
  if (!client) return empty;

  const fetchAll = async (make: () => any): Promise<any[]> => {
    const PAGE = 1000;
    let from = 0;
    const rows: any[] = [];
    for (;;) {
      const { data } = await make().range(from, from + PAGE - 1);
      const batch = (data as any[] | null) ?? [];
      rows.push(...batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }
    return rows;
  };

  // GPA scope: the approved Global Price Agreement item set (53 families / 99 SKUs).
  const gpaRows = await fetchAll(() => client.from("frequently_ordered_import").select("item_number"));
  const gpaSet = new Set<string>((gpaRows as any[]).map((r) => r.item_number).filter(Boolean));
  const gpaList = [...gpaSet];

  const [agRows, matchRows, itemRows, catRows, vbRows, officeRows, reqRows, gpaCatRows, apiRows] = await Promise.all([
    fetchAll(() => client.from("abc_price_agreements").select("id,agreement_number,version_label,abc_account_number,sales_rep,effective_date,expiry_date,ceo_verified,source_file")),
    fetchAll(() => client.from("abc_price_agreement_branch_matches").select("abc_price_agreement_id,branch_number,confidence_score")),
    fetchAll(() => client.from("abc_price_list_items").select("agreement_id,item_number,description,unit,unit_price,category_key")),
    fetchAll(() => client.from("roof_system_category").select("key,label,sort_order").order("sort_order")),
    fetchAll(() => client.from("vendor_branches").select("branch_number,branch_name,pricing_territory_office_id,is_active")),
    fetchAll(() => client.from("office").select("id,name")),
    fetchAll(() => client.from("price_refresh_request").select("agreement_id,status,created_at").eq("reason", "agreement_renewal").in("status", ["awaiting_verification", "approved", "ready_to_send", "sent"])),
    // GPA item master (description + roof-system category) for items not in a branch's agreement.
    fetchAll(() => client.from("abc_product_catalog").select("item_number,item_description,category_key").in("item_number", gpaList)),
    // Current ABC API price per item per branch (monthly seed, migration 134).
    fetchAll(() => client.from("v_branch_item_api_price").select("item_number,branch_number_norm,api_price,api_uom")),
  ]);
  if (agRows.length === 0) return empty;

  // GPA item master + branch-tied API price lookups.
  const gpaMaster = new Map<string, { description: string; categoryKey: string }>();
  for (const g of gpaCatRows as any[]) gpaMaster.set(g.item_number, { description: g.item_description ?? "", categoryKey: g.category_key || "uncategorized" });
  const apiByKey = new Map<string, { price: number; uom: string }>(); // item|branchNorm → API price
  const apiItems = new Set<string>(); // GPA items with any API price (for the coverage KPI)
  for (const r of apiRows as any[]) {
    apiByKey.set(`${r.item_number}|${r.branch_number_norm}`, { price: num(r.api_price), uom: r.api_uom ?? "" });
    if (gpaSet.has(r.item_number)) apiItems.add(r.item_number);
  }

  const categories = catRows.map((c) => ({ key: c.key, label: c.label, sortOrder: num(c.sort_order) }));
  const catLabel = new Map(categories.map((c) => [c.key, c]));

  // office id -> name
  const officeName = new Map<string, string>();
  for (const o of officeRows) officeName.set(o.id, o.name);

  // normalized branch number -> { name, office, total denominator counts }
  const branchInfo = new Map<string, { name: string; office: string }>();
  const officeDenominator = new Map<string, number>(); // office -> total assigned branches
  for (const vb of vbRows) {
    const norm = normBranch(vb.branch_number);
    if (!norm) continue;
    const office = vb.pricing_territory_office_id ? (officeName.get(vb.pricing_territory_office_id) ?? "Unassigned") : "Unassigned";
    if (!branchInfo.has(norm)) branchInfo.set(norm, { name: vb.branch_name || `Branch ${norm}`, office });
    if (vb.pricing_territory_office_id && office !== "Unassigned") officeDenominator.set(office, (officeDenominator.get(office) ?? 0) + 1);
  }

  // Negotiated price info per agreement, keyed by item — SCOPED to the GPA item set
  // ("only these items should be loaded; all others removed"). Non-GPA items are dropped here.
  type NegInfo = { unitPrice: number; uom: string; description: string; categoryKey: string };
  const negByAgreement = new Map<number, Map<string, NegInfo>>();
  const negotiatedGpaItems = new Set<string>(); // GPA items with a negotiated price anywhere (for the KPI)
  for (const it of itemRows) {
    const itemNumber = it.item_number ?? "";
    if (!gpaSet.has(itemNumber)) continue; // GPA scope
    const aid = num(it.agreement_id);
    const m = negByAgreement.get(aid) ?? new Map<string, NegInfo>();
    m.set(itemNumber, {
      unitPrice: num(it.unit_price),
      uom: it.unit ?? "",
      description: it.description ?? gpaMaster.get(itemNumber)?.description ?? "",
      categoryKey: it.category_key || gpaMaster.get(itemNumber)?.categoryKey || "uncategorized",
    });
    negByAgreement.set(aid, m);
    negotiatedGpaItems.add(itemNumber);
  }

  // agreement metadata
  const renewalByAgreement = new Map<number, any>();
  for (const r of reqRows) if (r.agreement_id != null) renewalByAgreement.set(num(r.agreement_id), r);

  interface AgMeta {
    id: number;
    number: string;
    versionLabel: string;
    salesRep: string;
    effective: string;
    expiry: string;
    ceoVerified: boolean;
    lifecycle: PaLifecycle;
    daysToExpiry: number | null;
    isApi: boolean;
    itemCount: number;
    sourceFile: string;
  }
  const agById = new Map<number, AgMeta>();
  for (const a of agRows) {
    const id = num(a.id);
    const expiry = d10(a.expiry_date);
    const { lifecycle, daysToExpiry } = lifecycleOf(expiry);
    agById.set(id, {
      id,
      number: a.agreement_number || `#${id}`,
      versionLabel: a.version_label || "",
      salesRep: a.sales_rep || "",
      effective: d10(a.effective_date),
      expiry,
      ceoVerified: !!a.ceo_verified,
      lifecycle,
      daysToExpiry,
      isApi: isApiAgreement(a.agreement_number),
      itemCount: (negByAgreement.get(id)?.size ?? 0), // GPA-scoped item count
      sourceFile: a.source_file || "",
    });
  }

  // Avg variance KPI accumulator (|negotiated - api| / api across covered cells).
  const varianceSamples: number[] = [];

  // branch (normalized) -> matched agreements
  const agreementsByBranch = new Map<string, Set<number>>();
  for (const m of matchRows) {
    const norm = normBranch(m.branch_number);
    const aid = num(m.abc_price_agreement_id);
    if (!norm || !agById.has(aid)) continue;
    const set = agreementsByBranch.get(norm) ?? new Set<number>();
    set.add(aid);
    agreementsByBranch.set(norm, set);
  }

  // Pick the branch's primary negotiated agreement: prefer a current (non-expired) one
  // with the most items, else the most recently expired.
  const pickPrimary = (metas: AgMeta[]): AgMeta | null => {
    const negotiated = metas.filter((m) => !m.isApi);
    if (negotiated.length === 0) return null;
    const current = negotiated.filter((m) => m.lifecycle !== "expired");
    const pool = current.length ? current : negotiated;
    return pool.slice().sort((a, b) => {
      // current first, then most items, then latest expiry
      const ac = a.lifecycle !== "expired" ? 0 : 1;
      const bc = b.lifecycle !== "expired" ? 0 : 1;
      return ac - bc || b.itemCount - a.itemCount || (b.expiry || "").localeCompare(a.expiry || "");
    })[0];
  };

  // Distinct branches carrying an API (non-negotiated) price list — counted independently
  // so the KPI reflects all of them even though API-only branches aren't rendered as rows.
  const apiBranchSet = new Set<string>();
  for (const [norm, aidSet] of agreementsByBranch) {
    if ([...aidSet].some((id) => agById.get(id)?.isApi)) apiBranchSet.add(norm);
  }

  const branches: PaBranch[] = [];
  for (const [norm, aidSet] of agreementsByBranch) {
    const metas = [...aidSet].map((id) => agById.get(id)!).filter(Boolean);
    const info = branchInfo.get(norm) ?? { name: `Branch ${norm}`, office: "Unassigned" };
    const apiNonNegotiated = metas.some((m) => m.isApi);
    const primary = pickPrimary(metas);

    // Per branch, show every GPA item it has EITHER a negotiated price (from its primary
    // agreement) OR a current API price for (branch-tied). Negotiated + API sit side-by-side
    // with the variance between them.
    const negMap = primary ? (negByAgreement.get(primary.id) ?? new Map()) : new Map<string, NegInfo>();
    const itemsOut: PaItem[] = [];
    for (const itemNumber of gpaSet) {
      const neg = negMap.get(itemNumber) as NegInfo | undefined;
      const api = apiByKey.get(`${itemNumber}|${norm}`);
      if (!neg && !api) continue; // no price of either kind at this branch → not shown
      const unitPrice = neg ? neg.unitPrice : 0;
      const apiPrice = api ? api.price : null;
      const variancePct = neg && apiPrice != null && apiPrice !== 0 ? ((unitPrice - apiPrice) / apiPrice) * 100 : null;
      if (variancePct != null) varianceSamples.push(Math.abs(variancePct));
      itemsOut.push({
        itemNumber,
        description: neg?.description || gpaMaster.get(itemNumber)?.description || "",
        uom: neg?.uom || api?.uom || "",
        unitPrice,
        hasNegotiated: !!neg,
        apiPrice,
        apiUom: api?.uom ?? "",
        variancePct,
        categoryKey: neg?.categoryKey || gpaMaster.get(itemNumber)?.categoryKey || "uncategorized",
      });
    }
    const itemCount = itemsOut.length;
    const byCat = new Map<string, PaItem[]>();
    for (const it of itemsOut) (byCat.get(it.categoryKey) ?? (byCat.set(it.categoryKey, []), byCat.get(it.categoryKey)!)).push(it);
    const categoriesOut: PaCategory[] = [...byCat.entries()]
      .map(([key, list]) => ({
        key,
        label: catLabel.get(key)?.label ?? key,
        sortOrder: catLabel.get(key)?.sortOrder ?? 998,
        itemCount: list.length,
        items: list.sort((a, b) => a.itemNumber.localeCompare(b.itemNumber)),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    // Render negotiated branches (the auditable catalog) AND API-only branches (flagged,
    // no items). Skip only branches with no agreement of either kind.
    if (!primary && !apiNonNegotiated) continue;

    const covered = !!primary && primary.lifecycle !== "expired";
    const needsAction = !!primary && primary.itemCount > 0 && (primary.lifecycle === "expired" || primary.lifecycle === "expiring");
    branches.push({
      branchCode: norm,
      branchName: info.name,
      office: info.office,
      agreementId: primary?.id ?? null,
      agreementNumber: primary?.number ?? "",
      versionLabel: primary?.versionLabel ?? "",
      effective: primary?.effective ?? "",
      expiry: primary?.expiry ?? "",
      lifecycle: primary?.lifecycle ?? "no_expiry",
      daysToExpiry: primary?.daysToExpiry ?? null,
      ceoVerified: primary?.ceoVerified ?? false,
      salesRep: primary?.salesRep ?? "",
      itemCount,
      covered,
      apiNonNegotiated,
      needsAction,
      renewalRequested: primary ? renewalByAgreement.has(primary.id) : false,
      renewalRequestedAt: primary && renewalByAgreement.get(primary.id)?.created_at ? String(renewalByAgreement.get(primary.id).created_at).slice(0, 10) : "",
      agreementPdfUrl: primary?.sourceFile ?? "",
      categories: categoriesOut,
    });
  }

  // Group branches into offices. Item counts are over DISTINCT agreements (an agreement
  // covering N branches is one catalog, not N) so office/total item counts aren't inflated.
  const officeMap = new Map<string, PaOffice>();
  const officeAgIds = new Map<string, Set<number>>();
  for (const br of branches) {
    let off = officeMap.get(br.office);
    if (!off) {
      off = {
        office: br.office,
        totalBranches: officeDenominator.get(br.office) ?? 0,
        coveredBranches: 0,
        coverageRate: 0,
        matchedBranchCount: 0,
        itemCount: 0,
        expired: 0,
        expiring: 0,
        apiBranches: 0,
        branches: [],
      };
      officeMap.set(br.office, off);
      officeAgIds.set(br.office, new Set<number>());
    }
    off.branches.push(br);
    off.matchedBranchCount++;
    if (br.agreementId) officeAgIds.get(br.office)!.add(br.agreementId);
    if (br.covered) off.coveredBranches++;
    if (br.lifecycle === "expired") off.expired++;
    if (br.lifecycle === "expiring") off.expiring++;
    if (br.apiNonNegotiated) off.apiBranches++;
  }

  const offices = [...officeMap.values()].map((o) => {
    o.itemCount = [...(officeAgIds.get(o.office) ?? [])].reduce((s, id) => s + (agById.get(id)?.itemCount ?? 0), 0);
    // Denominator falls back to matched branches when the office has no assigned-branch count.
    const denom = o.totalBranches || o.matchedBranchCount;
    o.totalBranches = denom;
    o.coverageRate = denom > 0 ? o.coveredBranches / denom : 0;
    o.branches.sort((a, b) => {
      const rank = (x: PaBranch) => (x.needsAction && x.lifecycle === "expired" ? 0 : x.needsAction ? 1 : x.covered ? 2 : 3);
      return rank(a) - rank(b) || b.itemCount - a.itemCount || a.branchName.localeCompare(b.branchName);
    });
    return o;
  });
  // Real offices first (by coverage), Unassigned last.
  offices.sort((a, b) => {
    if (a.office === "Unassigned") return 1;
    if (b.office === "Unassigned") return -1;
    return b.coverageRate - a.coverageRate || b.itemCount - a.itemCount;
  });

  const coverageOffices = offices.filter((o) => o.office !== "Unassigned" && o.totalBranches > 0);
  const coverageAvg = coverageOffices.length ? coverageOffices.reduce((s, o) => s + o.coverageRate, 0) / coverageOffices.length : 0;

  return {
    status: "live",
    generatedAt: new Date().toISOString(),
    offices,
    categories,
    totals: {
      coverageAvg,
      expired: branches.filter((b) => b.agreementId && b.lifecycle === "expired").length,
      expiring: branches.filter((b) => b.agreementId && b.lifecycle === "expiring").length,
      negotiatedAgreements: [...agById.values()].filter((a) => !a.isApi && a.itemCount > 0).length,
      branchesCovered: branches.filter((b) => b.covered).length,
      // Distinct negotiated line items actually surfaced (one agreement counted once).
      items: [...new Set(branches.map((b) => b.agreementId).filter((id): id is number => id != null))].reduce((s, id) => s + (agById.get(id)?.itemCount ?? 0), 0),
      apiBranches: apiBranchSet.size,
      needsAction: branches.filter((b) => b.needsAction).length,
      // GPA scope coverage: of the 99 Global Price Agreement items, how many have a live API
      // price vs a negotiated price; plus the average |negotiated − API| spread.
      gpaItems: gpaSet.size,
      apiCoveragePct: gpaSet.size ? apiItems.size / gpaSet.size : 0,
      negotiatedPct: gpaSet.size ? negotiatedGpaItems.size / gpaSet.size : 0,
      avgVariancePct: varianceSamples.length ? varianceSamples.reduce((s, v) => s + v, 0) / varianceSamples.length : null,
    },
  };
}
