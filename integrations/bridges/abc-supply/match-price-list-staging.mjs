#!/usr/bin/env node
// match-price-list-staging.mjs — assign an item id# to each family-level price-list row by
// DESCRIPTION (Chris's rule). Trigram containment match of the cleaned raw_description against the
// curated catalog families, done in Node (the DB-side word_similarity over 331K rows times out).
// high (>=0.6) → ready to promote; review (0.35–0.6) → human check; none (<0.35) → no match.

import { readFileSync } from "node:fs";
const ENV = "/Users/chussey/Documents/a-roofers-open-brain/.env";
const env = {};
for (const l of readFileSync(ENV, "utf8").split("\n")) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const SB = (env.PUBLIC_SUPABASE_URL || env.SUPABASE_URL).replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const trigrams = (s) => {
  const t = "  " + s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + "  ";
  const set = new Set();
  for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
  return set;
};
// containment: how much of the (short) description appears in the (long) family name
const containment = (a, b) => {
  const A = trigrams(a), B = trigrams(b);
  if (!A.size) return 0;
  let hit = 0; for (const g of A) if (B.has(g)) hit++;
  return hit / A.size;
};
const clean = (d) => d.replace(/\s*\d+(\.\d+)?\s*\/?(SQ|BD|LF|RL)?\s*$/i, "").trim();

// 1. curated catalog families (one representative item per family).
const cat = await (await fetch(`${SB}/rest/v1/abc_product_catalog?select=item_number,item_description,family_name,review_class,purchases_36mo&review_class=not.is.null&family_name=not.is.null&limit=5000`, { headers: H })).json();
const famRep = new Map(); // family_name -> {item_number, item_description}
for (const c of cat.sort((a, b) => (b.purchases_36mo || 0) - (a.purchases_36mo || 0))) {
  if (!famRep.has(c.family_name)) famRep.set(c.family_name, { item_number: c.item_number, item_description: c.item_description });
}
const fams = [...famRep.entries()];
console.log(`catalog families: ${fams.length}`);

// 2. staging rows to match.
const rows = await (await fetch(`${SB}/rest/v1/price_list_pdf_staging?select=id,raw_description&source_doc=in.(denver-branch49-pricelist-2024,dallas-pricelist-apr2025)`, { headers: H })).json();
console.log(`staging rows: ${rows.length}`);

let high = 0, review = 0, none = 0;
for (const r of rows) {
  const cd = clean(r.raw_description);
  let best = { score: 0, fam: null, rep: null };
  for (const [fam, rep] of fams) {
    const s = containment(cd, fam);
    if (s > best.score) best = { score: s, fam, rep };
  }
  const status = best.score >= 0.6 ? "high" : best.score >= 0.35 ? "review" : "none";
  if (status === "high") high++; else if (status === "review") review++; else none++;
  await fetch(`${SB}/rest/v1/price_list_pdf_staging?id=eq.${r.id}`, {
    method: "PATCH",
    headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      matched_item_number: best.rep?.item_number ?? null,
      matched_description: best.rep?.item_description ?? null,
      matched_family: best.fam,
      match_score: Math.round(best.score * 1000) / 1000,
      match_status: status,
    }),
  });
}
console.log(`matched — high: ${high}, review: ${review}, none: ${none}`);
