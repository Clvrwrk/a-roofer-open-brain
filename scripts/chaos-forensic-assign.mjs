#!/usr/bin/env node
/**
 * chaos-forensic-assign.mjs — pick the day's forensic victim.
 *
 * The daily walk (orgo-site-walker.mjs) is WIDE and shallow: every route, links
 * clicked, console and network watched. It cannot be deep everywhere — exercising
 * every filter permutation on 109 routes every night is neither fast nor useful.
 *
 * So one page a day gets taken apart properly. Chaos, but bounded chaos: a page is
 * not eligible again until every other page has had its turn. Pure randomness would
 * hit the same three routes in a week and never reach the long tail, which is exactly
 * where the rot was found (docs/84 — the surfaces nobody visited were the broken ones).
 *
 *   node scripts/chaos-forensic-assign.mjs            # print today's assignment
 *   node scripts/chaos-forensic-assign.mjs --json     # machine-readable
 *   node scripts/chaos-forensic-assign.mjs --seed X   # deterministic (tests)
 *
 * Routes come from the built page tree, not a hand-kept list — a hardcoded list
 * silently stops covering pages that get added, which is how orphans survive.
 * State: <STATE_DIR>/chaos-cycle.json, the current cycle's already-used routes.
 */
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, relative, extname, dirname } from "node:path";
import { createHash } from "node:crypto";

const REPO = process.env.CHAOS_REPO_ROOT || join(dirname(new URL(import.meta.url).pathname), "..");
const PAGES = join(REPO, "app/command-center/src/pages");
const STATE_DIR = process.env.CHAOS_STATE_DIR || join(process.env.HOME || "/root", ".site-sweep");
const STATE = join(STATE_DIR, "chaos-cycle.json");
const asJson = process.argv.includes("--json");
const seedArg = (() => { const i = process.argv.indexOf("--seed"); return i >= 0 ? process.argv[i + 1] : null; })();

// ---------- route discovery (same shape the sweep uses) ----------
const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};
const routeOf = (p) => {
  let r = relative(PAGES, p).replace(/\\/g, "/").replace(/\.(astro|ts|js)$/, "");
  r = r.replace(/(^|\/)index$/, "$1").replace(/\/$/, "");
  return "/" + r;
};
const routes = [...new Set(
  walk(PAGES)
    .filter((p) => [".astro"].includes(extname(p)))          // rendered pages only
    .filter((p) => !p.includes("/api/") && !p.includes(".test."))
    .map(routeOf)
    .filter((r) => !r.includes("["))                          // skip dynamic params — no id to walk
)].sort();

if (!routes.length) { console.error("no routes discovered — is CHAOS_REPO_ROOT right?"); process.exit(1); }

// ---------- cycle state ----------
mkdirSync(STATE_DIR, { recursive: true });
let state = { cycle: 1, used: [] };
if (existsSync(STATE)) { try { state = JSON.parse(readFileSync(STATE, "utf8")); } catch { /* corrupt -> restart */ } }
// Drop routes that no longer exist, so a deleted page can't stall a cycle forever.
state.used = (state.used || []).filter((r) => routes.includes(r));

let pool = routes.filter((r) => !state.used.includes(r));
let cycleComplete = false;
if (!pool.length) { state.cycle = (state.cycle || 1) + 1; state.used = []; pool = routes; cycleComplete = true; }

// Deterministic per day (and per seed, for tests): the same day re-run picks the same
// page, so a retry after a crash does not silently move to a different target.
const seed = seedArg || new Date().toISOString().slice(0, 10);
const h = createHash("sha256").update(`${seed}:${state.cycle}`).digest();
const pick = pool[h.readUInt32BE(0) % pool.length];

state.used.push(pick);
writeFileSync(STATE, JSON.stringify(state, null, 2));

const out = {
  date: seed,
  route: pick,
  cycle: state.cycle,
  progress: `${state.used.length}/${routes.length}`,
  cycleRolledOver: cycleComplete,
  totalRoutes: routes.length,
};
if (asJson) { console.log(JSON.stringify(out)); process.exit(0); }
console.log(`chaos assignment ${out.date}`);
console.log(`  route    ${out.route}`);
console.log(`  cycle    ${out.cycle} (${out.progress} covered${cycleComplete ? ", rolled over" : ""})`);
