import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandCenterActor } from "@lib/access-control";

// Warm rules from docs/125 (PR #30): no daily warm until a human has used the
// container, the daily warm lands at minute COMMAND_CENTER_DAILY_WARM_MINUTE
// plus 0–4 minutes (never :00), COMMAND_CENTER_PREWARM=off stops every automatic
// warm but not the manual one, and the warm targets run one at a time.

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  loadCommandCenterSurface: vi.fn(),
  loadVendorTerritorySurface: vi.fn(),
  loadExecutivePipelineDashboard: vi.fn(),
  loadAgreementGapSurface: vi.fn(),
  loadInvoiceAuditSummary: vi.fn(),
  loadOrderAudit: vi.fn(),
  loadEstimateAudit: vi.fn(),
  persistActivityRollup: vi.fn(),
}));

vi.mock("@lib/runtime-env", () => ({ getRuntimeEnv: () => mocks.env }));
vi.mock("@lib/activity-rollups.server", () => ({ persistActivityRollup: mocks.persistActivityRollup }));
vi.mock("@lib/live-work", () => ({ loadCommandCenterSurface: mocks.loadCommandCenterSurface }));
vi.mock("@lib/vendor-territories", () => ({ loadVendorTerritorySurface: mocks.loadVendorTerritorySurface }));
vi.mock("@lib/executive-pipeline", () => ({ loadExecutivePipelineDashboard: mocks.loadExecutivePipelineDashboard }));
vi.mock("@lib/abc-price-gaps", () => ({ loadAgreementGapSurface: mocks.loadAgreementGapSurface }));
vi.mock("@lib/invoice-audit", () => ({ loadInvoiceAuditSummary: mocks.loadInvoiceAuditSummary }));
vi.mock("@lib/order-audit", () => ({ loadOrderAudit: mocks.loadOrderAudit }));
vi.mock("@lib/estimate-audit", () => ({ loadEstimateAudit: mocks.loadEstimateAudit }));

// Same order as warmTargets in prewarm.server.ts.
const loaders = [
  ["command_center", mocks.loadCommandCenterSurface],
  ["vendor_territories", mocks.loadVendorTerritorySurface],
  ["executive_pipeline", mocks.loadExecutivePipelineDashboard],
  ["agreement_gaps", mocks.loadAgreementGapSurface],
  ["invoice_audit_summary", mocks.loadInvoiceAuditSummary],
  ["order_audit_active", mocks.loadOrderAudit],
  ["estimate_audit", mocks.loadEstimateAudit],
] as const;

const human = { type: "human" } as CommandCenterActor;
const agent = { type: "agent" } as CommandCenterActor;
const HOUR_MS = 60 * 60 * 1000;

// prewarm.server.ts reads its env-driven constants and keeps its schedule in
// module state, so every test imports a fresh copy after setting the env.
async function loadPrewarm(env: Record<string, string> = {}) {
  mocks.env = { ...env };
  vi.resetModules();
  return import("@lib/prewarm.server");
}

function totalLoaderCalls() {
  return loaders.reduce((sum, [, fn]) => sum + fn.mock.calls.length, 0);
}

function nextDailyWarm(prewarm: Awaited<ReturnType<typeof loadPrewarm>>) {
  const at = prewarm.getCommandCenterWarmCadenceState().schedule.nextDailyWarmAt;
  return at ? new Date(at) : null;
}

