// acculynx-sync — resources/estimates.test.ts (migration 319, 2026-10-01)
//
// The list sweep must never write a detail column (it used to upsert title/total_price = null every hour), and the
// detail pass must fill them from GET /estimates/{id} by UPDATE, scoped to the account.
//
// Run: deno test supabase/functions/acculynx-sync/resources/ --allow-env --allow-net=localhost
import { assertEquals } from "jsr:@std/assert@1";
import { enrichEstimateDetails, mapEstimateStub, syncEstimates } from "./estimates.ts";
import { newSweepOutcome } from "../lib/diff.ts";

const ACCT = { account_key: "kansas_city", market: "sedgwick_ks" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.test("the list sweep upserts only stub columns, so it cannot null detail columns", async () => {
  const upserts: Record<string, unknown>[][] = [];
  const sb: Record<string, unknown> = { from: () => sb, upsert: (rows: Record<string, unknown>[]) => { upserts.push(rows); return Promise.resolve({ error: null }); } };
  const page = [{ id: "e1", isPrimary: true, job: { id: "j1" }, _link: "x" }];
  await syncEstimates(sb, ACCT, "key", Date.now() + 60_000, null, () => Promise.resolve(json({ items: page, count: 1 })));
  assertEquals(upserts.length, 1);
  const row = upserts[0][0];
  assertEquals(Object.keys(row).sort(), ["account_key", "id", "is_primary", "job_id", "last_seen_by_api", "market", "raw", "synced_at"]);
  for (const detail of ["title", "total_price", "estimate_number", "created_date", "notes"]) assertEquals(detail in row, false, detail);
  assertEquals(mapEstimateStub(page[0], ACCT, "t").job_id, "j1");
});

Deno.test("the detail pass reads candidates for this account and fills detail columns by UPDATE", async () => {
  const filters: string[] = [];
  const updates: { patch: Record<string, unknown>; where: [string, unknown][] }[] = [];
  let pending: { patch: Record<string, unknown>; where: [string, unknown][] } | undefined;
  const sb: any = {
    from: () => sb,
    select: (c: string) => { filters.push("select:" + c); return sb; },
    is: (c: string, v: unknown) => { filters.push(`is:${c}:${v}`); return sb; },
    or: (f: string) => { filters.push("or:" + f.split(",")[0]); return sb; },
    order: () => sb,
    limit: () => Promise.resolve({ data: [{ id: "e1" }, { id: "gone" }, { id: "boom" }], error: null }),
    update: (patch: Record<string, unknown>) => { pending = { patch, where: [] }; updates.push(pending); return sb; },
    eq: (c: string, v: unknown) => {
      if (pending) { pending.where.push([c, v]); if (pending.where.length === 2) { pending = undefined; return Promise.resolve({ error: null }); } return sb; }
      filters.push(`eq:${c}:${v}`); return sb;
    },
  };
  const urls: string[] = [];
  const fetchFn = (url: string | URL | Request) => {
    const u = String(url); urls.push(u);
    if (u.endsWith("/e1")) return Promise.resolve(json({ id: "e1", title: "Roof replacement", estimateNumber: "12", createdDate: "2026-09-01T00:00:00Z", financials: { totalPrice: 18000, totalCost: 12000 } }));
    if (u.endsWith("/gone")) return Promise.resolve(json({}, 404));
    return Promise.resolve(json({ message: "server" }, 500));
  };
  const n = await enrichEstimateDetails(sb, ACCT, "key", Date.now() + 60_000, fetchFn as typeof fetch);
  assertEquals(n, 1);
  assertEquals(filters.includes("eq:account_key:kansas_city"), true);
  assertEquals(filters.includes("is:archived_at:null"), true);
  assertEquals(filters.includes("or:detail_synced_at.is.null"), true);
  assertEquals(urls.map((u) => u.split("/").pop()), ["e1", "gone", "boom"]);
  assertEquals(updates.length, 2, "a 500 writes nothing");
  assertEquals(updates[0].patch.title, "Roof replacement");
  assertEquals(updates[0].patch.total_price, 18000);
  assertEquals(updates[0].patch.estimate_number, "12");
  assertEquals("raw" in updates[0].patch, false, "the detail pass never replaces the stub raw");
  assertEquals(updates[0].where, [["id", "e1"], ["account_key", "kansas_city"]]);
  assertEquals(Object.keys(updates[1].patch), ["detail_synced_at"], "a 404 only stamps the attempt");
});

Deno.test("the detail pass stops at the run budget", async () => {
  let fetched = 0;
  const sb: any = { from: () => sb, select: () => sb, eq: () => sb, is: () => sb, or: () => sb, order: () => sb, limit: () => Promise.resolve({ data: [{ id: "a" }, { id: "b" }], error: null }) };
  await enrichEstimateDetails(sb, ACCT, "key", Date.now() - 1, () => { fetched++; return Promise.resolve(json({})); });
  assertEquals(fetched, 0);
});

// ---------------------------------------------------------------------------
// 2026-10-05 (migration 325): the sweep reports whether it is safe to archive.
// ---------------------------------------------------------------------------

/** pages[i] is the items array for pageStartIndex=i; a missing page answers an empty list. */
function pagedFetch(pages: unknown[][], count: number, failAt = -1) {
  const seen: number[] = [];
  const fn = (url: string | URL | Request) => {
    const p = Number(String(url).match(/pageStartIndex=(\d+)/)?.[1] ?? -1);
    seen.push(p);
    if (p === failAt) return Promise.resolve(json({ message: "server" }, 500));
    return Promise.resolve(json({ items: pages[p] ?? [], count }));
  };
  return { fn: fn as typeof fetch, seen };
}
const stubs = (n: number, tag: string) => Array.from({ length: n }, (_, i) => ({ id: `${tag}${i}`, isPrimary: false, job: { id: "j" } }));
const okSb = () => {
  const sb: Record<string, unknown> = { from: () => sb, upsert: () => Promise.resolve({ error: null }) };
  return sb;
};

Deno.test("syncEstimates outcome — a sweep that reaches the last page cleanly is complete", async () => {
  const outcome = newSweepOutcome();
  const { fn } = pagedFetch([stubs(50, "a"), stubs(7, "b")], 57);
  const n = await syncEstimates(okSb(), ACCT, "key", Date.now() + 60_000, null, fn, outcome);
  assertEquals(n, 57);
  assertEquals(outcome, { complete: true, pages: 2, seen: 57 });
});

Deno.test("syncEstimates outcome — an empty account (count 0) is complete, so stale rows can still be archived", async () => {
  const outcome = newSweepOutcome();
  await syncEstimates(okSb(), ACCT, "key", Date.now() + 60_000, null, pagedFetch([], 0).fn, outcome);
  assertEquals(outcome.complete, true);
  assertEquals(outcome.seen, 0);
});

Deno.test("syncEstimates outcome — a pass cut by the deadline is partial", async () => {
  const outcome = newSweepOutcome();
  await syncEstimates(okSb(), ACCT, "key", Date.now() - 1, null, pagedFetch([stubs(50, "a")], 50).fn, outcome);
  assertEquals(outcome.complete, false);
  assertEquals(outcome.pages, 0);
});

Deno.test("syncEstimates outcome — a non-200 page mid-sweep is partial", async () => {
  const outcome = newSweepOutcome();
  const { fn, seen } = pagedFetch([stubs(50, "a"), stubs(50, "b"), stubs(3, "c")], 103, 1);
  await syncEstimates(okSb(), ACCT, "key", Date.now() + 60_000, null, fn, outcome);
  assertEquals(seen, [0, 1]);
  assertEquals(outcome, { complete: false, pages: 1, seen: 50 });
});

Deno.test("syncEstimates outcome — a failed upsert is partial (those rows keep an old last_seen_by_api)", async () => {
  const outcome = newSweepOutcome();
  let call = 0;
  const sb: Record<string, unknown> = {
    from: () => sb,
    upsert: () => Promise.resolve({ error: call++ === 0 ? { message: "timeout" } : null }),
  };
  await syncEstimates(sb, ACCT, "key", Date.now() + 60_000, null, pagedFetch([stubs(50, "a"), stubs(2, "b")], 52).fn, outcome);
  assertEquals(outcome, { complete: false, pages: 2, seen: 2 });
});

Deno.test("syncEstimates outcome — fewer rows than the API count (an early short page) is partial", async () => {
  const outcome = newSweepOutcome();
  await syncEstimates(okSb(), ACCT, "key", Date.now() + 60_000, null, pagedFetch([stubs(20, "a")], 210).fn, outcome);
  assertEquals(outcome.complete, false);
  assertEquals(outcome.seen, 20);
});

Deno.test("syncEstimates outcome — a sweep resumed past page 0 never counts as complete", async () => {
  const outcome = newSweepOutcome();
  const { fn, seen } = pagedFetch([stubs(50, "a"), stubs(50, "b"), stubs(4, "c")], 4);
  await syncEstimates(okSb(), ACCT, "key", Date.now() + 60_000, { last_page_index: 2 }, fn, outcome);
  assertEquals(seen, [2]);
  assertEquals(outcome.complete, false);
});

Deno.test("syncEstimates outcome — a 200 whose body is not the list shape (no items, no count) is partial", async () => {
  // acculynxGet turns a non-JSON 200 into a string and an unparseable JSON 200 into {}. Either reads as an empty
  // first page with no count; trusting it as complete would archive every estimate of the account (review 2026-10-05).
  for (const res of [
    () => Promise.resolve(new Response("<html>gateway</html>", { status: 200, headers: { "content-type": "text/html" } })),
    () => Promise.resolve(new Response("{not json", { status: 200, headers: { "content-type": "application/json" } })),
    () => Promise.resolve(json({})),
  ]) {
    const outcome = newSweepOutcome();
    await syncEstimates(okSb(), ACCT, "key", Date.now() + 60_000, null, res as typeof fetch, outcome);
    assertEquals(outcome.complete, false);
  }
});
