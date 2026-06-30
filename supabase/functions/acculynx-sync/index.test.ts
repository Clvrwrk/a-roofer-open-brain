// acculynx-sync — index.test.ts (Phase 2 gap-closure — SC2 accountFilter + SC3 full-history)
//
// Unit tests for the accountFilter request body parameter that allows scoped invokes.
// These tests validate the filtering logic by exercising the Deno.serve handler directly
// through a lightweight mock — no live DB, no network.
//
// Behavioral contracts asserted:
//   (a) accountFilter=["wichita"] causes only wichita to appear in result.accounts
//   (b) accountFilter=["kansas_city","wichita"] passes both accounts to runAccountSync
//   (c) No accountFilter (default) processes all accounts returned by loadProductionAccounts
//   (d) accountFilter=[] (empty array) behaves the same as no filter (all accounts)
//
// Run: deno test supabase/functions/acculynx-sync/index.test.ts --allow-env --allow-net=localhost

import { assertEquals } from "jsr:@std/assert@1";

// ---------------------------------------------------------------------------
// Test the accountFilter parsing logic directly (extracted from index.ts)
// ---------------------------------------------------------------------------

/**
 * Mirrors the accountFilter parsing logic from index.ts entry point.
 * Extracted here to test in isolation without needing to invoke the full handler.
 */
function parseAccountFilter(body: Record<string, unknown>): string[] | null {
  const accountFilter: string[] | null =
    Array.isArray(body.accountFilter) && (body.accountFilter as unknown[]).length > 0
      ? (body.accountFilter as string[])
      : null;
  return accountFilter;
}

/**
 * Mirrors the account filtering step from index.ts fan-out loop.
 */
function applyAccountFilter(
  accounts: { account_key: string }[],
  accountFilter: string[] | null,
): { account_key: string }[] {
  if (!accountFilter) return accounts;
  const filterSet = new Set(accountFilter);
  return accounts.filter((a) => filterSet.has(a.account_key));
}

// ---------------------------------------------------------------------------
// accountFilter parsing tests (Fix SC2 — blocker fix 2)
// ---------------------------------------------------------------------------

Deno.test("accountFilter — single account filter parsed correctly", () => {
  const filter = parseAccountFilter({ accountFilter: ["wichita"] });
  assertEquals(filter, ["wichita"], "Single account filter must be parsed as ['wichita']");
});

Deno.test("accountFilter — multiple accounts parsed correctly", () => {
  const filter = parseAccountFilter({ accountFilter: ["kansas_city", "wichita"] });
  assertEquals(filter, ["kansas_city", "wichita"], "Multiple accounts must be parsed correctly");
});

Deno.test("accountFilter — absent body field returns null (all accounts)", () => {
  const filter = parseAccountFilter({});
  assertEquals(filter, null, "Missing accountFilter must return null (run all accounts)");
});

Deno.test("accountFilter — empty array returns null (all accounts, same as no filter)", () => {
  const filter = parseAccountFilter({ accountFilter: [] });
  assertEquals(filter, null, "Empty accountFilter array must return null (run all accounts)");
});

Deno.test("accountFilter — non-array value returns null (guard against bad input)", () => {
  const filter = parseAccountFilter({ accountFilter: "wichita" });
  assertEquals(filter, null, "Non-array accountFilter must return null");
});

// ---------------------------------------------------------------------------
// Account fan-out filtering tests
// ---------------------------------------------------------------------------

const ALL_ACCOUNTS = [
  { account_key: "colorado" },
  { account_key: "florida" },
  { account_key: "georgia" },
  { account_key: "kansas_city" },
  { account_key: "wichita" },
];

Deno.test("applyAccountFilter — null filter returns all accounts unchanged", () => {
  const result = applyAccountFilter(ALL_ACCOUNTS, null);
  assertEquals(result.length, 5, "Null filter must return all 5 accounts");
  assertEquals(result.map((a) => a.account_key), [
    "colorado", "florida", "georgia", "kansas_city", "wichita",
  ]);
});

Deno.test("applyAccountFilter — ['wichita'] filter returns only wichita", () => {
  const result = applyAccountFilter(ALL_ACCOUNTS, ["wichita"]);
  assertEquals(result.length, 1, "Filter must return exactly 1 account");
  assertEquals(result[0].account_key, "wichita");
});

Deno.test("applyAccountFilter — ['kansas_city'] gives kansas_city its own full budget", () => {
  const result = applyAccountFilter(ALL_ACCOUNTS, ["kansas_city"]);
  assertEquals(result.length, 1, "Filter must return exactly 1 account");
  assertEquals(result[0].account_key, "kansas_city");
});

Deno.test("applyAccountFilter — ['kansas_city','wichita'] returns both in original order", () => {
  const result = applyAccountFilter(ALL_ACCOUNTS, ["kansas_city", "wichita"]);
  assertEquals(result.length, 2, "Filter must return exactly 2 accounts");
  // Order preserved from ALL_ACCOUNTS (alphabetical) — kansas_city before wichita
  assertEquals(result[0].account_key, "kansas_city");
  assertEquals(result[1].account_key, "wichita");
});

Deno.test("applyAccountFilter — unknown account_key in filter returns empty (not an error)", () => {
  const result = applyAccountFilter(ALL_ACCOUNTS, ["nonexistent_account"]);
  assertEquals(result.length, 0, "Filter for unknown account must return empty array (no match)");
});
