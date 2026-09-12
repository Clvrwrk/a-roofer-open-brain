import { describe, expect, it } from "vitest";
import { cadenceFromCron, classifyFeed, classifyProbe, classifyScheduled, heartbeatEvidence, monitorLight, worst } from "./runtime-status";
import { resolveProbeUrl } from "./integration-probes.server";

const NOW = Date.parse("2026-09-11T15:00:00Z");
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

describe("classifyScheduled (docs/109 D5)", () => {
  it("is green when the last success is within 1.5× cadence", () => {
    const r = classifyScheduled({ cadenceS: 900, lastRunAt: ago(300), lastStatus: "succeeded", lastSuccessAt: ago(300), failedSinceSuccess: 0, now: NOW });
    expect(r.light).toBe("green");
  });
  it("is yellow when late (between 1.5× and 2× cadence)", () => {
    const r = classifyScheduled({ cadenceS: 900, lastRunAt: ago(1500), lastStatus: "succeeded", lastSuccessAt: ago(1500), failedSinceSuccess: 0, now: NOW });
    expect(r.light).toBe("yellow");
    expect(r.headline).toMatch(/late/);
  });
  it("is red when overdue (> 2× cadence) even if the last run succeeded", () => {
    const r = classifyScheduled({ cadenceS: 900, lastRunAt: ago(4000), lastStatus: "succeeded", lastSuccessAt: ago(4000), failedSinceSuccess: 0, now: NOW });
    expect(r.light).toBe("red");
  });
  it("is red with the failure count when the last run failed — the job-13 signature", () => {
    const r = classifyScheduled({ cadenceS: 900, lastRunAt: ago(60), lastStatus: "failed", lastSuccessAt: ago(9 * 86400), failedSinceSuccess: 893, now: NOW });
    expect(r.light).toBe("red");
    expect(r.headline).toContain("893 consecutive failures");
  });
  it("is yellow when a success carried a non-zero exit code (SuccessExitStatus=0 1 units)", () => {
    const r = classifyScheduled({ cadenceS: 86400, lastRunAt: ago(3600), lastStatus: "success", lastSuccessAt: ago(3600), failedSinceSuccess: 0, exitCode: 1, now: NOW });
    expect(r.light).toBe("yellow");
  });
  it("is unknown when nothing has ever run", () => {
    expect(classifyScheduled({ cadenceS: 900, lastRunAt: null, lastStatus: null, lastSuccessAt: null, failedSinceSuccess: 0, now: NOW }).light).toBe("unknown");
  });
});

describe("classifyFeed (docs/109 D5)", () => {
  it("flags lagging matview rows red before anything else", () => {
    const r = classifyFeed({ expectedWindowS: 1800, expectsRowsDaily: false, lastRowAt: ago(60), rows24h: null, laggingRows: 16, now: NOW });
    expect(r.light).toBe("red");
    expect(r.headline).toContain("16 recent invoices");
  });
  it("is yellow for green-but-empty (fresh window, zero rows in 24 h)", () => {
    const r = classifyFeed({ expectedWindowS: 2 * 86400, expectsRowsDaily: true, lastRowAt: ago(3600), rows24h: 0, laggingRows: null, now: NOW });
    expect(r.light).toBe("yellow");
  });
  it("is green when current with rows", () => {
    expect(classifyFeed({ expectedWindowS: 2 * 86400, expectsRowsDaily: true, lastRowAt: ago(3600), rows24h: 4, laggingRows: 0, now: NOW }).light).toBe("green");
  });
  it("is red when stale beyond 2× the window", () => {
    expect(classifyFeed({ expectedWindowS: 3600, expectsRowsDaily: false, lastRowAt: ago(4 * 3600), rows24h: null, laggingRows: null, now: NOW }).light).toBe("red");
  });
});

