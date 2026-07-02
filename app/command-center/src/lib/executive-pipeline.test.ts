import { describe, expect, it } from "vitest";
import {
  computeCloseRate,
  computeFreshnessBadges,
  computeLocationRollup,
  computeMarginByDimension,
  deriveRegionOffice,
  excludeClosedAndPaidInFull,
  filterByWindow,
  groupPipelineFunnel,
  isExcludedMilestone,
  jobRowsForLocation,
  paginateRange,
  type AcculynxJobRow,
  type PipelineRow,
} from "@lib/executive-pipeline";

function makePipelineRow(overrides: Partial<PipelineRow> = {}): PipelineRow {
  return {
    id: 1,
    acculynx_job_id: "job-1",
    job_name: "Test Job",
    location_city: "Wichita",
    location_state: "KS",
    market: "sedgwick_ks",
    current_milestone: "approved",
    primary_salesperson: "Jamie Rep",
    contract_amount: 10000,
    primary_estimate_amount: 9500,
    balance_due: 0,
    lead_date: "2026-06-25T00:00:00Z",
    approved_date: "2026-06-28T00:00:00Z",
    milestone_date: "2026-06-28T00:00:00Z",
    created_at: "2026-06-20T00:00:00Z",
    updated_at: "2026-06-28T00:00:00Z",
    insurance_company: null,
    insurance_claim_number: null,
    insurance_claim_filed: null,
    insurance_claim_filed_date: null,
    insurance_date_of_loss: null,
    parent_lead_source: "referral",
    sub_lead_source: null,
    data_source: "acculynx",
    ...overrides,
  };
}

function makeJobRow(overrides: Partial<AcculynxJobRow> = {}): AcculynxJobRow {
  return {
    id: "job-1",
    account_key: "wichita",
    job_category_name: "Residential",
    ...overrides,
  };
}

describe("funnel grouping", () => {
  it("groups rows by normalized lowercase crm_pipeline.current_milestone", () => {
    const rows = [
      makePipelineRow({ id: 1, current_milestone: "approved" }),
      makePipelineRow({ id: 2, current_milestone: "approved" }),
      makePipelineRow({ id: 3, current_milestone: "completed" }),
    ];

    const funnel = groupPipelineFunnel(rows);
    const approvedStage = funnel.find((stage) => stage.milestone === "approved");

    expect(approvedStage).toBeDefined();
    expect(approvedStage!.count).toBe(2);
  });

  it("never uses Title-Case acculynx_jobs milestone vocabulary for stage logic", () => {
    // A row whose current_milestone is already normalized lowercase per crm_pipeline convention.
    const rows = [makePipelineRow({ id: 1, current_milestone: "invoiced" })];
    const funnel = groupPipelineFunnel(rows);
    const stageLabels = funnel.map((stage) => stage.milestone);

    // Title-Case AccuLynx vocabulary ("Invoiced") must never appear as a stage key.
    expect(stageLabels).not.toContain("Invoiced");
    expect(stageLabels).toContain("invoiced");
  });
});

describe("close rate", () => {
  it("uses the snapshot-window proxy (soldMilestones count in window / lead count in window), not milestone-history", () => {
    const start = new Date("2026-06-20T00:00:00Z");
    const end = new Date("2026-06-30T00:00:00Z");
    const rows = [
      makePipelineRow({ id: 1, current_milestone: "unassigned_lead", lead_date: "2026-06-21T00:00:00Z" }),
      makePipelineRow({ id: 2, current_milestone: "unassigned_lead", lead_date: "2026-06-22T00:00:00Z" }),
      makePipelineRow({
        id: 3,
        current_milestone: "approved",
        lead_date: "2026-06-21T00:00:00Z",
        approved_date: "2026-06-25T00:00:00Z",
      }),
    ];

    const result = computeCloseRate(rows, start, end);

    expect(result.leadCount).toBe(2);
    expect(result.soldCount).toBe(1);
    expect(result.closeRate).toBeCloseTo(0.5, 5);
  });

  it("returns a period-snapshot qualifier that never asserts cohort-level rigor", () => {
    const start = new Date("2026-06-20T00:00:00Z");
    const end = new Date("2026-06-30T00:00:00Z");
    const result = computeCloseRate([], start, end);

    expect(result.qualifier).toMatch(/period.snapshot/i);
    // The qualifier may reference "cohort" only to explicitly disclaim it
    // (e.g. "not a cohort conversion rate") — it must never assert cohort-level
    // rigor as a bare, unqualified claim.
    expect(result.qualifier.toLowerCase()).not.toMatch(/^cohort conversion rate$/);
    expect(result.qualifier.toLowerCase()).toMatch(/not a cohort/);
  });
});

