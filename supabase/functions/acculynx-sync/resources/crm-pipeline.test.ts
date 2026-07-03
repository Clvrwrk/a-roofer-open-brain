// acculynx-sync — resources/crm-pipeline.test.ts (Phase 7, plan 07-06 Task 1)
//
// Behavioral unit tests for syncCrmPipeline() / buildPipelineRow().
//
// Behavioral contracts asserted:
//   (a) A job with a financials row produces contract_amount from approved_job_value and
//       balance_due from balance_due — the KS-11 ground truth (30368.48 / 17532.48)
//   (b) A job with NO financials row produces null contract_amount/balance_due
//   (c) primary_salesperson is set from the provided repName
//   (d) primary_salesperson key is OMITTED (not sent as null) when repName is absent —
//       T-07-06-01 null-safe merge: a missing rep name never overwrites a real stored value
//   (e) data_source === 'api_sync'
//   (f) The crm_pipeline upsert targets onConflict: 'acculynx_job_id'
//
// POST-MILESTONE FIX ROUND (2026-07-02), item 1 — durable rep source, additionally asserts:
//   (g) latestRepNameByJobIdFromRawRows resolves a job's rep from its LATEST acculynx_raw
//       /representatives archive (KS-11 shape) when the row list is pre-sorted newest-first
//   (h) A job absent from the CURRENT run's repNameByJobId map still gets
//       primary_salesperson set in syncCrmPipeline's upsert, sourced from the durable
//       acculynx_raw-backed fallback (loadDurableRepsFromRaw)
//   (i) When a job appears in BOTH the current-run map and the durable fallback with
//       different names, the CURRENT-RUN name wins (never overwritten by durable/raw)
//
// Run: deno test supabase/functions/acculynx-sync/resources/crm-pipeline.test.ts

import { assertEquals, assertExists } from "jsr:@std/assert@1";
import {
  buildPipelineRow,
  jobIdFromRepsEndpoint,
  latestRepNameByJobIdFromRawRows,
  syncCrmPipeline,
} from "./crm-pipeline.ts";
import type { JobFinancialsRow, JobRow } from "./crm-pipeline.ts";

// ---------------------------------------------------------------------------
// Fixtures — KS-11 ground truth
// ---------------------------------------------------------------------------

const KS11_JOB: JobRow = {
  id: "0c732e56-ks11",
  job_name: "KS-11: Smolek Reroof",
  job_number: "KS-11",
  priority: "normal",
  current_milestone: "approved",
  milestone_date: "2026-05-01T00:00:00Z",
  created_date: "2026-04-01T00:00:00Z",
  modified_date: "2026-06-01T00:00:00Z",
  lead_dead_reason: null,
  job_category_name: "Residential",
  trade_types: ["roofing"],
  location_street1: "123 Main St",
  location_city: "Wichita",
  location_state: "Kansas",
  location_state_abbrev: "KS",
  location_zip: "67202",
  latitude: 37.6872,
  longitude: -97.3301,
  lead_source_name: "Referral (Neighbor)",
  initial_appointment_start: null,
  initial_appointment_end: null,
  initial_appointment_notes: null,
  raw: { id: "0c732e56-ks11", contacts: [] },
};

const KS11_FINANCIALS: JobFinancialsRow = {
  job_id: "0c732e56-ks11",
  approved_job_value: 30368.48,
  balance_due: 17532.48,
};

// ---------------------------------------------------------------------------
// buildPipelineRow tests
// ---------------------------------------------------------------------------

Deno.test("buildPipelineRow — KS-11 financials map to contract_amount/balance_due", () => {
  const row = buildPipelineRow(KS11_JOB, KS11_FINANCIALS, "Bob Smolek", "batch-1", "2026-07-02T00:00:00Z");
  assertEquals(row.contract_amount, 30368.48);
  assertEquals(row.balance_due, 17532.48);
  assertEquals(row.primary_salesperson, "Bob Smolek");
  assertEquals(row.data_source, "api_sync");
  assertEquals(row.acculynx_job_id, "0c732e56-ks11");
});

