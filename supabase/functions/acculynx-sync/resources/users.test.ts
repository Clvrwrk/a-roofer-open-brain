// Behavioral unit tests for syncUsersForAccount() pagination.
//
// /users treats pageStartIndex as a RECORD OFFSET (live probe, colorado, 2026-10-02):
// pageStartIndex=1 returns records 2–51, =50 returns 51–97, =97 answers 416. The mock
// below reproduces that, so a pager that steps by page number fails these tests.
//
// Run: deno test supabase/functions/acculynx-sync/resources/users.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { syncUsersForAccount } from "./users.ts";

const ACCT = { account_key: "colorado" };
const JSON_HEADERS = { "content-type": "application/json" };

function makeUsersFetch(totalUsers: number) {
  const users = Array.from({ length: totalUsers }, (_, i) => ({ id: `user-${i + 1}`, firstName: "U", lastName: String(i + 1) }));
  const offsets: number[] = [];
  const mockFetch = (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(input.toString());
    const start = Number(url.searchParams.get("pageStartIndex") ?? "0");
    const size = Number(url.searchParams.get("pageSize") ?? "50");
    offsets.push(start);
    if (start >= totalUsers) {
      return Promise.resolve(new Response(JSON.stringify({ message: "Page Start Index cannot be greater than the number of users." }), { status: 416, headers: JSON_HEADERS }));
    }
    const items = users.slice(start, start + size);
    return Promise.resolve(new Response(JSON.stringify({ count: totalUsers, pageSize: size, pageStartIndex: start, items }), { status: 200, headers: JSON_HEADERS }));
  };
  return { mockFetch, offsets };
}

function makeUsersSb() {
  const upserted: string[] = [];
  const sb = {
    from: (_table: string) => ({
      upsert: (rows: { id: string }[]) => {
        for (const r of rows) upserted.push(r.id);
        return Promise.resolve({ error: null });
      },
    }),
  };
  return { sb, upserted };
}

Deno.test("syncUsersForAccount — pages by record offset: 97 users in two calls, no repeats", async () => {
  const { mockFetch, offsets } = makeUsersFetch(97);
  const { sb, upserted } = makeUsersSb();
  const total = await syncUsersForAccount(sb, ACCT, "test-key", Date.now() + 60_000, mockFetch as typeof fetch);
  assertEquals(offsets, [0, 50]);
  assertEquals(total, 97);
  assertEquals(new Set(upserted).size, 97);
  assertEquals(upserted.length, 97);
});

Deno.test("syncUsersForAccount — exactly one full page stops on count without a 416 round trip", async () => {
  const { mockFetch, offsets } = makeUsersFetch(50);
  const { sb } = makeUsersSb();
  const total = await syncUsersForAccount(sb, ACCT, "test-key", Date.now() + 60_000, mockFetch as typeof fetch);
  assertEquals(offsets, [0]);
  assertEquals(total, 50);
});

Deno.test("syncUsersForAccount — a tenant under one page (wichita, 49) makes one call", async () => {
  const { mockFetch, offsets } = makeUsersFetch(49);
  const { sb } = makeUsersSb();
  const total = await syncUsersForAccount(sb, ACCT, "test-key", Date.now() + 60_000, mockFetch as typeof fetch);
  assertEquals(offsets, [0]);
  assertEquals(total, 49);
});
