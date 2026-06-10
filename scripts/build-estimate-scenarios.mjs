#!/usr/bin/env node
// build-estimate-scenarios.mjs — docs/33 Phase 3 (§4.5–4.7 Pricing Engine)
//
// Turns extracted measurements + package templates + ABC pricing into
// Good/Better/Best scenario options with the full §4.6 quantity trail,
// §4.7 cost components, and margin checks against the §7 thresholds.
//
// Pure computation: inputs are JSON exports from the brain (no DB creds).
//   node scripts/build-estimate-scenarios.mjs --inputs /tmp/engine_inputs.json \
//     [--config config/roofer.config.yaml] > scenarios.json
//
// Pricing discipline (§4.5): this engine uses MIRRORED pricing (price
// agreements / price list / order history) and stamps every line
// price_source='static_fallback'. Final proposal approval still requires a
// live ABC pull or an explicit human exception — the pricing verification
// row records that.

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const inputs = JSON.parse(readFileSync(opt('inputs'), 'utf8'));

// ---------------------------------------------------------------------------
// Estimating assumptions. Defaults here are PLACEHOLDERS pending Ops
// confirmation (docs/33 §12 open questions: labor rates, commission formula).
// Override via config/roofer.config.yaml `estimating:` once confirmed.
// Every cost component carries source 'placeholder_config' until then.
// ---------------------------------------------------------------------------
const CFG = {
  target_gm_retail: 0.40,          // §4.7
  floor_gm: 0.28,                  // §4.7 CEO escalation floor
  labor_per_square: 165,           // tear-off + install, 1 story 1 layer — PLACEHOLDER
  labor_low_slope_per_square: 210, // SA low-slope system — PLACEHOLDER
  disposal_base: 450,              // dump trailer + fees — PLACEHOLDER
  disposal_per_square_over_30: 9,  // PLACEHOLDER
  delivery_fee: 75,                // ABC delivery — PLACEHOLDER
  permit_allowance: 250,           // jurisdiction-dependent (§2.3) — PLACEHOLDER
  commission_pct_of_price: 0.08,   // PLACEHOLDER pending §12 formula
  payment_fees_pct_of_price: 0.02, // PLACEHOLDER
  supplement_admin: 150,           // PLACEHOLDER
  contingency_pct_of_materials: 0.03, // PLACEHOLDER
  decking_allowance_sheets: 2,     // included sheets; more = change order (§4.8)
  nails_coil_squares_per_box: 16,
  nails_cap_squares_per_box: 30,
  starter_includes_rakes: false,   // eaves only by default
  ice_water_lf_per_roll: 67,       // 2-sq roll @36in
};

// Bundle factors: items priced per SQ but purchased per BD
const SQ_TO_BD = 3; // 3 bundles per square for all captured shingle lines

const F = {}; // per-run field maps
for (const r of inputs.runs) F[r.run_id] = r.fields;
const num = (v) => (v === null || v === undefined ? null : parseFloat(v));

