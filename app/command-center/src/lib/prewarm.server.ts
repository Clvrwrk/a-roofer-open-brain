import { loadAgreementGapSurface } from "@lib/abc-price-gaps";
import { loadCommandCenterSurface } from "@lib/live-work";
import { loadVendorTerritorySurface } from "@lib/vendor-territories";
import { loadWeeklySnapshot } from "@lib/weekly-snapshot";

let prewarmStarted = false;

/**
 * Warm the in-process surface caches shortly after boot so the first human
 * request after a deploy is served from cache instead of paying the full
 * Supabase fan-out. Fire-and-forget; every loader already fails soft.
 */
export function prewarmSurfaceCaches() {
  if (prewarmStarted) return;
  prewarmStarted = true;

  setTimeout(() => {
    void loadCommandCenterSurface().catch(() => undefined);
    void loadVendorTerritorySurface().catch(() => undefined);
    void loadWeeklySnapshot().catch(() => undefined);
    void loadAgreementGapSurface().catch(() => undefined);
  }, 250);
}