Deno.test("buildPipelineRow — no financials row produces null contract_amount/balance_due", () => {
  const row = buildPipelineRow(KS11_JOB, null, null, "batch-1", "2026-07-02T00:00:00Z");
  assertEquals(row.contract_amount, null);
  assertEquals(row.balance_due, null);
});

Deno.test("buildPipelineRow — primary_salesperson key omitted (not nulled) when repName absent", () => {
  const row = buildPipelineRow(KS11_JOB, KS11_FINANCIALS, null, "batch-1", "2026-07-02T00:00:00Z");
  assertEquals(
    Object.prototype.hasOwnProperty.call(row, "primary_salesperson"),
    false,
    "primary_salesperson must be omitted (not set to null) so an ON CONFLICT DO UPDATE never blanks an existing real name",
  );
});

Deno.test("buildPipelineRow — data_source is always api_sync", () => {
  const row = buildPipelineRow(KS11_JOB, null, null, undefined, "2026-07-02T00:00:00Z");
  assertEquals(row.data_source, "api_sync");
});

// ---------------------------------------------------------------------------
// syncCrmPipeline tests (mocked Supabase client)
// ---------------------------------------------------------------------------

interface RawRepsFixtureRow {
  api_endpoint: string;
  payload: unknown;
  fetched_at: string;
}

