import { describe, it, expect } from "vitest";
import { gapExposure } from "./price-agreement-coverage";

/** Shorthand for the four fields gapExposure reads. */
const v = (hasGap: boolean, invoiceCount: number, spend: number, isAccepted = false) =>
  ({ hasGap, invoiceCount, spend, isAccepted });

describe("gapExposure", () => {
  it("counts only the gaps that carry spend", () => {
    // Territory-only gaps (branches in the ring, nothing ever purchased) must not inflate
    // the number a human is asked to act on.
    const out = gapExposure([v(true, 4, 17437.63), v(true, 0, 0), v(true, 0, 0)]);
    expect(out.gapsWithSpend).toBe(1);
    expect(out.gapsToChase).toBe(1);
    expect(out.chaseSpend).toBeCloseTo(17437.63, 2);
  });

  it("ignores covered vendors entirely, however much they spend", () => {
    const out = gapExposure([v(false, 543, 1135068.53), v(true, 5, 5226.9)]);
    expect(out.gapsWithSpend).toBe(1);
    expect(out.chaseSpend).toBeCloseTo(5226.9, 2);
  });

  it("excludes accepted no_book rulings from the chase queue but keeps them in gapSpend", () => {
    // Chris ruled QXO no_book at every office on 2026-08-20: those lines price as no-price
    // BY DESIGN. Counting them as work would cry wolf every week.
    const out = gapExposure([
      v(true, 2, 5697.47, true),   // Wichita x QXO   — accepted
      v(true, 1, -3723.59, true),  // Richardson x QXO — accepted (net credit)
      v(true, 5, 5226.9, false),   // Atlanta x ABC    — pending, real work
    ]);
    expect(out.gapsWithSpend).toBe(3);
    expect(out.gapsToChase).toBe(1);
    expect(out.chaseSpend).toBeCloseTo(5226.9, 2);
    expect(out.gapSpend).toBeCloseTo(7200.78, 2);
  });

  it("nets credits rather than counting them as exposure", () => {
    const out = gapExposure([v(true, 1, -3723.59), v(true, 2, 5697.47)]);
    expect(out.gapsToChase).toBe(2);
    expect(out.chaseSpend).toBeCloseTo(1973.88, 2);
  });

  it("reproduces the 2026-08-21 prod queue once rulings are honoured", () => {
    const out = gapExposure([
      v(true, 4, 17437.63, false),  // Denver x SRS    — unrecorded, real work
      v(true, 2, 5697.47, true),    // Wichita x QXO   — no_book
      v(true, 5, 5226.9, false),    // Atlanta x ABC   — pending, real work
      v(true, 1, -3723.59, true),   // Richardson x QXO — no_book
      v(true, 0, 0), v(true, 0, 0), v(true, 0, 0), v(true, 0, 0), v(true, 0, 0),
    ]);
    expect(out.gapsWithSpend).toBe(4);
    expect(out.gapsToChase).toBe(2);                    // only Denver x SRS and Atlanta x ABC
    expect(out.chaseSpend).toBeCloseTo(22664.53, 2);    // 17437.63 + 5226.90
  });

  it("is zero when nothing has a gap", () => {
    expect(gapExposure([v(false, 10, 999)])).toEqual({
      gapsWithSpend: 0, gapsToChase: 0, gapSpend: 0, chaseSpend: 0,
    });
    expect(gapExposure([])).toEqual({
      gapsWithSpend: 0, gapsToChase: 0, gapSpend: 0, chaseSpend: 0,
    });
  });
});
