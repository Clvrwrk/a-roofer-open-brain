import { describe, expect, it } from "vitest";
import {
  computeAverageTicket,
  computeCloseRate,
  computeFreshnessBadges,
  computeFunnelStagesWithSplit,
  computeLeaderboardWithSplit,
  computeLocationRollup,
  computeMarginByDimension,
  computeQueueValues,
  computeSnapshotCloseRate,
  computeTrailing7dTotals,
  deriveRegionOffice,
  deriveSegment,
  excludeClosedAndPaidInFull,
  filterByWindow,
  formatCompactCurrency,
  groupPipelineFunnel,
  isExcludedMilestone,
  jobRowsForLocation,
  paginateRange,
  preClosePipelineValue,
  queueForRow,
  segmentForAccountKey,
  trailing7DayRange,
  type AcculynxJobRow,
  type LeaderboardRow,
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

  it("includes closed jobs in the location drill-down (checkpoint round 3: closed is a visible queue, not excluded)", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" }), makeJobRow({ id: "job-2", account_key: "wichita" })];
    const pipeline = [
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", current_milestone: "closed" }),
      makePipelineRow({ id: 2, acculynx_job_id: "job-2", current_milestone: "approved" }),
    ];

    const rows = jobRowsForLocation(pipeline, jobs, "wichita");

    expect(rows).toHaveLength(2);
  });

  it("excludes dead/cancelled jobs from the location drill-down (checkpoint round 3, item 2)", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" }), makeJobRow({ id: "job-2", account_key: "wichita" })];
    const pipeline = [
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", current_milestone: "dead" }),
      makePipelineRow({ id: 2, acculynx_job_id: "job-2", current_milestone: "approved" }),
    ];

    const rows = jobRowsForLocation(pipeline, jobs, "wichita");

    expect(rows).toHaveLength(1);
    expect(rows[0].acculynxJobId).toBe("job-2");
  });
});

