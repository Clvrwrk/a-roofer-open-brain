import type { SupabaseClient } from "@supabase/supabase-js";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";
import { createServerSupabaseClient } from "@lib/supabase.server";
import territorySnapshotJson from "../data/vendor-territories-snapshot.json";

export type VendorTerritoryStatus = "live" | "degraded" | "unconfigured";
export type VendorTerritorySource = "live" | "snapshot" | "none";
export type VendorBranchPricingStatus = "covered" | "overlap_pending" | "out_of_boundary" | "unclassified";
export type BranchPriceEvidenceStatus = "pdf_price_agreement" | "api_only_pricing" | "no_price_agreement";
export type TerritoryMarkerPriority = "needs_office_route" | "missing_branch_pricing" | "vendor_brand";

interface RegionRow {
  id: string;
  region_code: string | null;
  region_name: string | null;
  primary_city: string | null;
  primary_state: string | null;
  is_active: boolean | null;
}

interface OfficeRow {
  id: string;
  name: string | null;
  office_type: string | null;
  region_id: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  drive_time_minutes: number | string | null;
  boundary_method: string | null;
  boundary_computed_at: string | null;
  is_active: boolean | null;
}

interface VendorRow {
  id: string;
  name: string | null;
  slug: string | null;
  is_active: boolean | null;
}

interface VendorBranchRow {
  id: string;
  vendor_id: string | null;
  region_id: string | null;
  branch_number: string | null;
  branch_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  geocode_status: string | null;
  geocode_precision: string | null;
  pricing_status: string | null;
  pricing_territory_office_id: string | null;
  suggested_office_id: string | null;
  territory_decided_by: string | null;
  territory_decided_at: string | null;
  is_active: boolean | null;
}

interface BranchTerritoryRow {
  vendor_branch_id: string;
  vendor_id: string | null;
  vendor_name: string | null;
  branch_number: string | null;
  branch_name: string | null;
  city: string | null;
  state: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  geocode_status: string | null;
  pricing_status: string | null;
  pricing_territory_office_id: string | null;
  assigned_office_name: string | null;
  suggested_office_id: string | null;
  suggested_office_name: string | null;
  territory_decided_by: string | null;
  territory_decided_at: string | null;
  pricing_approved: boolean | null;
  candidate_office_count: number | string | null;
}

interface CandidateRow {
  vendor_branch_id: string;
  office_id: string;
  drive_minutes: number | string | null;
  straight_km: number | string | null;
  is_suggested: boolean | null;
}

interface PriceAgreementRow {
  id: string;
  vendor_id: string | null;
  region_id: string | null;
  vendor_branch_id: string | null;
  agreement_number: string | null;
  version_label: string | null;
  account_number: string | null;
  effective_date: string | null;
  expiry_date: string | null;
  ceo_verified: boolean | null;
  is_active: boolean | null;
  source_file: string | null;
}

interface AbcAgreementEvidenceRow {
  branch_number: string | null;
  source_file: string | null;
}

interface AbcVendorBranchRow {
  branch_number: string | null;
  branch_name: string | null;
  address_json: unknown;
  contact_json: unknown;
  city: string | null;
  state: string | null;
  postal: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
}

interface SnapshotOffice {
  id: string;
  name: string;
  lat: number;
  lng: number;
  region: string;
  drive_time_minutes: number;
  boundary: {
    type: "Polygon";
    coordinates: number[][][];
  } | null;
}

interface SnapshotBranch {
  id: string;
  vendor: string;
  name: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
  status: string;
  assigned: string | null;
  suggested: string | null;
  approved: boolean;
  cands?: Array<{ o: string; km: number }>;
}

interface VendorTerritorySnapshot {
  generated_at: string;
  note?: string;
  counts: Partial<Record<VendorBranchPricingStatus, number>>;
  offices: SnapshotOffice[];
  branches: SnapshotBranch[];
}

interface TerritorySnapshotRpc {
  generated_at?: string;
  offices?: Array<{
    id: string;
    name: string | null;
    lat: number | string | null;
    lng: number | string | null;
    region: string | null;
    drive_time_minutes: number | string | null;
    boundary: {
      type?: string;
      coordinates?: number[][][];
    } | null;
  }>;
}

export interface VendorMapVendor {
  id: string;
  name: string;
  slug: string;
  color: string;
  isActive: boolean;
  isPlanned: boolean;
}

