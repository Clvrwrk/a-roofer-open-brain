#!/usr/bin/env node
// build-order-schedule-drafts.mjs — docs/33 Phase 6 (§4.11 material order draft,
// §4.12 labor schedule recommendation).
//
// Both artifacts are DRAFTS gated on client selection and Ops approval:
// the order draft prices the given option's rounded lines (live ABC pull is
// still the approval gate per §4.5); the schedule recommendation derives a
// crew-day estimate from job complexity and lists observed crews as
// candidates — Scheduling must confirm with the crew (§4.12).
//
// Pure computation. Usage:
//   node scripts/build-order-schedule-drafts.mjs --input bundle.json
//
// Bundle: { run_id, address, option:{tier,template_name,lines:[...]},
//   branch:{number,name,drive_time_minutes}, measurements:{...},
//   crews:[{name, jobs_observed}], production_sq_per_day }

import { readFileSync } from 'node:fs';
const a = process.argv.slice(2); const i = a.indexOf('--input');
const b = JSON.parse(readFileSync(a[i + 1], 'utf8'));
const m = b.measurements;

// ── §4.11 material order draft ──
const orderLines = b.option.lines
  .filter((l) => l.rounded > 0 || l.needs_human)
  .map((l) => ({
    abc_item: l.item, description: l.desc,
    quantity: l.rounded, uom: l.uom,
    unit_price_mirror: l.unit_cost, line_total_mirror: l.line_cost,
    human_selection_required: !!l.needs_human,
    note: l.note || null,
  }));
const order = {
  selected_package: `${b.option.tier} — ${b.option.template_name} (PRE-SELECTION DRAFT: client has not chosen; regenerate on selection)`,
  branch: b.branch,
  ship_to_account: 'TBD — ship-to selection rules pending (docs/33 §12)',
  delivery_address: b.address,
  delivery_notes: 'Confirm ground drop vs rooftop load; verify access (see KS-91 lesson: blocked trailer access).',
  lines: orderLines,
  human_selection_flags: orderLines.filter((l) => l.human_selection_required).map((l) => l.description),
  pricing_note: 'Mirror pricing (static_fallback). Live ABC pull by branch+item required before order placement (§4.5 waterfall tier 2).',
  waste_assumption: `Roofr recommended waste already applied (waste-adjusted ${m.waste_adjusted_squares} sq).`,
};

// ── §4.12 schedule recommendation ──
const pitch = parseInt((m.predominant_pitch || '0/12').split('/')[0], 10);
const complexity = (pitch >= 8 ? 1.3 : pitch >= 6 ? 1.15 : 1) *
  ((m.stories || 1) > 1 ? 1.15 : 1) * ((m.existing_layers || 1) > 1 ? 1.15 : 1) *
  ((m.low_slope_area_sqft || 0) > 500 ? 1.2 : 1);
const crewDays = Math.max(1, Math.ceil((m.waste_adjusted_squares * complexity) / b.production_sq_per_day));
const schedule = {
  estimated_crew_days: crewDays,
  basis: `${m.waste_adjusted_squares} waste-adj sq × complexity ${complexity.toFixed(2)} (pitch ${m.predominant_pitch}, ` +
         `stories ${m.stories}, layers ${m.existing_layers}, low-slope ${m.low_slope_area_sqft} sqft) ÷ ` +
         `${b.production_sq_per_day} sq/day production assumption (PLACEHOLDER — no timing observations yet)`,
  crew_candidates: b.crews,
  dependencies: ['client option selection', 'material delivery from ' + b.branch.name,
    'permit status (jurisdiction workflow pending §2.3)', 'weather window (no integration yet)',
    'penetration/vent counts (open dashboard task)'],
  note: 'Recommendation only — Scheduling must review and confirm with the crew (§4.12). Crew availability and weather are not integrated.',
};

console.log(JSON.stringify({ order, schedule }, null, 1));
