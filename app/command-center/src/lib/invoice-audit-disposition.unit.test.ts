import { describe, expect, it } from "vitest";
import {
  computeGrossOvercharge,
  disposeInvoice,
  GROSS_OVERCHARGE_FLOOR,
  type DispositionLine,
} from "./invoice-audit-disposition";

// Helper: a line with sensible defaults; override per case.
function line(p: Partial<DispositionLine> = {}): DispositionLine {
  return {
    lineId: p.lineId ?? crypto.randomUUID(),
    categoryKey: p.categoryKey ?? "shingles",
    benchmarkSource: p.benchmarkSource ?? "api",
    variancePct: p.variancePct ?? null,
    varianceExt: p.varianceExt ?? null,
    auditable: p.auditable ?? true,
  };
}

describe("invoice-audit disposition — negotiated human gate (2026-06-30 policy)", () => {
  it("gates a negotiated line with ANY positive variance, regardless of % or $", () => {
    // Screenshot case 06MHSAB: negotiated price present, +19.9% variance, 'Major' tolerance.
    const out = disposeInvoice([
      line({ lineId: "06MHSAB", benchmarkSource: "negotiated", variancePct: 19.9, varianceExt: 4.2 }),
    ]);
    const d = out.lines[0];
    expect(d.disposition).toBe("gate-negotiated");
    expect(d.humanGate).toBe(true);
    expect(out.hasNegotiatedGate).toBe(true);
    expect(out.gatedLineCount).toBe(1);
  });

  it("gates a negotiated line even when the overcharge is tiny (sub-$25, sub-6%)", () => {
    // Under the OLD rule this small negotiated overcharge would auto-approve (accept-neg/accept-30d).
    // Under the new policy it must gate — the distinction the policy exists to enforce.
    const out = disposeInvoice([
      line({ benchmarkSource: "negotiated", variancePct: 1.2, varianceExt: 0.8 }),
    ]);
    expect(out.lines[0].disposition).toBe("gate-negotiated");
    expect(out.lines[0].humanGate).toBe(true);
    // The tiny negotiated overcharge is excluded from the gross floor.
    expect(out.grossOvercharge).toBe(0);
    expect(out.isActionInvoice).toBe(false);
  });

  it("does NOT gate a negotiated line with zero or negative variance (no overcharge)", () => {
    const exact = disposeInvoice([line({ benchmarkSource: "negotiated", variancePct: 0, varianceExt: 0 })]);
    expect(exact.lines[0].disposition).toBe("accept-neg");
    expect(exact.lines[0].humanGate).toBe(false);

    const under = disposeInvoice([line({ benchmarkSource: "negotiated", variancePct: -5, varianceExt: -3 })]);
    expect(under.lines[0].disposition).toBe("accept-neg");
    expect(under.lines[0].humanGate).toBe(false);
  });

  it("negotiated-gated lines are excluded from the per-invoice gross-overcharge floor", () => {
    // A big negotiated overcharge must NOT drag a non-negotiated line into ACTION territory.
    const out = disposeInvoice([
      line({ lineId: "neg", benchmarkSource: "negotiated", variancePct: 40, varianceExt: 500 }),
      line({ lineId: "api", benchmarkSource: "api", variancePct: 7, varianceExt: 10 }),
    ]);
    // gross = only the api line's $10 → below $25 floor → api line is NOT credit-flagged.
    expect(out.grossOvercharge).toBe(10);
    expect(out.isActionInvoice).toBe(false);
    expect(out.lines.find((l) => l.lineId === "neg")!.disposition).toBe("gate-negotiated");
    expect(out.lines.find((l) => l.lineId === "api")!.disposition).toBe("accept-30d"); // 3–6%? no — 7% but sub-$25 invoice
  });
});

describe("invoice-audit disposition — non-negotiated lines keep the per-invoice gross floor", () => {
  it('"No Price" line (no benchmark) → accept-nochallenge → Jordan coverage', () => {
    // Screenshot case 30MHTS1BZ: 'No Price', 0.0% vs API. No benchmark resolved → coverage gap.
    const out = disposeInvoice([
      line({ lineId: "30MHTS1BZ", benchmarkSource: "none", variancePct: null, varianceExt: null }),
    ]);
    expect(out.lines[0].disposition).toBe("accept-nochallenge");
    expect(out.lines[0].humanGate).toBe(false);
  });

  it("service fee auto-approves regardless of variance (amendment 7A)", () => {
    const out = disposeInvoice([
      line({ categoryKey: "service_fees", benchmarkSource: "api", variancePct: 650, varianceExt: 650 }),
    ]);
    expect(out.lines[0].disposition).toBe("accept-svc");
    // service fee excluded from gross floor
    expect(out.grossOvercharge).toBe(0);
  });

  it("≥6% on a ≥$25 API-benchmarked invoice → credit-flag (hold + Casey)", () => {
    const out = disposeInvoice([
      line({ benchmarkSource: "api", variancePct: 8, varianceExt: 30 }),
    ]);
    expect(out.grossOvercharge).toBe(30);
    expect(out.isActionInvoice).toBe(true);
    expect(out.lines[0].disposition).toBe("credit-flag");
  });

  it("3–6% → accept-30d weekly digest", () => {
    const out = disposeInvoice([line({ benchmarkSource: "api", variancePct: 4, varianceExt: 30 })]);
    expect(out.lines[0].disposition).toBe("accept-30d");
  });

  it("≥6% but invoice gross < $25 → absorbed (accept-30d/neg), not flagged", () => {
    const out = disposeInvoice([line({ benchmarkSource: "api", variancePct: 9, varianceExt: 5 })]);
    expect(out.isActionInvoice).toBe(false);
    // 9% ≥ 3% weekly tier, but no hold since invoice is sub-$25.
    expect(out.lines[0].disposition).toBe("accept-30d");
  });

  it("within tolerance (<3%) → accept-neg", () => {
    const out = disposeInvoice([line({ benchmarkSource: "recent", variancePct: 1, varianceExt: 2 })]);
    expect(out.lines[0].disposition).toBe("accept-neg");
  });
});

describe("computeGrossOvercharge", () => {
  it("sums only positive non-svc, non-negotiated-gate variance_ext; undercharges not netted", () => {
    const gross = computeGrossOvercharge([
      line({ benchmarkSource: "api", variancePct: 7, varianceExt: 20 }),
      line({ benchmarkSource: "api", variancePct: -5, varianceExt: -50 }), // undercharge, ignored
      line({ categoryKey: "service_fees", benchmarkSource: "api", variancePct: 100, varianceExt: 99 }), // svc, ignored
      line({ benchmarkSource: "negotiated", variancePct: 30, varianceExt: 999 }), // gated, ignored
      line({ benchmarkSource: "recent", variancePct: 4, varianceExt: 10 }),
    ]);
    expect(gross).toBe(30); // 20 + 10
  });

  it("at exactly the $25 floor the invoice IS an action invoice", () => {
    const out = disposeInvoice([line({ benchmarkSource: "api", variancePct: 6, varianceExt: GROSS_OVERCHARGE_FLOOR })]);
    expect(out.isActionInvoice).toBe(true);
    expect(out.lines[0].disposition).toBe("credit-flag");
  });
});
