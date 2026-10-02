// acculynx-sync — resources/contacts.test.ts (Phase 2, plan 02-02 Task 2 — Wave 0 RED)
//
// BEHAVIORAL unit tests for syncContacts() — RED here, GREEN in Plan 03 Task 2.
//
// This file imports from ./contacts.ts which does NOT exist until Plan 03.
// The import failure IS the intended RED state — it proves the module is absent.
//
// Behavioral contracts asserted:
//   (a) URL pagination param is `pageStartIndex` (NOT recordStartIndex — Pitfall 2)
//   (b) Every upserted row carries account_key AND market from the passed acct
//   (c) last_seen_by_api is set on every upserted row
//   (d) Loop stops when Date.now() >= deadline (budget-stop)
//
// Run: deno test supabase/functions/acculynx-sync/resources/ --allow-env --allow-net=localhost
import { assertEquals } from "jsr:@std/assert@1";

// resources/contacts.ts is a Wave 0 STUB that throws "not implemented".
// All tests in this file will FAIL (RED) because the stub throws before doing
// anything. Plan 03 (GREEN) replaces the stub with the real implementation.
import { enrichContactChannels, extractChannels, syncContacts } from "./contacts.ts";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** A canned API page: 2 contacts, then an empty page to end the loop. */
function makeContactsPages(pages: unknown[][]): () => Promise<Response> {
  let call = 0;
  return () => {
    const items = pages[call] ?? [];
    call++;
    const body = JSON.stringify({ items, count: pages[0]?.length ?? 0 });
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    );
  };
}

function makeUpsertSb() {
  const upsertCalls: { table: string; rows: unknown[]; options: unknown }[] = [];
  const updateCalls: { table: string; patch: Record<string, unknown>; where: unknown[][] }[] = [];
  let table = "";
  let pending: { table: string; patch: Record<string, unknown>; where: unknown[][] } | undefined;
  const sb: Record<string, unknown> = {
    from: (t: string) => { table = t; return sb; },
    upsert: (rows: unknown[], options: unknown) => {
      upsertCalls.push({ table, rows, options });
      return Promise.resolve({ error: null });
    },
    // Archive chain used by writeChannels: update().eq().in().is().lt()
    update: (patch: Record<string, unknown>) => { pending = { table, patch, where: [] }; updateCalls.push(pending); return sb; },
    eq: (...a: unknown[]) => { pending?.where.push(["eq", ...a]); return sb; },
    in: (...a: unknown[]) => { pending?.where.push(["in", ...a]); return sb; },
    is: (...a: unknown[]) => { pending?.where.push(["is", ...a]); return sb; },
    lt: (...a: unknown[]) => { pending?.where.push(["lt", ...a]); pending = undefined; return Promise.resolve({ error: null }); },
  };
  return { sb, upsertCalls, updateCalls };
}

const ACCT = {
  account_key: "kansas_city",
  env_secret_name: "PE_CC_KANSAS_CITY_ACCULYNX_API_KEY",
  label: "Kansas City",
  market: "sedgwick_ks",
  state: "KS",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("syncContacts — URL pagination param is pageStartIndex (not recordStartIndex)", async () => {
  const fetchedUrls: string[] = [];
  const mockFetch = (url: string | URL | Request) => {
    fetchedUrls.push(String(url));
    // Return one page then empty to terminate loop.
    const isFirstCall = fetchedUrls.length === 1;
    const items = isFirstCall ? [{ id: "c-1", firstName: "Test", lastName: "User" }] : [];
    const body = JSON.stringify({ items, count: 1 });
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    );
  };

  const { sb } = makeUpsertSb();
  const deadline = Date.now() + 60_000;
  await syncContacts(sb, ACCT, "test-api-key", deadline, null, mockFetch);

  const firstUrl = fetchedUrls[0] ?? "";
  assertEquals(
    firstUrl.includes("pageStartIndex"),
    true,
    `URL must contain 'pageStartIndex' but got: ${firstUrl}`,
  );
  assertEquals(
    firstUrl.includes("recordStartIndex"),
    false,
    `URL must NOT contain 'recordStartIndex' (contacts uses pageStartIndex, not recordStartIndex)`,
  );
});

