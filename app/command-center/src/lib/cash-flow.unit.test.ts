import { describe, expect, it } from "vitest";
import { computeProjection, nextMonday } from "@lib/cash-flow";

const BASE_ASSUMPTIONS = {
  undated_collection_pct: 0.04,
  new_billings_weekly: 100000,
  new_billings_ramp_week: 3,
  materials_weekly: 60000,
  subs_weekly: 48000,
  commissions_weekly: 19000,
  payroll_per_run: 51500,
  fixed_overhead_monthly: 127100,
  min_cash_floor: 250000,
  one_time_outflow_week1: 26526,
};

describe("nextMonday", () => {
  it("returns the following Monday from a Wednesday", () => {
    expect(nextMonday(new Date("2026-08-26T12:00:00Z")).toISOString().slice(0, 10)).toBe("2026-08-31");
  });
  it("returns the following Monday from a Monday (never same-day)", () => {
    expect(nextMonday(new Date("2026-08-31T12:00:00Z")).toISOString().slice(0, 10)).toBe("2026-09-07");
  });
  it("returns the next day from a Sunday", () => {
    expect(nextMonday(new Date("2026-08-30T12:00:00Z")).toISOString().slice(0, 10)).toBe("2026-08-31");
  });
});

describe("computeProjection", () => {
  const asOf = new Date("2026-08-26T12:00:00Z"); // Wednesday → weeks start 08-31

  it("produces 13 weeks with consistent running cash", () => {
    const weeks = computeProjection({
      asOf,
      beginningCash: 736303,
      datedByWeek: new Map([
        ["2026-08-24", 42009], // before forecast start → folds into week 1
        ["2026-08-31", 15000],
        ["2026-09-07", 75000],
      ]),
      undatedPool: 2463986,
      assumptions: BASE_ASSUMPTIONS,
    });

    expect(weeks).toHaveLength(13);
    expect(weeks[0].weekStart).toBe("2026-08-31");
    // Week 1 dated receipts = the on-week 15,000 + folded 42,009 catch-up.
    expect(weeks[0].datedReceipts).toBe(57009);
    expect(weeks[1].datedReceipts).toBe(75000);
    // New billings respect the ramp week.
    expect(weeks[0].newBillings).toBe(0);
    expect(weeks[1].newBillings).toBe(0);
    expect(weeks[2].newBillings).toBe(100000);
    // Payroll runs biweekly starting week 1.
    expect(weeks[0].payroll).toBe(51500);
    expect(weeks[1].payroll).toBe(0);
    expect(weeks[2].payroll).toBe(51500);
    // One-time outflow only in week 1.
    expect(weeks[0].oneTime).toBe(26526);
    expect(weeks[1].oneTime).toBe(0);
    // Running cash is internally consistent.
    for (let i = 0; i < 13; i++) {
      expect(weeks[i].endingCash).toBe(weeks[i].beginningCash + weeks[i].net);
      if (i > 0) expect(weeks[i].beginningCash).toBe(weeks[i - 1].endingCash);
      expect(weeks[i].totalReceipts).toBe(weeks[i].datedReceipts + weeks[i].undatedReceipts + weeks[i].newBillings);
    }
    // Undated pool declines: each week's spread is 4% of the remaining pool.
    expect(weeks[0].undatedReceipts).toBe(Math.round(2463986 * 0.04));
    expect(weeks[1].undatedReceipts).toBe(Math.round((2463986 - weeks[0].undatedReceipts) * 0.04));
    // Under seeded assumptions the floor holds (matches the reviewed template).
    expect(weeks.some((w) => w.belowFloor)).toBe(false);
  });

  it("flags floor breaches", () => {
    const weeks = computeProjection({
      asOf,
      beginningCash: 260000,
      datedByWeek: new Map(),
      undatedPool: 0,
      assumptions: { ...BASE_ASSUMPTIONS, new_billings_weekly: 0, undated_collection_pct: 0 },
    });
    expect(weeks[0].belowFloor).toBe(true);
  });
});
