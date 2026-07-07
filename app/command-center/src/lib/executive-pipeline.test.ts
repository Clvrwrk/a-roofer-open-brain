import { describe, expect, it } from "vitest";
import {
  arForRow,
  buildStageEntryDates,
  collectedByJobId,
  computeAverageTicket,
  computeCloseRate,
  computeClosedInWindow,
  computeFreshnessBadges,
  computeFunnelStagesWithSplit,
  computeHighestArAgingDays,
  computeLeaderboardWithSplit,
  computeLocationRollup,
  computeMarginByDimension,
  computeQueueValues,
  computeSnapshotCloseRate,
  computeTotalOutstandingArFromInvoices,
  computeTrailing7dPillsV2,
  computeTrailing7dTotals,
  dedupePipeline,
  deriveRegionOffice,
  deriveSegment,
  excludeClosedAndPaidInFull,
  filterByWindow,
  filterRowsInWindow,
  formatCompactCurrency,
  formatJobDisplayName,
  freshnessBasisByAccount,
  groupPipelineFunnel,
  isExcludedMilestone,
  isRowInWindow,
  jobRowsForLocation,
  looksLikeRepName,
  openInvoiceArByJobId,
  paginateRange,
  preClosePipelineValue,
  queueForRow,
  repBucketFor,
  REP_UNKNOWN_LABEL,
  segmentForAccountKey,
  stageDateFor,
  stageEntryDateFor,
  trailing7DayRange,
  windowRange,
  type AcculynxJobRow,
  type InvoiceAgingRow,
  type LeaderboardRow,
  type MilestoneHistoryRow,
  type PipelineRow,
  type WatermarkRow,
} from "@lib/executive-pipeline";