function makeCrmPipelineSb(
  jobs: JobRow[],
  financials: JobFinancialsRow[],
  options: { users?: { id: string; display_name?: string | null; first_name?: string | null; last_name?: string | null }[]; rawRepsRows?: RawRepsFixtureRow[] } = {},
) {
  const upsertCalls: { table: string; rows: unknown[]; options?: unknown }[] = [];
  const users = options.users ?? [];
  const rawRepsRows = options.rawRepsRows ?? [];

  const sb = {
    from: (table: string) => {
      if (table === "acculynx_jobs") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                // paged: first page returns everything (fixtures < PAGE_SIZE), later pages empty
                range: (from: number, _to: number) => Promise.resolve({ data: from === 0 ? jobs : [], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "acculynx_job_financials") {
        return {
          select: () => ({
            // Real query: account-scoped equality + .order().range() pagination
            // (PostgREST URL-length fix + 1000-row-cap fix, 2026-07-03). First page
            // returns the fixture set (< PAGE_SIZE), later pages empty.
            eq: () => ({
              order: () => ({
                range: (from: number, _to: number) => Promise.resolve({ data: from === 0 ? financials : [], error: null }),
              }),
            }),
            in: () => Promise.resolve({ data: financials, error: null }),
          }),
        };
      }
      if (table === "acculynx_users") {
        return {
          select: () => Promise.resolve({ data: users, error: null }),
        };
      }
      if (table === "acculynx_raw") {
        return {
          select: () => ({
            // Real query (2026-07-03 fix #5): endpoint-targeted .in(endpoints).order() —
            // return the fixture rows whose api_endpoint is in the requested chunk.
            in: (_col: string, endpoints: string[]) => ({
              order: () =>
                Promise.resolve({
                  data: rawRepsRows.filter((r) => endpoints.includes(r.api_endpoint)),
                  error: null,
                }),
            }),
            like: () => ({
              order: () => ({
                range: (from: number, _to: number) => Promise.resolve({ data: from === 0 ? rawRepsRows : [], error: null }),
                limit: () => Promise.resolve({ data: rawRepsRows, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "crm_pipeline") {
        return {
          upsert: (rows: unknown[], options?: unknown) => {
            upsertCalls.push({ table, rows: Array.isArray(rows) ? rows : [rows], options });
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table in test mock: ${table}`);
    },
  };

  return { sb, upsertCalls };
}

Deno.test("syncCrmPipeline — upserts crm_pipeline with financials + rep map merged in", async () => {
  const { sb, upsertCalls } = makeCrmPipelineSb([KS11_JOB], [KS11_FINANCIALS]);
  const repMap = new Map([["0c732e56-ks11", "Bob Smolek"]]);
  const deadline = Date.now() + 60_000;

  const result = await syncCrmPipeline(sb, { account_key: "wichita" }, deadline, repMap, "batch-1");

  assertEquals(result.upserted, 1);
  assertEquals(upsertCalls.length, 1);
  const row = upsertCalls[0].rows[0] as Record<string, unknown>;
  assertEquals(row.contract_amount, 30368.48);
  assertEquals(row.balance_due, 17532.48);
  assertEquals(row.primary_salesperson, "Bob Smolek");
});

Deno.test("syncCrmPipeline — onConflict targets acculynx_job_id, ignoreDuplicates false", async () => {
  const { sb, upsertCalls } = makeCrmPipelineSb([KS11_JOB], []);
  const deadline = Date.now() + 60_000;

  await syncCrmPipeline(sb, { account_key: "wichita" }, deadline, new Map(), "batch-1");

  assertEquals(upsertCalls.length, 1);
  const options = upsertCalls[0].options as { onConflict?: string; ignoreDuplicates?: boolean };
  assertExists(options);
  assertEquals(options.onConflict, "acculynx_job_id");
  assertEquals(options.ignoreDuplicates, false);
});

Deno.test("syncCrmPipeline — no jobs for account returns zero upserted, no upsert call", async () => {
  const { sb, upsertCalls } = makeCrmPipelineSb([], []);
  const deadline = Date.now() + 60_000;

  const result = await syncCrmPipeline(sb, { account_key: "wichita" }, deadline, new Map(), "batch-1");

  assertEquals(result.upserted, 0);
  assertEquals(upsertCalls.length, 0);
});

// ---------------------------------------------------------------------------
// Item 1 (2026-07-02 fix round): durable rep source from acculynx_raw
// ---------------------------------------------------------------------------

const KS11_REPS_PAYLOAD = {
  count: 1,
  pageSize: 25,
  pageStartIndex: 0,
  items: [{ id: "rep-1", type: "CompanyRepresentative", user: { id: "779da1e7-ks11-rep" } }],
};

Deno.test("jobIdFromRepsEndpoint — extracts the jobId from an archived /jobs/{id}/representatives path", () => {
  assertEquals(jobIdFromRepsEndpoint("/jobs/0c732e56-ks11/representatives"), "0c732e56-ks11");
  assertEquals(jobIdFromRepsEndpoint("/jobs/abc-123/representatives?foo=bar"), "abc-123");
  assertEquals(jobIdFromRepsEndpoint("/jobs/abc-123/representatives/sales-owner"), null);
  assertEquals(jobIdFromRepsEndpoint("/jobs/abc-123/financials"), null);
});

Deno.test("latestRepNameByJobIdFromRawRows — resolves the KS-11 shape from a raw archive row", () => {
  const userMap = new Map([["779da1e7-ks11-rep", "Bob Smolek"]]);
  const rows = [
    { api_endpoint: "/jobs/0c732e56-ks11/representatives", payload: KS11_REPS_PAYLOAD, fetched_at: "2026-06-15T00:00:00Z" },
  ];

  const result = latestRepNameByJobIdFromRawRows(rows, userMap);

  assertEquals(result.get("0c732e56-ks11"), "Bob Smolek");
});

Deno.test("latestRepNameByJobIdFromRawRows — keeps only the FIRST (newest) row per job when duplicates exist", () => {
  const userMap = new Map([
    ["779da1e7-ks11-rep", "Bob Smolek"],
    ["stale-rep-id", "Someone Else"],
  ]);
  // Caller contract: rows pre-sorted newest-first. The newest payload (index 0)
  // must win even though an older payload for the same job follows it.
  const rows = [
    {
      api_endpoint: "/jobs/0c732e56-ks11/representatives",
      payload: KS11_REPS_PAYLOAD,
      fetched_at: "2026-06-15T00:00:00Z",
    },
    {
      api_endpoint: "/jobs/0c732e56-ks11/representatives",
      payload: { items: [{ type: "CompanyRepresentative", user: { id: "stale-rep-id" } }] },
      fetched_at: "2026-05-01T00:00:00Z",
    },
  ];

  const result = latestRepNameByJobIdFromRawRows(rows, userMap);

  assertEquals(result.get("0c732e56-ks11"), "Bob Smolek");
});

Deno.test("syncCrmPipeline — a job absent from this run's repNameByJobId still resolves primary_salesperson via the durable acculynx_raw fallback (KS-11)", async () => {
  const { sb, upsertCalls } = makeCrmPipelineSb([KS11_JOB], [KS11_FINANCIALS], {
    users: [{ id: "779da1e7-ks11-rep", display_name: "Bob Smolek" }],
    rawRepsRows: [
      { api_endpoint: "/jobs/0c732e56-ks11/representatives", payload: KS11_REPS_PAYLOAD, fetched_at: "2026-06-15T00:00:00Z" },
    ],
  });
  const deadline = Date.now() + 60_000;

  // Empty repNameByJobId: THIS run's walk did not touch job KS-11 (e.g. it was
  // skipped under D-16, or walked in an earlier sync only) — the durable fallback
  // must still resolve the name from acculynx_raw so KS-11 never stays Unassigned.
  const result = await syncCrmPipeline(sb, { account_key: "wichita" }, deadline, new Map(), "batch-1");

  assertEquals(result.upserted, 1);
  const row = upsertCalls[0].rows[0] as Record<string, unknown>;
  assertEquals(row.primary_salesperson, "Bob Smolek");
});

Deno.test("syncCrmPipeline — current-run repNameByJobId ALWAYS wins over the durable acculynx_raw fallback", async () => {
  const { sb, upsertCalls } = makeCrmPipelineSb([KS11_JOB], [KS11_FINANCIALS], {
    users: [{ id: "779da1e7-ks11-rep", display_name: "Bob Smolek (stale durable name)" }],
    rawRepsRows: [
      { api_endpoint: "/jobs/0c732e56-ks11/representatives", payload: KS11_REPS_PAYLOAD, fetched_at: "2026-06-15T00:00:00Z" },
    ],
  });
  const deadline = Date.now() + 60_000;
  const repMap = new Map([["0c732e56-ks11", "Bob Smolek (this run, fresh)"]]);

  const result = await syncCrmPipeline(sb, { account_key: "wichita" }, deadline, repMap, "batch-1");

  assertEquals(result.upserted, 1);
  const row = upsertCalls[0].rows[0] as Record<string, unknown>;
  assertEquals(row.primary_salesperson, "Bob Smolek (this run, fresh)");
});

Deno.test("syncCrmPipeline — a job with NEITHER a current-run rep NOR a durable acculynx_raw archive omits primary_salesperson (never nulls existing value)", async () => {
  const { sb, upsertCalls } = makeCrmPipelineSb([KS11_JOB], [KS11_FINANCIALS], {
    users: [],
    rawRepsRows: [], // no prior /representatives archive for this job at all
  });
  const deadline = Date.now() + 60_000;

  const result = await syncCrmPipeline(sb, { account_key: "wichita" }, deadline, new Map(), "batch-1");

  assertEquals(result.upserted, 1);
  const row = upsertCalls[0].rows[0] as Record<string, unknown>;
  assertEquals(
    Object.prototype.hasOwnProperty.call(row, "primary_salesperson"),
    false,
    "primary_salesperson must be omitted (never null) when no rep resolves from either source",
  );
});
