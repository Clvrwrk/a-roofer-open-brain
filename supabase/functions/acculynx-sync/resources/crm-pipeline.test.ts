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
// Run: deno test supabase/functions/acculynx-sync/resources/crm-pipeline.test.ts

import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { buildPipelineRow, syncCrmPipeline } from "./crm-pipeline.ts";
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

function makeCrmPipelineSb(jobs: JobRow[], financials: JobFinancialsRow[]) {
  const upsertCalls: { table: string; rows: unknown[]; options?: unknown }[] = [];

  const sb = {
    from: (table: string) => {
      if (table === "acculynx_jobs") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: jobs, error: null }),
          }),
        };
      }
      if (table === "acculynx_job_financials") {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: financials, error: null }),
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