describe("dead/cancelled exclusion (checkpoint round 3, item 2: supersedes round 2's closed/paid-in-full exclusion)", () => {
  it("flags a row with current_milestone 'dead' as excluded", () => {
    expect(isExcludedMilestone(makePipelineRow({ current_milestone: "dead" }))).toBe(true);
  });

  it("flags a row with current_milestone 'cancelled' as excluded", () => {
    expect(isExcludedMilestone(makePipelineRow({ current_milestone: "cancelled" }))).toBe(true);
  });

  it("is case-insensitive (covers Title-Case acculynx_jobs vocabulary if it ever leaks into this field)", () => {
    expect(isExcludedMilestone(makePipelineRow({ current_milestone: "Dead" }))).toBe(true);
    expect(isExcludedMilestone(makePipelineRow({ current_milestone: "Cancelled" }))).toBe(true);
    expect(isExcludedMilestone(makePipelineRow({ current_milestone: "CANCELLED" }))).toBe(true);
  });

  it("does not flag other real production milestones (closed, invoiced, completed, approved, prospect, leads)", () => {
    for (const milestone of ["closed", "invoiced", "completed", "approved", "prospect", "assigned_lead", "unassigned_lead"]) {
      expect(isExcludedMilestone(makePipelineRow({ current_milestone: milestone }))).toBe(false);
    }
  });

  it("treats a null/empty current_milestone as not excluded", () => {
    expect(isExcludedMilestone(makePipelineRow({ current_milestone: null }))).toBe(false);
  });

  it("excludeClosedAndPaidInFull drops only dead/cancelled rows from a mixed set, case-insensitively", () => {
    const rows = [
      makePipelineRow({ id: 1, current_milestone: "dead" }),
      makePipelineRow({ id: 2, current_milestone: "Cancelled" }),
      makePipelineRow({ id: 3, current_milestone: "approved" }),
      makePipelineRow({ id: 4, current_milestone: "closed" }),
    ];

    const result = excludeClosedAndPaidInFull(rows);

    expect(result.map((row) => row.id)).toEqual([3, 4]);
  });

  it("removes excluded-milestone rows from the funnel grouping entirely (not zeroed, not present)", () => {
    const rows = excludeClosedAndPaidInFull([
      makePipelineRow({ id: 1, current_milestone: "dead", contract_amount: 50000 }),
      makePipelineRow({ id: 2, current_milestone: "approved", contract_amount: 10000 }),
    ]);
    const funnel = groupPipelineFunnel(rows);

    expect(funnel.find((stage) => stage.milestone === "dead")).toBeUndefined();
    expect(funnel.find((stage) => stage.milestone === "approved")).toBeDefined();
  });

  it("removes excluded-milestone rows from margin-by-dimension aggregation and its coverage denominator", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" }), makeJobRow({ id: "job-2", account_key: "wichita" })];
    const pipeline = excludeClosedAndPaidInFull([
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", current_milestone: "dead", contract_amount: 100000 }),
      makePipelineRow({ id: 2, acculynx_job_id: "job-2", current_milestone: "approved", contract_amount: 10000 }),
    ]);
    const financials = new Map([["job-2", { grossProfit: 2000 }]]);

    const byRegion = computeMarginByDimension(pipeline, jobs, financials, new Map(), (row, jobRows) => deriveRegionOffice(row, jobRows).accountKey);
    const wichita = byRegion.find((row) => row.dimension === "wichita");

    expect(wichita?.coverage.totalJobsInSlice).toBe(1);
  });

  it("removes excluded-milestone rows from the per-location rollup pre-close pipeline value and AR $ (checkpoint round 3, item 3)", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" }), makeJobRow({ id: "job-2", account_key: "wichita" })];
    const pipeline = excludeClosedAndPaidInFull([
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", current_milestone: "dead", contract_amount: 100000, balance_due: 5000 }),
      makePipelineRow({
        id: 2,
        acculynx_job_id: "job-2",
        current_milestone: "prospect",
        primary_estimate_amount: 10000,
        balance_due: 500,
      }),
    ]);

    const rollup = computeLocationRollup(pipeline, jobs, ["wichita"], new Date("2026-06-20"), new Date("2026-07-01"));

    expect(rollup[0].pipelineValue).toBe(10000);
    expect(rollup[0].arValue).toBe(500);
  });

  it("removes excluded-milestone rows from close-rate sold-count (checkpoint feedback applied uniformly, per implementation contract)", () => {
    const pipeline = excludeClosedAndPaidInFull([
      makePipelineRow({ id: 1, current_milestone: "dead", approved_date: "2026-06-28T00:00:00Z" }),
      makePipelineRow({ id: 2, current_milestone: "invoiced", approved_date: "2026-06-28T00:00:00Z" }),
    ]);

    const result = computeCloseRate(pipeline, new Date("2026-06-25"), new Date("2026-07-01"));

    expect(result.soldCount).toBe(1);
  });
});

describe("segment classification (checkpoint round 3, item 4: segmentation is BY ACCOUNT)", () => {
  it("classifies multi_family_commercial as commercial", () => {
    expect(segmentForAccountKey("multi_family_commercial")).toBe("commercial");
  });

  it("classifies insurance_program as residential (only multi_family_commercial is commercial)", () => {
    expect(segmentForAccountKey("insurance_program")).toBe("residential");
  });

  it("classifies every geo location account as residential", () => {
    for (const key of ["colorado", "florida", "georgia", "kansas_city", "texas", "wichita"]) {
      expect(segmentForAccountKey(key)).toBe("residential");
    }
  });

  it("classifies an unresolvable/unknown account_key as residential (never fabricates a commercial segment)", () => {
    expect(segmentForAccountKey("unknown")).toBe("residential");
  });

  it("deriveSegment wraps deriveRegionOffice + segmentForAccountKey for a row", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "multi_family_commercial" })];
    const row = makePipelineRow({ acculynx_job_id: "job-1" });

    expect(deriveSegment(row, jobs)).toBe("commercial");
  });
});

