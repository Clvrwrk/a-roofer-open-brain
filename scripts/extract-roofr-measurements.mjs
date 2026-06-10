#!/usr/bin/env node
// extract-roofr-measurements.mjs — docs/33 Phase 2 (Measurement Extraction)
//
// Parses a Roofr measurement CSV + matching PDF report into the normalized
// field set required by docs/33 §4.2, with per-field provenance (§8.2).
// Pure extraction: emits JSON to stdout; loading into Supabase is a separate
// step so this script never needs credentials.
//
// Usage:
//   node scripts/extract-roofr-measurements.mjs <file.csv> [file.pdf]
//   node scripts/extract-roofr-measurements.mjs --dir "<folder>"   # all CSVs, PDF auto-paired
//
// Requires `pdftotext` (poppler) on PATH for the PDF fields (facets,
// predominant pitch, recommended waste, imagery). Without the PDF those
// fields fall back to CSV-derivable values or are reported missing.
//
// Output shape (per file): {
//   source: {csv, pdf, content_hash_csv, content_hash_pdf},
//   address, fields: [{name, value_numeric|value_text, uom, method, confidence, locator, formula?}],
//   missing_fields: [...], notes: [...]
// }

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { basename, join, dirname } from 'node:path';
import { readdirSync } from 'node:fs';

const REQUIRED = [
  'total_roof_area_sqft', 'squares', 'waste_adjusted_squares', 'predominant_pitch',
  'eaves_lf', 'rakes_lf', 'hips_lf', 'ridges_lf', 'valleys_lf',
  'wall_flashing_lf', 'step_flashing_lf', 'facet_count',
  'penetrations_count', 'stories', 'existing_layers', 'low_slope_area_sqft',
];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const num = (s) => { const n = parseFloat(String(s).replace(/,/g, '')); return Number.isFinite(n) ? n : null; };

function parseCsv(csvPath) {
  const raw = readFileSync(csvPath, 'utf8').trim();
  const [headerLine, dataLine] = raw.split(/\r?\n/);
  const headers = headerLine.split(',');
  const values = dataLine.split(',');
  const row = {};
  headers.forEach((h, i) => { row[h.trim()] = values[i]; });
  return { headers, row, hash: sha256(raw) };
}

function pdfText(pdfPath, layout = false) {
  const args = layout ? ['-layout', pdfPath, '-'] : [pdfPath, '-'];
  return execFileSync('pdftotext', args, { encoding: 'utf8' });
}

// The Roofr summary floats "Recommended" above one column of each waste
// table. Multi-structure properties get one table per structure PLUS a
// whole-property total table. Parse all tables (recommended column resolved
// by character offset; adj squares read from Roofr's own Squares row), then
// the caller selects the table whose 0%-column squares match the property
// total — that is the property-level table.
function recommendedWasteTables(layoutText) {
  const lines = layoutText.split('\n');
  const tables = [];
  const colValue = (line, center) => {
    let best = null;
    const re = /([\d,]+(?:\.\d+)?)%?/g; let m;
    while ((m = re.exec(line))) {
      const c = m.index + m[0].length / 2;
      const dist = Math.abs(c - center);
      if (!best || dist < best.dist) best = { raw: m[1], dist };
    }
    return best;
  };
  const firstValue = (line) => {
    const m = line.match(/([\d,]+(?:\.\d+)?)/);
    return m ? num(m[1]) : null;
  };
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*Recommended\s*$/.test(lines[i])) continue;
    const recCenter = lines[i].indexOf('Recommended') + 'Recommended'.length / 2;
    const wi = lines.slice(i, i + 6).findIndex((l) => /Waste\s*%/.test(l));
    const si = lines.slice(i, i + 10).findIndex((l) => /^\s*Squares\s/.test(l));
    if (wi < 0 || si < 0) continue;
    const wasteLine = lines[i + wi].replace(/Waste\s*%/, (s) => ' '.repeat(s.length));
    const sqLine = lines[i + si].replace(/^(\s*)Squares/, (m0, sp) => sp + '       ');
    const wbest = colValue(wasteLine, recCenter);
    const sbest = colValue(sqLine, recCenter);
    if (wbest && sbest) {
      tables.push({
        waste_pct: parseFloat(wbest.raw),
        adj_squares: num(sbest.raw),
        raw_squares: firstValue(sqLine), // 0% column = unwasted squares for this table's scope
      });
    }
  }
  return tables.length ? tables : null;
}

