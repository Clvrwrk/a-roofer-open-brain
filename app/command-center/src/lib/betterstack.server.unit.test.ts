import { afterEach, describe, expect, it, vi } from "vitest";
import { loadBetterStackSnapshot, resetBetterStackCache } from "./betterstack.server";

// docs/109 D13: when Better Stack is unreachable or unconfigured the board shows yellow
// "not configured" — NEVER a false green. The whole point is that a missing token must not
// look like a healthy system, so these tests pin the shape the classifier depends on:
// `state !== "ok"` AND empty arrays, because runtime-status maps a missing monitor to
// `unknown` and a missing heartbeat to `unknown` (both non-green) via undefined lookups.
//
// The mapping tests matter more than usual here: BETTERSTACK_API_TOKEN is not set on
// production (docs/109 Q4), so the success path has never executed against the live API.
// Until it does, these are the only thing standing between a Better Stack field rename and
// a board that renders every monitor as "unknown" without anyone noticing.

const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

afterEach(() => {
  resetBetterStackCache();
  vi.unstubAllGlobals();
});

describe("loadBetterStackSnapshot — unconfigured never reads as healthy", () => {
  it("reports unconfigured, not ok, when no token is present", async () => {
    const snapshot = await loadBetterStackSnapshot({}, 1_000);
    expect(snapshot.state).toBe("unconfigured");
    expect(snapshot.state).not.toBe("ok");
    expect(snapshot.monitors).toEqual([]);
    expect(snapshot.heartbeats).toEqual([]);
  });

  it("treats the .env.example placeholder as unconfigured", async () => {
    // config/.env.example ships BETTERSTACK_API_TOKEN=__set_me__. A deployment that copies
    // the example verbatim must not send that string to the API and render the failure as
    // an outage — it is an unset token, and it reads as one.
    const snapshot = await loadBetterStackSnapshot({ BETTERSTACK_API_TOKEN: "__set_me__" }, 1_000);
    expect(snapshot.state).toBe("unconfigured");
  });

  it("treats a whitespace-only token as unconfigured", async () => {
    const snapshot = await loadBetterStackSnapshot({ BETTERSTACK_API_TOKEN: "   " }, 1_000);
    expect(snapshot.state).toBe("unconfigured");
  });

  it("does not call the API at all when unconfigured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await loadBetterStackSnapshot({}, 1_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("loadBetterStackSnapshot — failure never reads as healthy", () => {
  it("reports error with empty collections when the API rejects the token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })));
    const snapshot = await loadBetterStackSnapshot({ BETTERSTACK_API_TOKEN: "t" }, 1_000);
    expect(snapshot.state).toBe("error");
    expect(snapshot.detail).toContain("401");
    // Empty, not partial: a half-populated list would let some monitors render green while
    // the rest silently vanished.
    expect(snapshot.monitors).toEqual([]);
    expect(snapshot.heartbeats).toEqual([]);
  });

  it("reports error when the network throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    const snapshot = await loadBetterStackSnapshot({ BETTERSTACK_API_TOKEN: "t" }, 1_000);
    expect(snapshot.state).toBe("error");
    expect(snapshot.monitors).toEqual([]);
  });

  it("caches a failure so an outage does not become a request storm", async () => {
    // The page polls every 30 s per viewer; without this the first Better Stack outage
    // would fan every viewer's poll straight through to the API.
    const fetchMock = vi.fn(async () => { throw new Error("down"); });
    vi.stubGlobal("fetch", fetchMock);
    await loadBetterStackSnapshot({ BETTERSTACK_API_TOKEN: "t" }, 1_000);
    const callsAfterFirst = fetchMock.mock.calls.length;
    await loadBetterStackSnapshot({ BETTERSTACK_API_TOKEN: "t" }, 1_000 + 30_000);
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it("re-fetches once the 45 s cache window has passed", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("down"); });
    vi.stubGlobal("fetch", fetchMock);
    await loadBetterStackSnapshot({ BETTERSTACK_API_TOKEN: "t" }, 1_000);
    const callsAfterFirst = fetchMock.mock.calls.length;
    await loadBetterStackSnapshot({ BETTERSTACK_API_TOKEN: "t" }, 1_000 + 46_000);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});

