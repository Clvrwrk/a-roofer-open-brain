// Deno unit tests for the acculynx-write-action core (Phase 5, plan 05-01 Task 2).
// Run: deno test --allow-none supabase/functions/acculynx-write-action/action.test.ts
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  assertTarget,
  buildContactAddress,
  buildJobAddress,
  buildWriteRequest,
  computeIdempotencyKey,
  intId,
  LANES,
  redactSample,
  SANDBOX_SECRET_NAME,
  WRITE_ONLY_LANES,
  type WriteLane,
} from "./action.ts";

// --- assertTarget (D-09 barrier #1) ---

Deno.test("assertTarget accepts sandbox as the default, regardless of accountKey", () => {
  assertTarget("sandbox", ""); // must not throw
  assertTarget("sandbox", "anything"); // must not throw
});

Deno.test("assertTarget accepts explicit prod with a non-empty accountKey", () => {
  assertTarget("prod", "kansas_city"); // must not throw
});

Deno.test("assertTarget rejects prod with an empty accountKey — prod is never implicit", () => {
  assertThrows(() => assertTarget("prod", ""), Error, "non-empty accountKey");
});

Deno.test("assertTarget rejects an empty/ambiguous target", () => {
  assertThrows(() => assertTarget("", "x"), Error, "unrecognized targetEnv");
});

Deno.test("assertTarget rejects any target other than sandbox|prod", () => {
  assertThrows(() => assertTarget("staging", "x"), Error, "unrecognized targetEnv");
});

// --- intId (Pitfall 2) ---

Deno.test("intId coerces a numeric string to a number", () => {
  assertEquals(intId("42"), 42);
});

Deno.test("intId returns undefined for a non-numeric string", () => {
  assertEquals(intId("abc"), undefined);
});

Deno.test("intId returns undefined for null/undefined", () => {
  assertEquals(intId(null), undefined);
  assertEquals(intId(undefined), undefined);
});

// --- buildContactAddress / buildJobAddress (Pitfall 3) ---

Deno.test("buildContactAddress produces OBJECT state/country; buildJobAddress produces STRING state/country", () => {
  const contact = buildContactAddress({ street1: "1 Test St", city: "Wichita", state: "KS", zipCode: "67203" });
  assertEquals(typeof contact.state, "object");
  assertEquals((contact.state as { abbreviation: string }).abbreviation, "KS");
  assertEquals(typeof contact.country, "object");

  const job = buildJobAddress({ street1: "1 Test St", city: "Wichita", state: "KS", zipCode: "67203" });
  assertEquals(typeof job.state, "string");
  assertEquals(job.state, "KS");
  assertEquals(typeof job.country, "string");
});

Deno.test("buildContactAddress and buildJobAddress are distinct functions", () => {
  assert(buildContactAddress !== (buildJobAddress as unknown));
});

// --- redactSample ---

Deno.test("redactSample masks PII while preserving keys + non-PII values", () => {
  const raw = {
    id: "abc-123",
    jobName: "KS-8: Daniel Nagel",
    contacts: [{ firstName: "Daniel", email: "d@x.com", isPrimary: true }],
    count: 42,
  };
  const out = redactSample(raw) as Record<string, any>;
  assertEquals(out.jobName, "[redacted:string]");
  assertEquals(out.contacts[0].firstName, "[redacted:string]");
  assertEquals(out.contacts[0].email, "[redacted:string]");
  assertEquals(out.id, "abc-123");
  assertEquals(out.count, 42);
  assertEquals(out.contacts[0].isPrimary, true);
});

// --- computeIdempotencyKey ---

Deno.test("computeIdempotencyKey is deterministic for identical input", () => {
  const input = {
    lane: "postJobMessage" as WriteLane,
    accountKey: "sandbox",
    targetEnv: "sandbox",
    payload: { jobId: "job-1", message: "hi" },
  };
  const a = computeIdempotencyKey(input);
  const b = computeIdempotencyKey({ ...input, payload: { ...input.payload } });
  assertEquals(a, b);
});

