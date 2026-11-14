import { describe, it, expect } from "vitest";
import { syncHealthErrorCode } from "./sync-health-error-code";

describe("syncHealthErrorCode", () => {
  it("maps internal monitor codes literally instead of provider_unavailable", () => {
    expect(syncHealthErrorCode("stale_financials")).toBe("stale_financials");
    expect(syncHealthErrorCode("probe_failed")).toBe("probe_failed");
    expect(syncHealthErrorCode("partial_or_invalid")).toBe("partial_or_invalid");
  });
  it("maps auth and unknown transport classes", () => {
    expect(syncHealthErrorCode("auth_denied")).toBe("unauthorized");
    expect(syncHealthErrorCode("upstream_reset")).toBe("provider_unavailable");
  });
});