describe("loadBetterStackSnapshot — v2 payload mapping", () => {
  // Shapes taken from the Better Stack Uptime v2 API: data[].attributes, with the display
  // name under `pronounceable_name` for monitors and `name` for heartbeats. Getting either
  // wrong yields a snapshot full of empty names that the board renders as "unknown".
  const monitorsPayload = {
    data: [
      {
        id: 4920381,
        attributes: {
          pronounceable_name: "PE-CC · site · /healthz",
          url: "https://cc.proexteriorsus.net/healthz",
          status: "up",
          check_frequency: 180,
          last_checked_at: "2026-09-22T12:00:00.000Z",
          paused: false,
        },
      },
    ],
    pagination: { next: null },
  };
  const heartbeatsPayload = {
    data: [
      {
        id: 492466,
        attributes: { name: "PE-CC · pg_cron 6 · acculynx-reconcile", status: "up", period: 600, grace: 600, paused: false },
      },
    ],
    pagination: { next: null },
  };

  const stubTwoEndpoints = () =>
    vi.fn(async (url: string) =>
      okResponse(String(url).includes("/monitors") ? monitorsPayload : heartbeatsPayload),
    );

  it("maps monitor attributes onto the board's shape", async () => {
    vi.stubGlobal("fetch", stubTwoEndpoints());
    const snapshot = await loadBetterStackSnapshot({ BETTERSTACK_API_TOKEN: "t" }, 1_000);
    expect(snapshot.state).toBe("ok");
    expect(snapshot.monitors[0]).toEqual({
      id: "4920381",
      name: "PE-CC · site · /healthz",
      url: "https://cc.proexteriorsus.net/healthz",
      status: "up",
      checkFrequency: 180,
      lastCheckedAt: "2026-09-22T12:00:00.000Z",
      paused: false,
    });
  });

  it("maps heartbeat attributes, including the period/grace the overdue rule depends on", async () => {
    vi.stubGlobal("fetch", stubTwoEndpoints());
    const snapshot = await loadBetterStackSnapshot({ BETTERSTACK_API_TOKEN: "t" }, 1_000);
    expect(snapshot.heartbeats[0]).toEqual({
      id: "492466",
      name: "PE-CC · pg_cron 6 · acculynx-reconcile",
      status: "up",
      period: 600,
      grace: 600,
      paused: false,
    });
  });

  it("coerces numeric ids to strings so lookups by id do not silently miss", async () => {
    vi.stubGlobal("fetch", stubTwoEndpoints());
    const snapshot = await loadBetterStackSnapshot({ BETTERSTACK_API_TOKEN: "t" }, 1_000);
    expect(typeof snapshot.monitors[0].id).toBe("string");
    expect(typeof snapshot.heartbeats[0].id).toBe("string");
  });

  it("follows pagination rather than reporting only the first page", async () => {
    // 19 heartbeats today against a 250 per_page default, so pagination is not exercised in
    // production — which is exactly why it is pinned here.
    const page2 = { data: [{ id: 2, attributes: { name: "second page", status: "up", period: 600, grace: 600, paused: false } }], pagination: { next: null } };
    const page1 = { data: [{ id: 1, attributes: { name: "first page", status: "up", period: 600, grace: 600, paused: false } }], pagination: { next: "https://uptime.betterstack.com/api/v2/heartbeats?page=2" } };
    let heartbeatCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/monitors")) return okResponse({ data: [], pagination: { next: null } });
        heartbeatCalls += 1;
        return okResponse(heartbeatCalls === 1 ? page1 : page2);
      }),
    );
    const snapshot = await loadBetterStackSnapshot({ BETTERSTACK_API_TOKEN: "t" }, 1_000);
    expect(snapshot.heartbeats.map((h) => h.name)).toEqual(["first page", "second page"]);
  });

  it("sends the token as a bearer and never in the URL", async () => {
    const fetchMock = stubTwoEndpoints();
    vi.stubGlobal("fetch", fetchMock);
    await loadBetterStackSnapshot({ BETTERSTACK_API_TOKEN: "secret-token" }, 1_000);
    for (const [url, init] of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      expect(String(url)).not.toContain("secret-token");
      expect((init?.headers as Record<string, string>)?.authorization).toBe("Bearer secret-token");
    }
  });
});
