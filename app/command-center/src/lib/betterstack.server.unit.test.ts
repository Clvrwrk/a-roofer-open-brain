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
  // Every case asserts BOTH the state AND that no request went out. Asserting the state
  // alone would pass a regression that sends `__set_me__` to Better Stack, gets a 401, and
  // reports `unconfigured` because the call failed — right answer, wrong reason, and a
  // placeholder credential on the wire. Raised by review 2026-09-22; previously only the
  // absent-token case checked the spy.
  const unconfiguredCases: Array<[string, Record<string, string>]> = [
    ["no token at all", {}],
    // config/.env.example ships BETTERSTACK_API_TOKEN=__set_me__, so a deployment that
    // copies the example verbatim lands here.
    ["the .env.example placeholder", { BETTERSTACK_API_TOKEN: "__set_me__" }],
    ["a whitespace-only token", { BETTERSTACK_API_TOKEN: "   " }],
  ];

  it.each(unconfiguredCases)("reports unconfigured and calls nothing given %s", async (_label, env) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const snapshot = await loadBetterStackSnapshot(env, 1_000);
    expect(snapshot.state).toBe("unconfigured");
    expect(snapshot.state).not.toBe("ok");
    expect(snapshot.monitors).toEqual([]);
    expect(snapshot.heartbeats).toEqual([]);
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

  // A mock that fails EVERY fetch cannot distinguish "returns nothing on failure" from
  // "returns whatever succeeded". These two fail exactly one side each, which is the shape
  // a real Better Stack partial outage takes. docs/109 D13 is the reason this matters: a
  // half-populated snapshot renders the collection that loaded as green and silently drops
  // the other, which is a false green by omission. Raised by review 2026-09-22.
  const okMonitors = { data: [{ id: 1, attributes: { pronounceable_name: "site", status: "up" } }], pagination: { next: null } };
  const okHeartbeats = { data: [{ id: 2, attributes: { name: "job", status: "up", period: 600, grace: 600 } }], pagination: { next: null } };
  const failed = { ok: false, status: 500, json: async () => ({}) };

  it("returns NOTHING when monitors succeed but heartbeats fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      String(url).includes("/monitors") ? okResponse(okMonitors) : failed,
    ));
    const snapshot = await loadBetterStackSnapshot({ BETTERSTACK_API_TOKEN: "t" }, 1_000);
    expect(snapshot.state).toBe("error");
    expect(snapshot.monitors).toEqual([]);
    expect(snapshot.heartbeats).toEqual([]);
  });

  it("returns NOTHING when heartbeats succeed but monitors fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      String(url).includes("/monitors") ? failed : okResponse(okHeartbeats),
    ));
    const snapshot = await loadBetterStackSnapshot({ BETTERSTACK_API_TOKEN: "t" }, 1_000);
    expect(snapshot.state).toBe("error");
    expect(snapshot.monitors).toEqual([]);
    expect(snapshot.heartbeats).toEqual([]);
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
    // Exact URL, matched exactly. A substring test for "page=2" is a trap: the first request
    // carries `per_page=250`, and "per_page=250" CONTAINS "page=2", so a substring mock
    // serves page 2 to the very first call and the test fails for the wrong reason. Found by
    // running it, 2026-09-22.
    const PAGE_2_URL = "https://uptime.betterstack.com/api/v2/heartbeats?page=2";
    const page2 = { data: [{ id: 2, attributes: { name: "second page", status: "up", period: 600, grace: 600, paused: false } }], pagination: { next: null } };
    const page1 = { data: [{ id: 1, attributes: { name: "first page", status: "up", period: 600, grace: 600, paused: false } }], pagination: { next: PAGE_2_URL } };
    // Drive the response off the REQUESTED URL, never a call counter. A counter-driven mock
    // hands back page 2 on the second call whatever the client asked for, so it passes even
    // if `pagination.next` is ignored and page 1 is re-fetched — the one behaviour this test
    // exists to pin. Raised by review 2026-09-22.
    const heartbeatUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const requested = String(url);
        if (requested.includes("/monitors")) return okResponse({ data: [], pagination: { next: null } });
        heartbeatUrls.push(requested);
        return okResponse(requested === PAGE_2_URL ? page2 : page1);
      }),
    );
    const snapshot = await loadBetterStackSnapshot({ BETTERSTACK_API_TOKEN: "t" }, 1_000);
    expect(snapshot.heartbeats.map((h) => h.name)).toEqual(["first page", "second page"]);
    expect(heartbeatUrls).toHaveLength(2);
    expect(heartbeatUrls[1]).toBe(PAGE_2_URL);
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