Deno.test("syncContacts — stamps account_key on every upserted row", async () => {
  const pages = [
    [{ id: "c-1" }, { id: "c-2" }],
    [], // empty page terminates loop
  ];
  const mockFetch = makeContactsPages(pages);
  const { sb, upsertCalls } = makeUpsertSb();
  const deadline = Date.now() + 60_000;

  await syncContacts(sb, ACCT, "test-api-key", deadline, null, mockFetch);

  assertEquals(upsertCalls.length > 0, true, "upsert must be called at least once");
  for (const call of upsertCalls) {
    for (const row of call.rows as Record<string, unknown>[]) {
      assertEquals(
        row.account_key,
        "kansas_city",
        `Every row must carry account_key='kansas_city', got: ${JSON.stringify(row)}`,
      );
    }
  }
});

Deno.test("syncContacts — stamps market on every upserted row", async () => {
  const pages = [
    [{ id: "c-1" }, { id: "c-2" }],
    [],
  ];
  const mockFetch = makeContactsPages(pages);
  const { sb, upsertCalls } = makeUpsertSb();
  const deadline = Date.now() + 60_000;

  await syncContacts(sb, ACCT, "test-api-key", deadline, null, mockFetch);

  for (const call of upsertCalls) {
    for (const row of call.rows as Record<string, unknown>[]) {
      assertEquals(
        row.market,
        "sedgwick_ks",
        `Every row must carry market='sedgwick_ks', got: ${JSON.stringify(row)}`,
      );
    }
  }
});

Deno.test("syncContacts — sets last_seen_by_api on every upserted row", async () => {
  const pages = [[{ id: "c-1" }], []];
  const mockFetch = makeContactsPages(pages);
  const { sb, upsertCalls } = makeUpsertSb();
  const deadline = Date.now() + 60_000;

  await syncContacts(sb, ACCT, "test-api-key", deadline, null, mockFetch);

  for (const call of upsertCalls) {
    for (const row of call.rows as Record<string, unknown>[]) {
      assertEquals(
        typeof row.last_seen_by_api,
        "string",
        "last_seen_by_api must be an ISO string on every row",
      );
    }
  }
});

Deno.test("syncContacts — budget-stop: no fetch beyond a past deadline", async () => {
  let fetchCount = 0;
  const mockFetch = () => {
    fetchCount++;
    const items = [{ id: "c-1" }];
    const body = JSON.stringify({ items, count: 1 });
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    );
  };

  const { sb } = makeUpsertSb();
  // Deadline already in the past — loop must not call fetch at all (or at most once).
  const pastDeadline = Date.now() - 1;
  await syncContacts(sb, ACCT, "test-api-key", pastDeadline, null, mockFetch);

  assertEquals(
    fetchCount,
    0,
    `With a past deadline, syncContacts must make 0 fetch calls, got: ${fetchCount}`,
  );
});

// ---------------------------------------------------------------------------
// Fix SC4: syncContacts returns API count for last_api_count watermark persistence
// ---------------------------------------------------------------------------

Deno.test("syncContacts — returns the API count from the response for last_api_count", async () => {
  let callNum = 0;
  const mockFetch = () => {
    const items = callNum === 0 ? [{ id: "c-1" }, { id: "c-2" }] : [];
    callNum++;
    const body = JSON.stringify({ items, count: 342 }); // API reports 342 total contacts
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    );
  };

  const { sb } = makeUpsertSb();
  const deadline = Date.now() + 60_000;
  const { apiCount } = await syncContacts(sb, ACCT, "test-api-key", deadline, null, mockFetch);

  assertEquals(
    apiCount,
    342,
    `syncContacts must return the API count (342) so caller can persist it as last_api_count`,
  );
});

Deno.test("syncContacts — returns null when no pages were fetched (budget-exhausted before first page)", async () => {
  const mockFetch = () => {
    const body = JSON.stringify({ items: [], count: 0 });
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "content-type": "application/json" } }),
    );
  };

  const { sb } = makeUpsertSb();
  const pastDeadline = Date.now() - 1;
  const { apiCount, complete } = await syncContacts(sb, ACCT, "test-api-key", pastDeadline, null, mockFetch);
  assertEquals(complete, false, "a run that read nothing has not completed the cycle");

  assertEquals(
    apiCount,
    null,
    "syncContacts must return null when budget expired before any fetch (no api_count observed)",
  );
});

// ---------------------------------------------------------------------------
// 2026-07-01 fix: pageStartIndex is a PAGE NUMBER — advance by 1, not items.length.
// Regression guard for the wichita-contacts-stuck-at-64 bug.
// ---------------------------------------------------------------------------