Deno.test("computeIdempotencyKey changes when any field changes", () => {
  const base = {
    lane: "postJobMessage" as WriteLane,
    accountKey: "sandbox",
    targetEnv: "sandbox",
    payload: { jobId: "job-1", message: "hi" },
  };
  const baseline = computeIdempotencyKey(base);

  assert(computeIdempotencyKey({ ...base, lane: "postJobPaymentReceived" as WriteLane, payload: { jobId: "job-1" } }) !== baseline);
  assert(computeIdempotencyKey({ ...base, accountKey: "kansas_city" }) !== baseline);
  assert(computeIdempotencyKey({ ...base, targetEnv: "prod" }) !== baseline);
  assert(computeIdempotencyKey({ ...base, payload: { jobId: "job-1", message: "bye" } }) !== baseline);
});

Deno.test("computeIdempotencyKey is insensitive to payload key ordering (canonicalized)", () => {
  const a = computeIdempotencyKey({
    lane: "postJobExternalReference" as WriteLane,
    accountKey: "sandbox",
    targetEnv: "sandbox",
    payload: { jobId: "job-1", source: "cc", projectId: "p-1" },
  });
  const b = computeIdempotencyKey({
    lane: "postJobExternalReference" as WriteLane,
    accountKey: "sandbox",
    targetEnv: "sandbox",
    payload: { projectId: "p-1", jobId: "job-1", source: "cc" },
  });
  assertEquals(a, b);
});

// --- WRITE_ONLY_LANES ---

Deno.test("WRITE_ONLY_LANES contains exactly the 5 write-only lanes and none of the 12 writable ones", () => {
  const expectedWriteOnly = new Set<WriteLane>([
    "postWorksheetItem",
    "postJobMessage",
    "postJobPhotosVideos",
    "postJobRepresentativeCompany",
    "postJobExternalReference",
  ]);
  assertEquals(WRITE_ONLY_LANES.size, 5);
  for (const lane of expectedWriteOnly) {
    assert(WRITE_ONLY_LANES.has(lane), `expected WRITE_ONLY_LANES to contain ${lane}`);
  }
  const writableLanes: WriteLane[] = [
    "postContact",
    "postJob",
    "postJobPaymentReceived",
    "postJobPaymentExpense",
    "putJobAddress",
    "putJobInitialAppointment",
    "putJobInsurance",
    "putJobInsuranceCompany",
    "putJobLeadSource",
    "putJobPriority",
    "deleteJobArOwner",
    "deleteJobSalesOwner",
  ];
  assertEquals(writableLanes.length, 12);
  for (const lane of writableLanes) {
    assert(!WRITE_ONLY_LANES.has(lane), `expected WRITE_ONLY_LANES to NOT contain ${lane}`);
  }
});

Deno.test("LANES has exactly 17 entries (12 writable + 5 write-only)", () => {
  assertEquals(Object.keys(LANES).length, 17);
});

// --- buildWriteRequest: one test per lane (17 total) ---

Deno.test("buildWriteRequest(postContact) builds POST /contacts with object-shaped mailingAddress", () => {
  const req = buildWriteRequest("postContact", {
    contactTypeIds: ["ct-1"],
    firstName: "Jordan",
    lastName: "Roofer",
    mailingAddress: { city: "Wichita", state: "KS", zipCode: "67203" },
  });
  assertEquals(req.method, "POST");
  assertEquals(req.path, "/contacts");
  const body = req.body as Record<string, any>;
  assertEquals(typeof body.mailingAddress.state, "object");
  assertEquals(body.mailingAddress.state.abbreviation, "KS");
});

Deno.test("buildWriteRequest(postJob) builds POST /jobs and coerces jobCategory.id to a number", () => {
  const req = buildWriteRequest("postJob", {
    contact: { id: "contact-1" },
    jobCategory: { id: "7" },
    priority: "Normal",
  });
  assertEquals(req.method, "POST");
  assertEquals(req.path, "/jobs");
  const body = req.body as Record<string, any>;
  assertEquals(body.jobCategory.id, 7);
  assertEquals(typeof body.jobCategory.id, "number");
});

Deno.test("buildWriteRequest(postJob) builds STRING locationAddress state/country", () => {
  const req = buildWriteRequest("postJob", {
    contact: { id: "contact-1" },
    locationAddress: { city: "Wichita", state: "KS", zipCode: "67203" },
    priority: "Normal",
  });
  const body = req.body as Record<string, any>;
  assertEquals(typeof body.locationAddress.state, "string");
  assertEquals(body.locationAddress.state, "KS");
});

Deno.test("buildWriteRequest(postJob) rejects an invalid strict-enum priority", () => {
  assertThrows(
    () => buildWriteRequest("postJob", { contact: { id: "c-1" }, priority: "Urgent" }),
    Error,
    "invalid priority",
  );
});

