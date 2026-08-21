// Price-agreement TERRITORY COVERAGE — who inherits which price list.
//
// Reads the four prod views (v_office_vendor_inheritance / _branch / _price_item).
// Business rules are already encoded in SQL; this layer only shapes + labels them:
//   - An agreement held by ANY branch in an office's 2-hour drive-time ring is inherited
//     by every branch of that vendor in the ring.
//   - Competing agreements resolve PER ITEM, lowest price wins (v_office_vendor_price_item).
//   - EVERGREEN: is_lapsed means "extended, awaiting replacement" — NOT invalid.
//   - A branch inside two office rings appears under BOTH offices. Intentional.

import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";
import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;
const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const str = (v: unknown) => (v == null ? "" : String(v));

export type CoverageRole = "Primary" | "Region-covered" | "Inherits";

export interface CoverageBranch {
  vendorBranchId: string;
  branchKey: string;
  branchNumber: string;
  branchName: string;
  city: string;
  state: string;
  address: string;
  phone: string;
  managerName: string;
  managerEmail: string;
  salesRepName: string;
  milesFromOffice: number | null;
  agreementId: string | null;
  agreementNumber: string | null;
  agreementSource: string | null;
  agreementScope: "branch" | "region" | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  isLapsed: boolean;
  ceoVerified: boolean;
  holdsAgreement: boolean;
  isPrimaryBranch: boolean;
  role: CoverageRole;
}

export interface CoverageVendor {
  vendorId: string;
  vendorSlug: string;
  vendorName: string;
  branchesInTerritory: number;
  primaryBranches: number;
  regionCoveredBranches: number;
  branchesInheriting: number;
  competingAgreements: number;
  anyLapsed: boolean;
  allVerified: boolean;
  pricedItems: number;
  hasGap: boolean;
  /** Chris's ruling for this pair, from office_vendor_agreement_status via mig 265. */
  agreementStatus: string;
  /**
   * The pair's no-price behaviour is ACCEPTED, so it is not work to chase.
   * QXO is no_book at every office by Chris's 2026-08-20 ruling.
   */
  isAccepted: boolean;
  /** Invoices booked against this office x vendor (v_office_vendor_spend). */
  invoiceCount: number;
  /**
   * Invoice TOTAL booked against this office x vendor. Note this is not the same as
   * un-audited value: it includes tax, freight, and lines the separate line-level path
   * does price. Denver x SRS reads $17,437.63 here while only $13,464.80 of line value is
   * actually unpriced. Label it as spend, never as "un-audited".
   */
  spend: number;
  branches: CoverageBranch[];
}

export interface CoverageOffice {
  officeId: string;
  officeName: string;
  officeState: string;
  vendors: CoverageVendor[];
}

export interface PriceAgreementCoverage {
  status: "live" | "unconfigured";
  generatedAt: string;
  offices: CoverageOffice[];
  totals: {
    offices: number;
    vendors: number;
    branchRows: number;
    primaryBranches: number;
    regionCoveredBranches: number;
    branchesInheriting: number;
    pricedItems: number;
    gaps: number;
    lapsedVendors: number;
    /** Gaps carrying real spend, including ones whose no-price state is accepted. */
    gapsWithSpend: number;
    /** Gaps with spend that nobody has accepted — the actual chase queue. */
    gapsToChase: number;
    /** Invoice total at gap pairs. NOT the un-audited figure; see CoverageVendor.spend. */
    gapSpend: number;
    /** Invoice total at gap pairs excluding accepted (no_book) rulings. */
    chaseSpend: number;
    /** Spend that resolves to no office at all (v_unresolved_branch_spend). */
    unresolvedSpend: number;
  };
}

async function selectAll<T = any>(client: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await client.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
    from += batch.length;
  }
}

function branchRole(row: any): CoverageRole {
  if (row.is_primary_branch === true) return "Primary";
  if (row.agreement_scope === "region") return "Region-covered";
  return "Inherits";
}

const ROLE_ORDER: Record<CoverageRole, number> = { Primary: 0, "Region-covered": 1, Inherits: 2 };

/**
 * Rulings whose no-price behaviour is ACCEPTED. A pair carrying one of these is not work,
 * regardless of how much money runs through it — QXO is `no_book` at every office by Chris's
 * 2026-08-20 ruling, so surfacing it as a gap to chase is a false alarm every single week.
 */
const ACCEPTED_STATUSES = new Set(["no_book", "not_pursued"]);