// ---------------------------------------------------------------------------
// Quantity rules: qty_basis -> { raw measured basis, required qty in purchase
// uom (pre-rounding), notes, needs_human }
// ---------------------------------------------------------------------------
function quantity(rule, f) {
  const g = (n) => num(f[n]) ?? 0;
  const wsq = g('waste_adjusted_squares');
  const lowSq = g('low_slope_area_sqft') / 100;
  const pitchedWsq = Math.max(wsq - lowSq, 0); // shingles cover pitched only
  switch (rule) {
    case 'shingle_3bd_sq':
      return { raw: pitchedWsq, raw_uom: 'sq', required: pitchedWsq * SQ_TO_BD, uom: 'BD', basis: 'waste_adjusted_squares - low_slope, 3 BD/SQ' };
    case 'ridge_cap_31lf':
      return { raw: g('hips_lf') + g('ridges_lf'), raw_uom: 'lf', required: (g('hips_lf') + g('ridges_lf')) / 31, uom: 'BD', basis: 'hips_lf + ridges_lf @31lf/BD' };
    case 'ridge_cap_20lf':
      return { raw: g('hips_lf') + g('ridges_lf'), raw_uom: 'lf', required: 0, uom: 'BD', basis: 'alternate ridge product; primary is 31lf H&R', needs_human: true, note: 'EZ-Ridge is an alternate to 227 H&R — human selects one ridge system' };
    case 'starter_120lf': {
      const lf = g('eaves_lf') + (CFG.starter_includes_rakes ? g('rakes_lf') : 0);
      return { raw: lf, raw_uom: 'lf', required: lf / 120, uom: 'BD', basis: `eaves${CFG.starter_includes_rakes ? '+rakes' : ''} @120lf/BD` };
    }
    case 'synthetic_10sq_roll':
      return { raw: pitchedWsq, raw_uom: 'sq', required: pitchedWsq / 10, uom: 'RL', basis: 'pitched waste-adjusted squares @10sq/RL' };
    case 'ice_water_67lf_roll':
      return { raw: g('valleys_lf'), raw_uom: 'lf', required: g('valleys_lf') / CFG.ice_water_lf_per_roll, uom: 'RL', basis: `valleys_lf @${CFG.ice_water_lf_per_roll}lf/RL (eave ice barrier is jurisdiction-dependent — not assumed)` };
    case 'gutter_apron_10ft':
      return { raw: g('eaves_lf'), raw_uom: 'lf', required: g('eaves_lf') / 10, uom: 'PC', basis: 'eaves_lf @10ft/PC' };
    case 'drip_edge_10ft':
      return { raw: g('rakes_lf'), raw_uom: 'lf', required: g('rakes_lf') / 10, uom: 'PC', basis: 'rakes_lf @10ft/PC' };
    case 'coil_nails_box':
      return { raw: wsq, raw_uom: 'sq', required: wsq / CFG.nails_coil_squares_per_box, uom: 'BX', basis: `waste sq @${CFG.nails_coil_squares_per_box}sq/BX` };
    case 'cap_nails_box':
      return { raw: wsq, raw_uom: 'sq', required: wsq / CFG.nails_cap_squares_per_box, uom: 'BX', basis: `waste sq @${CFG.nails_cap_squares_per_box}sq/BX` };
    case 'low_slope_cap_roll':
      return { raw: lowSq, raw_uom: 'sq', required: lowSq / 1, uom: 'RL', basis: 'low_slope sq @1sq/RL' };
    case 'low_slope_base_roll':
      return { raw: lowSq, raw_uom: 'sq', required: lowSq / 2, uom: 'RL', basis: 'low_slope sq @2sq/RL' };
    case 'primer_can':
      return { raw: lowSq, raw_uom: 'sq', required: lowSq > 0 ? Math.max(1, lowSq / 4) : 0, uom: 'CAN', basis: 'low-slope prep, ~4sq/can, min 1 when low slope exists' };
    case 'sealant_tube':
      return { raw: wsq, raw_uom: 'sq', required: 2 + lowSq / 2, uom: 'EA', basis: '2 base + 1 per 2 low-slope sq' };
    case 'pipe_boot_each':
    case 'vent_cap_each':
    case 'field_count_each':
    case 'human_select_each':
      return { raw: null, raw_uom: 'count', required: 0, uom: 'EA', basis: 'penetration/vent counts missing from Roofr export', needs_human: true, note: 'qty requires field count or CompanyCam review (open dashboard task)' };
    case 'ridge_vent_4ft':
      return { raw: g('ridges_lf'), raw_uom: 'lf', required: 0, uom: 'PC', basis: 'ridge vent vs box-vent strategy is a human/ventilation-design choice', needs_human: true, note: 'ventilation system selection pending' };
    case 'decking_allowance_sheet':
      return { raw: CFG.decking_allowance_sheets, raw_uom: 'sheet', required: CFG.decking_allowance_sheets, uom: 'BRD', basis: `${CFG.decking_allowance_sheets}-sheet allowance; beyond = change order (§4.8)` };
    default:
      return { raw: null, raw_uom: null, required: 0, uom: 'EA', basis: `unknown rule ${rule}`, needs_human: true };
  }
}