describe("queue bucketing (checkpoint round 3, item 3)", () => {
  it("buckets unassigned_lead/assigned_lead/lead into the leads queue with NO value (excluded entirely)", () => {
    const rows = [
      makePipelineRow({ id: 1, current_milestone: "unassigned_lead", contract_amount: 5000 }),
      makePipelineRow({ id: 2, current_milestone: "assigned_lead", contract_amount: 8000 }),
    ];

    const queues = computeQueueValues(rows);
    const leads = queues.find((q) => q.queue === "leads");

    expect(leads?.count).toBe(2);
    expect(leads?.value).toBeNull();
  });

  it("buckets prospect ONLY when primary_estimate_amount > 0; excludes prospects with no estimate from count and value", () => {
    const rows = [
      makePipelineRow({ id: 1, current_milestone: "prospect", primary_estimate_amount: 15000 }),
      makePipelineRow({ id: 2, current_milestone: "prospect", primary_estimate_amount: 0 }),
      makePipelineRow({ id: 3, current_milestone: "prospect", primary_estimate_amount: null }),
    ];

    const queues = computeQueueValues(rows);
    const prospects = queues.find((q) => q.queue === "prospects");

    expect(prospects?.count).toBe(1);
    expect(prospects?.value).toBe(15000);
  });

  it("the prospects queue's summed estimate value IS the pre-close pipeline value", () => {
    const rows = [
      makePipelineRow({ id: 1, current_milestone: "prospect", primary_estimate_amount: 15000 }),
      makePipelineRow({ id: 2, current_milestone: "prospect", primary_estimate_amount: 22000 }),
      makePipelineRow({ id: 3, current_milestone: "approved", contract_amount: 999999 }),
    ];

    const queues = computeQueueValues(rows);

    expect(preClosePipelineValue(queues)).toBe(37000);
  });

  it("folds 'completed' into the approved queue (user decision, item 3)", () => {
    const rows = [
      makePipelineRow({ id: 1, current_milestone: "approved", contract_amount: 10000 }),
      makePipelineRow({ id: 2, current_milestone: "completed", contract_amount: 20000 }),
    ];

    const queues = computeQueueValues(rows);
    const approved = queues.find((q) => q.queue === "approved");

    expect(approved?.count).toBe(2);
    expect(approved?.value).toBe(30000);
    expect(queueForRow({ current_milestone: "completed" })).toBe("approved");
  });

  it("buckets invoiced and closed queues by contract value", () => {
    const rows = [
      makePipelineRow({ id: 1, current_milestone: "invoiced", contract_amount: 12000 }),
      makePipelineRow({ id: 2, current_milestone: "closed", contract_amount: 9000 }),
    ];

    const queues = computeQueueValues(rows);

    expect(queues.find((q) => q.queue === "invoiced")).toEqual({ queue: "invoiced", count: 1, value: 12000 });
    expect(queues.find((q) => q.queue === "closed")).toEqual({ queue: "closed", count: 1, value: 9000 });
  });

  it("returns null (not undefined/throw) for an unrecognized milestone", () => {
    expect(queueForRow({ current_milestone: "some_unknown_value" })).toBeNull();
    expect(queueForRow({ current_milestone: null })).toBeNull();
  });
});

