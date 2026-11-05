import { describe, expect, it } from "vitest";
import { shouldEmitSyncHealthToSentry, syncHealthErrorCode } from "./sync-health-sentry";

describe("syncHealthErrorCode", () => {
  it("maps internal monitor codes literally instead of provider_unavailable", () => {
    expect(syncHealthErrorCode("probe_failed")).toBe("probe_failed");
    expect(syncHealthErrorCode("stale_financials")).toBe("stale_financials");
    expect(syncHealthErrorCode("auth_denied")).toBe("unauthorized");
    expect(syncHealthErrorCode("upstream_timeout")).toBe("provider_unavailable");
  });
});

describe("shouldEmitSyncHealthToSentry", () => {
  it("suppresses lone direct-probe blips", () => {
    expect(shouldEmitSyncHealthToSentry({ failure_code: "probe_failed", failures: 1 })).toBe(false);
    expect(shouldEmitSyncHealthToSentry({ failure_code: "probe_failed", failures: 2 })).toBe(false);
    expect(shouldEmitSyncHealthToSentry({ failure_code: "probe_failed", failures: 3 })).toBe(true);
  });

  it("still emits non-probe and sustained probe failures", () => {
    expect(shouldEmitSyncHealthToSentry({ failure_code: "worker_timeout", failures: 1 })).toBe(true);
    expect(shouldEmitSyncHealthToSentry({ failure_code: "transport_error", failures: 1 })).toBe(true);
  });
});