Deno.test("buildWriteRequest(postJobPaymentReceived) builds POST /jobs/{jobId}/payments/received", () => {
  const req = buildWriteRequest("postJobPaymentReceived", {
    jobId: "job-1",
    from: "CC",
    amount: 100,
    paymentDate: "2026-07-01",
  });
  assertEquals(req.method, "POST");
  assertEquals(req.path, "/jobs/job-1/payments/received");
  assertEquals((req.body as Record<string, any>).jobId, undefined);
  assertEquals((req.body as Record<string, any>).amount, 100);
});

Deno.test("buildWriteRequest(postJobPaymentExpense) builds POST /jobs/{jobId}/payments/expense", () => {
  const req = buildWriteRequest("postJobPaymentExpense", { jobId: "job-1", to: "Vendor", amount: 50 });
  assertEquals(req.method, "POST");
  assertEquals(req.path, "/jobs/job-1/payments/expense");
});

Deno.test("buildWriteRequest(putJobAddress) builds PUT /jobs/{jobId}/address with STRING state/country", () => {
  const req = buildWriteRequest("putJobAddress", { jobId: "job-1", city: "Wichita", state: "KS", zipCode: "67203" });
  assertEquals(req.method, "PUT");
  assertEquals(req.path, "/jobs/job-1/address");
  const body = req.body as Record<string, any>;
  assertEquals(typeof body.state, "string");
  assertEquals(body.state, "KS");
});

Deno.test("buildWriteRequest(putJobInitialAppointment) builds PUT /jobs/{jobId}/initial-appointment", () => {
  const req = buildWriteRequest("putJobInitialAppointment", {
    jobId: "job-1",
    startDate: "2026-07-02T09:00:00Z",
    endDate: "2026-07-02T10:00:00Z",
    notes: "on-site",
  });
  assertEquals(req.method, "PUT");
  assertEquals(req.path, "/jobs/job-1/initial-appointment");
});

Deno.test("buildWriteRequest(putJobInsurance) builds PUT /jobs/{jobId}/insurance", () => {
  const req = buildWriteRequest("putJobInsurance", { jobId: "job-1", claimNumber: "CLM-1" });
  assertEquals(req.method, "PUT");
  assertEquals(req.path, "/jobs/job-1/insurance");
});

Deno.test("buildWriteRequest(putJobInsuranceCompany) builds PUT /jobs/{jobId}/insurance/insurance-company", () => {
  const req = buildWriteRequest("putJobInsuranceCompany", { jobId: "job-1", insuranceCompanyName: "Acme Insurance" });
  assertEquals(req.method, "PUT");
  assertEquals(req.path, "/jobs/job-1/insurance/insurance-company");
});

Deno.test("buildWriteRequest(putJobLeadSource) builds PUT /jobs/{jobId}/lead-source", () => {
  const req = buildWriteRequest("putJobLeadSource", { jobId: "job-1", id: "lead-source-1" });
  assertEquals(req.method, "PUT");
  assertEquals(req.path, "/jobs/job-1/lead-source");
});

Deno.test("buildWriteRequest(putJobPriority) builds PUT /jobs/{jobId}/priority and enforces the strict enum", () => {
  const req = buildWriteRequest("putJobPriority", { jobId: "job-1", priority: "High" });
  assertEquals(req.method, "PUT");
  assertEquals(req.path, "/jobs/job-1/priority");
  assertThrows(() => buildWriteRequest("putJobPriority", { jobId: "job-1", priority: "Urgent" }), Error, "invalid priority");
});

Deno.test("buildWriteRequest(deleteJobArOwner) builds DELETE /jobs/{jobId}/representatives/ar-owner with no body", () => {
  const req = buildWriteRequest("deleteJobArOwner", { jobId: "job-1" });
  assertEquals(req.method, "DELETE");
  assertEquals(req.path, "/jobs/job-1/representatives/ar-owner");
  assertEquals(req.body, undefined);
});

Deno.test("buildWriteRequest(deleteJobSalesOwner) builds DELETE /jobs/{jobId}/representatives/sales-owner with no body", () => {
  const req = buildWriteRequest("deleteJobSalesOwner", { jobId: "job-1" });
  assertEquals(req.method, "DELETE");
  assertEquals(req.path, "/jobs/job-1/representatives/sales-owner");
  assertEquals(req.body, undefined);
});