/**
 * Split coverage gaps into what is actually actionable.
 *
 * Three distinctions matter, and conflating any two of them produces a misleading number:
 *
 *  1. A gap with no invoices is theoretical — branches sit in the ring, nothing was bought.
 *  2. A gap whose ruling is `no_book` is accepted by a human; it costs money but is not work.
 *  3. `spend` is the invoice TOTAL, which includes tax, freight, and lines the separate
 *     line-level path does price. It is NOT the un-audited figure and must not be labelled
 *     as one — Denver x SRS reads $17,437.63 of spend against $13,464.80 of unpriced line
 *     value.
 */
export function gapExposure(
  vendors: Pick<CoverageVendor, "hasGap" | "invoiceCount" | "spend" | "isAccepted">[],
): { gapsWithSpend: number; gapsToChase: number; gapSpend: number; chaseSpend: number } {
  const gaps = vendors.filter((v) => v.hasGap);
  const withSpend = gaps.filter((v) => v.invoiceCount > 0);
  const toChase = withSpend.filter((v) => !v.isAccepted);
  return {
    gapsWithSpend: withSpend.length,
    gapsToChase: toChase.length,
    gapSpend: gaps.reduce((s, v) => s + v.spend, 0),
    chaseSpend: toChase.reduce((s, v) => s + v.spend, 0),
  };
}