describe("margin", () => {
  it("prefers a job-financials GP value when present", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1" })];
    const pipeline = [makePipelineRow({ id: 1, acculynx_job_id: "job-1", contract_amount: 10000 })];
    const financials = new Map([["job-1", { grossProfit: 4000 }]]);
    const invoiceCosts = new Map<string, number>();

    const result = computeMarginByDimension(pipeline, jobs, financials, invoiceCosts, (row) => "all");

    expect(result[0].marginPct).toBeCloseTo(40, 5);
    expect(result[0].coverage.jobsWithCostData).toBe(1);
    expect(result[0].coverage.totalJobsInSlice).toBe(1);
  });

  it("falls back to contract_amount minus invoiced cost when no job-financials row exists", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1" })];
    const pipeline = [makePipelineRow({ id: 1, acculynx_job_id: "job-1", contract_amount: 10000 })];
    const financials = new Map<string, { grossProfit: number }>();
    const invoiceCosts = new Map([["job-1", 6000]]);

    const result = computeMarginByDimension(pipeline, jobs, financials, invoiceCosts, (row) => "all");

    expect(result[0].marginPct).toBeCloseTo(40, 5);
    expect(result[0].coverage.jobsWithCostData).toBe(1);
  });

  it("for a slice of 130 jobs where only 18 have cost data, excludes no-cost jobs from the average and counts them in the denominator (honesty guarantee)", () => {
    const jobs: AcculynxJobRow[] = [];
    const pipeline: PipelineRow[] = [];
    const financials = new Map<string, { grossProfit: number }>();
    const invoiceCosts = new Map<string, number>();

    for (let i = 0; i < 130; i += 1) {
      const jobId = `job-${i}`;
      jobs.push(makeJobRow({ id: jobId }));
      pipeline.push(makePipelineRow({ id: i, acculynx_job_id: jobId, contract_amount: 10000 }));
      if (i < 18) {
        invoiceCosts.set(jobId, 5000);
      }
    }

    const result = computeMarginByDimension(pipeline, jobs, financials, invoiceCosts, (row) => "all");

    expect(result[0].coverage.jobsWithCostData).toBe(18);
    expect(result[0].coverage.totalJobsInSlice).toBe(130);
    expect(result[0].coverage.coveragePct).toBeCloseTo(13.8461538, 3);
  });

  it("never treats a job with no cost data as 0 cost / 100% margin", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1" })];
    const pipeline = [makePipelineRow({ id: 1, acculynx_job_id: "job-1", contract_amount: 10000 })];
    const financials = new Map<string, { grossProfit: number }>();
    const invoiceCosts = new Map<string, number>();

    const result = computeMarginByDimension(pipeline, jobs, financials, invoiceCosts, (row) => "all");

    expect(result[0].coverage.jobsWithCostData).toBe(0);
    expect(result[0].coverage.totalJobsInSlice).toBe(1);
    expect(result[0].marginPct).not.toBe(100);
  });
});

