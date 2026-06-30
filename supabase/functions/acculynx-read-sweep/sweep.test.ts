// Deno smoke tests for the acculynx-read-sweep core (plan 01-02 Task 1).
// Run: deno test supabase/functions/acculynx-read-sweep/sweep.test.ts
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  assertSandbox,
  paginationParam,
  pathParams,
  redactSample,
  SANDBOX_SECRET_NAME,
} from "./sweep.ts";

Deno.test("assertSandbox throws for any production key name", () => {
  for (
    const prod of [
      "PE_CC_KANSAS_CITY_ACCULYNX_API_KEY",
      "PE_CC_FLORIDA_ACCULYNX_API_KEY",
      "ACCULYNX_API_KEY",
      "",
    ]
  ) {
    assertThrows(() => assertSandbox(prod), Error, "sandbox-only");
  }
});

Deno.test("assertSandbox accepts the sandbox key name", () => {
  assertSandbox(SANDBOX_SECRET_NAME); // must not throw
});

Deno.test("paginationParam — recordStartIndex wins over pageStartIndex", () => {
  assertEquals(paginationParam(["recordStartIndex", "pageSize"]), "recordStartIndex");
  assertEquals(paginationParam([{ name: "pageStartIndex" }, { name: "pageSize" }]), "pageStartIndex");
  assertEquals(paginationParam(["includes"]), null);
  assertEquals(paginationParam({ pagination_param: "recordStartIndex" }), "recordStartIndex");
  assertEquals(paginationParam({ pagination_param: null }), null);
  assertEquals(paginationParam({ parameters: [{ name: "pageStartIndex" }] }), "pageStartIndex");
});

Deno.test("redactSample masks homeowner PII but preserves keys + non-PII values", () => {
  const raw = {
    id: "abc-123",
    jobName: "KS-8: Daniel Nagel",
    currentMilestone: "approved",
    locationAddress: { street1: "123 Main St", city: "Wichita", zipCode: "67203" },
    contacts: [{ firstName: "Daniel", lastName: "Nagel", email: "d@x.com", isPrimary: true }],
    count: 42,
  };
  const out = redactSample(raw) as Record<string, any>;

  // PII values masked
  assertEquals(out.jobName, "[redacted:string]");
  assertEquals(out.locationAddress.street1, "[redacted:string]");
  assertEquals(out.contacts[0].firstName, "[redacted:string]");
  assertEquals(out.contacts[0].email, "[redacted:string]");

  // keys + structure + non-PII values survive
  assert("jobName" in out && "locationAddress" in out);
  assertEquals(out.id, "abc-123");
  assertEquals(out.currentMilestone, "approved");
  assertEquals(out.locationAddress.city, "Wichita");
  assertEquals(out.locationAddress.zipCode, "67203");
  assertEquals(out.contacts[0].isPrimary, true);
  assertEquals(out.count, 42);
});

Deno.test("redactSample truncates very long non-PII strings", () => {
  const long = "x".repeat(500);
  const out = redactSample({ description: long }) as Record<string, string>;
  assert(out.description.length < 500);
  assert(out.description.startsWith("xxxx"));
});

Deno.test("pathParams extracts ordered path parameters", () => {
  assertEquals(pathParams("/jobs/{jobId}/contacts/{jobContactId}"), ["jobId", "jobContactId"]);
  assertEquals(pathParams("/jobs"), []);
});