Deno.test("buildWriteRequest(postWorksheetItem) builds POST /financials/{financialsId}/worksheet/items", () => {
  const req = buildWriteRequest("postWorksheetItem", { financialsId: "fin-1", price: 100, itemName: "Shingles" });
  assertEquals(req.method, "POST");
  assertEquals(req.path, "/financials/fin-1/worksheet/items");
  assertEquals((req.body as Record<string, any>).financialsId, undefined);
});

Deno.test("buildWriteRequest(postJobMessage) builds POST /jobs/{jobId}/messages, payload passed through", () => {
  const req = buildWriteRequest("postJobMessage", { jobId: "job-1", message: "hi" });
  assertEquals(req.method, "POST");
  assertEquals(req.path, "/jobs/job-1/messages");
  assertEquals(req.body, { message: "hi" });
});

Deno.test("buildWriteRequest(postJobPhotosVideos) yields a multipart FormData request", () => {
  const req = buildWriteRequest("postJobPhotosVideos", { jobId: "job-1", description: "roof damage" });
  assertEquals(req.method, "POST");
  assertEquals(req.path, "/jobs/job-1/photos-videos");
  assert(req.formData instanceof FormData);
  assert(req.body === undefined);
  assertEquals(req.formData!.get("description"), "roof damage");
  assert(req.formData!.get("file") instanceof Blob);
});

Deno.test("buildWriteRequest(postJobRepresentativeCompany) builds POST /jobs/{jobId}/representatives/company", () => {
  const req = buildWriteRequest("postJobRepresentativeCompany", { jobId: "job-1", id: "user-1" });
  assertEquals(req.method, "POST");
  assertEquals(req.path, "/jobs/job-1/representatives/company");
});

Deno.test("buildWriteRequest(postJobExternalReference) builds POST /jobs/external-references (idempotency anchor)", () => {
  const req = buildWriteRequest("postJobExternalReference", { jobId: "job-1", source: "cc", projectId: "p-1" });
  assertEquals(req.method, "POST");
  assertEquals(req.path, "/jobs/external-references");
  assertEquals(req.body, { jobId: "job-1", source: "cc", projectId: "p-1" });
});

// --- Negative tests ---

Deno.test("buildWriteRequest throws for an unknown lane", () => {
  assertThrows(() => buildWriteRequest("notARealLane" as WriteLane, {}), Error, "unknown lane");
});

Deno.test("buildWriteRequest throws with a field-naming message when a required field is missing", () => {
  assertThrows(
    () => buildWriteRequest("postJobMessage", { jobId: "job-1" }),
    Error,
    'missing required field "message"',
  );
  assertThrows(
    () => buildWriteRequest("postJobPaymentReceived", {}),
    Error,
    'missing required field "jobId"',
  );
});

// --- D-03 anti-drift: dry-run preview and execute build the identical request ---

Deno.test("D-03: the request built for a dry-run preview and the request built for execute are byte-identical (payment lane)", () => {
  const payload = {
    jobId: "job-42",
    from: "Command Center",
    amount: 1250.5,
    paymentDate: "2026-07-01",
    notes: "deposit",
  };
  // There is only ONE builder (buildWriteRequest) — dryRun and execute both call it with
  // the same lane + payload. This test proves preview==execute by construction: two
  // invocations with identical inputs produce deep-equal output, and there is no second
  // "preview" constructor anywhere in this module for the caller to have drifted from.
  const previewIntent = buildWriteRequest("postJobPaymentReceived", payload);
  const executeIntent = buildWriteRequest("postJobPaymentReceived", payload);
  assertEquals(previewIntent, executeIntent);
});

Deno.test("D-03: byte-identical also holds for a lane with guardrail coercion (postJob Int32 jobCategory.id)", () => {
  const payload = { contact: { id: "contact-9" }, jobCategory: { id: "3" }, priority: "Normal" };
  const previewIntent = buildWriteRequest("postJob", payload);
  const executeIntent = buildWriteRequest("postJob", payload);
  assertEquals(previewIntent, executeIntent);
});

// --- SANDBOX_SECRET_NAME sanity ---

Deno.test("SANDBOX_SECRET_NAME matches the reused sweep constant", () => {
  assertEquals(SANDBOX_SECRET_NAME, "PE_CC_SANDBOX_ACCULYNX_API_KEY");
});
