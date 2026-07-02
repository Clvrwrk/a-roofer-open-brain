import type { APIRoute } from "astro";
import { jsonResponse } from "@lib/agent-auth";
import {
  KNOWN_ACCOUNT_KEYS,
  loadExecutivePipelineDashboard,
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

  const filters: DashboardFilters = {
    ...(window ? { window } : {}),
    ...(accountKey ? { accountKey } : {}),
    ...(commercialResidential ? { commercialResidential } : {}),
  };

  const dashboard = await loadExecutivePipelineDashboard(filters);
  return jsonResponse(dashboard);
};
