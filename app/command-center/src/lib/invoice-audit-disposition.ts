// Invoice-audit disposition engine — the deterministic rule that `morning_abc_sync`
// (docs/57 §1) follows per line, made testable and reusable here.
//
// HISTORY: this rule previously lived ONLY in two places — the docs/57 §1 spec text
// and a one-off backfill script (context/memory/2026-06-30.md, validated 108/108 vs
// Alex's prior run). It had no durable, tested home in the codebase. This module is
// that home: a pure function over the benchmark cascade so the rule can be unit-tested
// and so any future surface (a real headless decision pass, a re-backfill, the UI's
// suggested-disposition hint) shares ONE source of truth.
//
// AUTHORITATIVE MODEL = docs/57 §1 (the per-INVOICE gross-overcharge floor), plus
// amendment 7A (service fees), plus the 2026-06-30 NEGOTIATED-LINE HUMAN GATE:
//
//   Per line, take the benchmark the cascade chose (v_invoice_audit_line_cascade):
//     benchmark_source ∈ {negotiated, api, recent, org_inv, none}
//
//   1. category 'service_fees'           → accept-svc      (auto-approve, weekly review; never held)
//   2. benchmark_source 'none'           → accept-nochallenge (no benchmark → Jordan coverage gap)
//   3. NEGOTIATED + variance_pct > 0     → gate-negotiated  ← MANDATORY HUMAN GATE (new policy)
//        A line priced against a matched branch agreement that still shows ANY overcharge is
//        NEVER auto-dispositioned. It is left PENDING (no passed/disputed audit row), which
//        keeps the invoice out of the to-be-paid / register-export set until a human rules on
//        it. Negotiated lines do NOT participate in the per-invoice gross-overcharge floor —
//        the gate pre-empts the percentage/$ thresholds entirely.
//   4. everything else (non-negotiated benchmark: api / recent / org_inv) follows the
//      per-INVOICE gross-overcharge floor below.
//
//   Per-invoice gross overcharge = Σ variance_ext over AUTO-EVALUATED auditable lines where
//   variance_pct > 0 (service-fee and negotiated-gated lines excluded; undercharges not netted):
//     gross  < $25  → approve the whole invoice; 3–6% lines → accept-30d (weekly digest),
//                     else accept-neg. No hold, no Slack (tiny-dollar absorbed deliberately).
//     gross ≥ $25  → ACTION invoice; within it: lines ≥6% → credit-flag (Track C hold +
//                     Casey credit-memo candidate); 3–6% → accept-30d; else accept-neg.
//
// This module decides; it does NOT write. The caller records each non-gated decision via the
// mark endpoint. Gated lines are intentionally NOT written — leaving them pending IS the gate.

export type BenchmarkSource = "negotiated" | "api" | "recent" | "org_inv" | "none" | "";

export type Disposition =
  | "accept-svc"        // service fee — auto-approved, weekly review
  | "accept-nochallenge" // no benchmark — coverage gap → Jordan
  | "gate-negotiated"   // matched agreement + overcharge → MANDATORY human gate (leave pending)
  | "credit-flag"       // ≥6% on a ≥$25 invoice → hold + Casey credit memo
  | "accept-30d"        // 3–6% → weekly digest
  | "accept-neg";       // within tolerance / sub-$25 absorbed

export const SERVICE_FEES_CATEGORY = "service_fees";

// Per-invoice ACTION threshold and per-line tier bounds (docs/57 §1, LOCKED 2026-06-28).
export const GROSS_OVERCHARGE_FLOOR = 25; // $ — below this the whole invoice is approved
export const FLAG_VARIANCE_PCT = 6;       // ≥ this on a ≥$25 invoice → credit-flag
export const WEEKLY_TIER_PCT = 3;         // [3,6) → accept-30d weekly digest

export interface DispositionLine {
  lineId: string;
  categoryKey: string;
  benchmarkSource: BenchmarkSource;
  variancePct: number | null; // cascaded variance % (positive = overcharge)
  varianceExt: number | null; // cascaded variance $ (positive = overcharge)
  auditable: boolean;
}

export interface LineDisposition {
  lineId: string;
  disposition: Disposition;
  // true when the line must be left PENDING for a human (no auto audit-row written).
  // Today only `gate-negotiated` sets this; everything else is an auto decision.
  humanGate: boolean;
  note: string;
}