function makePipelineRow(overrides: Partial<PipelineRow> = {}): PipelineRow {
  return {
    id: 1,
    acculynx_job_id: "job-1",
    job_name: "Test Job",
    client_name: "Test Client",
    client_job_number: "1001",
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

/** AR-truth fix (2026-07-03): AR fixtures are open-invoice maps built from
 * acculynx_invoices rows — crm_pipeline.balance_due is retired as an AR signal. */
function makeInvoice(overrides: Partial<InvoiceAgingRow> = {}): InvoiceAgingRow {
  return {
    job_id: "job-1",
    invoice_date: "2026-06-01T00:00:00Z",
    balance_due: 0,
    total_price: 0,
    ...overrides,
  };
}

function arMap(entries: Record<string, number>): Map<string, number> {
  return openInvoiceArByJobId(
    Object.entries(entries).map(([jobId, balance]) => makeInvoice({ job_id: jobId, balance_due: balance })),
  );
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

describe("freshnessBasisByAccount (Round 3, item F: live-diagnosed freshness fix)", () => {
  function makeWatermark(overrides: Partial<WatermarkRow> = {}): WatermarkRow {
    return { account_key: "wichita", resource_type: "jobs", last_sync_at: "2026-07-02T11:45:00Z", ...overrides };
  }

  it("uses the account's jobs watermark as the freshness basis", () => {
    const basis = freshnessBasisByAccount([makeWatermark({ last_sync_at: "2026-07-02T11:45:00Z" })]);
    expect(basis.get("wichita")).toBe("2026-07-02T11:45:00Z");
  });

  it("ignores legacy non-account-scoped/NULL seed rows (users, invoices, job_financials, job_insurance, job_milestone_history)", () => {
    const staleLegacyRows: WatermarkRow[] = [
      makeWatermark({ resource_type: "users", last_sync_at: null }),
      makeWatermark({ resource_type: "invoices", last_sync_at: null }),
      makeWatermark({ resource_type: "job_financials", last_sync_at: null }),
      makeWatermark({ resource_type: "job_insurance", last_sync_at: null }),
      makeWatermark({ resource_type: "job_milestone_history", last_sync_at: null }),
      makeWatermark({ resource_type: "jobs", last_sync_at: "2026-07-02T11:45:00Z" }),
    ];

    const basis = freshnessBasisByAccount(staleLegacyRows);

    expect(basis.get("wichita")).toBe("2026-07-02T11:45:00Z");
  });

  it("ignores job_walk rows entirely, even when job_walk is stale/never-advanced", () => {
    const rows: WatermarkRow[] = [
      makeWatermark({ resource_type: "job_walk", last_sync_at: "2025-01-01T00:00:00Z" }),
      makeWatermark({ resource_type: "jobs", last_sync_at: "2026-07-02T11:45:00Z" }),
    ];

    const basis = freshnessBasisByAccount(rows);

    expect(basis.get("wichita")).toBe("2026-07-02T11:45:00Z");
  });

  it("takes the MAX across jobs/contacts/estimates when multiple qualifying resources exist", () => {
    const rows: WatermarkRow[] = [
      makeWatermark({ resource_type: "jobs", last_sync_at: "2026-07-02T10:00:00Z" }),
      makeWatermark({ resource_type: "contacts", last_sync_at: "2026-07-02T11:45:00Z" }),
      makeWatermark({ resource_type: "estimates", last_sync_at: "2026-07-02T09:00:00Z" }),
    ];

    const basis = freshnessBasisByAccount(rows);

    expect(basis.get("wichita")).toBe("2026-07-02T11:45:00Z");
  });

  it("an account with no qualifying watermark row is absent from the map (never fabricates a date)", () => {
    const rows: WatermarkRow[] = [makeWatermark({ resource_type: "job_walk", last_sync_at: "2025-01-01T00:00:00Z" })];

    const basis = freshnessBasisByAccount(rows);

    expect(basis.has("wichita")).toBe(false);
  });

  it("live-diagnosed regression: a fresh jobs sync is NOT dragged stale by other stale/legacy resource rows for the same account", () => {
    const now = new Date("2026-07-02T12:00:00Z");
    const rows: WatermarkRow[] = [
      makeWatermark({ resource_type: "jobs", last_sync_at: "2026-07-02T11:45:00Z" }), // 15 min old
      makeWatermark({ resource_type: "job_walk", last_sync_at: "2025-01-01T00:00:00Z" }), // ancient
      makeWatermark({ resource_type: "job_milestone_history", last_sync_at: null }),
    ];

    const basis = freshnessBasisByAccount(rows);
    const badges = computeFreshnessBadges([{ accountKey: "wichita", lastSyncAt: basis.get("wichita") ?? null }], now, 60 * 60_000);

    expect(badges[0].tone).toBe("ready");
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

describe("milestone-history stage dates (2026-07-06 rebuild)", () => {
  const history: MilestoneHistoryRow[] = [
    { job_id: "job-1", milestone_name: "Lead", milestone_date: "2024-03-01T00:00:00Z" },
    { job_id: "job-1", milestone_name: "Approved", milestone_date: "2024-05-01T00:00:00Z" },
    { job_id: "job-1", milestone_name: "Closed", milestone_date: "2026-02-15T00:00:00Z" },
    // earliest of two Closed entries wins (job first entered the stage):
    { job_id: "job-1", milestone_name: "Closed", milestone_date: "2026-03-20T00:00:00Z" },
    { job_id: "job-2", milestone_name: "Cancelled", milestone_date: "2026-01-10T00:00:00Z" },
  ];

  it("builds earliest per-stage entry dates and ignores Cancelled (not a windowable stage)", () => {
    const map = buildStageEntryDates(history);
    expect(map.get("job-1")?.closed?.toISOString()).toBe("2026-02-15T00:00:00.000Z");
    expect(map.get("job-1")?.approved?.toISOString()).toBe("2024-05-01T00:00:00.000Z");
    // job-2 only has a Cancelled row -> no windowable stage recorded
    expect(map.get("job-2")).toBeUndefined();
  });

  it("stageEntryDateFor prefers the real history date over crm columns", () => {
    const map = buildStageEntryDates(history);
    const row = makePipelineRow({ acculynx_job_id: "job-1", current_milestone: "closed", milestone_date: "2026-06-28T00:00:00Z" });
    // history Closed date (2026-02-15) wins over the crm milestone_date (2026-06-28)
    expect(stageEntryDateFor(row, "closed", map)?.toISOString()).toBe("2026-02-15T00:00:00.000Z");
  });

  it("NEVER falls back to updated_at/created_at — an undated job resolves to null", () => {
    const row = makePipelineRow({
      acculynx_job_id: "no-history",
      current_milestone: "closed",
      milestone_date: null,
      approved_date: null,
      lead_date: null,
      updated_at: "2026-07-06T00:00:00Z",
      created_at: "2026-07-06T00:00:00Z",
    });
    // legacy stageDateFor would return the updated_at fallback; the new resolver must not
    expect(stageDateFor(row, "closed")?.toISOString()).toBe("2026-07-06T00:00:00.000Z");
    expect(stageEntryDateFor(row, "closed", new Map())).toBeNull();
  });

  it("isRowInWindow with a stage-date map windows a closed job on its real close date, not the sync clock", () => {
    const map = buildStageEntryDates(history);
    // Job closed 2026-02-15 but last synced (updated_at) 2026-07-06.
    const row = makePipelineRow({ acculynx_job_id: "job-1", current_milestone: "closed", milestone_date: null, approved_date: null, updated_at: "2026-07-06T00:00:00Z" });
    const july = { start: new Date("2026-07-01T00:00:00Z"), end: new Date("2026-07-31T00:00:00Z") };
    const feb = { start: new Date("2026-02-01T00:00:00Z"), end: new Date("2026-02-28T00:00:00Z") };
    // Legacy path (no map) would drag it into July via updated_at:
    expect(isRowInWindow(row, july.start, july.end)).toBe(true);
    // History-aware path: in February (real close), NOT in July:
    expect(isRowInWindow(row, feb.start, feb.end, undefined, map)).toBe(true);
    expect(isRowInWindow(row, july.start, july.end, undefined, map)).toBe(false);
  });

  it("computeClosedInWindow counts closed jobs once, by close date, and excludes approved-not-closed", () => {
    const map = buildStageEntryDates([
      { job_id: "closed-2026", milestone_name: "Closed", milestone_date: "2026-04-10T00:00:00Z" },
      { job_id: "closed-2025", milestone_name: "Closed", milestone_date: "2025-04-10T00:00:00Z" },
    ]);
    const rows = [
      makePipelineRow({ id: 1, acculynx_job_id: "closed-2026", current_milestone: "closed", contract_amount: 50000 }),
      makePipelineRow({ id: 2, acculynx_job_id: "closed-2025", current_milestone: "closed", contract_amount: 99000 }),
      makePipelineRow({ id: 3, acculynx_job_id: "appr", current_milestone: "approved", contract_amount: 77000 }),
    ];
    const ytd = computeClosedInWindow(rows, new Date("2026-01-01T00:00:00Z"), new Date("2026-12-31T00:00:00Z"), map);
    // only the 2026-closed job counts; 2025-closed is out of window; approved is not "sold" yet
    expect(ytd.soldCount).toBe(1);
    expect(ytd.soldValue).toBe(50000);
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

    const { rows } = jobRowsForLocation(pipeline, jobs, "wichita");

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

    const { rows } = jobRowsForLocation(pipeline, jobs, "wichita", "Commercial");

    expect(rows).toHaveLength(1);
    expect(rows[0].acculynxJobId).toBe("job-2");
  });

  it("sorts rows by contract amount descending and never fabricates rows", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" }), makeJobRow({ id: "job-2", account_key: "wichita" })];
    const pipeline = [
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", contract_amount: 5000 }),
      makePipelineRow({ id: 2, acculynx_job_id: "job-2", contract_amount: 20000 }),
    ];

    const { rows } = jobRowsForLocation(pipeline, jobs, "wichita");

    expect(rows).toHaveLength(2);
    expect(rows[0].acculynxJobId).toBe("job-2");
    expect(rows[1].acculynxJobId).toBe("job-1");
  });

  it("returns an empty array (not a fabricated row) when no jobs match the location", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "colorado" })];
    const pipeline = [makePipelineRow({ id: 1, acculynx_job_id: "job-1" })];

    const { rows } = jobRowsForLocation(pipeline, jobs, "wichita");

    expect(rows).toHaveLength(0);
  });

  it("includes closed jobs in the location drill-down (checkpoint round 3: closed is a visible queue, not excluded)", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" }), makeJobRow({ id: "job-2", account_key: "wichita" })];
    const pipeline = [
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", current_milestone: "closed" }),
      makePipelineRow({ id: 2, acculynx_job_id: "job-2", current_milestone: "approved" }),
    ];

    const { rows } = jobRowsForLocation(pipeline, jobs, "wichita");

    expect(rows).toHaveLength(2);
  });

  it("excludes dead/cancelled jobs from the location drill-down (checkpoint round 3, item 2)", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" }), makeJobRow({ id: "job-2", account_key: "wichita" })];
    const pipeline = [
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", current_milestone: "dead" }),
      makePipelineRow({ id: 2, acculynx_job_id: "job-2", current_milestone: "approved" }),
    ];

    const { rows } = jobRowsForLocation(pipeline, jobs, "wichita");

    expect(rows).toHaveLength(1);
    expect(rows[0].acculynxJobId).toBe("job-2");
  });

  // -------------------------------------------------------------------------
  // Fix round item 2 (2026-07-02): zero-value jobs hidden from the drill-down list
  // -------------------------------------------------------------------------

  it("excludes a $0-value job from rows and counts it in hiddenZeroValueCount", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" }), makeJobRow({ id: "job-2", account_key: "wichita" })];
    const pipeline = [
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", contract_amount: 0, primary_estimate_amount: 0 }),
      makePipelineRow({ id: 2, acculynx_job_id: "job-2", contract_amount: 15000, primary_estimate_amount: 0 }),
    ];

    const { rows, hiddenZeroValueCount } = jobRowsForLocation(pipeline, jobs, "wichita");

    expect(rows).toHaveLength(1);
    expect(rows[0].acculynxJobId).toBe("job-2");
    expect(hiddenZeroValueCount).toBe(1);
  });

  it("counts a negative-value job (bad data) as hidden too — never shows a non-positive value row", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" })];
    const pipeline = [makePipelineRow({ id: 1, acculynx_job_id: "job-1", contract_amount: -500, primary_estimate_amount: 0 })];

    const { rows, hiddenZeroValueCount } = jobRowsForLocation(pipeline, jobs, "wichita");

    expect(rows).toHaveLength(0);
    expect(hiddenZeroValueCount).toBe(1);
  });

  it("hiddenZeroValueCount is 0 when every matching job has a positive value", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" })];
    const pipeline = [makePipelineRow({ id: 1, acculynx_job_id: "job-1", contract_amount: 8000 })];

    const { hiddenZeroValueCount } = jobRowsForLocation(pipeline, jobs, "wichita");

    expect(hiddenZeroValueCount).toBe(0);
  });

  it("hiddenZeroValueCount only counts zero-value jobs matching the location/type/rep filters, not the whole dataset", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" }), makeJobRow({ id: "job-2", account_key: "colorado" })];
    const pipeline = [
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", contract_amount: 5000, primary_estimate_amount: 0 }),
      // A zero-value job in a DIFFERENT location must not inflate wichita's hidden count.
      makePipelineRow({ id: 2, acculynx_job_id: "job-2", contract_amount: 0, primary_estimate_amount: 0 }),
    ];

    const { hiddenZeroValueCount } = jobRowsForLocation(pipeline, jobs, "wichita");

    expect(hiddenZeroValueCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Fix round item 3 (2026-07-02): a job whose crm_pipeline.job_name fell back to a
  // bare AccuLynx job_number never renders as a bare number in the drill-down.
  // -------------------------------------------------------------------------

  it("renders a client-name/job-number label instead of a bare numeric job_name (the 'weird numbers for names' bug)", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" })];
    const pipeline = [
      makePipelineRow({
        id: 1,
        acculynx_job_id: "job-1",
        job_name: "48213", // buildPipelineRow's job_number fallback: AccuLynx jobName was empty
        client_name: "Smith Reroof",
        client_job_number: "48213",
        contract_amount: 12000,
      }),
    ];

    const { rows } = jobRowsForLocation(pipeline, jobs, "wichita");

    expect(rows).toHaveLength(1);
    expect(rows[0].jobName).toBe("Smith Reroof · 48213");
    expect(rows[0].jobName).not.toBe("48213");
  });

  // -------------------------------------------------------------------------
  // Round 3, item E: drill-down rows honor the same window + AR-exception rules
  // as A/B — "all revenue ever" disappears when a window is supplied.
  // -------------------------------------------------------------------------

  it("with a window supplied: a closed job with no AR outside the window is NOT listed", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" })];
    const pipeline = [
      makePipelineRow({
        id: 1,
        acculynx_job_id: "job-1",
        current_milestone: "closed",
        contract_amount: 9000,
        milestone_date: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        balance_due: 0,
      }),
    ];

    const { rows } = jobRowsForLocation(
      pipeline,
      jobs,
      "wichita",
      "all",
      "all",
      new Date("2026-06-01T00:00:00Z"),
      new Date("2026-06-30T00:00:00Z"),
    );

    expect(rows).toHaveLength(0);
  });

  it("with a window supplied: a closed job WITH an open invoice stays listed even outside the window (AR-truth fix: the exception keys on acculynx_invoices, never crm balance_due)", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" })];
    const pipeline = [
      makePipelineRow({
        id: 1,
        acculynx_job_id: "job-1",
        current_milestone: "closed",
        contract_amount: 9000,
        milestone_date: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        balance_due: 0, // crm balance is IGNORED — the invoice ledger drives AR
      }),
    ];

    const { rows } = jobRowsForLocation(
      pipeline,
      jobs,
      "wichita",
      "all",
      "all",
      new Date("2026-06-01T00:00:00Z"),
      new Date("2026-06-30T00:00:00Z"),
      arMap({ "job-1": 500 }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].outstandingAr).toBe(500);
  });

  it("with a window supplied: an APPROVED job with an open invoice also stays listed outside the window (fix 2 — the exception covers any queue, not just invoiced/closed)", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" })];
    const pipeline = [
      makePipelineRow({
        id: 1,
        acculynx_job_id: "job-1",
        current_milestone: "approved",
        contract_amount: 9000,
        approved_date: "2026-01-01T00:00:00Z",
        milestone_date: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      }),
    ];

    const { rows } = jobRowsForLocation(
      pipeline,
      jobs,
      "wichita",
      "all",
      "all",
      new Date("2026-06-01T00:00:00Z"),
      new Date("2026-06-30T00:00:00Z"),
      arMap({ "job-1": 1200 }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].outstandingAr).toBe(1200);
  });

  it("without a window supplied (legacy call signature): existing window-independent behavior is unchanged", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" })];
    const pipeline = [
      makePipelineRow({
        id: 1,
        acculynx_job_id: "job-1",
        current_milestone: "closed",
        contract_amount: 9000,
        milestone_date: "2026-01-01T00:00:00Z",
        balance_due: 0,
      }),
    ];

    const { rows } = jobRowsForLocation(pipeline, jobs, "wichita");

    expect(rows).toHaveLength(1);
  });

  it("emits outstandingAr on every row from the invoice ledger (item E's drill-down column, AR-truth fix)", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" })];
    const pipeline = [makePipelineRow({ id: 1, acculynx_job_id: "job-1", contract_amount: 9000, balance_due: 250 })];

    const { rows } = jobRowsForLocation(pipeline, jobs, "wichita", "all", "all", undefined, undefined, arMap({ "job-1": 250 }));

    expect(rows[0].outstandingAr).toBe(250);
  });

  it("without an invoice map, outstandingAr is 0 — crm balance_due never leaks into the AR column", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" })];
    const pipeline = [makePipelineRow({ id: 1, acculynx_job_id: "job-1", contract_amount: 9000, balance_due: 250 })];

    const { rows } = jobRowsForLocation(pipeline, jobs, "wichita");

    expect(rows[0].outstandingAr).toBe(0);
  });

  it("an unassigned lead with NO value is excluded from the drill-down entirely (item B)", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" })];
    const pipeline = [
      makePipelineRow({
        id: 1,
        acculynx_job_id: "job-1",
        current_milestone: "unassigned_lead",
        primary_salesperson: null,
        contract_amount: 0,
        primary_estimate_amount: 0,
      }),
    ];

    const { rows } = jobRowsForLocation(pipeline, jobs, "wichita");

    expect(rows).toHaveLength(0);
  });

  it("an unassigned job WITH value is bucketed under the account_key as its rep", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" })];
    const pipeline = [
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", primary_salesperson: null, contract_amount: 15000 }),
    ];

    const { rows } = jobRowsForLocation(pipeline, jobs, "wichita");

    expect(rows).toHaveLength(1);
    expect(rows[0].salesperson).toBe("wichita");
  });

  it("a GUID-shaped rep value renders as [rep-unknown] in the drill-down", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" })];
    const pipeline = [
      makePipelineRow({
        id: 1,
        acculynx_job_id: "job-1",
        primary_salesperson: "3f9a1c2e-44b1-4a2d-9c3e-8b7a6f5d4c3b",
        contract_amount: 15000,
      }),
    ];

    const { rows } = jobRowsForLocation(pipeline, jobs, "wichita");

    expect(rows[0].salesperson).toBe(REP_UNKNOWN_LABEL);
  });

  it("the rep filter matches against the same account-bucket/rep-unknown value the row displays", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" }), makeJobRow({ id: "job-2", account_key: "wichita" })];
    const pipeline = [
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", primary_salesperson: null, contract_amount: 15000 }),
      makePipelineRow({ id: 2, acculynx_job_id: "job-2", primary_salesperson: "Jamie Rep", contract_amount: 8000 }),
    ];

    const { rows } = jobRowsForLocation(pipeline, jobs, "wichita", "all", "wichita");

    expect(rows).toHaveLength(1);
    expect(rows[0].acculynxJobId).toBe("job-1");
  });
});

