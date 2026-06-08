import type { SupabaseClient } from "@supabase/supabase-js";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";
import { createServerSupabaseClient } from "@lib/supabase.server";

export type VendorTerritoryStatus = "live" | "degraded" | "unconfigured";
export type VendorBranchPricingStatus = "covered" | "overlap_pending" | "out_of_boundary" | "unclassified";
export type BranchPriceEvidenceStatus = "pdf_price_agreement" | "api_only_pricing" | "no_price_agreement";

interface OfficeRow {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  drive_time_minutes: number | string | null;
  boundary: unknown;
  is_active: boolean | null;
}

interface BranchTerritoryRow {
  vendor_branch_id: string;
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
  pricing_approved: boolean | null;
  candidate_office_count: number | string | null;
}

interface AgreementEvidenceRow {
  branch_number: string | null;
  source_file: string | null;
}

interface BranchPriceEvidence {
  pdfCount: number;
  apiCount: number;
  status: BranchPriceEvidenceStatus;
  label: string;
}

export interface ProjectedOfficeTerritory {
  id: string;
  name: string;
  location: string;
  x: number | null;
  y: number | null;
  polygonPoints: string;
  driveTimeMinutes: number | null;
}

export interface ProjectedVendorBranch {
  id: string;
  vendorName: string;
  branchNumber: string;
  branchName: string;
  location: string;
  x: number;
  y: number;
  status: VendorBranchPricingStatus;
  assignedOfficeName: string;
  suggestedOfficeName: string;
  pricingApproved: boolean;
  candidateOfficeCount: number;
  geocodeStatus: string;
  priceEvidenceStatus: BranchPriceEvidenceStatus;
  priceEvidenceLabel: string;
}

export interface VendorTerritorySurface {
  status: VendorTerritoryStatus;
  generatedAt: string;
  missingConfig: string[];
  errors: string[];
  counts: {
    offices: number;
    branches: number;
    covered: number;
    overlapPending: number;
    outOfBoundary: number;
    unclassified: number;
    pricingApproved: number;
    needsDecision: number;
    pdfAgreementBranches: number;
    apiOnlyBranches: number;
    noPriceAgreementBranches: number;
  };
  offices: ProjectedOfficeTerritory[];
  branches: ProjectedVendorBranch[];
  reviewBranches: ProjectedVendorBranch[];
}

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 620;
const MAP_PAD = 54;
const PAGE_SIZE = 1000;

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

function priceEvidenceFrom(pdfCount: number, apiCount: number): BranchPriceEvidence {
  if (pdfCount > 0) {
    return {
      pdfCount,
      apiCount,
      status: "pdf_price_agreement",
      label: apiCount > 0 ? "PDF agreement plus API pricing" : "PDF price agreement",
    };
  }

  if (apiCount > 0) {
    return {
      pdfCount,
      apiCount,
      status: "api_only_pricing",
      label: "API-only pricing; no PDF agreement mapped",
    };
  }

  return {
    pdfCount,
    apiCount,
    status: "no_price_agreement",
    label: "No PDF/API price agreement mapped",
  };
}

function boundaryPoints(boundary: unknown): Array<[number, number]> {
  if (!boundary || typeof boundary !== "object") return [];
  const coordinates = (boundary as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coordinates)) return [];
  const ring = Array.isArray(coordinates[0]) ? coordinates[0] : [];

  return ring.filter((point): point is [number, number] => {
    return (
      Array.isArray(point) &&
      point.length >= 2 &&
      typeof point[0] === "number" &&
      typeof point[1] === "number"
    );
  });
}

function buildProjection(points: Array<[number, number]>) {
  const lons = points.map(([longitude]) => longitude);
  const lats = points.map(([, latitude]) => latitude);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const lonSpan = maxLon - minLon || 1;
  const latSpan = maxLat - minLat || 1;
  const width = MAP_WIDTH - MAP_PAD * 2;
  const height = MAP_HEIGHT - MAP_PAD * 2;

  return (longitude: number, latitude: number) => {
    const x = MAP_PAD + ((longitude - minLon) / lonSpan) * width;
    const y = MAP_HEIGHT - MAP_PAD - ((latitude - minLat) / latSpan) * height;
    return {
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
    };
  };
}

