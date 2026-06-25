import { loadAgreementGapSurface } from "@lib/abc-price-gaps";
import { loadEstimateAudit } from "@lib/estimate-audit";
import { loadInvoiceAuditSummary } from "@lib/invoice-audit";
import { loadCommandCenterSurface } from "@lib/live-work";
import { loadOrderAudit } from "@lib/order-audit";
import { loadPriceListCoverage } from "@lib/price-list-coverage";
import { loadPriceListReviewHierarchy } from "@lib/price-list-review-hierarchy";
import { loadVendorTerritorySurface } from "@lib/vendor-territories";
import { loadWeeklySnapshot } from "@lib/weekly-snapshot";

let prewarmStarted = false;

export interface CacheWarmResult {
  name: string;
  ok: boolean;
  durationMs: number;
  error?: string;
}

const warmTargets: Array<{ name: string; run: () => Promise<unknown> }> = [
  { name: "command_center", run: () => loadCommandCenterSurface() },
  { name: "vendor_territories", run: () => loadVendorTerritorySurface() },
  { name: "weekly_snapshot", run: () => loadWeeklySnapshot() },
  { name: "agreement_gaps", run: () => loadAgreementGapSurface() },
  { name: "invoice_audit_summary", run: () => loadInvoiceAuditSummary() },
  { name: "price_list_review", run: () => loadPriceListReviewHierarchy() },
  { name: "order_audit_active", run: () => loadOrderAudit(undefined, "active") },
  { name: "estimate_audit", run: () => loadEstimateAudit() },
  { name: "price_list_coverage", run: () => loadPriceListCoverage() },
];

function nowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

export async function warmCommandCenterCaches(): Promise<CacheWarmResult[]> {
  return Promise.all(
    warmTargets.map(async (target) => {
      const started = nowMs();
      try {
        await target.run();
        return { name: target.name, ok: true, durationMs: Math.round((nowMs() - started) * 10) / 10 };
      } catch (error) {
        return {
          name: target.name,
          ok: false,
          durationMs: Math.round((nowMs() - started) * 10) / 10,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
}

/**
 * Warm the in-process surface caches shortly after boot so the first human
 * request after a deploy is served from cache instead of paying the full
 * Supabase fan-out. Fire-and-forget; every loader already fails soft.
 */
export function prewarmSurfaceCaches() {
  if (prewarmStarted) return;
  prewarmStarted = true;

  setTimeout(() => {
    void warmCommandCenterCaches().catch(() => undefined);
  }, 250);
}