describe("formatJobDisplayName (checkpoint fix round item 3: never render a bare job number as a name)", () => {
  it("uses job_name as-is when it is a real, non-numeric name", () => {
    expect(
      formatJobDisplayName({ job_name: "KS-11: Smolek Reroof", client_name: "Smolek", client_job_number: "KS-11" }),
    ).toBe("KS-11: Smolek Reroof");
  });

  it("falls back to 'client_name · job_number' when job_name is purely numeric", () => {
    expect(formatJobDisplayName({ job_name: "48213", client_name: "Smith", client_job_number: "48213" })).toBe(
      "Smith · 48213",
    );
  });

  it("falls back to 'client_name · job_number' when job_name has internal dashes but is otherwise numeric", () => {
    expect(formatJobDisplayName({ job_name: "482-13", client_name: "Jones", client_job_number: "482-13" })).toBe(
      "Jones · 482-13",
    );
  });

  it("falls back to 'Unnamed job (job_number)' when job_name is numeric and client_name is empty", () => {
    expect(formatJobDisplayName({ job_name: "48213", client_name: null, client_job_number: "48213" })).toBe(
      "Unnamed job (48213)",
    );
  });

  it("falls back to 'Unnamed job (job_number)' when job_name is the literal '(unnamed)' sentinel", () => {
    expect(formatJobDisplayName({ job_name: "(unnamed)", client_name: null, client_job_number: "77001" })).toBe(
      "Unnamed job (77001)",
    );
  });

  it("falls back to plain 'Unnamed job' when nothing is available at all", () => {
    expect(formatJobDisplayName({ job_name: null, client_name: null, client_job_number: null })).toBe("Unnamed job");
  });

  it("never treats a purely-numeric client_name as a real client-ish label either", () => {
    expect(formatJobDisplayName({ job_name: "48213", client_name: "48213", client_job_number: "48213" })).toBe(
      "Unnamed job (48213)",
    );
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

  it("removes excluded-milestone rows from the per-location rollup pre-close pipeline value and AR $ (checkpoint round 3, item 3; AR-truth fix: AR comes from the invoice ledger)", () => {
    const jobs: AcculynxJobRow[] = [makeJobRow({ id: "job-1", account_key: "wichita" }), makeJobRow({ id: "job-2", account_key: "wichita" })];
    const pipeline = excludeClosedAndPaidInFull([
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", current_milestone: "dead", contract_amount: 100000, balance_due: 5000 }),
      makePipelineRow({
        id: 2,
        acculynx_job_id: "job-2",
        current_milestone: "prospect",
        primary_estimate_amount: 10000,
        balance_due: 0,
      }),
    ]);

    // job-1 (dead, excluded upstream) has $5,000 of open invoices that must never
    // count; job-2's $500 open invoice is the only AR in the rollup.
    const rollup = computeLocationRollup(
      pipeline,
      jobs,
      ["wichita"],
      new Date("2026-06-20"),
      new Date("2026-07-01"),
      arMap({ "job-1": 5000, "job-2": 500 }),
    );

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

describe("csv/api dedup with data_source precedence (VERIFICATION gap 8 / 07-07)", () => {
  it("collapses two rows sharing an acculynx_job_id to the api_sync row, regardless of order", () => {
    const csvRow = makePipelineRow({ id: 1, acculynx_job_id: "job-KS-11", data_source: "csv_initial", contract_amount: 5000 });
    const apiRow = makePipelineRow({ id: 2, acculynx_job_id: "job-KS-11", data_source: "api_sync", contract_amount: 0 });

    const resultCsvFirst = dedupePipeline([csvRow, apiRow]);
    expect(resultCsvFirst).toHaveLength(1);
    expect(resultCsvFirst[0].data_source).toBe("api_sync");
    expect(resultCsvFirst[0].id).toBe(2);

    const resultApiFirst = dedupePipeline([apiRow, csvRow]);
    expect(resultApiFirst).toHaveLength(1);
    expect(resultApiFirst[0].data_source).toBe("api_sync");
    expect(resultApiFirst[0].id).toBe(2);
  });

  it("preserves both rows with a null acculynx_job_id (no join key to merge on)", () => {
    const rows = [
      makePipelineRow({ id: 1, acculynx_job_id: null, data_source: "csv_initial" }),
      makePipelineRow({ id: 2, acculynx_job_id: null, data_source: "csv_initial" }),
    ];

    const result = dedupePipeline(rows);

    expect(result).toHaveLength(2);
    expect(result.map((row) => row.id).sort()).toEqual([1, 2]);
  });

  it("falls back to the first row when neither duplicate is api_sync", () => {
    const rows = [
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", data_source: "csv_initial", job_name: "First" }),
      makePipelineRow({ id: 2, acculynx_job_id: "job-1", data_source: "csv_initial", job_name: "Second" }),
    ];

    const result = dedupePipeline(rows);

    expect(result).toHaveLength(1);
    expect(result[0].job_name).toBe("First");
  });

  it("leaves a single unique acculynx_job_id row untouched", () => {
    const rows = [makePipelineRow({ id: 1, acculynx_job_id: "job-1", data_source: "api_sync" })];

    expect(dedupePipeline(rows)).toEqual(rows);
  });

  it("KS-11 case: a pipeline-value/funnel aggregate over the duplicate pair counts the job once, using the api_sync amount", () => {
    const pipeline = [
      makePipelineRow({
        id: 1,
        acculynx_job_id: "job-KS-11",
        data_source: "csv_initial",
        current_milestone: "prospect",
        primary_estimate_amount: 30368.48,
      }),
      makePipelineRow({
        id: 2,
        acculynx_job_id: "job-KS-11",
        data_source: "api_sync",
        current_milestone: "prospect",
        primary_estimate_amount: 0,
      }),
    ];

    const deduped = dedupePipeline(pipeline);
    const funnel = groupPipelineFunnel(deduped);
    const prospectStage = funnel.find((stage) => stage.milestone === "prospect");

    expect(deduped).toHaveLength(1);
    expect(prospectStage?.count).toBe(1);
    expect(preClosePipelineValue(computeQueueValues(deduped))).toBe(0);
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

  it("computeFunnelStagesWithSplit: a nonzero-AR fixture splits collected vs AR correctly per stage (AR-truth fix: AR from the invoice ledger, crm balance_due ignored)", () => {
    const pipeline = [
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", current_milestone: "invoiced", contract_amount: 10000, primary_estimate_amount: 0, balance_due: 0 }),
      makePipelineRow({ id: 2, acculynx_job_id: "job-2", current_milestone: "invoiced", contract_amount: 6000, primary_estimate_amount: 0, balance_due: 0 }),
    ];

    const stages = computeFunnelStagesWithSplit(pipeline, arMap({ "job-1": 4000, "job-2": 1000 }));
    const invoiced = stages.find((s) => s.milestone === "invoiced");

    expect(invoiced?.value).toBe(16000);
    expect(invoiced?.arOutstanding).toBe(5000);
    expect(invoiced?.collected).toBe(11000);
  });

  it("computeFunnelStagesWithSplit: floors the collected segment at 0 when AR exceeds the stage value (never negative)", () => {
    const pipeline = [
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", current_milestone: "invoiced", contract_amount: 1000, primary_estimate_amount: 0, balance_due: 0 }),
    ];

    const stages = computeFunnelStagesWithSplit(pipeline, arMap({ "job-1": 5000 }));
    const invoiced = stages.find((s) => s.milestone === "invoiced");

    expect(invoiced?.arOutstanding).toBe(5000);
    expect(invoiced?.collected).toBe(0);
  });

  it("computeFunnelStagesWithSplit: crm balance_due alone (no invoice map) yields a zero AR segment — retired as an AR signal", () => {
    const pipeline = [
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", current_milestone: "invoiced", contract_amount: 10000, primary_estimate_amount: 0, balance_due: 4000 }),
    ];

    const stages = computeFunnelStagesWithSplit(pipeline);
    const invoiced = stages.find((s) => s.milestone === "invoiced");

    expect(invoiced?.arOutstanding).toBe(0);
    expect(invoiced?.collected).toBe(10000);
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

  it("computeLeaderboardWithSplit: a nonzero-AR fixture splits collected vs AR per rep (AR-truth fix: AR from the invoice ledger)", () => {
    const leaderboard: LeaderboardRow[] = [{ salesperson: "Jamie Rep", soldCount: 1, soldValue: 10000, arBalance: 3000 }];
    const soldRowsByRep = new Map<string, PipelineRow[]>([
      ["Jamie Rep", [makePipelineRow({ id: 1, acculynx_job_id: "job-1", primary_salesperson: "Jamie Rep", contract_amount: 10000, balance_due: 0 })]],
    ]);

    const withSplit = computeLeaderboardWithSplit(leaderboard, soldRowsByRep, arMap({ "job-1": 3000 }));

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

describe("trailing-7-day 7-pill row V2 (fix round item 4, 2026-07-02)", () => {
  const NOW = new Date("2026-07-01T12:00:00");

  it("Lead->Prospect: counts/values prospects-with-an-estimate whose EARLIEST Prospect history entry falls in the window", () => {
    const pipeline = [
      makePipelineRow({
        id: 1,
        acculynx_job_id: "job-1",
        current_milestone: "prospect",
        primary_estimate_amount: 4000,
        contract_amount: 0,
        milestone_date: "2026-06-27T00:00:00Z",
      }),
    ];
    const history: MilestoneHistoryRow[] = [
      { job_id: "job-1", milestone_name: "Prospect", milestone_date: "2026-06-27T00:00:00Z" },
    ];

    const pills = computeTrailing7dPillsV2(pipeline, history, [], NOW);

    expect(pills.leadToProspect.count).toBe(1);
    expect(pills.leadToProspect.value).toBe(4000);
    expect(pills.leadToProspect.secondaryValue).toBeNull();
    expect(pills.leadToProspect.source).toBe("history");
  });

  it("Lead->Prospect: falls back to milestone_date-entered-current-stage when no history row exists, and flags coverage as fallback", () => {
    const pipeline = [
      makePipelineRow({
        id: 1,
        acculynx_job_id: "job-1",
        current_milestone: "prospect",
        primary_estimate_amount: 3500,
        contract_amount: 0,
        milestone_date: "2026-06-28T00:00:00Z",
      }),
    ];

    const pills = computeTrailing7dPillsV2(pipeline, [], [], NOW);

    expect(pills.leadToProspect.count).toBe(1);
    expect(pills.leadToProspect.value).toBe(3500);
    expect(pills.leadToProspect.source).toBe("fallback");
    expect(pills.leadToProspect.coverageNote).toContain("0 of 1");
  });

  it("Prospect->Approved: counts jobs entering Approved in-window, value = contract value, secondaryValue = invoice-ledger Monies Collected (AR-truth fix)", () => {
    const pipeline = [
      makePipelineRow({
        id: 1,
        acculynx_job_id: "job-1",
        current_milestone: "approved",
        contract_amount: 30368.48,
        balance_due: 17532.48, // crm balance is IGNORED — collected comes from the invoice ledger
        milestone_date: "2026-06-29T00:00:00Z",
      }),
    ];
    const history: MilestoneHistoryRow[] = [
      { job_id: "job-1", milestone_name: "Approved", milestone_date: "2026-06-29T00:00:00Z" },
    ];
    // The job has billed $12,836 and been paid in full on those invoices.
    const invoices: InvoiceAgingRow[] = [
      makeInvoice({ job_id: "job-1", total_price: 12836, balance_due: 0 }),
    ];

    const pills = computeTrailing7dPillsV2(pipeline, history, invoices, NOW);

    expect(pills.prospectToApproved.count).toBe(1);
    expect(pills.prospectToApproved.value).toBe(30368.48);
    expect(pills.prospectToApproved.secondaryValue).toBe(12836);
    expect(pills.prospectToApproved.source).toBe("history");
  });

  it("Prospect->Approved: a job with nothing billed has collected $0 — never contract - crm balance (AR-truth fix)", () => {
    const pipeline = [
      makePipelineRow({
        id: 1,
        acculynx_job_id: "job-1",
        current_milestone: "approved",
        contract_amount: 30000,
        balance_due: 0, // the retired proxy would have claimed $30,000 collected
        milestone_date: "2026-06-29T00:00:00Z",
      }),
    ];

    const pills = computeTrailing7dPillsV2(pipeline, [], [], NOW);

    expect(pills.prospectToApproved.secondaryValue).toBe(0);
  });

  it("Approved->Invoiced and Invoiced->Closed: secondaryValue is open-invoice AR for jobs entering each stage in-window (AR-truth fix)", () => {
    const pipeline = [
      makePipelineRow({
        id: 1,
        acculynx_job_id: "job-invoiced",
        current_milestone: "invoiced",
        contract_amount: 10000,
        balance_due: 0,
        milestone_date: "2026-06-29T00:00:00Z",
      }),
      makePipelineRow({
        id: 2,
        acculynx_job_id: "job-closed",
        current_milestone: "closed",
        contract_amount: 8000,
        balance_due: 0,
        milestone_date: "2026-06-30T00:00:00Z",
      }),
    ];
    const invoices: InvoiceAgingRow[] = [
      makeInvoice({ job_id: "job-invoiced", total_price: 10000, balance_due: 4000 }),
      makeInvoice({ job_id: "job-closed", total_price: 8000, balance_due: 500 }),
    ];

    const pills = computeTrailing7dPillsV2(pipeline, [], invoices, NOW);

    expect(pills.approvedToInvoiced.count).toBe(1);
    expect(pills.approvedToInvoiced.secondaryValue).toBe(4000);
    expect(pills.invoicedToClosed.count).toBe(1);
    expect(pills.invoicedToClosed.secondaryValue).toBe(500);
  });

  it("completed milestone folds into the Approved transition (item 3 convention preserved)", () => {
    const pipeline = [
      makePipelineRow({
        id: 1,
        acculynx_job_id: "job-1",
        current_milestone: "completed",
        contract_amount: 6000,
        balance_due: 0,
        milestone_date: "2026-06-29T00:00:00Z",
      }),
    ];

    const pills = computeTrailing7dPillsV2(pipeline, [], [], NOW);

    expect(pills.prospectToApproved.count).toBe(1);
  });

  it("computeTotalOutstandingArFromInvoices sums balance_due across invoices, floored at 0 per invoice", () => {
    const invoices: InvoiceAgingRow[] = [
      { job_id: "job-1", invoice_date: "2026-06-01T00:00:00Z", balance_due: 500, total_price: 0 },
      { job_id: "job-2", invoice_date: "2026-06-01T00:00:00Z", balance_due: -50, total_price: 0 }, // credit — never subtracts
      { job_id: "job-3", invoice_date: "2026-06-01T00:00:00Z", balance_due: 1200, total_price: 0 },
    ];

    expect(computeTotalOutstandingArFromInvoices(invoices)).toBe(1700);
  });

  it("computeHighestArAgingDays returns the oldest OPEN invoice's age in days, ignoring paid invoices", () => {
    const invoices: InvoiceAgingRow[] = [
      { job_id: "job-1", invoice_date: "2026-06-20T00:00:00Z", balance_due: 100, total_price: 0 }, // 11 days old
      { job_id: "job-2", invoice_date: "2026-05-01T00:00:00Z", balance_due: 0, total_price: 0 }, // paid — ignored despite being older
      { job_id: "job-3", invoice_date: "2026-06-01T00:00:00Z", balance_due: 300, total_price: 0 }, // 30 days old — oldest open
    ];

    expect(computeHighestArAgingDays(invoices, NOW)).toBe(30);
  });

  it("computeHighestArAgingDays returns 0 when there are no open invoices with a usable date", () => {
    expect(computeHighestArAgingDays([], NOW)).toBe(0);
    expect(computeHighestArAgingDays([{ job_id: "job-1", invoice_date: null, balance_due: 500, total_price: 0 }], NOW)).toBe(0);
  });

  it("totalMoniesCollectedThisWeek sums invoice-ledger collected dollars across every non-lead/prospect row entering its stage in-window (AR-truth fix)", () => {
    const pipeline = [
      makePipelineRow({
        id: 1,
        acculynx_job_id: "job-1",
        current_milestone: "approved",
        contract_amount: 10000,
        balance_due: 0,
        milestone_date: "2026-06-28T00:00:00Z",
      }),
      makePipelineRow({
        id: 2,
        acculynx_job_id: "job-2",
        current_milestone: "closed",
        contract_amount: 5000,
        balance_due: 0,
        milestone_date: "2026-06-29T00:00:00Z",
      }),
      makePipelineRow({
        id: 3,
        acculynx_job_id: "job-3",
        current_milestone: "approved",
        contract_amount: 2000,
        balance_due: 0,
        approved_date: null, // must clear the fixture default too — entryDate falls back to milestone_date only when approved_date is absent
        milestone_date: "2026-05-01T00:00:00Z", // outside window
      }),
    ];
    const invoices: InvoiceAgingRow[] = [
      makeInvoice({ job_id: "job-1", total_price: 10000, balance_due: 3000 }), // $7,000 collected
      makeInvoice({ job_id: "job-2", total_price: 5000, balance_due: 0 }), // $5,000 collected
      makeInvoice({ job_id: "job-3", total_price: 2000, balance_due: 0 }), // outside window — excluded
    ];

    const pills = computeTrailing7dPillsV2(pipeline, [], invoices, NOW);

    expect(pills.totalMoniesCollectedThisWeek).toBe(7000 + 5000);
  });

  it("scopes invoices to the jobIds present in the filtered pipeline (obeys the D-13 filter bar via rows)", () => {
    const pipeline = [makePipelineRow({ id: 1, acculynx_job_id: "job-1", contract_amount: 5000 })];
    const invoices: InvoiceAgingRow[] = [
      { job_id: "job-1", invoice_date: "2026-06-01T00:00:00Z", balance_due: 200, total_price: 0 },
      { job_id: "job-OTHER-LOCATION", invoice_date: "2026-01-01T00:00:00Z", balance_due: 99999, total_price: 0 },
    ];

    const pills = computeTrailing7dPillsV2(pipeline, [], invoices, NOW);

    expect(pills.totalOutstandingAr).toBe(200);
  });

  it("returns the documented all-zero/none shape for an empty pipeline", () => {
    const pills = computeTrailing7dPillsV2([], [], [], NOW);

    expect(pills.leadToProspect).toEqual({ count: 0, value: 0, secondaryValue: null, source: "none", coverageNote: "No jobs in this window" });
    expect(pills.totalOutstandingAr).toBe(0);
    expect(pills.highestArAgingDays).toBe(0);
    expect(pills.totalMoniesCollectedThisWeek).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Round 3, item C: the trailing-7 pills are the ONLY section NOT affected by the
  // Window selector, but they MUST still obey Location/Type/Rep filters — the loader
  // achieves this by always passing the D-13-filtered pipeline (never the whole
  // unfiltered dataset) into computeTrailing7dPillsV2. This test proves the pure
  // function's counts change when the caller narrows `rows` to a filtered subset
  // (the same mechanism the loader relies on for location/type/rep filtering).
  // ---------------------------------------------------------------------------
  it("pill counts obey whatever pre-filtered row set the caller passes in (Location/Type/Rep filter obedience)", () => {
    const wichitaJob = makePipelineRow({
      id: 1,
      acculynx_job_id: "wichita-job",
      current_milestone: "prospect",
      primary_estimate_amount: 15000,
      lead_date: "2026-06-16T00:00:00Z",
      created_at: "2026-06-16T00:00:00Z",
    });
    const coloradoJob = makePipelineRow({
      id: 2,
      acculynx_job_id: "colorado-job",
      current_milestone: "prospect",
      primary_estimate_amount: 22000,
      lead_date: "2026-06-16T00:00:00Z",
      created_at: "2026-06-16T00:00:00Z",
    });
    const allRows = [wichitaJob, coloradoJob];

    const unfilteredPills = computeTrailing7dPillsV2(allRows, [], [], NOW);
    // Simulates the loader's D-13 filter bar having already narrowed the pipeline to
    // one location before this function ever sees it.
    const wichitaOnlyPills = computeTrailing7dPillsV2([wichitaJob], [], [], NOW);

    expect(unfilteredPills.leadToProspect.count).toBe(2);
    expect(unfilteredPills.leadToProspect.value).toBe(37000);
    expect(wichitaOnlyPills.leadToProspect.count).toBe(1);
    expect(wichitaOnlyPills.leadToProspect.value).toBe(15000);
  });
});

// ---------------------------------------------------------------------------
// ROUND 3, item A: unified window semantics
// ---------------------------------------------------------------------------

describe("windowRange (Round 3, item A: calendar-anchored window tokens, mtd default)", () => {
  const NOW = new Date("2026-07-15T12:00:00Z"); // Wednesday, mid-July, Q3

  it("wtd anchors to the start of the current calendar week (Sunday)", () => {
    const { start, label } = windowRange("wtd", NOW);
    expect(start.getUTCDay()).toBe(0);
    expect(label).toBe("Week-to-Date");
  });

  it("mtd anchors to the 1st of the current month and is the default token", () => {
    const { start, label } = windowRange("mtd", NOW);
    expect(start.getMonth()).toBe(NOW.getMonth());
    expect(start.getDate()).toBe(1);
    expect(label).toBe("Month-to-Date");
  });

  it("mtd boundary: the last day of the prior month is NOT in the window", () => {
    const { start, end } = windowRange("mtd", NOW);
    const lastDayOfPriorMonth = new Date(NOW.getFullYear(), NOW.getMonth(), 0);
    expect(lastDayOfPriorMonth < start).toBe(true);
    expect(end.getMonth()).toBe(NOW.getMonth());
  });

  it("qtd anchors to the start of the current calendar quarter (Current Quarter)", () => {
    const { start, label } = windowRange("qtd", NOW);
    expect(start.getMonth()).toBe(6); // July is in Q3 (Jul-Sep), quarter starts in month index 6
    expect(label).toBe("Current Quarter");
  });

  it("ytd anchors to January 1st", () => {
    const { start, label } = windowRange("ytd", NOW);
    expect(start.getMonth()).toBe(0);
    expect(start.getDate()).toBe(1);
    expect(label).toBe("Year-to-Date");
  });

  it("falls back to mtd (the documented default) for an unrecognized token", () => {
    const fallback = windowRange("mtd", NOW);
    const unknown = windowRange("bogus" as unknown as Parameters<typeof windowRange>[0], NOW);
    expect(unknown).toEqual(fallback);
  });
});

describe("stageDateFor (Round 3, item A: per-stage date mapping documented in code)", () => {
  it("leads/prospects use lead_date, falling back to created_at", () => {
    const row = makePipelineRow({ lead_date: "2026-06-01T00:00:00Z", created_at: "2026-05-01T00:00:00Z" });
    expect(stageDateFor(row, "leads")?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(stageDateFor(row, "prospects")?.toISOString()).toBe("2026-06-01T00:00:00.000Z");

    const noLeadDate = makePipelineRow({ lead_date: null, created_at: "2026-05-01T00:00:00Z" });
    expect(stageDateFor(noLeadDate, "leads")?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("approved uses approved_date, falling back to milestone_date, falling back to updated_at", () => {
    const row = makePipelineRow({ approved_date: "2026-06-10T00:00:00Z" });
    expect(stageDateFor(row, "approved")?.toISOString()).toBe("2026-06-10T00:00:00.000Z");

    const noApprovedDate = makePipelineRow({ approved_date: null, milestone_date: "2026-06-12T00:00:00Z" });
    expect(stageDateFor(noApprovedDate, "approved")?.toISOString()).toBe("2026-06-12T00:00:00.000Z");

    const onlyUpdatedAt = makePipelineRow({ approved_date: null, milestone_date: null, updated_at: "2026-06-14T00:00:00Z" });
    expect(stageDateFor(onlyUpdatedAt, "approved")?.toISOString()).toBe("2026-06-14T00:00:00.000Z");
  });

  it("invoiced and closed use milestone_date, falling back to updated_at", () => {
    const row = makePipelineRow({ milestone_date: "2026-06-20T00:00:00Z" });
    expect(stageDateFor(row, "invoiced")?.toISOString()).toBe("2026-06-20T00:00:00.000Z");
    expect(stageDateFor(row, "closed")?.toISOString()).toBe("2026-06-20T00:00:00.000Z");

    const noMilestoneDate = makePipelineRow({ milestone_date: null, updated_at: "2026-06-22T00:00:00Z" });
    expect(stageDateFor(noMilestoneDate, "invoiced")?.toISOString()).toBe("2026-06-22T00:00:00.000Z");
  });
});

describe("isRowInWindow / filterRowsInWindow (Round 3, item A: the AR exception)", () => {
  const start = new Date("2026-06-01T00:00:00Z");
  const end = new Date("2026-06-30T00:00:00Z");

  it("a lead OUTSIDE the window (no exception) is dropped", () => {
    const row = makePipelineRow({ current_milestone: "unassigned_lead", lead_date: "2026-05-01T00:00:00Z", created_at: "2026-05-01T00:00:00Z" });
    expect(isRowInWindow(row, start, end)).toBe(false);
  });

  it("a lead INSIDE the window is retained", () => {
    const row = makePipelineRow({ current_milestone: "lead", lead_date: "2026-06-15T00:00:00Z", created_at: "2026-06-15T00:00:00Z" });
    expect(isRowInWindow(row, start, end)).toBe(true);
  });

  it("an APPROVED job with an open invoice stays visible OUTSIDE the window (AR-truth fix 2: the exception covers any queue)", () => {
    const row = makePipelineRow({
      acculynx_job_id: "job-1",
      current_milestone: "approved",
      approved_date: "2026-05-01T00:00:00Z",
      milestone_date: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
    });
    expect(isRowInWindow(row, start, end, arMap({ "job-1": 5000 }))).toBe(true);
  });

  it("an approved job OUTSIDE the window with no open invoice is dropped — crm balance_due grants NO exception (retired AR signal)", () => {
    const row = makePipelineRow({
      acculynx_job_id: "job-1",
      current_milestone: "approved",
      approved_date: "2026-05-01T00:00:00Z",
      milestone_date: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
      balance_due: 5000, // crm balance is ignored — no invoice map entry, no exception
    });
    expect(isRowInWindow(row, start, end, arMap({}))).toBe(false);
  });

  it("closed WITH an open invoice stays visible even when its stage date is OUTSIDE the window", () => {
    const row = makePipelineRow({
      acculynx_job_id: "job-1",
      current_milestone: "closed",
      milestone_date: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });
    expect(isRowInWindow(row, start, end, arMap({ "job-1": 1500 }))).toBe(true);
  });

  it("closed with NO open invoice and stage date OUTSIDE the window is dropped (the exact user rule)", () => {
    const row = makePipelineRow({
      current_milestone: "closed",
      milestone_date: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      balance_due: 0,
    });
    expect(isRowInWindow(row, start, end, arMap({}))).toBe(false);
  });

  it("closed with stage date INSIDE the window is retained regardless of AR", () => {
    const row = makePipelineRow({
      current_milestone: "closed",
      milestone_date: "2026-06-10T00:00:00Z",
      updated_at: "2026-06-10T00:00:00Z",
      balance_due: 0,
    });
    expect(isRowInWindow(row, start, end)).toBe(true);
  });

  it("invoiced WITH an open invoice stays visible even when OUTSIDE the window", () => {
    const row = makePipelineRow({
      acculynx_job_id: "job-1",
      current_milestone: "invoiced",
      milestone_date: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    });
    expect(isRowInWindow(row, start, end, arMap({ "job-1": 800 }))).toBe(true);
  });

  it("a row with an unrecognized milestone (queueForRow -> null) is excluded, not fabricated into a bucket", () => {
    const row = makePipelineRow({ current_milestone: "some_unknown_value" });
    expect(isRowInWindow(row, start, end)).toBe(false);
  });

  it("filterRowsInWindow applies isRowInWindow (with the invoice-AR exception) across a row set", () => {
    const rows = [
      makePipelineRow({ id: 1, acculynx_job_id: "job-1", current_milestone: "closed", milestone_date: "2026-01-01T00:00:00Z", balance_due: 0 }),
      makePipelineRow({ id: 2, acculynx_job_id: "job-2", current_milestone: "closed", milestone_date: "2026-01-01T00:00:00Z" }),
      makePipelineRow({ id: 3, acculynx_job_id: "job-3", current_milestone: "lead", lead_date: "2026-06-15T00:00:00Z", created_at: "2026-06-15T00:00:00Z" }),
    ];
    const filtered = filterRowsInWindow(rows, start, end, arMap({ "job-2": 200 }));
    expect(filtered.map((r) => r.id)).toEqual([2, 3]);
  });
});

describe("invoice-ledger AR helpers (AR-truth fix, 2026-07-03)", () => {
  it("openInvoiceArByJobId sums per-job open balances, flooring each invoice at 0 (credits never net down)", () => {
    const map = openInvoiceArByJobId([
      makeInvoice({ job_id: "job-1", balance_due: 500 }),
      makeInvoice({ job_id: "job-1", balance_due: 700 }),
      makeInvoice({ job_id: "job-1", balance_due: -300 }), // credit — ignored
      makeInvoice({ job_id: "job-2", balance_due: 0 }), // paid — no entry
    ]);
    expect(map.get("job-1")).toBe(1200);
    expect(map.has("job-2")).toBe(false);
  });

  it("collectedByJobId sums per-invoice (total_price - balance_due), floored at 0 per invoice", () => {
    const map = collectedByJobId([
      makeInvoice({ job_id: "job-1", total_price: 10000, balance_due: 4000 }), // 6000 collected
      makeInvoice({ job_id: "job-1", total_price: 2000, balance_due: 0 }), // 2000 collected
      makeInvoice({ job_id: "job-2", total_price: 0, balance_due: 0 }), // void — no entry
    ]);
    expect(map.get("job-1")).toBe(8000);
    expect(map.has("job-2")).toBe(false);
  });

  it("arForRow returns 0 for a row with no job id or no map entry", () => {
    const map = arMap({ "job-1": 900 });
    expect(arForRow(makePipelineRow({ acculynx_job_id: "job-1" }), map)).toBe(900);
    expect(arForRow(makePipelineRow({ acculynx_job_id: "job-9" }), map)).toBe(0);
    expect(arForRow(makePipelineRow({ acculynx_job_id: null }), map)).toBe(0);
  });
});

describe("looksLikeRepName / repBucketFor (Round 3, item B: unassigned + name rules)", () => {
  it("accepts a real 'First Last' name", () => {
    expect(looksLikeRepName("Jamie Rep")).toBe(true);
    expect(looksLikeRepName("Mary Jo Smith")).toBe(true);
  });

  it("rejects a single-token value (no word pair)", () => {
    expect(looksLikeRepName("Unassigned")).toBe(false);
  });

  it("rejects a GUID-shaped value", () => {
    expect(looksLikeRepName("3f9a1c2e-44b1-4a2d-9c3e-8b7a6f5d4c3b")).toBe(false);
  });

  it("rejects a numeric-sequence value", () => {
    expect(looksLikeRepName("00047213")).toBe(false);
    expect(looksLikeRepName("Rep 48213219")).toBe(false);
  });

  it("rejects an empty/whitespace value", () => {
    expect(looksLikeRepName("")).toBe(false);
    expect(looksLikeRepName("   ")).toBe(false);
  });

  it("repBucketFor: unassigned lead with NO value returns null (filtered out of view entirely)", () => {
    const row = makePipelineRow({ primary_salesperson: null, contract_amount: 0, primary_estimate_amount: 0 });
    expect(repBucketFor(row, "colorado")).toBeNull();
  });

  it("repBucketFor: unassigned WITH value buckets under the account_key (brackets-style rep bucket)", () => {
    const row = makePipelineRow({ primary_salesperson: "", contract_amount: 25000 });
    expect(repBucketFor(row, "texas")).toBe("texas");
  });

  it("repBucketFor: a GUID/numeric rep value becomes [rep-unknown]", () => {
    const row = makePipelineRow({ primary_salesperson: "3f9a1c2e-44b1-4a2d-9c3e-8b7a6f5d4c3b" });
    expect(repBucketFor(row, "wichita")).toBe(REP_UNKNOWN_LABEL);
  });

  it("repBucketFor: a real rep name passes through as-is", () => {
    const row = makePipelineRow({ primary_salesperson: "Jamie Rep" });
    expect(repBucketFor(row, "wichita")).toBe("Jamie Rep");
  });
});
