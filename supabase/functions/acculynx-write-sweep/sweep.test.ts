// Deno smoke tests for the acculynx-write-sweep core (Phase 4, plan 04-01 Task 3).
// Run: deno test supabase/functions/acculynx-write-sweep/sweep.test.ts
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  assertSandbox,
  buildContactAddress,
  buildJobAddress,
  classifyVerdict2,
  isReachableRoute,
  looksLikeProblemDetails,
  pathParams,
  redactSample,
  SANDBOX_SECRET_NAME,
  shouldStopProbing,
  type VerdictInput,
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

// --- Plan 04-03: evidence-correctness classifier tests ---

Deno.test("looksLikeProblemDetails — true when >=2 canonical ProblemDetails keys present", () => {
  assert(looksLikeProblemDetails(["type", "title", "status", "detail", "traceId"]));
  assert(looksLikeProblemDetails(["title", "status"]));
  assert(!looksLikeProblemDetails(["status"])); // only 1 key -> not enough
  assert(!looksLikeProblemDetails(["message", "code"])); // platform 404, not AccuLynx ProblemDetails
  assert(!looksLikeProblemDetails([]));
});

Deno.test("isReachableRoute — any 2xx is reachable regardless of body shape", () => {
  assert(isReachableRoute(200, []));
  assert(isReachableRoute(201, ["id"]));
  assert(isReachableRoute(204, []));
});

Deno.test("isReachableRoute — 500 is reachable (handler crashed, route exists)", () => {
  assert(isReachableRoute(500, []));
  assert(isReachableRoute(500, ["message"]));
});

Deno.test("isReachableRoute — 400 with ProblemDetails body is reachable (validation error)", () => {
  assert(isReachableRoute(400, ["type", "title", "status", "detail", "traceId"]));
});

Deno.test("isReachableRoute — 404 with ProblemDetails body is reachable (missing child resource, not route-not-found)", () => {
  assert(isReachableRoute(404, ["type", "title", "status", "detail"]));
});

Deno.test("isReachableRoute — bare 404 with no ProblemDetails keys is NOT reachable (genuine route-not-found)", () => {
  assert(!isReachableRoute(404, []));
  assert(!isReachableRoute(404, ["message"]));
});

Deno.test("isReachableRoute — bare 405 with no ProblemDetails keys is NOT reachable (genuine method-not-allowed)", () => {
  assert(!isReachableRoute(405, []));
});

function baseVerdictInput(overrides: Partial<VerdictInput>): VerdictInput {
  return {
    probeability: "probeable",
    neverProbed: false,
    isSearchShaped: false,
    isWriteOnlyShaped: false,
    probes: [],
    createdEntityId: null,
    method: "POST",
    missingChildIdName: null,
    ...overrides,
  };
}

Deno.test("classifyVerdict2 — probeability blocked-by-dependency short-circuits", () => {
  const v = classifyVerdict2(baseVerdictInput({ probeability: "blocked-by-dependency" }));
  assertEquals(v, "blocked-by-dependency");
});

Deno.test("classifyVerdict2 — neverProbed -> blocked-by-dependency", () => {
  const v = classifyVerdict2(baseVerdictInput({ neverProbed: true }));
  assertEquals(v, "blocked-by-dependency");
});

Deno.test("classifyVerdict2 — search-shaped -> read-shaped even with a 200", () => {
  const v = classifyVerdict2(
    baseVerdictInput({ isSearchShaped: true, probes: [{ status: 200, topKeys: ["items"], guardrail: null }] }),
  );
  assertEquals(v, "read-shaped");
});

Deno.test("classifyVerdict2 — a genuinely-absent route (no reachable signal at all) -> unsupported", () => {
  const v = classifyVerdict2(
    baseVerdictInput({
      probes: [
        { status: 404, topKeys: [], guardrail: null },
        { status: 404, topKeys: ["message"], guardrail: null },
      ],
    }),
  );
  assertEquals(v, "unsupported");
});

Deno.test("classifyVerdict2 — reachable 400 ProblemDetails validation error (missing child id) -> blocked-by-dependency, NOT unsupported", () => {
  const v = classifyVerdict2(
    baseVerdictInput({
      probes: [{ status: 400, topKeys: ["type", "title", "status", "detail", "traceId"], guardrail: null }],
      missingChildIdName: "userId",
    }),
  );
  assertEquals(v, "blocked-by-dependency");
});

Deno.test("classifyVerdict2 — reachable 404 ProblemDetails (missing child resource) -> blocked-by-dependency, NOT unsupported", () => {
  const v = classifyVerdict2(
    baseVerdictInput({
      probes: [{ status: 404, topKeys: ["type", "title", "status", "detail"], guardrail: null }],
      missingChildIdName: "documentFolderId",
    }),
  );
  assertEquals(v, "blocked-by-dependency");
});

Deno.test("classifyVerdict2 — 500 on an otherwise-empty body -> fragile-with-guardrail (e.g. putTradeTypesForJob empty-body crash)", () => {
  const v = classifyVerdict2(
    baseVerdictInput({
      probes: [{ status: 500, topKeys: [], guardrail: null }],
    }),
  );
  assertEquals(v, "fragile-with-guardrail");
});

Deno.test("classifyVerdict2 — success + a guardrail (e.g. 412) -> fragile-with-guardrail", () => {
  const v = classifyVerdict2(
    baseVerdictInput({
      probes: [
        { status: 412, topKeys: ["type", "title", "status"], guardrail: "precondition_failed" },
        { status: 201, topKeys: ["id"], guardrail: null },
      ],
      createdEntityId: "abc-123",
    }),
  );
  assertEquals(v, "fragile-with-guardrail");
});

Deno.test("classifyVerdict2 — write-only shaped success with no created-entity read-back -> write-only", () => {
  const v = classifyVerdict2(
    baseVerdictInput({
      isWriteOnlyShaped: true,
      probes: [{ status: 201, topKeys: ["id"], guardrail: null }],
      createdEntityId: "msg-1",
    }),
  );
  assertEquals(v, "write-only");
});

Deno.test("classifyVerdict2 — POST success with no created entity id -> write-only (side-channel, e.g. mutate-only POST)", () => {
  const v = classifyVerdict2(
    baseVerdictInput({
      method: "POST",
      probes: [{ status: 204, topKeys: [], guardrail: null }],
      createdEntityId: null,
    }),
  );
  assertEquals(v, "write-only");
});

Deno.test("classifyVerdict2 — clean success with a created entity -> writable", () => {
  const v = classifyVerdict2(
    baseVerdictInput({
      method: "POST",
      probes: [{ status: 201, topKeys: ["id"], guardrail: null }],
      createdEntityId: "job-1",
    }),
  );
  assertEquals(v, "writable");
});

Deno.test("classifyVerdict2 — PUT clean success (204, no body) -> writable", () => {
  const v = classifyVerdict2(
    baseVerdictInput({
      method: "PUT",
      probes: [{ status: 204, topKeys: [], guardrail: null }],
      createdEntityId: null,
    }),
  );
  assertEquals(v, "writable");
});
