import { describe, it, expect } from "vitest";
import { gapExposure, coverageLabelKind } from "./price-agreement-coverage";

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
    // QXO carries a recorded no_book ruling at every office (2026-08-20): those lines price as no-price
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

describe("unreachable vs absent agreements", () => {
  // The two rows in the live chase queue need OPPOSITE actions, and the surface used to
  // call both of them "No agreement":
  //   Denver x SRS   live_agreements = 2, agreement_not_reaching = true  -> repair the link
  //   Atlanta x ABC  live_agreements = 0, agreement_not_reaching = false -> chase paperwork
  // Both still count as work; the distinction is what the operator should DO.
  const pair = (notReaching: boolean, live: number) => ({
    hasGap: true, invoiceCount: 4, spend: 17437.63, isAccepted: false,
    agreementNotReaching: notReaching, liveAgreements: live,
  });

  it("counts an unreachable-agreement pair as work to chase, like any other gap", () => {
    const out = gapExposure([pair(true, 2), { ...pair(false, 0), spend: 5226.9, invoiceCount: 5 }]);
    expect(out.gapsToChase).toBe(2);
    expect(out.chaseSpend).toBeCloseTo(17437.63 + 5226.9, 2);
  });

  it("keeps the reachability flag distinct from the ruling flag", () => {
    const unreachable = pair(true, 2);
    // An unreachable agreement is NOT an accepted ruling — it must not be muted away.
    expect(unreachable.isAccepted).toBe(false);
    expect(unreachable.agreementNotReaching).toBe(true);
    expect(unreachable.liveAgreements).toBeGreaterThan(0);
  });
});

describe("coverageLabelKind", () => {
  // The pill tells an operator WHAT TO DO. Getting the order wrong has twice sent someone
  // to chase paperwork that was already signed, so the order is pinned here on purpose.
  const pair = (over: Partial<Parameters<typeof coverageLabelKind>[0]> = {}) => ({
    hasGap: true, invoiceCount: 4, isAccepted: false, agreementNotReaching: false, ...over,
  });

  it("returns null when the pair has no gap", () => {
    expect(coverageLabelKind(pair({ hasGap: false }))).toBeNull();
  });

  it("REGRESSION: an unreachable agreement with no invoices is not labelled 'no spend yet'", () => {
    // The bug: `invoiceCount === 0` was tested first, so a signed-but-unreachable book that
    // had not been invoiced yet rendered as "No agreement — no spend yet" and pointed the
    // operator at paperwork that already exists. A book signed before the first order puts
    // a real pair in exactly this state.
    expect(coverageLabelKind(pair({ invoiceCount: 0, agreementNotReaching: true })))
      .toBe("unreachable");
  });

  it("lets a recorded human ruling outrank the derived reachability signal", () => {
    expect(coverageLabelKind(pair({ isAccepted: true, agreementNotReaching: true })))
      .toBe("accepted");
  });

  it("still reports an unreachable agreement that does carry spend", () => {
    expect(coverageLabelKind(pair({ agreementNotReaching: true }))).toBe("unreachable");
  });

  it("keeps the two plain cases distinct", () => {
    expect(coverageLabelKind(pair({ invoiceCount: 0 }))).toBe("no-spend");
    expect(coverageLabelKind(pair({ invoiceCount: 5 }))).toBe("no-agreement");
  });
});