// price reconciliation: agreement price uom -> purchase uom unit cost
function unitCost(line, pricing) {
  const p = pricing.find((x) => x.item === line.item);
  if (p) {
    let cost = num(p.price); let conv = 1; let note = null;
    if (p.uom === 'SQ' && (line.vendor_uom === 'BD' || line.qty_basis === 'shingle_3bd_sq')) {
      cost = cost / SQ_TO_BD; conv = SQ_TO_BD; note = `price ${p.price}/SQ ÷ ${SQ_TO_BD} BD/SQ`;
    }
    return { unit_cost: +cost.toFixed(4), price_uom: p.uom, conversion: conv, source: p.src, note };
  }
  if (line.hist_cost !== null && line.hist_cost !== undefined) {
    return { unit_cost: num(line.hist_cost), price_uom: line.vendor_uom || line.sell_uom, conversion: 1, source: 'order_history_avg', note: 'no agreement/list price in mirror — order-history average, needs review' };
  }
  return { unit_cost: null, price_uom: null, conversion: 1, source: 'none', note: 'no price available — human pricing required' };
}

const out = [];
for (const run of inputs.runs) {
  const f = F[run.run_id];
  for (const tpl of inputs.templates) {
    const lines = inputs.lines.filter((l) => l.template_id === tpl.id).sort((a, b) => a.line_no - b.line_no);
    const scenLines = [];
    let materials = 0; let unresolved = 0; let shingleSeen = false;
    for (const l of lines) {
      let q = quantity(l.qty_basis, f);
      // Templates listing multiple shingle lines (e.g. OC Oakridge + Supreme,
      // GAF Timberline + Tamko) are offering ALTERNATES: first line is the
      // priced primary, the rest are human-select options at qty 0.
      if (l.qty_basis === 'shingle_3bd_sq') {
        if (shingleSeen) {
          q = { ...q, required: 0, needs_human: true, note: 'alternate shingle line — human selects one shingle system' };
        }
        shingleSeen = true;
      }
      const c = unitCost(l, inputs.pricing);
      const rounded = Math.ceil(q.required - 1e-9);
      const lineCost = c.unit_cost !== null ? +(rounded * c.unit_cost).toFixed(2) : null;
      if (lineCost) materials += lineCost;
      if (q.needs_human || c.source === 'none') unresolved++;
      scenLines.push({
        line_no: l.line_no, template_line_id: l.id, mapping_id: l.mapping_id,
        description: l.description, item: l.item,
        raw_quantity: q.raw, raw_uom: q.raw_uom,
        waste_factor: null, // waste already inside waste_adjusted_squares (Roofr recommended)
        required_quantity: +(q.required).toFixed(4),
        uom_conversion: c.conversion,
        rounded_quantity: rounded,
        vendor_price_uom: c.price_uom, sell_uom: l.sell_uom, purchase_uom: q.uom,
        rounding_delta: +(rounded - q.required).toFixed(4),
        unit_cost: c.unit_cost, line_cost: lineCost,
        price_source: c.source === 'none' ? null : 'static_fallback',
        price_source_detail: c.source, qty_basis: q.basis,
        needs_human: !!q.needs_human || c.source === 'none',
        note: [q.note, c.note].filter(Boolean).join('; ') || null,
      });
    }
    // §4.7 cost components (placeholders pending Ops confirmation)
    const wsq = num(f.waste_adjusted_squares) ?? 0;
    const lowSq = (num(f.low_slope_area_sqft) ?? 0) / 100;
    const pitchedWsq = Math.max(wsq - lowSq, 0);
    const stories = num(f.stories) ?? 1;
    const storyFactor = stories > 1 ? 1.15 : 1;
    const labor = +(pitchedWsq * CFG.labor_per_square * storyFactor + lowSq * CFG.labor_low_slope_per_square).toFixed(2);
    const disposal = +(CFG.disposal_base + Math.max(0, wsq - 30) * CFG.disposal_per_square_over_30).toFixed(2);
    const contingency = +(materials * CFG.contingency_pct_of_materials).toFixed(2);
    const baseCost = materials + labor + CFG.permit_allowance + disposal + CFG.delivery_fee + CFG.supplement_admin + contingency;
    // price solves: price = baseCost + commission·price + fees·price + (1-gm)… price·(1-gm_target) = cost
    // With commission/fees as % of price: price·(1 - gm) = baseCost + (comm+fees)·price
    // → price = baseCost / (1 - gm - comm - fees)
    const denom = 1 - CFG.target_gm_retail - CFG.commission_pct_of_price - CFG.payment_fees_pct_of_price;
    const price = +(baseCost / denom).toFixed(2);
    const commission = +(price * CFG.commission_pct_of_price).toFixed(2);
    const fees = +(price * CFG.payment_fees_pct_of_price).toFixed(2);
    const totalCost = +(baseCost + commission + fees).toFixed(2);
    const gm = +((price - totalCost) / price).toFixed(4);
    out.push({
      run_id: run.run_id, source: run.src, template_id: tpl.id, template_name: tpl.name,
      brand: tpl.brand, shingle_line: tpl.shingle_line,
      lines: scenLines,
      unresolved_lines: unresolved,
      cost_components: [
        { component: 'materials', amount: +materials.toFixed(2), basis: 'sum of rounded line costs (static_fallback pricing)', source: 'abc_mirror' },
        { component: 'labor', amount: labor, basis: `pitched ${pitchedWsq.toFixed(2)}sq @$${CFG.labor_per_square}${storyFactor > 1 ? '·1.15 two-story' : ''} + low-slope ${lowSq.toFixed(2)}sq @$${CFG.labor_low_slope_per_square}`, source: 'placeholder_config' },
        { component: 'permit', amount: CFG.permit_allowance, basis: 'allowance; jurisdiction workflow pending (§2.3)', source: 'placeholder_config' },
        { component: 'disposal', amount: disposal, basis: `$${CFG.disposal_base} base + $${CFG.disposal_per_square_over_30}/sq over 30`, source: 'placeholder_config' },
        { component: 'delivery', amount: CFG.delivery_fee, basis: 'ABC delivery fee', source: 'placeholder_config' },
        { component: 'sales_commission', amount: commission, basis: `${CFG.commission_pct_of_price * 100}% of price (formula pending §12)`, source: 'placeholder_config' },
        { component: 'payment_fees', amount: fees, basis: `${CFG.payment_fees_pct_of_price * 100}% of price`, source: 'placeholder_config' },
        { component: 'supplement_admin', amount: CFG.supplement_admin, basis: 'flat allowance', source: 'placeholder_config' },
        { component: 'contingency', amount: contingency, basis: `${CFG.contingency_pct_of_materials * 100}% of materials`, source: 'placeholder_config' },
      ],
      total_cost: totalCost, total_price: price, gross_margin_pct: gm,
      margin_check: {
        job_type: 'retail', gross_margin_pct: +(gm * 100).toFixed(2),
        target_pct: CFG.target_gm_retail * 100, floor_pct: CFG.floor_gm * 100,
        outcome: gm >= CFG.target_gm_retail ? 'pass' : gm >= CFG.floor_gm ? 'ops_manager_approval' : 'ceo_escalation',
        routed_to: gm >= CFG.target_gm_retail ? 'ops_manager' : gm >= CFG.floor_gm ? 'ops_manager' : 'ceo',
      },
    });
  }
}
console.log(JSON.stringify(out, null, 1));