describe("region", () => {
  it("derives region/office via acculynx_job_id -> acculynx_jobs.account_key (one of the 8 keys)", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "colorado" })];
    const row = makePipelineRow({ acculynx_job_id: "job-1", market: "denver_co" });

    const derived = deriveRegionOffice(row, jobs);

    expect(derived.accountKey).toBe("colorado");
    expect([
      "colorado",
      "florida",
      "georgia",
      "kansas_city",
      "texas",
      "wichita",
      "insurance_program",
      "multi_family_commercial",
    ]).toContain(derived.accountKey);
  });

  it("does NOT return crm_pipeline.market county-slug values like sedgwick_ks", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" })];
    const row = makePipelineRow({ acculynx_job_id: "job-1", market: "sedgwick_ks" });

    const derived = deriveRegionOffice(row, jobs);

    expect(derived.accountKey).not.toBe("sedgwick_ks");
    expect(derived.accountKey).toBe("wichita");
  });

  it("derives commercial/residential = 'uncategorized' (not dropped) when job_category_name is null", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", job_category_name: null })];
    const row = makePipelineRow({ acculynx_job_id: "job-1" });

    const derived = deriveRegionOffice(row, jobs);

    expect(derived.commercialResidential).toBe("uncategorized");
  });
});

describe("pagination", () => {
  it("returns correct [from,to] windows so a 6434-row table is fully covered across pages", () => {
    const windows = paginateRange(6434, 1000);

    expect(windows[0]).toEqual([0, 999]);
    expect(windows[windows.length - 1]).toEqual([6000, 6433]);

    const totalCovered = windows.reduce((sum, [from, to]) => sum + (to - from + 1), 0);
    expect(totalCovered).toBe(6434);
  });

  it("covers a table exactly divisible by the page size without an extra empty page", () => {
    const windows = paginateRange(2000, 1000);
    expect(windows).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });
});

describe("freshness", () => {
  const slaMs = 60 * 60_000; // hourly SLA

  it("flags a location ready when last_sync_at is within the hourly SLA", () => {
    const now = new Date("2026-07-02T12:00:00Z");
    const lastSyncAt = new Date("2026-07-02T11:45:00Z").toISOString();

    const badges = computeFreshnessBadges([{ accountKey: "wichita", lastSyncAt }], now, slaMs);

    expect(badges[0].tone).toBe("ready");
  });

  it("flags a location review between 1x-2x SLA", () => {
    const now = new Date("2026-07-02T12:00:00Z");
    const lastSyncAt = new Date("2026-07-02T10:30:00Z").toISOString(); // 1.5h stale

    const badges = computeFreshnessBadges([{ accountKey: "wichita", lastSyncAt }], now, slaMs);

    expect(badges[0].tone).toBe("review");
  });

  it("flags a location critical beyond 2x SLA", () => {
    const now = new Date("2026-07-02T12:00:00Z");
    const lastSyncAt = new Date("2026-07-02T09:00:00Z").toISOString(); // 3h stale

    const badges = computeFreshnessBadges([{ accountKey: "wichita", lastSyncAt }], now, slaMs);

    expect(badges[0].tone).toBe("critical");
  });
});

describe("window filtering", () => {
  it("filters rows to those whose date falls within [start, end]", () => {
    const rows = [
      makePipelineRow({ id: 1, created_at: "2026-06-01T00:00:00Z" }),
      makePipelineRow({ id: 2, created_at: "2026-06-25T00:00:00Z" }),
    ];
    const start = new Date("2026-06-20T00:00:00Z");
    const end = new Date("2026-06-30T00:00:00Z");

    const filtered = filterByWindow(rows, (row) => row.created_at, start, end);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(2);
  });
});