function extractOne(csvPath, pdfPath) {
  const { row, hash: csvHash } = parseCsv(csvPath);
  const csvName = basename(csvPath);
  const fields = [];
  const notes = [];
  const F = (name, valueNumeric, uom, method, confidence, locator, extra = {}) =>
    fields.push({ name, value_numeric: valueNumeric, uom, method, confidence, locator, ...extra });
  const FT = (name, valueText, method, confidence, locator, extra = {}) =>
    fields.push({ name, value_text: valueText, method, confidence, locator, ...extra });

  // --- CSV scalars (high confidence, direct read) ---
  const csvMap = [
    ['total_roof_area_sqft', 'Total roof area (Sqft)', 'sqft'],
    ['total_flat_area_sqft', 'Total flat area (Sqft)', 'sqft'],
    ['total_pitched_area_sqft', 'Total pitched area (Sqft)', 'sqft'],
    ['two_story_area_sqft', 'Two Story (Sqft)', 'sqft'],
    ['two_layer_area_sqft', 'Two Layer (Sqft)', 'sqft'],
    ['eaves_lf', 'Eaves (LF)', 'lf'],
    ['valleys_lf', 'Valleys (LF)', 'lf'],
    ['hips_lf', 'Hips (LF)', 'lf'],
    ['ridges_lf', 'Ridges (LF)', 'lf'],
    ['rakes_lf', 'Rakes (LF)', 'lf'],
    ['wall_flashing_lf', 'Wall Flashing (LF)', 'lf'],
    ['step_flashing_lf', 'Step Flashing (LF)', 'lf'],
    ['transitions_sqft', 'Transitions (Sqft)', 'sqft'],
    ['parapet_wall_sqft', 'Parapet Wall (Sqft)', 'sqft'],
    ['unspecified_sqft', 'Unspecified (Sqft)', 'sqft'],
  ];
  for (const [name, col, uom] of csvMap) {
    const v = num(row[col]);
    if (v !== null) F(name, v, uom, 'roofr_csv', 0.98, `${csvName}::${col}`);
  }

  // --- Pitch buckets (non-zero only) + low-slope from buckets ---
  let lowSlopeFromBuckets = 0;
  const buckets = [];
  for (let p = 0; p <= 100; p++) {
    const col = `${p}/12 pitch (Sqft)`;
    const v = num(row[col]);
    if (v) {
      buckets.push({ pitch: `${p}/12`, sqft: v });
      F(`pitch_area_${p}_12_sqft`, v, 'sqft', 'roofr_csv', 0.98, `${csvName}::${col}`);
      if (p <= 2) lowSlopeFromBuckets += v;
    }
  }

  // --- PDF fields ---
  let pdfPitch = null, waste = null, pdfHash = null;
  if (pdfPath && existsSync(pdfPath)) {
    pdfHash = sha256(readFileSync(pdfPath));
    const text = pdfText(pdfPath);
    const layout = pdfText(pdfPath, true);
    const fm = text.match(/(\d+)\s*facets/i);
    if (fm) { F('facet_count', parseInt(fm[1], 10), 'count', 'roofr_pdf_text', 0.95, `${basename(pdfPath)}::summary`); }
    const pm = text.match(/Predominant pitch[:\s]+(\d+)\/12/i);
    if (pm) { pdfPitch = `${pm[1]}/12`; FT('predominant_pitch', pdfPitch, 'roofr_pdf_text', 0.95, `${basename(pdfPath)}::summary`); }
    const tables = recommendedWasteTables(layout);
    if (tables) {
      // Property-level table = the one whose 0%-column squares match total
      // squares — or PITCHED squares: Roofr's waste tables cover shingled
      // (pitched) area only, so flat-roof properties match on pitched.
      const totalSq = num(row['Total roof area (Sqft)']) / 100;
      const pitchedSq = (num(row['Total pitched area (Sqft)']) || 0) / 100;
      const flatSq = (num(row['Total flat area (Sqft)']) || 0) / 100;
      const tol = (t) => Math.max(0.5, t * 0.03);
      // Table scope is recoverable from the table itself: raw = adj/(1+pct).
      // Multi-structure reports list per-structure tables first and the
      // report-summary table last, so prefer the LAST matching table.
      const cands = tables
        .map((t) => ({ ...t, implied_raw: t.adj_squares !== null ? t.adj_squares / (1 + t.waste_pct / 100) : null }))
        .filter((t) => t.implied_raw !== null);
      const pick = (target) => {
        const m = cands.filter((t) => Math.abs(t.implied_raw - target) <= tol(target));
        return m.length ? m[m.length - 1] : null;
      };
      // Scope = whichever target (total vs pitched) the table's implied raw
      // squares sits closest to; matters when flat area exists.
      const tTotal = pick(totalSq);
      const tPitched = pitchedSq > 0 ? pick(pitchedSq) : null;
      let prop = null; let scope = null;
      if (tTotal && tPitched) {
        const dT = Math.abs(tTotal.implied_raw - totalSq);
        const dP = Math.abs(tPitched.implied_raw - pitchedSq);
        if (dP < dT) { prop = tPitched; scope = 'pitched'; } else { prop = tTotal; scope = 'total'; }
      } else if (tTotal) { prop = tTotal; scope = 'total'; }
      else if (tPitched) { prop = tPitched; scope = 'pitched'; }
      if (prop && prop.adj_squares !== null) {
        waste = prop;
        const adj = scope === 'pitched' ? +(prop.adj_squares + flatSq).toFixed(2) : prop.adj_squares;
        const formula = scope === 'pitched'
          ? `Roofr recommended column (${prop.waste_pct}%) of the pitched-area waste table (${prop.adj_squares} sq) + flat area ${flatSq} sq unwasted (low-slope membrane waste handled separately)`
          : `Roofr recommended column (${prop.waste_pct}%) of the property-level waste table`;
        F('waste_adjusted_squares', adj, 'sq', 'roofr_pdf_layout', scope === 'pitched' ? 0.85 : 0.9,
          `${basename(pdfPath)}::waste-table (${scope}-level of ${tables.length})`, { formula, all_tables: tables });
        F('recommended_waste_pct', prop.waste_pct, 'pct', 'roofr_pdf_layout', 0.85, `${basename(pdfPath)}::waste-table (${scope} scope)`);
        if (scope === 'pitched') notes.push('Waste table covers pitched area only; flat area added unwasted to waste_adjusted_squares.');
      } else {
        notes.push(`Waste tables found (${tables.length}) but none matches property total or pitched squares; falling back to default waste.`);
      }
    }
    const im = text.match(/(Nearmap|Vexcel|EagleView|Google)\s+([A-Z][a-z]+ \d{1,2}, \d{4})/);
    if (im) { FT('imagery_source', `${im[1]} ${im[2]}`, 'roofr_pdf_text', 0.9, `${basename(pdfPath)}::cover`); }
  } else {
    notes.push('No PDF available: facet_count, predominant_pitch, recommended_waste_pct, imagery_source not extracted.');
  }

  // predominant pitch fallback from buckets
  if (!pdfPitch && buckets.length) {
    const top = buckets.reduce((a, b) => (b.sqft > a.sqft ? b : a));
    FT('predominant_pitch', top.pitch, 'derived_from_csv_buckets', 0.9, `${csvName}::pitch buckets`, { formula: 'largest pitch-bucket area' });
    pdfPitch = top.pitch;
  }

  // --- Derived fields ---
  const total = num(row['Total roof area (Sqft)']);
  const flat = num(row['Total flat area (Sqft)']) || 0;
  if (total !== null) {
    const squares = +(total / 100).toFixed(2);
    F('squares', squares, 'sq', 'derived', 0.98, 'total_roof_area_sqft / 100', { formula: 'total_roof_area_sqft / 100' });
    if (!waste) {
      const was = +((total * 1.1) / 100).toFixed(2);
      F('waste_adjusted_squares', was, 'sq', 'derived', 0.7,
        'squares * 1.10', { formula: `total ${total} sqft * (1 + 10% default waste) / 100`, waste_source: 'default_10pct_fallback' });
      notes.push('Recommended waste not extracted from PDF; waste_adjusted_squares uses 10% default fallback.');
    }
  }
  // Roofr's flat area already contains the 0-2/12 pitch buckets — take max, not sum.
  const lowSlope = +Math.max(flat, lowSlopeFromBuckets).toFixed(2);
  F('low_slope_area_sqft', lowSlope, 'sqft', 'derived', 0.95, 'max(flat area, 0/12..2/12 pitch buckets)', { formula: `max(flat ${flat}, low-pitch buckets ${lowSlopeFromBuckets})` });

  // stories / layers inference from area columns (inference, not measurement)
  const twoStory = num(row['Two Story (Sqft)']) || 0;
  const twoLayer = num(row['Two Layer (Sqft)']) || 0;
  F('stories', twoStory > 0 ? 2 : 1, 'count', 'inferred_from_roofr_csv', 0.7, `${csvName}::Two Story (Sqft)`,
    { formula: twoStory > 0 ? `two-story area ${twoStory} sqft > 0` : 'two-story area = 0 → assume single story' });
  F('existing_layers', twoLayer > 0 ? 2 : 1, 'count', 'inferred_from_roofr_csv', 0.7, `${csvName}::Two Layer (Sqft)`,
    { formula: twoLayer > 0 ? `two-layer area ${twoLayer} sqft > 0` : 'two-layer area = 0 → assume single layer' });

  // --- Missing required fields (§4.2 fallback path) ---
  const have = new Set(fields.map((f) => f.name));
  const missing = REQUIRED.filter((r) => !have.has(r));
  // penetrations/vents never appear in Roofr CSV/PDF measurements
  if (!have.has('penetrations_count')) {
    notes.push('Penetrations/vents are not in Roofr measurement exports: requires CompanyCam photo review or human field count (docs/33 §4.2).');
  }

  return {
    source: {
      csv: csvName,
      pdf: pdfPath && existsSync(pdfPath) ? basename(pdfPath) : null,
      content_hash_csv: csvHash,
      content_hash_pdf: pdfHash,
    },
    address: (row['Address'] || '').trim(),
    fields,
    missing_fields: missing,
    extraction_status: missing.length ? 'partial' : 'complete',
    notes,
  };
}

// --- CLI ---
const args = process.argv.slice(2);
let jobs = [];
if (args[0] === '--dir') {
  const dir = args[1];
  for (const f of readdirSync(dir)) {
    if (f.toLowerCase().endsWith('.csv')) {
      const pdf = join(dir, f.replace(/\.csv$/i, '.pdf'));
      jobs.push([join(dir, f), existsSync(pdf) ? pdf : null]);
    }
  }
} else if (args.length) {
  const csv = args[0];
  const pdf = args[1] || join(dirname(csv), basename(csv).replace(/\.csv$/i, '.pdf'));
  jobs.push([csv, existsSync(pdf) ? pdf : null]);
} else {
  console.error('Usage: extract-roofr-measurements.mjs <file.csv> [file.pdf] | --dir <folder>');
  process.exit(1);
}

const out = jobs.map(([csv, pdf]) => extractOne(csv, pdf));
console.log(JSON.stringify(out, null, 2));