export interface PriceAgreementSummary {
  id: string;
  scope: "branch" | "region";
  vendorName: string;
  regionCode: string | null;
  regionName: string | null;
  agreementNumber: string | null;
  versionLabel: string | null;
  accountNumber: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  ceoVerified: boolean;
  isActive: boolean;
  sourceFile: string | null;
}

export interface OfficeMapNode {
  id: string;
  name: string;
  officeType: string;
  regionId: string | null;
  regionCode: string | null;
  regionName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  driveTimeMinutes: number | null;
  boundary: {
    type: "Polygon";
    coordinates: number[][][];
  } | null;
  boundaryMethod: string | null;
  boundaryComputedAt: string | null;
  activePriceAgreements: PriceAgreementSummary[];
  branchCounts: {
    total: number;
    needsOfficeRoute: number;
    missingPricing: number;
    healthy: number;
  };
}

export interface CandidateOffice {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  driveMinutes: number | null;
  straightMiles: number | null;
  isSuggested: boolean;
}

export interface VendorBranchMapNode {
  id: string;
  vendorId: string;
  vendorName: string;
  vendorSlug: string;
  vendorColor: string;
  branchNumber: string | null;
  branchName: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodeStatus: string;
  geocodePrecision: string | null;
  pricingStatus: VendorBranchPricingStatus;
  markerPriority: TerritoryMarkerPriority;
  markerColor: string;
  assignedOfficeId: string | null;
  assignedOfficeName: string | null;
  suggestedOfficeId: string | null;
  suggestedOfficeName: string | null;
  candidateOffices: CandidateOffice[];
  currentAgreement: PriceAgreementSummary | null;
  priceEvidenceStatus: BranchPriceEvidenceStatus;
  priceEvidenceLabel: string;
  pricingApproved: boolean;
  invoiceGateStatus: "approved" | "blocked";
  territoryDecidedBy: string | null;
  territoryDecidedAt: string | null;
}

export interface VendorTerritoryCounts {
  offices: number;
  branches: number;
  branchesWithCoordinates: number;
  missingCoordinates: number;
  covered: number;
  overlapPending: number;
  outOfBoundary: number;
  unclassified: number;
  pricingApproved: number;
  needsOfficeRoute: number;
  missingBranchPricing: number;
  vendorBrand: number;
}

export interface VendorTerritoryMapPayload {
  status: VendorTerritoryStatus;
  source: VendorTerritorySource;
  generatedAt: string;
  missingConfig: string[];
  errors: string[];
  vendors: VendorMapVendor[];
  states: string[];
  offices: OfficeMapNode[];
  branches: VendorBranchMapNode[];
  reviewBranches: VendorBranchMapNode[];
  counts: VendorTerritoryCounts;
}

export type VendorTerritorySurface = VendorTerritoryMapPayload;

const PAGE_SIZE = 1000;
const territorySnapshot = territorySnapshotJson as VendorTerritorySnapshot;

const PLANNED_VENDORS: VendorMapVendor[] = [
  {
    id: "planned-qxo",
    name: "QXO",
    slug: "qxo",
    color: "#2563eb",
    isActive: false,
    isPlanned: true,
  },
  {
    id: "planned-srs",
    name: "SRS Distribution",
    slug: "srs-distribution",
    color: "#0f766e",
    isActive: false,
    isPlanned: true,
  },
];

const VENDOR_COLORS: Array<{ pattern: RegExp; color: string }> = [
  { pattern: /\babc\b|abc supply/i, color: "#d71920" },
  { pattern: /\bqxo\b/i, color: "#2563eb" },
  { pattern: /\bsrs\b|srs distribution/i, color: "#0f766e" },
];

const MARKER_COLORS: Record<TerritoryMarkerPriority, string> = {
  needs_office_route: "#eab308",
  missing_branch_pricing: "#dc2626",
  vendor_brand: "#0f766e",
};

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

async function optionalSelectAll<T extends Record<string, unknown>>(
  client: SupabaseClient,
  table: string,
  columns: string,
  errors: string[],
): Promise<T[]> {
  try {
    return await selectAll<T>(client, table, columns);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : `${table}: unknown select error`);
    return [];
  }
}