describe("job drill-down rows for a location (D-09 checkpoint rework)", () => {
  it("returns only jobs whose derived account_key matches the requested location", () => {
    const jobs: AcculynxJobRow[] = [
      makeJobRow({ id: "job-1", account_key: "wichita" }),
      makeJobRow({ id: "job-2", account_key: "colorado" }),
    ];
    const pipeline = [
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", job_name: "Wichita Roof" }),
      makePipelineRow({ id: 2, acculynx_job_id: "job-2", job_name: "Colorado Roof" }),
    ];

    const rows = jobRowsForLocation(pipeline, jobs, "wichita");

    expect(rows).toHaveLength(1);
    expect(rows[0].jobName).toBe("Wichita Roof");
    expect(rows[0].accountKey).toBe("wichita");
  });

  it("further filters by commercial/residential when provided", () => {
    const jobs: AcculynxJobRow[] = [
      makeJobRow({ id: "job-1", account_key: "wichita", job_category_name: "Residential" }),
      makeJobRow({ id: "job-2", account_key: "wichita", job_category_name: "Commercial" }),
    ];
    const pipeline = [
      makePipelineRow({ id: 1, acculynx_job_id: "job-1" }),
      makePipelineRow({ id: 2, acculynx_job_id: "job-2" }),
    ];

    const rows = jobRowsForLocation(pipeline, jobs, "wichita", "Commercial");

    expect(rows).toHaveLength(1);
    expect(rows[0].acculynxJobId).toBe("job-2");
  });

  it("sorts rows by contract amount descending and never fabricates rows", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" }), makeJobRow({ id: "job-2", account_key: "wichita" })];
    const pipeline = [
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", contract_amount: 5000 }),
      makePipelineRow({ id: 2, acculynx_job_id: "job-2", contract_amount: 20000 }),
    ];

    const rows = jobRowsForLocation(pipeline, jobs, "wichita");

    expect(rows).toHaveLength(2);
    expect(rows[0].acculynxJobId).toBe("job-2");
    expect(rows[1].acculynxJobId).toBe("job-1");
  });

  it("returns an empty array (not a fabricated row) when no jobs match the location", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "colorado" })];
    const pipeline = [makePipelineRow({ id: 1, acculynx_job_id: "job-1" })];

    const rows = jobRowsForLocation(pipeline, jobs, "wichita");

    expect(rows).toHaveLength(0);
  });

  it("excludes closed/paid-in-full jobs from the location drill-down (checkpoint feedback)", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" }), makeJobRow({ id: "job-2", account_key: "wichita" })];
    const pipeline = [
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", current_milestone: "closed" }),
      makePipelineRow({ id: 2, acculynx_job_id: "job-2", current_milestone: "approved" }),
    ];

    const rows = jobRowsForLocation(pipeline, jobs, "wichita");

    expect(rows).toHaveLength(1);
    expect(rows[0].acculynxJobId).toBe("job-2");
  });
});