describe("Average Ticket per segment (checkpoint round 3, item 4)", () => {
  it("computes avgTicket = sum(contract value) / count for jobs approved within the window, per segment", () => {
    const jobs: AcculynxJobRow[] = [
      makeJobRow({ id: "job-1", account_key: "wichita" }),
      makeJobRow({ id: "job-2", account_key: "wichita" }),
      makeJobRow({ id: "job-3", account_key: "multi_family_commercial" }),
    ];
    const pipeline = [
      makePipelineRow({
        id: 1,
        acculynx_job_id: "job-1",
        current_milestone: "approved",
        contract_amount: 10000,
        approved_date: "2026-06-26T00:00:00Z",
      }),
      makePipelineRow({
        id: 2,
        acculynx_job_id: "job-2",
        current_milestone: "approved",
        contract_amount: 20000,
        approved_date: "2026-06-27T00:00:00Z",
      }),
      makePipelineRow({
        id: 3,
        acculynx_job_id: "job-3",
        current_milestone: "approved",
        contract_amount: 90000,
        approved_date: "2026-06-27T00:00:00Z",
      }),
    ];

    const result = computeAverageTicket(pipeline, jobs, new Date("2026-06-20"), new Date("2026-06-30"));

    expect(result.residential.avgTicket).toBeCloseTo(15000, 5);
    expect(result.residential.count).toBe(2);
    expect(result.commercial.avgTicket).toBeCloseTo(90000, 5);
    expect(result.commercial.count).toBe(1);
  });

  it("includes 'completed' jobs (folded into approved) in Average Ticket", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" })];
    const pipeline = [
      makePipelineRow({
        id: 1,
        acculynx_job_id: "job-1",
        current_milestone: "completed",
        contract_amount: 40000,
        milestone_date: "2026-06-26T00:00:00Z",
      }),
    ];

    const result = computeAverageTicket(pipeline, jobs, new Date("2026-06-20"), new Date("2026-06-30"));

    expect(result.residential.avgTicket).toBe(40000);
    expect(result.residential.count).toBe(1);
  });

  it("excludes jobs approved outside the window", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" })];
    const pipeline = [
      makePipelineRow({
        id: 1,
        acculynx_job_id: "job-1",
        current_milestone: "approved",
        contract_amount: 40000,
        approved_date: "2026-05-01T00:00:00Z",
      }),
    ];

    const result = computeAverageTicket(pipeline, jobs, new Date("2026-06-20"), new Date("2026-06-30"));

    expect(result.residential.count).toBe(0);
    expect(result.residential.avgTicket).toBe(0);
  });

  it("returns 0 avgTicket (not NaN) for a segment with zero approved jobs in the window", () => {
    const result = computeAverageTicket([], [], new Date("2026-06-20"), new Date("2026-06-30"));

    expect(result.residential.avgTicket).toBe(0);
    expect(result.commercial.avgTicket).toBe(0);
  });
});

describe("snapshot close rate (checkpoint round 3, item 7 — exact user formula)", () => {
  it("computes count(Approved+Invoiced+Closed) / count(Leads+Prospects+Approved+Invoiced+Closed), ignoring the window", () => {
    const rows = [
      makePipelineRow({ id: 1, current_milestone: "unassigned_lead" }),
      makePipelineRow({ id: 2, current_milestone: "prospect", primary_estimate_amount: 5000 }),
      makePipelineRow({ id: 3, current_milestone: "approved" }),
      makePipelineRow({ id: 4, current_milestone: "invoiced" }),
      makePipelineRow({ id: 5, current_milestone: "closed" }),
    ];

    // numerator = approved+invoiced+closed = 3; denominator = all 5 queue rows = 5
    expect(computeSnapshotCloseRate(rows)).toBeCloseTo(0.6, 5);
  });

  it("counts a prospect toward the denominator even with no estimate value (count-based, not value-based)", () => {
    const rows = [
      makePipelineRow({ id: 1, current_milestone: "prospect", primary_estimate_amount: 0 }),
      makePipelineRow({ id: 2, current_milestone: "approved" }),
    ];

    // denominator counts BOTH rows (prospect counts even without an estimate);
    // numerator counts only the approved row.
    expect(computeSnapshotCloseRate(rows)).toBeCloseTo(0.5, 5);
  });

  it("counts 'completed' toward the numerator (folded into approved, item 3)", () => {
    const rows = [makePipelineRow({ id: 1, current_milestone: "completed" }), makePipelineRow({ id: 2, current_milestone: "unassigned_lead" })];

    expect(computeSnapshotCloseRate(rows)).toBeCloseTo(0.5, 5);
  });

  it("returns 0 (not NaN) when there are no rows in any of the five queues", () => {
    expect(computeSnapshotCloseRate([])).toBe(0);
  });

  it("ignores dates entirely — a row far outside any window still counts (snapshot, not window-filtered)", () => {
    const rows = [makePipelineRow({ id: 1, current_milestone: "approved", approved_date: "2020-01-01T00:00:00Z" })];

    expect(computeSnapshotCloseRate(rows)).toBe(1);
  });

  it("computeLocationRollup exposes closeRateSnapshot per location, independent of the passed window", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" }), makeJobRow({ id: "job-2", account_key: "wichita" })];
    const pipeline = [
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", current_milestone: "unassigned_lead" }),
      makePipelineRow({ id: 2, acculynx_job_id: "job-2", current_milestone: "closed" }),
    ];

    const rollup = computeLocationRollup(pipeline, jobs, ["wichita"], new Date("2026-01-01"), new Date("2026-01-02"));

    expect(rollup[0].closeRateSnapshot).toBeCloseTo(0.5, 5);
  });
});