async function loadTerritorySnapshotRpc(client: SupabaseClient, errors: string[]) {
  const { data, error } = await client.rpc("territory_snapshot");
  if (error) {
    errors.push(`territory_snapshot: ${error.message}`);
    return null;
  }

  return data && typeof data === "object" ? (data as TerritorySnapshotRpc) : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function compact(value: unknown, fallback = "Unknown") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function nullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeStatus(value: string | null): VendorBranchPricingStatus {
  if (value === "covered" || value === "overlap_pending" || value === "out_of_boundary") return value;
  return "unclassified";
}

function isPdfSource(value: string | null | undefined) {
  return /\.pdf(?:$|[?#])/i.test(String(value ?? ""));
}

function isApiSource(value: string | null | undefined) {
  return /\bapi\b/i.test(String(value ?? ""));
}

function normalizeBranchNumber(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const alnum = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const noPrefix = alnum.replace(/^ABC/, "");
  return noPrefix.replace(/^0+/, "") || noPrefix || alnum;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function addressKey(city: unknown, state: unknown, address: unknown) {
  const normalizedAddress = normalizeText(address);
  if (!normalizedAddress) return "";
  return [normalizeText(city), normalizeText(state), normalizedAddress].join("|");
}

function parseJsonish(value: unknown) {
  if (!value) return null;
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function firstStringDeep(value: unknown, keys: string[]): string | null {
  const root = parseJsonish(value);
  if (!root) return null;

  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const stack: unknown[] = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    for (const [key, entry] of Object.entries(current)) {
      if (wanted.has(key.toLowerCase()) && typeof entry === "string" && entry.trim()) return entry.trim();
      if (entry && typeof entry === "object") stack.push(entry);
    }
  }

  return null;
}

function abcApiAddress(row: AbcVendorBranchRow | null) {
  if (!row) return null;
  return firstStringDeep(row.address_json, [
    "address",
    "address1",
    "addressLine1",
    "street",
    "streetAddress",
    "line1",
  ]);
}

function abcApiPhone(row: AbcVendorBranchRow | null) {
  if (!row) return null;
  return firstStringDeep(row.contact_json, ["phone", "phoneNumber", "telephone", "mainPhone"]);
}

function isAbcVendor(vendorName: string, vendorSlug: string) {
  return /\babc\b|abc supply/i.test(`${vendorName} ${vendorSlug}`);
}

function vendorColor(name: string, slug: string) {
  const lookup = `${name} ${slug}`;
  return VENDOR_COLORS.find((item) => item.pattern.test(lookup))?.color ?? "#334155";
}

function plannedOrLiveVendors(rows: VendorRow[]) {
  const liveVendors = rows
    .filter((vendor) => vendor.is_active !== false)
    .map((vendor) => {
      const name = compact(vendor.name, "Vendor");
      const slug = nullableText(vendor.slug) ?? slugify(name);
      return {
        id: vendor.id,
        name,
        slug,
        color: vendorColor(name, slug),
        isActive: true,
        isPlanned: false,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const liveSlugs = new Set(liveVendors.map((vendor) => vendor.slug));
  const planned = PLANNED_VENDORS.filter((vendor) => !liveSlugs.has(vendor.slug));
  return [...liveVendors, ...planned];
}

function priceEvidenceFrom(pdfCount: number, apiCount: number) {
  if (pdfCount > 0) {
    return {
      status: "pdf_price_agreement" as const,
      label: apiCount > 0 ? "PDF agreement plus API pricing" : "PDF price agreement",
    };
  }

  if (apiCount > 0) {
    return {
      status: "api_only_pricing" as const,
      label: "API-only pricing; no PDF agreement mapped",
    };
  }

  return {
    status: "no_price_agreement" as const,
    label: "No price agreement mapped",
  };
}

function isAgreementCurrent(agreement: PriceAgreementRow) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    agreement.is_active !== false &&
    agreement.ceo_verified === true &&
    (!agreement.effective_date || agreement.effective_date <= today) &&
    (!agreement.expiry_date || agreement.expiry_date >= today)
  );
}

function agreementSummary(
  agreement: PriceAgreementRow,
  vendorById: Map<string, VendorMapVendor>,
  regionById: Map<string, RegionRow>,
  scope: "branch" | "region",
): PriceAgreementSummary {
  const region = agreement.region_id ? regionById.get(agreement.region_id) : null;
  return {
    id: agreement.id,
    scope,
    vendorName: agreement.vendor_id ? (vendorById.get(agreement.vendor_id)?.name ?? "Vendor") : "Vendor",
    regionCode: region?.region_code ?? null,
    regionName: region?.region_name ?? null,
    agreementNumber: agreement.agreement_number,
    versionLabel: agreement.version_label,
    accountNumber: agreement.account_number,
    effectiveDate: agreement.effective_date,
    expiryDate: agreement.expiry_date,
    ceoVerified: agreement.ceo_verified === true,
    isActive: agreement.is_active !== false,
    sourceFile: agreement.source_file,
  };
}

function findCurrentAgreement(
  branch: BranchTerritoryRow,
  branchRaw: VendorBranchRow | null,
  assignedOffice: OfficeRow | null,
  agreements: PriceAgreementRow[],
  vendorById: Map<string, VendorMapVendor>,
  regionById: Map<string, RegionRow>,
) {
  const branchAgreement = agreements
    .filter((agreement) => agreement.vendor_branch_id === branch.vendor_branch_id && isAgreementCurrent(agreement))
    .sort(compareAgreements)[0];

  if (branchAgreement) return agreementSummary(branchAgreement, vendorById, regionById, "branch");

  const regionId = assignedOffice?.region_id ?? branchRaw?.region_id ?? null;
  if (!branch.vendor_id || !regionId) return null;

  const regionAgreement = agreements
    .filter((agreement) => agreement.vendor_id === branch.vendor_id && agreement.region_id === regionId && isAgreementCurrent(agreement))
    .sort(compareAgreements)[0];

  return regionAgreement ? agreementSummary(regionAgreement, vendorById, regionById, "region") : null;
}

function compareAgreements(a: PriceAgreementRow, b: PriceAgreementRow) {
  return String(b.effective_date ?? "").localeCompare(String(a.effective_date ?? ""));
}

function markerPriority(branch: {
  assignedOfficeId: string | null;
  pricingStatus: VendorBranchPricingStatus;
  pricingApproved: boolean;
  candidateOffices: CandidateOffice[];
  currentAgreement: PriceAgreementSummary | null;
}) {
  const needsOfficeRoute =
    branch.pricingStatus === "overlap_pending" ||
    (branch.pricingStatus !== "out_of_boundary" && !branch.assignedOfficeId) ||
    (branch.candidateOffices.length > 1 && !branch.assignedOfficeId);

  if (needsOfficeRoute) return "needs_office_route" as const;
  if (!branch.pricingApproved || !branch.currentAgreement || branch.pricingStatus === "out_of_boundary") {
    return "missing_branch_pricing" as const;
  }

  return "vendor_brand" as const;
}

function statesFrom(offices: OfficeMapNode[], branches: VendorBranchMapNode[]) {
  return [...new Set([...offices.map((office) => office.state), ...branches.map((branch) => branch.state)].filter(Boolean) as string[])]
    .sort((a, b) => a.localeCompare(b));
}

function countsFrom(offices: OfficeMapNode[], branches: VendorBranchMapNode[]): VendorTerritoryCounts {
  return {
    offices: offices.length,
    branches: branches.length,
    branchesWithCoordinates: branches.filter((branch) => branch.latitude !== null && branch.longitude !== null).length,
    missingCoordinates: branches.filter((branch) => branch.latitude === null || branch.longitude === null).length,
    covered: branches.filter((branch) => branch.pricingStatus === "covered").length,
    overlapPending: branches.filter((branch) => branch.pricingStatus === "overlap_pending").length,
    outOfBoundary: branches.filter((branch) => branch.pricingStatus === "out_of_boundary").length,
    unclassified: branches.filter((branch) => branch.pricingStatus === "unclassified").length,
    pricingApproved: branches.filter((branch) => branch.pricingApproved).length,
    needsOfficeRoute: branches.filter((branch) => branch.markerPriority === "needs_office_route").length,
    missingBranchPricing: branches.filter((branch) => branch.markerPriority === "missing_branch_pricing").length,
    vendorBrand: branches.filter((branch) => branch.markerPriority === "vendor_brand").length,
  };
}

function reviewBranchesFrom(branches: VendorBranchMapNode[]) {
  const rank: Record<TerritoryMarkerPriority, number> = {
    needs_office_route: 0,
    missing_branch_pricing: 1,
    vendor_brand: 2,
  };

  return branches
    .filter((branch) => branch.markerPriority !== "vendor_brand")
    .sort((a, b) => {
      return (
        rank[a.markerPriority] - rank[b.markerPriority] ||
        a.vendorName.localeCompare(b.vendorName) ||
        a.state?.localeCompare(b.state ?? "") ||
        a.branchName.localeCompare(b.branchName)
      );
    })
    .slice(0, 100);
}

function surfaceFromSnapshot(reason: string, missingConfig: string[] = []): VendorTerritoryMapPayload {
  const officeById = new Map(territorySnapshot.offices.map((office) => [office.id, office]));
  const vendors: VendorMapVendor[] = [
    {
      id: "snapshot-abc",
      name: "ABC Supply Co.",
      slug: "abc-supply",
      color: vendorColor("ABC Supply Co.", "abc-supply"),
      isActive: true,
      isPlanned: false,
    },
    ...PLANNED_VENDORS,
  ];
  const vendorBySlug = new Map(vendors.map((vendor) => [vendor.slug, vendor]));

  const offices: OfficeMapNode[] = territorySnapshot.offices.map((office) => ({
    id: office.id,
    name: office.name,
    officeType: "brick_mortar",
    regionId: null,
    regionCode: office.region,
    regionName: office.region,
    address: null,
    city: null,
    state: null,
    postalCode: null,
    latitude: office.lat,
    longitude: office.lng,
    driveTimeMinutes: office.drive_time_minutes,
    boundary: office.boundary,
    boundaryMethod: "snapshot",
    boundaryComputedAt: null,
    activePriceAgreements: [],
    branchCounts: {
      total: 0,
      needsOfficeRoute: 0,
      missingPricing: 0,
      healthy: 0,
    },
  }));

  const branches: VendorBranchMapNode[] = territorySnapshot.branches.map((branch) => {
    const vendor = vendorBySlug.get("abc-supply") ?? vendors[0];
    const candidateOffices = (branch.cands ?? []).map((candidate) => {
      const office = officeById.get(candidate.o);
      return {
        id: candidate.o,
        name: office?.name ?? candidate.o,
        city: null,
        state: null,
        driveMinutes: null,
        straightMiles: Number.isFinite(candidate.km) ? Number((candidate.km * 0.621371).toFixed(1)) : null,
        isSuggested: branch.suggested === candidate.o,
      };
    });
    const pricingStatus = normalizeStatus(branch.status);
    const currentAgreement = branch.approved
      ? {
          id: "snapshot-agreement",
          scope: "region" as const,
          vendorName: vendor.name,
          regionCode: null,
          regionName: null,
          agreementNumber: null,
          versionLabel: "Snapshot",
          accountNumber: null,
          effectiveDate: null,
          expiryDate: null,
          ceoVerified: true,
          isActive: true,
          sourceFile: "previous app snapshot",
        }
      : null;
    const priority = markerPriority({
      assignedOfficeId: branch.assigned,
      pricingStatus,
      pricingApproved: branch.approved,
      candidateOffices,
      currentAgreement,
    });

    return {
      id: branch.id,
      vendorId: vendor.id,
      vendorName: vendor.name,
      vendorSlug: vendor.slug,
      vendorColor: vendor.color,
      branchNumber: branch.name,
      branchName: branch.name,
      address: null,
      city: branch.city,
      state: branch.state,
      phone: null,
      latitude: branch.lat,
      longitude: branch.lng,
      geocodeStatus: "snapshot",
      geocodePrecision: null,
      pricingStatus,
      markerPriority: priority,
      markerColor: priority === "vendor_brand" ? vendor.color : MARKER_COLORS[priority],
      assignedOfficeId: branch.assigned,
      assignedOfficeName: branch.assigned ? (officeById.get(branch.assigned)?.name ?? branch.assigned) : null,
      suggestedOfficeId: branch.suggested,
      suggestedOfficeName: branch.suggested ? (officeById.get(branch.suggested)?.name ?? branch.suggested) : null,
      candidateOffices,
      currentAgreement,
      priceEvidenceStatus: branch.approved ? "pdf_price_agreement" : "no_price_agreement",
      priceEvidenceLabel: branch.approved ? "Snapshot pricing approved" : "Snapshot pricing missing",
      pricingApproved: branch.approved,
      invoiceGateStatus: branch.approved ? "approved" : "blocked",
      territoryDecidedBy: null,
      territoryDecidedAt: null,
    };
  });

  attachOfficeBranchCounts(offices, branches);

  return {
    status: missingConfig.length ? "unconfigured" : "degraded",
    source: "snapshot",
    generatedAt: territorySnapshot.generated_at,
    missingConfig,
    errors: [
      `${reason} Showing the previous app territory snapshot from ${new Date(territorySnapshot.generated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`,
    ],
    vendors,
    states: statesFrom(offices, branches),
    offices,
    branches,
    reviewBranches: reviewBranchesFrom(branches),
    counts: countsFrom(offices, branches),
  };
}

function attachOfficeBranchCounts(offices: OfficeMapNode[], branches: VendorBranchMapNode[]) {
  const officeById = new Map(offices.map((office) => [office.id, office]));
  for (const office of offices) {
    office.branchCounts = {
      total: 0,
      needsOfficeRoute: 0,
      missingPricing: 0,
      healthy: 0,
    };
  }

  for (const branch of branches) {
    if (!branch.assignedOfficeId) continue;
    const office = officeById.get(branch.assignedOfficeId);
    if (!office) continue;
    office.branchCounts.total += 1;
    if (branch.markerPriority === "needs_office_route") office.branchCounts.needsOfficeRoute += 1;
    else if (branch.markerPriority === "missing_branch_pricing") office.branchCounts.missingPricing += 1;
    else office.branchCounts.healthy += 1;
  }
}

export async function loadVendorTerritoryMapPayload(
  env: RuntimeEnv = getRuntimeEnv(),
): Promise<VendorTerritoryMapPayload> {
  const { client, config } = createServerSupabaseClient(env);

  if (!client) {
    return surfaceFromSnapshot("Supabase territory data is not configured.", config.missing);
  }

  const nonCriticalErrors: string[] = [];

  try {
    const [regions, officeRows, vendorRows, branchViewRows, branchRows, candidateRows, agreements, abcEvidenceRows, abcApiRows, territoryRpc] =
      await Promise.all([
        selectAll<RegionRow>(
          client,
          "regions",
          "id,region_code,region_name,primary_city,primary_state,is_active",
        ),
        selectAll<OfficeRow>(
          client,
          "office",
          "id,name,office_type,region_id,address,city,state,postal_code,latitude,longitude,drive_time_minutes,boundary_method,boundary_computed_at,is_active",
        ),
        selectAll<VendorRow>(client, "vendors", "id,name,slug,is_active"),
        selectAll<BranchTerritoryRow>(
          client,
          "v_branch_territory",
          "vendor_branch_id,vendor_id,vendor_name,branch_number,branch_name,city,state,latitude,longitude,geocode_status,pricing_status,pricing_territory_office_id,assigned_office_name,suggested_office_id,suggested_office_name,territory_decided_by,territory_decided_at,pricing_approved,candidate_office_count",
        ),
        selectAll<VendorBranchRow>(
          client,
          "vendor_branches",
          "id,vendor_id,region_id,branch_number,branch_name,address,city,state,phone,latitude,longitude,geocode_status,geocode_precision,pricing_status,pricing_territory_office_id,suggested_office_id,territory_decided_by,territory_decided_at,is_active",
        ),
        selectAll<CandidateRow>(
          client,
          "branch_office_candidate",
          "vendor_branch_id,office_id,drive_minutes,straight_km,is_suggested",
        ),
        optionalSelectAll<PriceAgreementRow>(
          client,
          "price_agreements",
          "id,vendor_id,region_id,vendor_branch_id,agreement_number,version_label,account_number,effective_date,expiry_date,ceo_verified,is_active,source_file",
          nonCriticalErrors,
        ),
        optionalSelectAll<AbcAgreementEvidenceRow>(
          client,
          "abc_price_agreements",
          "branch_number,source_file",
          nonCriticalErrors,
        ),
        optionalSelectAll<AbcVendorBranchRow>(
          client,
          "abc_vendor_branches",
          "branch_number,branch_name,address_json,contact_json,city,state,postal,latitude,longitude",
          nonCriticalErrors,
        ),
        loadTerritorySnapshotRpc(client, nonCriticalErrors),
      ]);

    const vendors = plannedOrLiveVendors(vendorRows);
    const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
    const regionById = new Map(regions.map((region) => [region.id, region]));
    const officeById = new Map(officeRows.map((office) => [office.id, office]));
    const branchById = new Map(branchRows.map((branch) => [branch.id, branch]));
    const rpcBoundaryByOfficeId = new Map(
      (territoryRpc?.offices ?? []).map((office) => [
        office.id,
        office.boundary?.type === "Polygon" && Array.isArray(office.boundary.coordinates)
          ? ({ type: "Polygon", coordinates: office.boundary.coordinates } as const)
          : null,
      ]),
    );

    const candidateByBranch = new Map<string, CandidateOffice[]>();
    for (const candidate of candidateRows) {
      const office = officeById.get(candidate.office_id);
      const list = candidateByBranch.get(candidate.vendor_branch_id) ?? [];
      const straightKm = toNumber(candidate.straight_km);
      list.push({
        id: candidate.office_id,
        name: compact(office?.name, candidate.office_id),
        city: office?.city ?? null,
        state: office?.state ?? null,
        driveMinutes: toNumber(candidate.drive_minutes),
        straightMiles: straightKm === null ? null : Number((straightKm * 0.621371).toFixed(1)),
        isSuggested: candidate.is_suggested === true,
      });
      candidateByBranch.set(candidate.vendor_branch_id, list);
    }

    for (const candidates of candidateByBranch.values()) {
      candidates.sort((a, b) => {
        return (
          Number(b.isSuggested) - Number(a.isSuggested) ||
          (a.driveMinutes ?? Number.POSITIVE_INFINITY) - (b.driveMinutes ?? Number.POSITIVE_INFINITY) ||
          (a.straightMiles ?? Number.POSITIVE_INFINITY) - (b.straightMiles ?? Number.POSITIVE_INFINITY) ||
          a.name.localeCompare(b.name)
        );
      });
    }

    const branchEvidence = new Map<string, { pdfCount: number; apiCount: number }>();
    for (const agreement of abcEvidenceRows) {
      const branchNumber = normalizeBranchNumber(agreement.branch_number);
      if (!branchNumber) continue;
      const current = branchEvidence.get(branchNumber) ?? { pdfCount: 0, apiCount: 0 };
      if (isPdfSource(agreement.source_file)) current.pdfCount += 1;
      if (isApiSource(agreement.source_file)) current.apiCount += 1;
      branchEvidence.set(branchNumber, current);
    }

    const abcApiByNumber = new Map<string, AbcVendorBranchRow>();
    const abcApiByAddress = new Map<string, AbcVendorBranchRow>();
    for (const apiBranch of abcApiRows) {
      const numberKey = normalizeBranchNumber(apiBranch.branch_number);
      if (numberKey) abcApiByNumber.set(numberKey, apiBranch);
      const apiAddress = abcApiAddress(apiBranch);
      const key = addressKey(apiBranch.city, apiBranch.state, apiAddress);
      if (key) abcApiByAddress.set(key, apiBranch);
    }

    const offices: OfficeMapNode[] = officeRows
      .filter((office) => office.is_active !== false)
      .map((office) => {
        const region = office.region_id ? regionById.get(office.region_id) : null;
        const activePriceAgreements = agreements
          .filter((agreement) => agreement.region_id === office.region_id && isAgreementCurrent(agreement))
          .sort(compareAgreements)
          .map((agreement) => agreementSummary(agreement, vendorById, regionById, "region"));

        return {
          id: office.id,
          name: compact(office.name, "Office"),
          officeType: compact(office.office_type, "brick_mortar"),
          regionId: office.region_id,
          regionCode: region?.region_code ?? null,
          regionName: region?.region_name ?? null,
          address: office.address,
          city: office.city,
          state: office.state,
          postalCode: office.postal_code,
          latitude: toNumber(office.latitude),
          longitude: toNumber(office.longitude),
          driveTimeMinutes: toNumber(office.drive_time_minutes),
          boundary: rpcBoundaryByOfficeId.get(office.id) ?? null,
          boundaryMethod: office.boundary_method,
          boundaryComputedAt: office.boundary_computed_at,
          activePriceAgreements,
          branchCounts: {
            total: 0,
            needsOfficeRoute: 0,
            missingPricing: 0,
            healthy: 0,
          },
        };
      });

    const branches: VendorBranchMapNode[] = branchViewRows
      .map((branch) => {
        const rawBranch = branchById.get(branch.vendor_branch_id) ?? null;
        const vendor = branch.vendor_id ? vendorById.get(branch.vendor_id) : null;
        const vendorName = compact(branch.vendor_name ?? vendor?.name, "Vendor");
        const vendorSlug = vendor?.slug ?? slugify(vendorName);
        const vendorMainColor = vendor?.color ?? vendorColor(vendorName, vendorSlug);
        const abcApiBranch = isAbcVendor(vendorName, vendorSlug)
          ? abcApiByNumber.get(normalizeBranchNumber(branch.branch_number ?? rawBranch?.branch_number)) ??
            abcApiByAddress.get(addressKey(branch.city ?? rawBranch?.city, branch.state ?? rawBranch?.state, rawBranch?.address))
          : null;
        const assignedOffice = branch.pricing_territory_office_id
          ? (officeById.get(branch.pricing_territory_office_id) ?? null)
          : null;
        const candidateOffices = candidateByBranch.get(branch.vendor_branch_id) ?? [];
        const pricingStatus = normalizeStatus(branch.pricing_status);
        const currentAgreement = findCurrentAgreement(branch, rawBranch, assignedOffice, agreements, vendorById, regionById);
        const branchNumber = nullableText(abcApiBranch?.branch_number ?? branch.branch_number ?? rawBranch?.branch_number);
        const evidenceCounts = branchEvidence.get(normalizeBranchNumber(branchNumber)) ?? { pdfCount: 0, apiCount: 0 };
        const priceEvidence = currentAgreement
          ? { status: "pdf_price_agreement" as const, label: "Current price agreement mapped" }
          : priceEvidenceFrom(evidenceCounts.pdfCount, evidenceCounts.apiCount);
        const priority = markerPriority({
          assignedOfficeId: branch.pricing_territory_office_id,
          pricingStatus,
          pricingApproved: branch.pricing_approved === true,
          candidateOffices,
          currentAgreement,
        });

        return {
          id: branch.vendor_branch_id,
          vendorId: branch.vendor_id ?? vendor?.id ?? "unknown-vendor",
          vendorName,
          vendorSlug,
          vendorColor: vendorMainColor,
          branchNumber,
          branchName: compact(branch.branch_name ?? rawBranch?.branch_name ?? abcApiBranch?.branch_name, "Branch"),
          address: rawBranch?.address ?? abcApiAddress(abcApiBranch),
          city: branch.city ?? rawBranch?.city ?? abcApiBranch?.city ?? null,
          state: branch.state ?? rawBranch?.state ?? abcApiBranch?.state ?? null,
          phone: rawBranch?.phone ?? abcApiPhone(abcApiBranch),
          latitude: toNumber(branch.latitude ?? rawBranch?.latitude ?? abcApiBranch?.latitude),
          longitude: toNumber(branch.longitude ?? rawBranch?.longitude ?? abcApiBranch?.longitude),
          geocodeStatus: compact(branch.geocode_status ?? rawBranch?.geocode_status, "unknown"),
          geocodePrecision: rawBranch?.geocode_precision ?? null,
          pricingStatus,
          markerPriority: priority,
          markerColor: priority === "vendor_brand" ? vendorMainColor : MARKER_COLORS[priority],
          assignedOfficeId: branch.pricing_territory_office_id,
          assignedOfficeName: branch.assigned_office_name,
          suggestedOfficeId: branch.suggested_office_id,
          suggestedOfficeName: branch.suggested_office_name,
          candidateOffices,
          currentAgreement,
          priceEvidenceStatus: priceEvidence.status,
          priceEvidenceLabel: priceEvidence.label,
          pricingApproved: branch.pricing_approved === true,
          invoiceGateStatus: branch.pricing_approved === true ? "approved" : "blocked",
          territoryDecidedBy: branch.territory_decided_by,
          territoryDecidedAt: branch.territory_decided_at,
        };
      })
      .sort((a, b) => {
        return (
          a.vendorName.localeCompare(b.vendorName) ||
          (a.state ?? "").localeCompare(b.state ?? "") ||
          a.branchName.localeCompare(b.branchName)
        );
      });

    attachOfficeBranchCounts(offices, branches);

    return {
      status: nonCriticalErrors.length ? "degraded" : "live",
      source: "live",
      generatedAt: new Date().toISOString(),
      missingConfig: [],
      errors: nonCriticalErrors,
      vendors,
      states: statesFrom(offices, branches),
      offices,
      branches,
      reviewBranches: reviewBranchesFrom(branches),
      counts: countsFrom(offices, branches),
    };
  } catch (error) {
    return surfaceFromSnapshot(error instanceof Error ? error.message : "Unknown vendor territory error");
  }
}

export async function loadVendorTerritorySurface(env: RuntimeEnv = getRuntimeEnv()) {
  return loadVendorTerritoryMapPayload(env);
}