Deno.test("syncContacts — pageStartIndex advances by 1 per page (page-number pagination)", async () => {
  const seenPageStartIndex: number[] = [];
  // 3 full pages of 50, then a short final page of 10 → sweep must fetch pages 0,1,2,3.
  const mockFetch = (url: string | URL | Request) => {
    const u = String(url);
    const m = u.match(/pageStartIndex=(\d+)/);
    const p = m ? Number(m[1]) : -1;
    seenPageStartIndex.push(p);
    const count = 160;
    const full = Array.from({ length: 50 }, (_, i) => ({ id: `c-${p}-${i}` }));
    const items = p < 3 ? full : Array.from({ length: 10 }, (_, i) => ({ id: `c-${p}-${i}` }));
    return Promise.resolve(
      new Response(JSON.stringify({ items, count }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };

  const { sb } = makeUpsertSb();
  const result = await syncContacts(sb, ACCT, "test-api-key", Date.now() + 60_000, null, mockFetch);

  assertEquals(
    seenPageStartIndex,
    [0, 1, 2, 3],
    `pageStartIndex must increment by 1 per page (page number), got: ${JSON.stringify(seenPageStartIndex)}`,
  );
  assertEquals(result.apiCount, 160, "returns the API-reported total count");
  assertEquals(result.complete, true, "the short last page completes the cycle");
});

// ---------------------------------------------------------------------------
// Contact channels (migration 320). All values below are synthetic test fixtures.
// ---------------------------------------------------------------------------

const jsonRes = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

const FULL_CONTACT = {
  id: "c-full",
  firstName: "Test",
  phoneNumbers: [
    { id: "p-1", number: "(555) 010-0001", ext: "", type: "Mobile", primary: true, smsOptOut: false, _link: "x" },
    { id: "p-2", number: "(555) 010-0002", ext: "12", type: "Home", primary: false, smsOptOut: true, _link: "x" },
  ],
  emailAddresses: [{ id: "e-1", address: "owner@example.test", type: "Personal", primary: true, _link: "x" }],
};
const STUB_CONTACT = {
  id: "c-stub",
  phoneNumbers: [{ id: "p-9", _link: "x" }],
  emailAddresses: [],
};

Deno.test("syncContacts — asks the list call for includes=emailAddress,phoneNumber", async () => {
  const urls: string[] = [];
  const { sb } = makeUpsertSb();
  await syncContacts(sb, ACCT, "k", Date.now() + 60_000, null, (u) => { urls.push(String(u)); return jsonRes({ items: [], count: 0 }); });
  assertEquals(urls[0].includes("includes=emailAddress,phoneNumber"), true, urls[0]);
});

Deno.test("syncContacts — upserts full phone and email children and stamps the contact", async () => {
  const { sb, upsertCalls, updateCalls } = makeUpsertSb();
  const r = await syncContacts(sb, ACCT, "k", Date.now() + 60_000, null, () => jsonRes({ items: [FULL_CONTACT], count: 1 }));

  assertEquals(r.complete, true);
  assertEquals([r.phones, r.emails, r.channelsComplete], [2, 1, 1]);

  const contactRows = upsertCalls.filter((c) => c.table === "acculynx_contacts").flatMap((c) => c.rows) as Record<string, unknown>[];
  assertEquals(contactRows.length, 1);
  assertEquals(typeof contactRows[0].channels_synced_at, "string", "a fully read contact is stamped");

  const phones = upsertCalls.find((c) => c.table === "acculynx_contact_phones");
  assertEquals((phones?.options as { onConflict: string }).onConflict, "id");
  const [p1, p2] = phones!.rows as Record<string, unknown>[];
  assertEquals([p1.id, p1.contact_id, p1.phone_type, p1.is_primary, p1.sms_opt_out, p1.phone_ext], ["p-1", "c-full", "Mobile", true, false, null]);
  assertEquals([p2.sms_opt_out, p2.phone_ext, p2.account_key, p2.market], [true, "12", "kansas_city", "sedgwick_ks"]);
  assertEquals(p1.archived_at, null, "a child seen on the contact is live");
  assertEquals("trust_tier" in p1, false, "the sync never writes trust_tier (hard rule 4)");
  assertEquals((p1.raw as { id: string }).id, "p-1", "raw keeps the source child");

  const emails = upsertCalls.find((c) => c.table === "acculynx_contact_emails");
  const e1 = (emails!.rows as Record<string, unknown>[])[0];
  assertEquals([e1.id, e1.contact_id, e1.email_type, e1.is_primary], ["e-1", "c-full", "Personal", true]);
  assertEquals(e1.email_address, "owner@example.test");

  // Children the contact no longer has are archived — scoped to this account and these contacts, never deleted.
  assertEquals(updateCalls.map((u) => u.table), ["acculynx_contact_phones", "acculynx_contact_emails"]);
  for (const u of updateCalls) {
    assertEquals(u.patch.archive_reason, "removed_from_contact");
    assertEquals(u.where[0], ["eq", "account_key", "kansas_city"]);
    assertEquals(u.where[1], ["in", "contact_id", ["c-full"]]);
    assertEquals(u.where[2], ["is", "archived_at", null]);
    assertEquals(u.where[3][0], "lt");
    assertEquals(u.where[3][1], "last_seen_by_api");
  }
});

Deno.test("syncContacts — a stub child writes no channel row and leaves the contact owed", async () => {
  const { sb, upsertCalls, updateCalls } = makeUpsertSb();
  const r = await syncContacts(sb, ACCT, "k", Date.now() + 60_000, null, () => jsonRes({ items: [STUB_CONTACT, FULL_CONTACT], count: 2 }));

  assertEquals(r.channelsComplete, 1);
  const contactUpserts = upsertCalls.filter((c) => c.table === "acculynx_contacts");
  assertEquals(contactUpserts.length, 2, "stamped and unstamped contacts are written separately (no column-union null wipe)");
  for (const call of contactUpserts) {
    const keys = (call.rows as Record<string, unknown>[]).map((row) => "channels_synced_at" in row);
    assertEquals(new Set(keys).size, 1, "every row in one upsert has the same columns");
  }
  const stubRow = contactUpserts.flatMap((c) => c.rows as Record<string, unknown>[]).find((row) => row.id === "c-stub");
  assertEquals("channels_synced_at" in stubRow!, false);
  const phoneIds = upsertCalls.filter((c) => c.table === "acculynx_contact_phones").flatMap((c) => (c.rows as { id: string }[]).map((x) => x.id));
  assertEquals(phoneIds.includes("p-9"), false, "a stub has no value to write");
  for (const u of updateCalls) assertEquals(u.where[1], ["in", "contact_id", ["c-full"]], "only fully read contacts archive children");
});

Deno.test("syncContacts — an address without '@' is stored as NULL, raw keeps the source", () => {
  const ch = extractChannels({ id: "c", emailAddresses: [{ id: "e", address: "not-an-address", primary: true }] }, ACCT, "t");
  assertEquals(ch.emails[0].email_address, null);
  assertEquals((ch.emails[0].raw as { address: string }).address, "not-an-address");
  assertEquals(ch.complete, true);
});

Deno.test("syncContacts — a 400 on includes re-reads the page without it and keeps syncing contacts", async () => {
  const urls: string[] = [];
  const { sb, upsertCalls } = makeUpsertSb();
  const r = await syncContacts(sb, ACCT, "k", Date.now() + 60_000, null, (u) => {
    urls.push(String(u));
    return String(u).includes("includes=") ? jsonRes({ message: "bad" }, 400) : jsonRes({ items: [STUB_CONTACT], count: 1 });
  });
  assertEquals(urls.length, 2);
  assertEquals(urls[1].includes("includes="), false);
  assertEquals(urls[1].includes("pageStartIndex=0"), true, "the same page is re-read");
  assertEquals(r.includesRejected, true);
  assertEquals(r.complete, true);
  assertEquals(upsertCalls.some((c) => c.table === "acculynx_contacts"), true);
});

Deno.test("syncContacts — resumes at the watermark page and reports where a cut-short run stopped", async () => {
  const pages: number[] = [];
  const { sb } = makeUpsertSb();
  const full = Array.from({ length: 50 }, (_, i) => ({ id: `c-${i}` }));
  const r = await syncContacts(sb, ACCT, "k", Date.now() + 60_000, { last_page_index: 3 }, (u) => {
    const p = Number(String(u).match(/pageStartIndex=(\d+)/)![1]);
    pages.push(p);
    return p === 3 ? jsonRes({ items: full, count: 400 }) : jsonRes({ message: "server" }, 500);
  });
  assertEquals(pages, [3, 4]);
  assertEquals(r.complete, false, "an error page does not complete the cycle (nothing may be archived)");
  assertEquals(r.nextPage, 4);
});

Deno.test("enrichContactChannels — reads owed contacts by id, falls back to the child list, stamps, scoped to the account", async () => {
  const filters: string[] = [];
  const upserts: { table: string; rows: Record<string, unknown>[] }[] = [];
  const stamps: { patch: Record<string, unknown>; where: unknown[][] }[] = [];
  let table = "";
  let pending: { patch: Record<string, unknown>; where: unknown[][]; archive: boolean } | undefined;
  // deno-lint-ignore no-explicit-any
  const sb: any = {
    from: (t: string) => { table = t; return sb; },
    select: (c: string) => { filters.push("select:" + c); return sb; },
    or: (f: string) => { filters.push("or:" + f.split(",")[0]); return sb; },
    order: () => sb,
    limit: () => Promise.resolve({ data: [{ id: "c-a" }, { id: "c-gone" }, { id: "c-err" }], error: null }),
    upsert: (rows: Record<string, unknown>[]) => { upserts.push({ table, rows }); return Promise.resolve({ error: null }); },
    update: (patch: Record<string, unknown>) => {
      pending = { patch, where: [], archive: table !== "acculynx_contacts" };
      if (!pending.archive) stamps.push(pending);
      return sb;
    },
    in: () => sb,
    lt: () => { pending = undefined; return Promise.resolve({ error: null }); },
    is: (c: string, v: unknown) => { if (!pending) filters.push(`is:${c}:${v}`); return sb; },
    eq: (c: string, v: unknown) => {
      if (!pending) { filters.push(`eq:${c}:${v}`); return sb; }
      pending.where.push([c, v]);
      if (!pending.archive && pending.where.length === 2) { pending = undefined; return Promise.resolve({ error: null }); }
      return sb;
    },
  };
  const urls: string[] = [];
  const fetchFn = (u: string | URL | Request) => {
    const url = String(u);
    urls.push(url.replace("https://api.acculynx.com/api/v2", ""));
    if (url.endsWith("/contacts/c-a?includes=emailAddress,phoneNumber")) {
      return jsonRes({ id: "c-a", phoneNumbers: [{ id: "p-a", _link: "x" }], emailAddresses: [{ id: "e-a", address: "a@example.test", primary: true }] });
    }
    if (url.endsWith("/contacts/c-a/phone-numbers")) {
      return jsonRes({ items: [{ id: "p-a", number: "(555) 010-0003", type: "Mobile", primary: true, smsOptOut: false }] });
    }
    if (url.includes("/contacts/c-gone")) return jsonRes({}, 404);
    return jsonRes({ message: "server" }, 500);
  };

  const n = await enrichContactChannels(sb, ACCT, "k", Date.now() + 60_000, fetchFn as typeof fetch);

  assertEquals(n, 1);
  assertEquals(filters.includes("eq:account_key:kansas_city"), true);
  assertEquals(filters.includes("is:archived_at:null"), true);
  assertEquals(filters.includes("or:channels_synced_at.is.null"), true);
  assertEquals(urls, [
    "/contacts/c-a?includes=emailAddress,phoneNumber",
    "/contacts/c-a/phone-numbers",
    "/contacts/c-gone?includes=emailAddress,phoneNumber",
    "/contacts/c-err?includes=emailAddress,phoneNumber",
  ]);
  const phone = upserts.find((u) => u.table === "acculynx_contact_phones")!.rows[0];
  assertEquals([phone.id, phone.contact_id, phone.sms_opt_out], ["p-a", "c-a", false]);
  assertEquals(upserts.find((u) => u.table === "acculynx_contact_emails")!.rows[0].email_address, "a@example.test");
  assertEquals(stamps.length, 2, "c-gone (404) and c-a are stamped; a 500 writes nothing");
  for (const s of stamps) {
    assertEquals(Object.keys(s.patch), ["channels_synced_at"]);
    assertEquals(s.where[1], ["account_key", "kansas_city"]);
  }
});

Deno.test("enrichContactChannels — stops at the run budget", async () => {
  let fetched = 0;
  // deno-lint-ignore no-explicit-any
  const sb: any = { from: () => sb, select: () => sb, eq: () => sb, is: () => sb, or: () => sb, order: () => sb, limit: () => Promise.resolve({ data: [{ id: "a" }], error: null }) };
  const n = await enrichContactChannels(sb, ACCT, "k", Date.now() - 1, () => { fetched++; return jsonRes({}); });
  assertEquals([n, fetched], [0, 0]);
});
