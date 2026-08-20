import { describe, it, expect } from "vitest";
import { gapExposure } from "./price-agreement-coverage";

// Shorthand for the only three fields gapExposure reads.
const v = (hasGap: boolean, invoiceCount: number, spend: number) => ({ hasGap, invoiceCount, spend });

describe("gapExposure", () => {
  it("counts only the gaps that carry spend", () => {
    // Territory-only gaps (branches in the ring, nothing ever purchased) must not inflate
    // the number a human is asked to act on.
    const out = gapExposure([v(true, 4, 17437.63), v(true, 0, 0), v(true, 0, 0)]);
    expect(out.gapsWithSpend).toBe(1);
    expect(out.unauditedSpend).toBeCloseTo(17437.63, 2);
  });

  it("ignores covered vendors entirely, however much they spend", () => {
    const out = gapExposure([v(false, 543, 1135068.53), v(true, 5, 5226.9)]);
    expect(out.gapsWithSpend).toBe(1);
    expect(out.unauditedSpend).toBeCloseTo(5226.9, 2);
  });

  it("nets credits rather than counting them as exposure", () => {
    // Richardson x QXO is a lone credit memo: real activity, negative dollars.
    const out = gapExposure([v(true, 1, -3723.59), v(true, 2, 5697.47)]);
    expect(out.gapsWithSpend).toBe(2);
    expect(out.unauditedSpend).toBeCloseTo(1973.88, 2);
  });

  it("reproduces the 2026-08-20 prod exposure", () => {
    const out = gapExposure([
      v(true, 4, 17437.63),  // Denver x SRS
      v(true, 2, 5697.47),   // Wichita x QXO
      v(true, 5, 5226.9),    // Atlanta x ABC
      v(true, 1, -3723.59),  // Richardson x QXO (credit)
      v(true, 0, 0), v(true, 0, 0), v(true, 0, 0), v(true, 0, 0), v(true, 0, 0),
    ]);
    expect(out.gapsWithSpend).toBe(4);
    expect(out.unauditedSpend).toBeCloseTo(24638.41, 2);
  });

  it("is zero when nothing has a gap", () => {
    expect(gapExposure([v(false, 10, 999)])).toEqual({ gapsWithSpend: 0, unauditedSpend: 0 });
    expect(gapExposure([])).toEqual({ gapsWithSpend: 0, unauditedSpend: 0 });
  });
});