beforeEach(() => {
  vi.useFakeTimers();
  // 10:15 local time; the scheduler works in the container's local hours.
  vi.setSystemTime(new Date(2026, 9, 8, 10, 15, 0, 0));
  for (const [, fn] of loaders) fn.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("daily warm scheduling", () => {
  it("schedules no daily warm before any human activity", async () => {
    const prewarm = await loadPrewarm();
    prewarm.prewarmSurfaceCaches();
    expect(nextDailyWarm(prewarm)).toBeNull();

    // Agent traffic is not a reason to warm either.
    prewarm.recordCommandCenterActivity({ actor: agent, pathname: "/api/invoice-audit" });
    expect(nextDailyWarm(prewarm)).toBeNull();

    // Two days pass: only the boot warm ever ran.
    await vi.advanceTimersByTimeAsync(48 * HOUR_MS);
    for (const [, fn] of loaders) expect(fn).toHaveBeenCalledTimes(1);
    expect(prewarm.getCommandCenterWarmCadenceState().lastWarm?.trigger).toBe("boot");
  });

  it("schedules the daily warm at minute 41 plus 0–4 minutes once a human shows up", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const prewarm = await loadPrewarm();
    prewarm.recordCommandCenterActivity({ actor: human, pathname: "/invoices" });

    // Busiest human hour is 10, so the warm runs the hour before: 09:41 tomorrow.
    const due = nextDailyWarm(prewarm);
    expect(due).not.toBeNull();
    expect(due!.getDate()).toBe(9);
    expect(due!.getHours()).toBe(9);
    expect(due!.getMinutes()).toBe(41);
    expect(due!.getSeconds()).toBe(0);
  });

  it("keeps the jitter inside four minutes", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9999);
    const prewarm = await loadPrewarm();
    prewarm.recordCommandCenterActivity({ actor: human, pathname: "/invoices" });

    const due = nextDailyWarm(prewarm)!;
    expect(due.getHours()).toBe(9);
    expect(due.getMinutes()).toBe(44);
  });

  it.each([
    ["17", 0, 17],
    ["0", 0, 41], // 0 is refused; the default stands, so the warm never starts at :00
    ["75", 0.9999, 58], // clamped to 55, plus the full jitter, still inside the hour
  ])("honours COMMAND_CENTER_DAILY_WARM_MINUTE=%s and never lands on :00", async (minute, random, expected) => {
    vi.spyOn(Math, "random").mockReturnValue(random);
    const prewarm = await loadPrewarm({ COMMAND_CENTER_DAILY_WARM_MINUTE: minute });
    prewarm.recordCommandCenterActivity({ actor: human, pathname: "/invoices" });

    const due = nextDailyWarm(prewarm)!;
    expect(due.getHours()).toBe(9);
    expect(due.getMinutes()).toBe(expected);
    expect(due.getMinutes()).not.toBe(0);
  });

  it("runs the daily warm when it comes due", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const prewarm = await loadPrewarm();
    prewarm.recordCommandCenterActivity({ actor: human, pathname: "/invoices" });
    const due = nextDailyWarm(prewarm)!;

    // The idle-session warm fires 20 minutes after the visit.
    await vi.advanceTimersByTimeAsync(21 * 60 * 1000);
    expect(prewarm.getCommandCenterWarmCadenceState().lastWarm?.trigger).toBe("human_session_idle");

    await vi.advanceTimersByTimeAsync(due.getTime() - Date.now() - 1000);
    expect(prewarm.getCommandCenterWarmCadenceState().lastWarm?.trigger).toBe("human_session_idle");

    await vi.advanceTimersByTimeAsync(2000);
    const state = prewarm.getCommandCenterWarmCadenceState();
    expect(state.lastWarm?.trigger).toBe("daily_activity_cadence");
    expect(new Date(state.lastWarm!.startedAt).getMinutes()).toBe(41);
    for (const [, fn] of loaders) expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("COMMAND_CENTER_PREWARM=off", () => {
  it("disables the boot, daily and session warms", async () => {
    const prewarm = await loadPrewarm({ COMMAND_CENTER_PREWARM: "off" });
    prewarm.prewarmSurfaceCaches();
    prewarm.recordCommandCenterActivity({ actor: human, pathname: "/invoices" });

    const { schedule, config } = prewarm.getCommandCenterWarmCadenceState();
    expect(config.prewarmDisabled).toBe(true);
    expect(schedule.nextDailyWarmAt).toBeNull();
    expect(schedule.sessionWarmScheduledFor).toBeNull();

    await vi.advanceTimersByTimeAsync(48 * HOUR_MS);
    expect(totalLoaderCalls()).toBe(0);
    expect(prewarm.getCommandCenterWarmCadenceState().lastWarm).toBeNull();
  });

  it("is case- and space-insensitive", async () => {
    const prewarm = await loadPrewarm({ COMMAND_CENTER_PREWARM: " OFF " });
    prewarm.prewarmSurfaceCaches();
    await vi.advanceTimersByTimeAsync(1000);
    expect(totalLoaderCalls()).toBe(0);
  });

  it("still runs a manual warm", async () => {
    const prewarm = await loadPrewarm({ COMMAND_CENTER_PREWARM: "off" });
    const results = await prewarm.warmCommandCenterCaches("manual");

    expect(results.map((result) => result.name)).toEqual(loaders.map(([name]) => name));
    expect(results.every((result) => result.ok)).toBe(true);
    for (const [, fn] of loaders) expect(fn).toHaveBeenCalledTimes(1);
    expect(prewarm.getCommandCenterWarmCadenceState().lastWarm?.trigger).toBe("manual");
  });
});

describe("warm targets", () => {
  it("run one at a time, in order", async () => {
    const releases: Array<() => void> = [];
    for (const [, fn] of loaders) {
      fn.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            releases.push(resolve);
          }),
      );
    }

    const prewarm = await loadPrewarm();
    const warm = prewarm.warmCommandCenterCaches("manual");

    for (let index = 0; index < loaders.length; index += 1) {
      await vi.advanceTimersByTimeAsync(0);
      // Only the targets up to this one have started; the next waits its turn.
      loaders.forEach(([, fn], position) => {
        expect(fn).toHaveBeenCalledTimes(position <= index ? 1 : 0);
      });
      expect(releases).toHaveLength(index + 1);
      releases[index]();
    }

    const results = await warm;
    expect(results.map((result) => result.name)).toEqual(loaders.map(([name]) => name));
  });

  it("keep going after one fails", async () => {
    mocks.loadVendorTerritorySurface.mockRejectedValue(new Error("territory_snapshot timed out"));
    const prewarm = await loadPrewarm();
    const results = await prewarm.warmCommandCenterCaches("manual");

    expect(results).toHaveLength(loaders.length);
    expect(results[1]).toMatchObject({ name: "vendor_territories", ok: false, error: "territory_snapshot timed out" });
    expect(results.filter((result) => result.ok)).toHaveLength(loaders.length - 1);
    for (const [, fn] of loaders) expect(fn).toHaveBeenCalledTimes(1);
    expect(prewarm.getCommandCenterWarmCadenceState().lastWarm?.ok).toBe(false);
  });

  it("share one in-flight warm between concurrent callers", async () => {
    const prewarm = await loadPrewarm();
    const first = prewarm.warmCommandCenterCaches("manual");
    const second = prewarm.warmCommandCenterCaches("manual");
    expect(await second).toEqual(await first);
    for (const [, fn] of loaders) expect(fn).toHaveBeenCalledTimes(1);
  });
});