describe("compact currency formatter (checkpoint round 3, item 5)", () => {
  it("formats thousands as $NK, rounded to the nearest whole K", () => {
    expect(formatCompactCurrency(5000)).toBe("$5K");
    expect(formatCompactCurrency(50000)).toBe("$50K");
    expect(formatCompactCurrency(500000)).toBe("$500K");
  });

  it("formats millions as $NM", () => {
    expect(formatCompactCurrency(1_000_000)).toBe("$1M");
    expect(formatCompactCurrency(1_500_000)).toBe("$1.5M");
  });

  it("formats sub-thousand values as a plain rounded dollar amount", () => {
    expect(formatCompactCurrency(0)).toBe("$0");
    expect(formatCompactCurrency(999)).toBe("$999");
    expect(formatCompactCurrency(499.6)).toBe("$500");
  });

  it("handles the exact 1000/1,000,000 boundaries", () => {
    expect(formatCompactCurrency(999)).toBe("$999");
    expect(formatCompactCurrency(1000)).toBe("$1K");
    expect(formatCompactCurrency(999_999)).toBe("$1000K");
    expect(formatCompactCurrency(1_000_000)).toBe("$1M");
  });

  it("preserves the negative sign before the dollar mark", () => {
    expect(formatCompactCurrency(-5000)).toBe("-$5K");
    expect(formatCompactCurrency(-1_500_000)).toBe("-$1.5M");
  });
});

