import { describe, expect, it, vi } from "vitest";
import { reportReadFailure, reportWriteFailure } from "@lib/supabase-write";

describe("supabase write/read failure reporting", () => {
  it("stays quiet and returns false when there is no error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(reportWriteFailure("ctx", null)).toBe(false);
    expect(reportReadFailure("ctx", undefined)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("logs the context and message, and returns true, when a write fails", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(reportWriteFailure("verify-paid dashboard_action_log", { message: "permission denied" })).toBe(true);
    expect(spy).toHaveBeenCalledWith("[verify-paid dashboard_action_log] supabase write failed:", "permission denied");
  });

  it("logs reads separately from writes", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(reportReadFailure("activity-rollups", { message: "relation missing" })).toBe(true);
    expect(spy).toHaveBeenCalledWith("[activity-rollups] supabase read failed:", "relation missing");
  });
});
