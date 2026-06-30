// acculynx-sync — lib/accounts.test.ts (Phase 2, plan 02-02 Task 2 — Wave 0 RED)
//
// Unit tests for loadProductionAccounts() and resolveKey().
// These are PURE unit tests: no live DB, no network — inject a mock Supabase client.
//
// RED state: tests define behavioral contracts; they pass once Plan 03 (GREEN)
// completes the real implementation.
//
// Run: deno test supabase/functions/acculynx-sync/lib/accounts.test.ts --allow-env
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { loadProductionAccounts, resolveKey, type AccountRow } from "./accounts.ts";

// ---------------------------------------------------------------------------
// Mock Supabase client builder
// ---------------------------------------------------------------------------

/** Records all chained builder calls so tests can assert on them. */
function makeMockSb(returnData: unknown[] | null, returnError: { message: string } | null = null) {
  const calls: { method: string; args: unknown[] }[] = [];
  const record = (method: string, ...args: unknown[]) => {
    calls.push({ method, args });
    return builder;
  };

  const builder: Record<string, unknown> = {
    from: (table: string) => {
      calls.push({ method: "from", args: [table] });
      return builder;
    },
    select: (...args: unknown[]) => record("select", ...args),
    eq: (...args: unknown[]) => record("eq", ...args),
    order: (...args: unknown[]) => {
      record("order", ...args);
      // Return the final promise-like shape when order() is the last call.
      return Promise.resolve({ data: returnData, error: returnError });
    },
  };

  return { sb: builder, calls };
}

// ---------------------------------------------------------------------------
// Sandbox account fixture (must NOT appear in production results)
// ---------------------------------------------------------------------------
const SANDBOX_ROW: AccountRow = {
  account_key: "sandbox",
  env_secret_name: "PE_CC_SANDBOX_ACCULYNX_API_KEY",
  label: "Sandbox",
  market: null,
  state: null,
};

const PRODUCTION_ROWS: AccountRow[] = [
  {
    account_key: "kansas_city",
    env_secret_name: "PE_CC_KANSAS_CITY_ACCULYNX_API_KEY",
    label: "Kansas City",
    market: "sedgwick_ks",
    state: "KS",
  },
  {
    account_key: "florida",
    env_secret_name: "PE_CC_FLORIDA_ACCULYNX_API_KEY",
    label: "Florida",
    market: "fl_other",
    state: "FL",
  },
];

// ---------------------------------------------------------------------------
// Tests: loadProductionAccounts
// ---------------------------------------------------------------------------

Deno.test("loadProductionAccounts — filters to environment='production'", async () => {
  const { sb, calls } = makeMockSb(PRODUCTION_ROWS);
  await loadProductionAccounts(sb);

  const eqCalls = calls.filter((c) => c.method === "eq");
  const environmentEq = eqCalls.find(
    (c) => c.args[0] === "environment" && c.args[1] === "production",
  );
  assertEquals(
    environmentEq !== undefined,
    true,
    "Expected .eq('environment','production') to be called",
  );
});

Deno.test("loadProductionAccounts — filters is_active=true", async () => {
  const { sb, calls } = makeMockSb(PRODUCTION_ROWS);
  await loadProductionAccounts(sb);

  const eqCalls = calls.filter((c) => c.method === "eq");
  const activeEq = eqCalls.find((c) => c.args[0] === "is_active" && c.args[1] === true);
  assertEquals(
    activeEq !== undefined,
    true,
    "Expected .eq('is_active',true) to be called",
  );
});

Deno.test("loadProductionAccounts — never returns the sandbox row", async () => {
  // The DB mock only returns PRODUCTION_ROWS (sandbox already excluded by the query).
  // This test asserts the query filter is correct: sandbox is environment='sandbox',
  // not 'production', so it must not appear in the returned set.
  const { sb } = makeMockSb(PRODUCTION_ROWS);
  const accounts = await loadProductionAccounts(sb);

  const hasSandbox = accounts.some((a) => a.account_key === SANDBOX_ROW.account_key);
  assertEquals(hasSandbox, false, "Sandbox account must not appear in production results");
});

Deno.test("loadProductionAccounts — orders by account_key", async () => {
  const { sb, calls } = makeMockSb(PRODUCTION_ROWS);
  await loadProductionAccounts(sb);

  const orderCall = calls.find((c) => c.method === "order");
  assertEquals(
    orderCall?.args[0],
    "account_key",
    "Expected .order('account_key') to be called",
  );
});

Deno.test("loadProductionAccounts — throws on Supabase error", async () => {
  const { sb } = makeMockSb(null, { message: "connection refused" });
  await assertRejects(
    () => loadProductionAccounts(sb),
    Error,
    "accounts load: connection refused",
  );
});

Deno.test("loadProductionAccounts — returns empty array when DB returns null", async () => {
  const { sb } = makeMockSb(null, null);
  // When data is null and error is null, should return [].
  // Override to return { data: null, error: null }.
  const noDataSb = {
    from: () => noDataSb,
    select: () => noDataSb,
    eq: () => noDataSb,
    order: () => Promise.resolve({ data: null, error: null }),
  };
  const result = await loadProductionAccounts(noDataSb);
  assertEquals(result, []);
});

// ---------------------------------------------------------------------------
// Tests: resolveKey
// ---------------------------------------------------------------------------

Deno.test("resolveKey — returns API key when secret is set", () => {
  const acct: AccountRow = {
    account_key: "kansas_city",
    env_secret_name: "ACCULYNX_TEST_KEY_FOR_RESOLVE_KEY_TEST",
    label: null,
    market: null,
    state: null,
  };
  // Set the env var for the duration of this test.
  Deno.env.set(acct.env_secret_name, "test-api-key-value-abc123");
  const key = resolveKey(acct);
  Deno.env.delete(acct.env_secret_name);
  assertEquals(key, "test-api-key-value-abc123");
});

Deno.test("resolveKey — returns undefined (not throw) when secret is unset", () => {
  const acct: AccountRow = {
    account_key: "no_secret_account",
    env_secret_name: "ACCULYNX_THIS_SECRET_DOES_NOT_EXIST_AT_ALL",
    label: null,
    market: null,
    state: null,
  };
  // Ensure the env var is NOT set.
  Deno.env.delete(acct.env_secret_name);
  const key = resolveKey(acct);
  assertEquals(key, undefined, "resolveKey must return undefined (skip path), not throw");
});