describe("collected/AR split for stacked charts (checkpoint round 4, item 1)", () => {
  it("computeFunnelStagesWithSplit: an all-zero-AR fixture (today's production reality) yields fully-collected stages with a zero AR segment", () => {
    const pipeline = [
      makePipelineRow({ id: 1, current_milestone: "approved", contract_amount: 10000, primary_estimate_amount: 0, balance_due: 0 }),
      makePipelineRow({ id: 2, current_milestone: "approved", contract_amount: 5000, primary_estimate_amount: 0, balance_due: 0 }),
      makePipelineRow({ id: 3, current_milestone: "invoiced", contract_amount: 8000, primary_estimate_amount: 0, balance_due: 0 }),
    ];

    const stages = computeFunnelStagesWithSplit(pipeline);
    const approved = stages.find((s) => s.milestone === "approved");
    const invoiced = stages.find((s) => s.milestone === "invoiced");

    expect(approved).toBeDefined();
    expect(approved?.value).toBe(15000);
    expect(approved?.collected).toBe(15000);
    expect(approved?.arOutstanding).toBe(0);

    expect(invoiced).toBeDefined();
    expect(invoiced?.collected).toBe(8000);
    expect(invoiced?.arOutstanding).toBe(0);
  });

  it("computeFunnelStagesWithSplit: a nonzero-AR fixture splits collected vs AR correctly per stage", () => {
    const pipeline = [
      makePipelineRow({ id: 1, current_milestone: "invoiced", contract_amount: 10000, primary_estimate_amount: 0, balance_due: 4000 }),
      makePipelineRow({ id: 2, current_milestone: "invoiced", contract_amount: 6000, primary_estimate_amount: 0, balance_due: 1000 }),
    ];

    const stages = computeFunnelStagesWithSplit(pipeline);
    const invoiced = stages.find((s) => s.milestone === "invoiced");

    expect(invoiced?.value).toBe(16000);
    expect(invoiced?.arOutstanding).toBe(5000);
    expect(invoiced?.collected).toBe(11000);
  });

  it("computeFunnelStagesWithSplit: floors the collected segment at 0 when AR exceeds the stage value (never negative)", () => {
    const pipeline = [
      makePipelineRow({ id: 1, current_milestone: "invoiced", contract_amount: 1000, primary_estimate_amount: 0, balance_due: 5000 }),
    ];

    const stages = computeFunnelStagesWithSplit(pipeline);
    const invoiced = stages.find((s) => s.milestone === "invoiced");

    expect(invoiced?.arOutstanding).toBe(5000);
    expect(invoiced?.collected).toBe(0);
  });

  it("computeFunnelStagesWithSplit: preserves the same stage set/order/values as groupPipelineFunnel", () => {
    const pipeline = [
      makePipelineRow({ id: 1, current_milestone: "approved", contract_amount: 10000, balance_due: 0 }),
      makePipelineRow({ id: 2, current_milestone: "prospect", primary_estimate_amount: 2000, contract_amount: 0, balance_due: 0 }),
    ];

    const baseline = groupPipelineFunnel(pipeline);
    const withSplit = computeFunnelStagesWithSplit(pipeline);

    expect(withSplit.map((s) => ({ milestone: s.milestone, count: s.count, value: s.value }))).toEqual(baseline);
  });

  it("computeLeaderboardWithSplit: an all-zero-AR fixture yields fully-collected reps with a zero AR segment", () => {
    const leaderboard: LeaderboardRow[] = [{ salesperson: "Jamie Rep", soldCount: 2, soldValue: 15000, arBalance: 0 }];
    const soldRowsByRep = new Map<string, PipelineRow[]>([
      [
        "Jamie Rep",
        [
          makePipelineRow({ id: 1, primary_salesperson: "Jamie Rep", contract_amount: 10000, balance_due: 0 }),
          makePipelineRow({ id: 2, primary_salesperson: "Jamie Rep", contract_amount: 5000, balance_due: 0 }),
        ],
      ],
    ]);

    const withSplit = computeLeaderboardWithSplit(leaderboard, soldRowsByRep);

    expect(withSplit[0].collected).toBe(15000);
    expect(withSplit[0].arOutstanding).toBe(0);
  });

  it("computeLeaderboardWithSplit: a nonzero-AR fixture splits collected vs AR per rep", () => {
    const leaderboard: LeaderboardRow[] = [{ salesperson: "Jamie Rep", soldCount: 1, soldValue: 10000, arBalance: 3000 }];
    const soldRowsByRep = new Map<string, PipelineRow[]>([
      ["Jamie Rep", [makePipelineRow({ id: 1, primary_salesperson: "Jamie Rep", contract_amount: 10000, balance_due: 3000 })]],
    ]);

    const withSplit = computeLeaderboardWithSplit(leaderboard, soldRowsByRep);

    expect(withSplit[0].collected).toBe(7000);
    expect(withSplit[0].arOutstanding).toBe(3000);
  });

  it("computeLeaderboardWithSplit: a rep missing from soldRowsByRep yields a fully-collected zero-AR row rather than throwing", () => {
    const leaderboard: LeaderboardRow[] = [{ salesperson: "Ghost Rep", soldCount: 0, soldValue: 0, arBalance: 0 }];
    const withSplit = computeLeaderboardWithSplit(leaderboard, new Map());

    expect(withSplit[0].collected).toBe(0);
    expect(withSplit[0].arOutstanding).toBe(0);
  });
});

