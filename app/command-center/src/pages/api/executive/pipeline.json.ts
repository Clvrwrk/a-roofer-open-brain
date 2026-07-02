import type { APIRoute } from "astro";
import { jsonResponse } from "@lib/agent-auth";
import {
  KNOWN_ACCOUNT_KEYS,
  loadExecutivePipelineDashboard,
  loadJobsForLocation,
  type DashboardFilters,
  type WindowToken,
} from "@lib/executive-pipeline";

export const prerender = false;

// Security V5 / Threat T-07-04 (Tampering): allowlist-validate every incoming filter
// query param against a fixed known set BEFORE building any Supabase filter. Unknown
// values are ignored (fall back to the loader's "all"/default), never passed through.
const KNOWN_WINDOW_TOKENS = new Set<WindowToken>(["this_week", "last_7_days", "mtd", "qtd"]);
const KNOWN_ACCOUNT_KEY_SET = new Set<string>(KNOWN_ACCOUNT_KEYS);
// job_category_name values observed live, plus the loader's "uncategorized" derivation
// for null/unset rows (RESEARCH.md: ~33% of acculynx_jobs.job_category_name is null).
const KNOWN_COMMERCIAL_RESIDENTIAL = new Set<string>([
  "Residential",
  "Commercial",
  "Property Management",
  "uncategorized",
]);

// Checkpoint round 3, item 1/6: the Rep filter is data-driven (crm_pipeline.primary_
// salesperson values are not a fixed compile-time set like account_key/window). It is
// never built into a Supabase .eq()/.in() call — the loader/jobRowsForLocation only
// ever use it for a plain in-memory JS string-equality filter (see executive-pipeline.ts:
// deriveSegment/jobRowsForLocation), so there is no PostgREST/SQL injection surface for
// T-07-04 to exploit. Defense in depth: reject anything absurdly long or containing
// characters that could not appear in a real AccuLynx salesperson name.
const MAX_REP_LENGTH = 120;
const SAFE_REP_PATTERN = /^[\w .,'’&()/-]+$/u;

function sanitizeRep(value: string | null): string | "all" | undefined {
  if (!value) return undefined;
  if (value === "all") return "all";
  if (value.length > MAX_REP_LENGTH) return undefined;
  if (!SAFE_REP_PATTERN.test(value)) return undefined;
  return value;
}

function pickAllowlisted<T extends string>(value: string | null, allowed: Set<T>): T | undefined {
  if (!value) return undefined;
  return allowed.has(value as T) ? (value as T) : undefined;
}

export const GET: APIRoute = async ({ url }) => {
  const params = url.searchParams;

  const window = pickAllowlisted(params.get("window"), KNOWN_WINDOW_TOKENS);
  const accountKey =
    params.get("location") === "all" || params.get("region") === "all"
      ? "all"
      : pickAllowlisted(params.get("location") ?? params.get("region"), KNOWN_ACCOUNT_KEY_SET);
  const commercialResidential =
    params.get("type") === "all"
      ? "all"
      : pickAllowlisted(params.get("type"), KNOWN_COMMERCIAL_RESIDENTIAL);
  const rep = sanitizeRep(params.get("rep"));

  // Per-location job drill-down (D-09 checkpoint rework, directive 6): ?jobs=1 requests
  // the job-level table for ONE location instead of the aggregate dashboard. `location`
  // MUST allowlist-validate against the 8 known account keys (Security V5 / T-07-04) —
  // an unrecognized/missing location yields an empty result, never an unfiltered query.
  if (params.get("jobs") === "1") {
    const jobsAccountKey = pickAllowlisted(params.get("location"), KNOWN_ACCOUNT_KEY_SET);
    if (!jobsAccountKey) {
      return jsonResponse({ status: "live", jobs: [], error: null });
    }
    const result = await loadJobsForLocation(jobsAccountKey, commercialResidential ?? "all", undefined, rep ?? "all");
    return jsonResponse(result);
  }

  const filters: DashboardFilters = {
    ...(window ? { window } : {}),
    ...(accountKey ? { accountKey } : {}),
    ...(commercialResidential ? { commercialResidential } : {}),
    ...(rep ? { rep } : {}),
  };

  const dashboard = await loadExecutivePipelineDashboard(filters);
  return jsonResponse(dashboard);
};