export async function loadPriceAgreementCoverage(
  env: RuntimeEnv = getRuntimeEnv(),
): Promise<PriceAgreementCoverage> {
  const empty: PriceAgreementCoverage = {
    status: "unconfigured",
    generatedAt: new Date().toISOString(),
    offices: [],
    totals: {
      offices: 0, vendors: 0, branchRows: 0, primaryBranches: 0, regionCoveredBranches: 0,
      branchesInheriting: 0, pricedItems: 0, gaps: 0, lapsedVendors: 0,
      gapsWithSpend: 0, gapsToChase: 0, gapSpend: 0, chaseSpend: 0, unresolvedSpend: 0,
    },
  };
  const { client } = createServerSupabaseClient(env);
  if (!client) return empty;

  const [inhRows, branchRows, spendRows, unresolvedRows, rulingRows] = await Promise.all([
    selectAll<any>(
      client,
      "v_office_vendor_inheritance",
      "office_id,office_name,office_state,vendor_id,vendor_slug,vendor_name,branches_in_territory,primary_branches,region_covered_branches,branches_inheriting,competing_agreements,any_lapsed,all_verified,priced_items",
    ),
    selectAll<any>(
      client,
      "v_office_vendor_branch",
      "office_id,office_name,office_state,vendor_id,vendor_slug,vendor_name,vendor_branch_id,branch_key,branch_number_raw,branch_name,city,state,address,phone,manager_name,manager_email,sales_rep_name,miles_from_office,agreement_id,agreement_number,agreement_source,agreement_scope,effective_date,expiry_date,is_lapsed,ceo_verified,holds_agreement,is_primary_branch",
    ),
    selectAll<any>(client, "v_office_vendor_spend", "office_id,vendor_id,invoice_count,spend"),
    selectAll<any>(client, "v_unresolved_branch_spend", "reason,invoice_count,spend"),
    selectAll<any>(client, "v_office_vendor_gap_exposure", "office_id,vendor_id,agreement_status"),
  ]);
  if (inhRows.length === 0) return empty;

  // office+vendor → branch list
  const byOfficeVendor = new Map<string, CoverageBranch[]>();
  for (const b of branchRows) {
    const key = `${b.office_id}::${b.vendor_id}`;
    const list = byOfficeVendor.get(key) ?? [];
    list.push({
      vendorBranchId: str(b.vendor_branch_id),
      branchKey: str(b.branch_key),
      branchNumber: str(b.branch_number_raw),
      branchName: str(b.branch_name),
      city: str(b.city),
      state: str(b.state),
      address: str(b.address),
      phone: str(b.phone),
      managerName: str(b.manager_name),
      managerEmail: str(b.manager_email),
      salesRepName: str(b.sales_rep_name),
      milesFromOffice: b.miles_from_office == null ? null : Number(b.miles_from_office),
      agreementId: b.agreement_id == null ? null : String(b.agreement_id),
      agreementNumber: b.agreement_number == null ? null : String(b.agreement_number),
      agreementSource: b.agreement_source == null ? null : String(b.agreement_source),
      agreementScope: b.agreement_scope === "branch" || b.agreement_scope === "region" ? b.agreement_scope : null,
      effectiveDate: b.effective_date == null ? null : String(b.effective_date),
      expiryDate: b.expiry_date == null ? null : String(b.expiry_date),
      isLapsed: b.is_lapsed === true,
      ceoVerified: b.ceo_verified === true,
      holdsAgreement: b.holds_agreement === true,
      isPrimaryBranch: b.is_primary_branch === true,
      role: branchRole(b),
    });
    byOfficeVendor.set(key, list);
  }
  for (const list of byOfficeVendor.values()) {
    list.sort((a, b) => {
      const r = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
      if (r !== 0) return r;
      const am = a.milesFromOffice ?? Number.POSITIVE_INFINITY;
      const bm = b.milesFromOffice ?? Number.POSITIVE_INFINITY;
      if (am !== bm) return am - bm;
      return a.branchName.localeCompare(b.branchName);
    });
  }

  // office+vendor -> spend. A gap with no spend is theoretical; a gap with spend costs money.
  const spendByOfficeVendor = new Map<string, { invoiceCount: number; spend: number }>();
  for (const r of spendRows) {
    spendByOfficeVendor.set(`${str(r.office_id)}::${str(r.vendor_id)}`, {
      invoiceCount: num(r.invoice_count),
      spend: num(r.spend),
    });
  }

  // office+vendor -> Chris's ruling. A pair ruled no_book prices as no-price BY DESIGN and
  // must never appear in a "chase this" queue, however many dollars it carries.
  const rulingByOfficeVendor = new Map<string, string>();
  for (const r of rulingRows) {
    rulingByOfficeVendor.set(`${str(r.office_id)}::${str(r.vendor_id)}`, str(r.agreement_status));
  }

  const officeMap = new Map<string, CoverageOffice>();
  for (const r of inhRows) {
    const officeId = str(r.office_id);
    let office = officeMap.get(officeId);
    if (!office) {
      office = { officeId, officeName: str(r.office_name), officeState: str(r.office_state), vendors: [] };
      officeMap.set(officeId, office);
    }
    const primaryBranches = num(r.primary_branches);
    const regionCoveredBranches = num(r.region_covered_branches);
    office.vendors.push({
      vendorId: str(r.vendor_id),
      vendorSlug: str(r.vendor_slug),
      vendorName: str(r.vendor_name),
      branchesInTerritory: num(r.branches_in_territory),
      primaryBranches,
      regionCoveredBranches,
      branchesInheriting: num(r.branches_inheriting),
      competingAgreements: num(r.competing_agreements),
      anyLapsed: r.any_lapsed === true,
      allVerified: r.all_verified === true,
      pricedItems: num(r.priced_items),
      hasGap: primaryBranches + regionCoveredBranches === 0,
      agreementStatus: rulingByOfficeVendor.get(`${officeId}::${str(r.vendor_id)}`) ?? "unrecorded",
      isAccepted: ACCEPTED_STATUSES.has(rulingByOfficeVendor.get(`${officeId}::${str(r.vendor_id)}`) ?? ""),
      invoiceCount: spendByOfficeVendor.get(`${officeId}::${str(r.vendor_id)}`)?.invoiceCount ?? 0,
      spend: spendByOfficeVendor.get(`${officeId}::${str(r.vendor_id)}`)?.spend ?? 0,
      branches: byOfficeVendor.get(`${officeId}::${str(r.vendor_id)}`) ?? [],
    });
  }

  const offices = [...officeMap.values()]
    .map((o) => {
      o.vendors.sort((a, b) => b.branchesInTerritory - a.branchesInTerritory || a.vendorName.localeCompare(b.vendorName));
      return o;
    })
    .sort((a, b) => a.officeName.localeCompare(b.officeName));

  const allVendors = offices.flatMap((o) => o.vendors);
  return {
    status: "live",
    generatedAt: new Date().toISOString(),
    offices,
    totals: {
      offices: offices.length,
      vendors: allVendors.length,
      branchRows: branchRows.length,
      primaryBranches: allVendors.reduce((s, v) => s + v.primaryBranches, 0),
      regionCoveredBranches: allVendors.reduce((s, v) => s + v.regionCoveredBranches, 0),
      branchesInheriting: allVendors.reduce((s, v) => s + v.branchesInheriting, 0),
      pricedItems: allVendors.reduce((s, v) => s + v.pricedItems, 0),
      gaps: allVendors.filter((v) => v.hasGap).length,
      lapsedVendors: allVendors.filter((v) => v.anyLapsed).length,
      ...gapExposure(allVendors),
      unresolvedSpend: unresolvedRows.reduce((s, r) => s + num(r.spend), 0),
    },
  };
}