describe("Better Stack mapping", () => {
  it("treats a paused monitor as red (a blind spot, not rest)", () => {
    expect(monitorLight({ id: "1", name: "x", url: "u", status: "up", checkFrequency: 180, lastCheckedAt: null, paused: true }).light).toBe("red");
  });
  it("maps pending heartbeats to yellow and down to red", () => {
    expect(heartbeatEvidence({ id: "1", name: "x", status: "pending", period: 900, grace: 600, paused: false }).light).toBe("yellow");
    expect(heartbeatEvidence({ id: "1", name: "x", status: "down", period: 900, grace: 600, paused: false }).light).toBe("red");
  });
});

describe("helpers", () => {
  it("worst() ranks red > yellow > unknown > green", () => {
    expect(worst("green", "unknown")).toBe("unknown");
    expect(worst("unknown", "yellow")).toBe("yellow");
    expect(worst("yellow", "red", "green")).toBe("red");
  });
  it("derives cadence from cron expressions", () => {
    expect(cadenceFromCron("*/15 * * * *")).toBe(900);
    expect(cadenceFromCron("0 * * * *")).toBe(3600);
    expect(cadenceFromCron("45 10 * * *")).toBe(86400);
    expect(cadenceFromCron("30 10 * * 4")).toBe(604800);
    expect(cadenceFromCron("0 11 1 1,4,7,10 *")).toBe(7862400);
  });
});

describe("classifyProbe (docs/109 D16 — direct pings)", () => {
  const base = { key: "int.x", url: "https://x.example/", ms: 120, error: null, checkedAt: ago(0), credentialConfigured: null as boolean | null };
  it("is green when an anonymous ping returns the documented code (JT 200 → green)", () => {
    const r = classifyProbe({ ...base, mode: "reachability", status: 200, ok: true }, 200, false);
    expect(r.light).toBe("green");
    expect(r.headline).toMatch(/ping HTTP 200/);
  });
  it("is green when a 401 is the documented anonymous answer (AccuLynx)", () => {
    expect(classifyProbe({ ...base, mode: "reachability", status: 401, ok: true }, 401, false).light).toBe("green");
  });
  it("is red when the system is unreachable or times out", () => {
    const r = classifyProbe({ ...base, mode: "reachability", status: null, ok: false, error: "timeout after 6000 ms" }, 200, false);
    expect(r.light).toBe("red");
    expect(r.headline).toMatch(/unreachable/);
  });
  it("is red when an authenticated ping is rejected", () => {
    const r = classifyProbe({ ...base, mode: "authenticated", status: 401, ok: false, credentialConfigured: true }, 200, true);
    expect(r.light).toBe("red");
    expect(r.headline).toMatch(/credential rejected/);
  });
  it("is yellow when the credential this deployment should hold is missing, even though the system answers", () => {
    const r = classifyProbe({ ...base, mode: "reachability", status: 401, ok: true, credentialConfigured: false }, 401, true);
    expect(r.light).toBe("yellow");
    expect(r.headline).toMatch(/credential not configured/);
  });
  it("is yellow on an unexpected but non-fatal code and red on 5xx", () => {
    expect(classifyProbe({ ...base, mode: "reachability", status: 404, ok: false }, 200, false).light).toBe("yellow");
    expect(classifyProbe({ ...base, mode: "reachability", status: 503, ok: false }, 200, false).light).toBe("red");
  });
});

describe("resolveProbeUrl", () => {
  it("fills env placeholders and refuses when one is missing", () => {
    expect(resolveProbeUrl("{SUPABASE_URL}/rest/v1/", { SUPABASE_URL: "https://p.supabase.co/" })).toBe("https://p.supabase.co/rest/v1/");
    expect(resolveProbeUrl("{SUPABASE_URL}/rest/v1/", {})).toBeNull();
    expect(resolveProbeUrl("{SUPABASE_URL}/rest/v1/", { SUPABASE_URL: "__set_me__" })).toBeNull();
  });
});