function branchNeedsDecision(branch: ProjectedVendorBranch) {
  return (
    branch.status !== "covered" ||
    !branch.pricingApproved ||
    branch.candidateOfficeCount > 1 ||
    branch.assignedOfficeName === "Unassigned"
  );
}

export async function loadVendorTerritorySurface(env: RuntimeEnv = getRuntimeEnv()): Promise<VendorTerritorySurface> {
  const { client, config } = createServerSupabaseClient(env);

  if (!client) {
    return {
      status: "unconfigured",
      generatedAt: new Date().toISOString(),
      missingConfig: config.missing,
      errors: [],
      counts: {
        offices: 0,
        branches: 0,
        covered: 0,
        overlapPending: 0,
        outOfBoundary: 0,
        unclassified: 0,
        pricingApproved: 0,
        needsDecision: 0,
        pdfAgreementBranches: 0,
        apiOnlyBranches: 0,
        noPriceAgreementBranches: 0,
      },
      offices: [],
      branches: [],
      reviewBranches: [],
    };
  }

  try {
    const [officeRows, branchRows, agreementRows] = await Promise.all([
      selectAll<OfficeRow>(
        client,
        "office",
        "id,name,city,state,latitude,longitude,drive_time_minutes,boundary,is_active",
      ),
      selectAll<BranchTerritoryRow>(
        client,
        "v_branch_territory",
        "vendor_branch_id,vendor_name,branch_number,branch_name,city,state,latitude,longitude,geocode_status,pricing_status,pricing_territory_office_id,assigned_office_name,suggested_office_id,suggested_office_name,pricing_approved,candidate_office_count",
      ),
      selectAll<AgreementEvidenceRow>(
        client,
        "abc_price_agreements",
        "branch_number,source_file",
      ),
    ]);

    const branchEvidence = new Map<string, { pdfCount: number; apiCount: number }>();
    for (const agreement of agreementRows) {
      const branchNumber = compact(agreement.branch_number, "");
      if (!branchNumber) continue;
      const current = branchEvidence.get(branchNumber) ?? { pdfCount: 0, apiCount: 0 };
      if (isPdfSource(agreement.source_file)) current.pdfCount += 1;
      if (isApiSource(agreement.source_file)) current.apiCount += 1;
      branchEvidence.set(branchNumber, current);
    }

    const activeOffices = officeRows.filter((office) => office.is_active !== false);
    const coordinatePool: Array<[number, number]> = [];

    for (const office of activeOffices) {
      coordinatePool.push(...boundaryPoints(office.boundary));
      const longitude = toNumber(office.longitude);
      const latitude = toNumber(office.latitude);
      if (longitude !== null && latitude !== null) coordinatePool.push([longitude, latitude]);
    }

    for (const branch of branchRows) {
      const longitude = toNumber(branch.longitude);
      const latitude = toNumber(branch.latitude);
      if (longitude !== null && latitude !== null) coordinatePool.push([longitude, latitude]);
    }

    if (!coordinatePool.length) throw new Error("No office or vendor branch coordinates available.");

    const project = buildProjection(coordinatePool);

    const offices = activeOffices.map((office) => {
      const longitude = toNumber(office.longitude);
      const latitude = toNumber(office.latitude);
      const center = longitude !== null && latitude !== null ? project(longitude, latitude) : null;
      const polygonPoints = boundaryPoints(office.boundary)
        .map(([pointLongitude, pointLatitude]) => {
          const point = project(pointLongitude, pointLatitude);
          return `${point.x},${point.y}`;
        })
        .join(" ");

      return {
        id: office.id,
        name: compact(office.name, "Office"),
        location: [office.city, office.state].filter(Boolean).join(", ") || compact(office.name, "Office"),
        x: center?.x ?? null,
        y: center?.y ?? null,
        polygonPoints,
        driveTimeMinutes: toNumber(office.drive_time_minutes),
      };
    });

    const branches = branchRows
      .map((branch) => {
        const longitude = toNumber(branch.longitude);
        const latitude = toNumber(branch.latitude);
        if (longitude === null || latitude === null) return null;
        const point = project(longitude, latitude);
        const status = normalizeStatus(branch.pricing_status);
        const branchNumber = compact(branch.branch_number, "No branch #");
        const evidenceCounts = branchEvidence.get(branchNumber) ?? { pdfCount: 0, apiCount: 0 };
        const priceEvidence = priceEvidenceFrom(evidenceCounts.pdfCount, evidenceCounts.apiCount);
        return {
          id: branch.vendor_branch_id,
          vendorName: compact(branch.vendor_name, "Vendor"),
          branchNumber,
          branchName: compact(branch.branch_name, "Branch"),
          location: [branch.city, branch.state].filter(Boolean).join(", ") || "Unknown location",
          x: point.x,
          y: point.y,
          status,
          assignedOfficeName: compact(branch.assigned_office_name, "Unassigned"),
          suggestedOfficeName: compact(branch.suggested_office_name, "No suggestion"),
          pricingApproved: Boolean(branch.pricing_approved),
          candidateOfficeCount: toNumber(branch.candidate_office_count) ?? 0,
          geocodeStatus: compact(branch.geocode_status, "unknown"),
          priceEvidenceStatus: priceEvidence.status,
          priceEvidenceLabel: priceEvidence.label,
        };
      })
      .filter((branch): branch is ProjectedVendorBranch => Boolean(branch));

    const reviewBranches = branches
      .filter(branchNeedsDecision)
      .sort((a, b) => {
        const statusRank: Record<VendorBranchPricingStatus, number> = {
          overlap_pending: 0,
          out_of_boundary: 1,
          unclassified: 2,
          covered: 3,
        };
        return (
          statusRank[a.status] - statusRank[b.status] ||
          Number(a.pricingApproved) - Number(b.pricingApproved) ||
          b.candidateOfficeCount - a.candidateOfficeCount ||
          a.vendorName.localeCompare(b.vendorName) ||
          a.branchName.localeCompare(b.branchName)
        );
      });

    return {
      status: "live",
      generatedAt: new Date().toISOString(),
      missingConfig: [],
      errors: [],
      counts: {
        offices: offices.length,
        branches: branches.length,
        covered: branches.filter((branch) => branch.status === "covered").length,
        overlapPending: branches.filter((branch) => branch.status === "overlap_pending").length,
        outOfBoundary: branches.filter((branch) => branch.status === "out_of_boundary").length,
        unclassified: branches.filter((branch) => branch.status === "unclassified").length,
        pricingApproved: branches.filter((branch) => branch.pricingApproved).length,
        needsDecision: reviewBranches.length,
        pdfAgreementBranches: branches.filter((branch) => branch.priceEvidenceStatus === "pdf_price_agreement").length,
        apiOnlyBranches: branches.filter((branch) => branch.priceEvidenceStatus === "api_only_pricing").length,
        noPriceAgreementBranches: branches.filter((branch) => branch.priceEvidenceStatus === "no_price_agreement").length,
      },
      offices,
      branches,
      reviewBranches,
    };
  } catch (error) {
    return {
      status: "degraded",
      generatedAt: new Date().toISOString(),
      missingConfig: [],
      errors: [error instanceof Error ? error.message : "Unknown vendor territory error"],
      counts: {
        offices: 0,
        branches: 0,
        covered: 0,
        overlapPending: 0,
        outOfBoundary: 0,
        unclassified: 0,
        pricingApproved: 0,
        needsDecision: 0,
        pdfAgreementBranches: 0,
        apiOnlyBranches: 0,
        noPriceAgreementBranches: 0,
      },
      offices: [],
      branches: [],
      reviewBranches: [],
    };
  }
}
