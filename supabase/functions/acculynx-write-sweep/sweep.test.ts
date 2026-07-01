// Deno smoke tests for the acculynx-write-sweep core (Phase 4, plan 04-01 Task 3).
// Run: deno test supabase/functions/acculynx-write-sweep/sweep.test.ts
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  assertSandbox,
  buildContactAddress,
  buildJobAddress,
  pathParams,
  redactSample,
  SANDBOX_SECRET_NAME,
  shouldStopProbing,
} from "./sweep.ts";

Deno.test("assertSandbox throws for any production key name", () => {
  for (
    const prod of [
      "PE_CC_KANSAS_CITY_ACCULYNX_API_KEY",
      "PE_CC_FLORIDA_ACCULYNX_API_KEY",
      "PE_CC_WICHITA_ACCULYNX_API_KEY",
      "PE_CC_TULSA_ACCULYNX_API_KEY",
      "PE_CC_OKLAHOMA_CITY_ACCULYNX_API_KEY",
      "PE_CC_SPRINGFIELD_ACCULYNX_API_KEY",
      "PE_CC_ST_LOUIS_ACCULYNX_API_KEY",
      "PE_CC_DENVER_ACCULYNX_API_KEY",
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

Deno.test("redactSample preserves non-PII write-body fields (checkNumber, amount)", () => {
  const raw = {
    from: "Jordan Sandbox0",
    amount: 1250.5,
    checkNumber: "1042",
    paymentDate: "2026-07-01",
    notes: "deposit",
  };
  const out = redactSample(raw) as Record<string, any>;
  assertEquals(out.from, "[redacted:string]");
  assertEquals(out.amount, 1250.5);
  assertEquals(out.checkNumber, "1042");
  assertEquals(out.paymentDate, "2026-07-01");
  assertEquals(out.notes, "deposit");
});

Deno.test("redactSample truncates very long non-PII strings", () => {
  const long = "x".repeat(500);
  const out = redactSample({ description: long }) as Record<string, string>;
  assert(out.description.length < 500);
  assert(out.description.startsWith("xxxx"));
});

Deno.test("pathParams extracts ordered path parameters", () => {
  assertEquals(pathParams("/jobs/{jobId}/financials/{financialsId}"), ["jobId", "financialsId"]);
  assertEquals(pathParams("/contacts"), []);
});

Deno.test("shouldStopProbing — 0 or 1 probes never stops", () => {
  assertEquals(shouldStopProbing([]), false);
  assertEquals(
    shouldStopProbing([{ status: 400, errorShape: "ValidationError", guardrail: null }]),
    false,
  );
});

Deno.test("shouldStopProbing — 2 consecutive identical-signal probes stops", () => {
  const sig = { status: 400, errorShape: "ValidationError", guardrail: null };
  assertEquals(shouldStopProbing([sig, sig]), true);
});

Deno.test("shouldStopProbing — 2 consecutive differing-signal probes does not stop", () => {
  const a = { status: 400, errorShape: "ValidationError", guardrail: null };
  const b = { status: 404, errorShape: "NotFound", guardrail: null };
  assertEquals(shouldStopProbing([a, b]), false);
});

Deno.test("shouldStopProbing — only the last two probes matter (3rd differs from 2nd, matches 1st)", () => {
  const a = { status: 400, errorShape: "ValidationError", guardrail: null };
  const b = { status: 404, errorShape: "NotFound", guardrail: null };
  // history [a, b, a] -> last two are (b, a): differ -> false
  assertEquals(shouldStopProbing([a, b, a]), false);
});

Deno.test("buildContactAddress uses OBJECT state/country; buildJobAddress uses STRING state/country", () => {
  const contact = buildContactAddress({
    street1: "1 Test St",
    city: "Wichita",
    state: "KS",
    zipCode: "67203",
    country: "US",
  });
  assertEquals(typeof contact.state, "object");
  assertEquals((contact.state as { abbreviation: string }).abbreviation, "KS");
  assertEquals(typeof contact.country, "object");

  const job = buildJobAddress({
    street1: "1 Test St",
    city: "Wichita",
    state: "KS",
    zipCode: "67203",
    country: "US",
  });
  assertEquals(typeof job.state, "string");
  assertEquals(job.state, "KS");
  assertEquals(typeof job.country, "string");
  assertEquals(job.country, "US");
});

Deno.test("buildContactAddress and buildJobAddress apply Wichita/KS defaults when fields are omitted", () => {
  const contact = buildContactAddress({});
  assertEquals(contact.city, "Wichita");
  assertEquals(typeof contact.state, "object");

  const job = buildJobAddress({});
  assertEquals(job.city, "Wichita");
  assertEquals(job.state, "KS");
});