describe("trailing 7-day totals (checkpoint round 4, item 2)", () => {
  const NOW = new Date("2026-07-01T12:00:00");

  it("trailing7DayRange is a fixed 7-day window anchored at now (start of today back 7 days), independent of any selector token", () => {
    const { start, end } = trailing7DayRange(NOW);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(6); // July (0-indexed)
    expect(end.getDate()).toBe(1);
    expect(end.getHours()).toBe(0);
    expect(start.getDate()).toBe(24);
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("counts a new lead inside the boundary and excludes one outside it (New Leads: count only, no $)", () => {
    const pipeline = [
      makePipelineRow({ id: 1, current_milestone: "unassigned_lead", lead_date: "2026-06-26T12:00:00" }), // inside
      makePipelineRow({ id: 2, current_milestone: "assigned_lead", lead_date: "2026-06-15T12:00:00" }), // outside (too old)
      makePipelineRow({ id: 3, current_milestone: "lead", lead_date: "2026-07-01T12:00:00" }), // outside (on/after the exclusive end boundary)
    ];

    const totals = computeTrailing7dTotals(pipeline, NOW);

    expect(totals.newLeads.count).toBe(1);
    expect(totals.newLeads.value).toBeNull();
  });

  it("New Pre-close counts/values prospects-with-an-estimate inside the window, excluding prospects with no estimate", () => {
    const pipeline = [
      makePipelineRow({
        id: 1,
        current_milestone: "prospect",
        primary_estimate_amount: 4000,
        contract_amount: 0,
        lead_date: "2026-06-27T00:00:00Z",
      }),
      makePipelineRow({
        id: 2,
        current_milestone: "prospect",
        primary_estimate_amount: 0,
        contract_amount: 0,
        lead_date: "2026-06-27T00:00:00Z",
      }), // no estimate — excluded
      makePipelineRow({
        id: 3,
        current_milestone: "prospect",
        primary_estimate_amount: 3000,
        contract_amount: 0,
        lead_date: "2026-06-01T00:00:00Z",
      }), // outside window
    ];

    const totals = computeTrailing7dTotals(pipeline, NOW);

    expect(totals.newPreClose.count).toBe(1);
    expect(totals.newPreClose.value).toBe(4000);
  });

  it("New Contracts counts the Approved queue (completed folded in) keyed on approved_date within the window", () => {
    const pipeline = [
      makePipelineRow({ id: 1, current_milestone: "approved", contract_amount: 12000, approved_date: "2026-06-28T00:00:00Z" }),
      makePipelineRow({ id: 2, current_milestone: "completed", contract_amount: 8000, approved_date: "2026-06-25T00:00:00Z" }),
      makePipelineRow({ id: 3, current_milestone: "approved", contract_amount: 5000, approved_date: "2026-05-01T00:00:00Z" }), // outside
    ];

    const totals = computeTrailing7dTotals(pipeline, NOW);

    expect(totals.newContracts.count).toBe(2);
    expect(totals.newContracts.value).toBe(20000);
  });

  it("Invoiced and Closed each count/value their own queue within the window", () => {
    const pipeline = [
      makePipelineRow({
        id: 1,
        current_milestone: "invoiced",
        contract_amount: 7000,
        approved_date: null,
        milestone_date: "2026-06-29T00:00:00Z",
      }),
      makePipelineRow({
        id: 2,
        current_milestone: "closed",
        contract_amount: 9000,
        approved_date: null,
        milestone_date: "2026-06-30T00:00:00Z",
      }),
      makePipelineRow({
        id: 3,
        current_milestone: "closed",
        contract_amount: 1000,
        approved_date: null,
        milestone_date: "2026-01-01T00:00:00Z",
      }), // outside
    ];

    const totals = computeTrailing7dTotals(pipeline, NOW);

    expect(totals.invoiced.count).toBe(1);
    expect(totals.invoiced.value).toBe(7000);
    expect(totals.closed.count).toBe(1);
    expect(totals.closed.value).toBe(9000);
  });

  it("returns all-zero totals (not NaN/throw) for an empty row set", () => {
    const totals = computeTrailing7dTotals([], NOW);

    expect(totals.newLeads).toEqual({ count: 0, value: null });
    expect(totals.newPreClose).toEqual({ count: 0, value: 0 });
    expect(totals.newContracts).toEqual({ count: 0, value: 0 });
    expect(totals.invoiced).toEqual({ count: 0, value: 0 });
    expect(totals.closed).toEqual({ count: 0, value: 0 });
  });

  it("dead/cancelled rows are excluded upstream — a caller passing pre-excluded rows never sees them counted", () => {
    // queueForRow returns null for dead/cancelled (they are not in any QUEUE_*_MILESTONES
    // set), so even an un-pre-filtered row is naturally skipped — this regression-guards
    // that behavior without relying on the caller always remembering to pre-filter.
    const pipeline = [
      makePipelineRow({ id: 1, current_milestone: "dead", lead_date: "2026-06-28T00:00:00Z" }),
      makePipelineRow({ id: 2, current_milestone: "cancelled", contract_amount: 5000, approved_date: "2026-06-28T00:00:00Z" }),
    ];

    const totals = computeTrailing7dTotals(pipeline, NOW);

    expect(totals.newLeads.count).toBe(0);
    expect(totals.newContracts.count).toBe(0);
  });
});