describe("closed/paid-in-full exclusion (checkpoint feedback round 2: 'eliminate closed and paid in full data')", () => {
  it("flags a row with current_milestone 'closed' as excluded", () => {
    expect(isExcludedMilestone(makePipelineRow({ current_milestone: "closed" }))).toBe(true);
  });

  it("flags a row with current_milestone 'paid in full' as excluded even though it never appears in production data today", () => {
    expect(isExcludedMilestone(makePipelineRow({ current_milestone: "paid in full" }))).toBe(true);
    expect(isExcludedMilestone(makePipelineRow({ current_milestone: "paid_in_full" }))).toBe(true);
  });

  it("is case-insensitive (covers Title-Case acculynx_jobs vocabulary if it ever leaks into this field)", () => {
    expect(isExcludedMilestone(makePipelineRow({ current_milestone: "Closed" }))).toBe(true);
    expect(isExcludedMilestone(makePipelineRow({ current_milestone: "CLOSED" }))).toBe(true);
    expect(isExcludedMilestone(makePipelineRow({ current_milestone: "Paid In Full" }))).toBe(true);
  });

  it("does not flag other real production milestones (dead, cancelled, invoiced, completed, approved, prospect, leads)", () => {
    for (const milestone of [
      "dead",
      "cancelled",
      "invoiced",
      "completed",
      "approved",
      "prospect",
      "assigned_lead",
      "unassigned_lead",
    ]) {
      expect(isExcludedMilestone(makePipelineRow({ current_milestone: milestone }))).toBe(false);
    }
  });

  it("treats a null/empty current_milestone as not excluded", () => {
    expect(isExcludedMilestone(makePipelineRow({ current_milestone: null }))).toBe(false);
  });

  it("excludeClosedAndPaidInFull drops only closed/paid-in-full rows from a mixed set, case-insensitively", () => {
    const rows = [
      makePipelineRow({ id: 1, current_milestone: "closed" }),
      makePipelineRow({ id: 2, current_milestone: "Closed" }),
      makePipelineRow({ id: 3, current_milestone: "approved" }),
      makePipelineRow({ id: 4, current_milestone: "dead" }),
    ];

    const result = excludeClosedAndPaidInFull(rows);

    expect(result.map((row) => row.id)).toEqual([3, 4]);
  });

  it("removes excluded-milestone rows from the funnel grouping entirely (not zeroed, not present)", () => {
    const rows = excludeClosedAndPaidInFull([
      makePipelineRow({ id: 1, current_milestone: "closed", contract_amount: 50000 }),
      makePipelineRow({ id: 2, current_milestone: "approved", contract_amount: 10000 }),
    ]);
    const funnel = groupPipelineFunnel(rows);

    expect(funnel.find((stage) => stage.milestone === "closed")).toBeUndefined();
    expect(funnel.find((stage) => stage.milestone === "approved")).toBeDefined();
  });

  it("removes excluded-milestone rows from margin-by-dimension aggregation and its coverage denominator", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" }), makeJobRow({ id: "job-2", account_key: "wichita" })];
    const pipeline = excludeClosedAndPaidInFull([
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", current_milestone: "closed", contract_amount: 100000 }),
      makePipelineRow({ id: 2, acculynx_job_id: "job-2", current_milestone: "approved", contract_amount: 10000 }),
    ]);
    const financials = new Map([["job-2", { grossProfit: 2000 }]]);

    const byRegion = computeMarginByDimension(pipeline, jobs, financials, new Map(), (row, jobRows) => deriveRegionOffice(row, jobRows).accountKey);
    const wichita = byRegion.find((row) => row.dimension === "wichita");

    expect(wichita?.coverage.totalJobsInSlice).toBe(1);
  });

  it("removes excluded-milestone rows from the per-location rollup (pipeline $, sold $, AR $)", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" }), makeJobRow({ id: "job-2", account_key: "wichita" })];
    const pipeline = excludeClosedAndPaidInFull([
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", current_milestone: "closed", contract_amount: 100000, balance_due: 5000 }),
      makePipelineRow({ id: 2, acculynx_job_id: "job-2", current_milestone: "approved", contract_amount: 10000, balance_due: 500 }),
    ]);

    const rollup = computeLocationRollup(pipeline, jobs, ["wichita"], new Date("2026-06-20"), new Date("2026-07-01"));

    expect(rollup[0].pipelineValue).toBe(10000);
    expect(rollup[0].arValue).toBe(500);
  });

  it("removes excluded-milestone rows from close-rate sold-count (checkpoint feedback applied uniformly, per implementation contract)", () => {
    const pipeline = excludeClosedAndPaidInFull([
      makePipelineRow({ id: 1, current_milestone: "closed", approved_date: "2026-06-28T00:00:00Z" }),
      makePipelineRow({ id: 2, current_milestone: "invoiced", approved_date: "2026-06-28T00:00:00Z" }),
    ]);

    const result = computeCloseRate(pipeline, new Date("2026-06-25"), new Date("2026-07-01"));

    expect(result.soldCount).toBe(1);
  });
});