export interface InvoiceDisposition {
  grossOvercharge: number;       // Σ positive variance_ext over auto-evaluated lines (excludes svc + gated)
  isActionInvoice: boolean;      // grossOvercharge ≥ $25
  hasNegotiatedGate: boolean;    // ≥1 line forced to the human gate
  gatedLineCount: number;
  lines: LineDisposition[];
}

const positive = (v: number | null): number => (v != null && v > 0 ? v : 0);

// Does this line get pulled OUT of the auto-evaluation (gross floor + auto disposition)?
// Service fees auto-approve regardless of variance; negotiated overcharges go to the human gate.
function isNegotiatedGate(line: DispositionLine): boolean {
  return line.benchmarkSource === "negotiated" && (line.variancePct ?? 0) > 0;
}

/**
 * Compute the per-invoice gross overcharge exactly as docs/57 §1 defines it:
 * Σ variance_ext over AUDITABLE lines with variance_pct > 0, EXCLUDING service-fee lines
 * and negotiated-gated lines (those never enter the auto floor). Undercharges are not netted.
 */
export function computeGrossOvercharge(lines: DispositionLine[]): number {
  let gross = 0;
  for (const l of lines) {
    if (!l.auditable) continue;
    if (l.categoryKey === SERVICE_FEES_CATEGORY) continue;
    if (isNegotiatedGate(l)) continue;
    if ((l.variancePct ?? 0) > 0) gross += positive(l.varianceExt);
  }
  return Math.round(gross * 100) / 100;
}

/**
 * Disposition every line of one invoice. Pure: no I/O, no writes.
 * The negotiated human-gate override pre-empts the percentage/$ thresholds for matched-agreement
 * overcharges; all other lines follow the per-invoice gross-overcharge floor.
 */
export function disposeInvoice(lines: DispositionLine[]): InvoiceDisposition {
  const grossOvercharge = computeGrossOvercharge(lines);
  const isActionInvoice = grossOvercharge >= GROSS_OVERCHARGE_FLOOR;

  const out: LineDisposition[] = lines.map((l) => {
    // 1. Service fees auto-approve regardless of variance (amendment 7A).
    if (l.categoryKey === SERVICE_FEES_CATEGORY) {
      return { lineId: l.lineId, disposition: "accept-svc", humanGate: false, note: "Service fee — auto-approved; weekly review" };
    }
    // 2. No benchmark at all → coverage gap (Jordan). Includes non-auditable / null-variance lines.
    if (l.benchmarkSource === "none" || l.benchmarkSource === "" || l.variancePct == null) {
      return { lineId: l.lineId, disposition: "accept-nochallenge", humanGate: false, note: "No benchmark — coverage gap → Jordan" };
    }
    // 3. NEGOTIATED + overcharge → MANDATORY human gate. Leave pending; do NOT auto-dispose.
    if (isNegotiatedGate(l)) {
      const pct = (l.variancePct ?? 0).toFixed(1);
      return {
        lineId: l.lineId,
        disposition: "gate-negotiated",
        humanGate: true,
        note: `Negotiated line +${pct}% over agreement — human review required (no auto-disposition)`,
      };
    }
    // 4. Non-negotiated benchmark (api / recent / org_inv) → per-invoice gross-overcharge floor.
    const pct = l.variancePct ?? 0;
    if (isActionInvoice && pct >= FLAG_VARIANCE_PCT) {
      return { lineId: l.lineId, disposition: "credit-flag", humanGate: false, note: `≥6% on a ≥$25 invoice — hold + credit memo (Casey)` };
    }
    if (pct >= WEEKLY_TIER_PCT) {
      return { lineId: l.lineId, disposition: "accept-30d", humanGate: false, note: "3–6% — weekly digest" };
    }
    return { lineId: l.lineId, disposition: "accept-neg", humanGate: false, note: "Within tolerance / sub-$25 absorbed" };
  });

  const gated = out.filter((d) => d.humanGate);
  return {
    grossOvercharge,
    isActionInvoice,
    hasNegotiatedGate: gated.length > 0,
    gatedLineCount: gated.length,
    lines: out,
  };
}
