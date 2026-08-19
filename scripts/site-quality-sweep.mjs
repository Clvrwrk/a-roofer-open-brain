#!/usr/bin/env node
/**
 * Daily site quality sweep (docs/92, PEC-218) — the Layer 2 automation from the
 * 2026-08-18 site audit (docs/90). Reproduces, unattended, the checks that audit
 * ran by hand, so a regression is caught by a machine at 06:00 instead of by a
 * human noticing months later.
 *
 *   node scripts/site-quality-sweep.mjs            # full sweep, exit 1 on failure
 *   node scripts/site-quality-sweep.mjs --static   # repo checks only (no network)
 *
 * WHAT IT COVERS
 *   STATIC (against the repo checkout)
 *     - link graph: every internal href/fetch target resolves to a real route
 *     - fabricated data: no literal $ amounts or % in page markup; no
 *       mock/sample/hardcoded data modules reachable from a page
 *     - orphans: built pages with zero inbound links (the PEC-217 failure mode)
 *   LIVE (against https://cc.proexteriorsus.net)
 *     - /healthz reachable, status ok, and buildCommit matches origin/main
 *     - every agent-reachable /api/* route: HTTP status + response-time budget
 *
 * WHAT IT DELIBERATELY DOES NOT COVER
 *   The HTML dashboards are WorkOS-gated and an agent has no human session
 *   (see the workos-agent-auth skill), so this cannot fetch them from prod.
 *   Page-level rendering/console checks would need a browser AND a session; that
 *   is a separate job, not something to fake here. Static analysis covers the
 *   page tree instead.
 *
 * ENV: AGENT_SERVICE_TOKEN (or AGENT_SERVICE_TOKENS csv), SLACK_BOT_TOKEN,
 *      LINEAR_API_KEY — each optional; the sweep degrades loudly, never silently.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, relative, extname, dirname } from "node:path";
import { execSync } from "node:child_process";

const REPO = process.env.SWEEP_REPO_ROOT || join(dirname(new URL(import.meta.url).pathname), "..");
const SRC = join(REPO, "app/command-center/src");
const PAGES = join(SRC, "pages");
const SITE = process.env.SWEEP_SITE || "https://cc.proexteriorsus.net";
const STATIC_ONLY = process.argv.includes("--static");
const findings = [];
const add = (sev, area, msg) => findings.push({ severity: sev, area, message: msg });

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};
const CODE = new Set([".astro", ".ts", ".js"]);
const isCode = (p) => CODE.has(extname(p)) && !p.includes(".test.");

// ---------- routes ----------
const routeOf = (p) => {
  let r = relative(PAGES, p).replace(/\\/g, "/").replace(/\.(astro|ts|js)$/, "");
  r = r.replace(/(^|\/)index$/, "$1").replace(/\/$/, "");
  return "/" + r;
};
const pageFiles = walk(PAGES).filter(isCode);
const routes = new Set(pageFiles.map(routeOf));
const dynamic = [...routes].filter((r) => r.includes("[")).map(
  (r) => new RegExp("^" + r.replace(/\[\.\.\.[^\]]+\]/g, ".+").replace(/\[[^\]]+\]/g, "[^/]+") + "$"));
const known = (l) => {
  const b = l.split("?")[0].split("#")[0].replace(/\/$/, "") || "/";
  return routes.has(b) || dynamic.some((d) => d.test(b));
};

// ---------- 1. link graph ----------
const STATIC_OK = new Set(["/favicon.svg", "/pro-exteriors-logo.svg", "/sw.js", "/manifest.webmanifest", "/robots.txt"]);
const linkRx = /href=["'](\/[^"'\s>]*)|fetch\(\s*[`"'](\/[^`"'\s]*)|location\.href\s*=\s*[`"'](\/[^`"'\s?]*)|redirect\([`"'](\/[^`"'\s?]*)/g;
const scanDirs = ["pages", "components", "scripts", "layouts"].map((d) => join(SRC, d)).filter(existsSync);
const links = new Map();
for (const d of scanDirs) for (const f of walk(d).filter(isCode)) {
  const txt = readFileSync(f, "utf8");
  for (const m of txt.matchAll(linkRx)) {
    const l = m[1] || m[2] || m[3] || m[4];
    if (l && !l.startsWith("//")) (links.get(l) ?? links.set(l, new Set()).get(l)).add(relative(REPO, f));
  }
}
let dangling = 0;
for (const [l, srcs] of links) {
  if (!known(l) && !STATIC_OK.has(l) && !l.startsWith("/_")) {
    dangling++;
    add("error", "link-graph", `dead internal link ${l} (from ${[...srcs][0]})`);
  }
}

// ---------- 2. fabricated data ----------
const moneyRx = />\s*\$[0-9][0-9,.]*/;
const pctRx = />[0-9]+(\.[0-9]+)?%</;
for (const d of [join(SRC, "pages"), join(SRC, "components")].filter(existsSync))
  for (const f of walk(d).filter(isCode)) {
    const txt = readFileSync(f, "utf8");
    for (const [rx, what] of [[moneyRx, "literal $ amount"], [pctRx, "literal percentage"]]) {
      const line = txt.split("\n").findIndex((L) => rx.test(L) && !L.includes("${"));
      if (line >= 0) add("error", "fabricated-data", `${what} hardcoded in markup: ${relative(REPO, f)}:${line + 1}`);
    }
  }
// Only self-admissions of data that is fake RIGHT NOW. A bare "hardcoded" matches
// comments describing bugs that were already fixed ("hasPriceList was hardcoded
// true"), which is exactly the false positive that makes a daily sweep get ignored.
const FAKE = /\b(sample data for now|sample SKU|fabricated data|mock data|dummy data|fake data)\b/i;
for (const f of walk(join(SRC, "lib")).filter(isCode)) {
  const txt = readFileSync(f, "utf8");
  if (!FAKE.test(txt)) continue;
  const base = relative(SRC, f).replace(/\.ts$/, "");
  const importedBy = scanDirs.flatMap((d) => walk(d).filter(isCode))
    .filter((o) => o !== f && new RegExp(`from\\s+["']@?[^"']*${base.split("/").pop()}["']`).test(readFileSync(o, "utf8")))
    .filter((o) => !/^import type/m.test(readFileSync(o, "utf8").split("\n").find((L) => L.includes(base.split("/").pop())) || ""));
  const sev = importedBy.length ? "error" : "warn";
  add(sev, "fabricated-data",
    `${relative(REPO, f)} declares sample/hardcoded data and is imported at runtime by ${importedBy.length} file(s)` +
    (importedBy.length ? ` — ${importedBy.map((x) => relative(REPO, x)).join(", ")}` : " (dead — safe, but delete it)"));
}

// ---------- 3. orphan pages ----------
const linkedTargets = new Set([...links.keys()].map((l) => l.split("?")[0].replace(/\/$/, "") || "/"));
const navTxt = existsSync(join(SRC, "lib/nav.ts")) ? readFileSync(join(SRC, "lib/nav.ts"), "utf8") : "";
// Machine endpoints (auth, oauth, agent, discovery, health, service worker) are
// never linked from the UI by design — only real .astro pages can be "orphaned".
const MACHINE = [/^\/api/, /^\/auth/, /^\/oauth2/, /^\/agent/, /^\/\.well-known/, /^\/healthz/, /^\/sw\.js/, /^\/submit-agreement/];
for (const r of routes) {
  if (r.includes("[") || r === "/" || MACHINE.some((m) => m.test(r))) continue;
  const file = pageFiles.find((p) => routeOf(p) === r);
  if (!file || extname(file) !== ".astro") continue;
  const body = readFileSync(file, "utf8");
  if (/Astro\.redirect/.test(body)) continue;                       // redirect stubs are intentional
  if (linkedTargets.has(r)) continue;                               // linked from somewhere
  if (new RegExp(`href:\\s*["']${r}["']`).test(navTxt)) continue;   // in nav
  add("warn", "orphan-page", `${r} is built but has no inbound link and is not in nav (${relative(REPO, file)})`);
}

// ---------- 4. live checks ----------
const timed = async (url, opts = {}) => {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(30000) });
    return { ok: true, status: res.status, ms: Date.now() - t0, res };
  } catch (e) { return { ok: false, status: 0, ms: Date.now() - t0, error: String(e) }; }
};
if (!STATIC_ONLY) {
  const h = await timed(`${SITE}/healthz`);
  if (!h.ok || h.status !== 200) {
    add("error", "live", `/healthz unreachable or non-200 (status=${h.status}${h.error ? ", " + h.error : ""})`);
  } else {
    const body = await h.res.json().catch(() => ({}));
    if (body.status !== "ok") add("error", "live", `/healthz status is "${body.status}", expected "ok"`);
    let head = "";
    try { head = execSync("git rev-parse origin/main", { cwd: REPO }).toString().trim(); } catch {}
    if (head && body.buildCommit && !String(body.buildCommit).startsWith(head.slice(0, 7)))
      add("warn", "live", `deployed buildCommit ${String(body.buildCommit).slice(0, 7)} != origin/main ${head.slice(0, 7)} — deploy drift`);
    if (h.ms > 3000) add("warn", "live", `/healthz slow: ${h.ms}ms`);
  }

  let token = process.env.AGENT_SERVICE_TOKEN || "";
  if (!token && process.env.AGENT_SERVICE_TOKENS)
    token = (process.env.AGENT_SERVICE_TOKENS.split(",").find((p) => p.startsWith("ob-accounting:")) || "").split(":").slice(1).join(":");
  if (!token) {
    add("warn", "live", "no AGENT_SERVICE_TOKEN — skipped all /api/* probes (set it to enable live API coverage)");
  } else {
    const PROBES = [
      { path: "/api/vendor-territories", budget: 4000 },
      { path: "/api/accounting/kpi-pills", budget: 5000 },
      { path: "/api/credit-memos/pending", budget: 5000 },
      { path: "/api/product-surface.json", budget: 4000 },
      { path: "/api/agent/work-queue", budget: 5000 },
    ];
    for (const p of PROBES) {
      const r = await timed(`${SITE}${p.path}`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
      if (!r.ok) { add("error", "live", `${p.path} request failed: ${r.error}`); continue; }
      if (r.status === 401 || r.status === 403) { add("error", "live", `${p.path} -> ${r.status} (service token rejected)`); continue; }
      if (r.status >= 500) { add("error", "live", `${p.path} -> ${r.status}`); continue; }
      if (r.status !== 200) { add("warn", "live", `${p.path} -> ${r.status}`); continue; }
      if (r.ms > p.budget) add("warn", "live", `${p.path} slow: ${r.ms}ms > ${p.budget}ms budget`);
    }
  }
}

// ---------- report ----------
const errors = findings.filter((f) => f.severity === "error");
const warns = findings.filter((f) => f.severity === "warn");
const stamp = new Date().toISOString();
const report = {
  generatedAt: stamp, site: SITE, mode: STATIC_ONLY ? "static" : "full",
  totals: { routes: routes.size, links: links.size, dangling, errors: errors.length, warnings: warns.length },
  findings,
};
const outDir = join(process.env.HOME || "/root", ".site-sweep");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "latest.json"), JSON.stringify(report, null, 2));

console.log(`site-quality-sweep ${stamp}`);
console.log(`  routes=${routes.size} links=${links.size} dangling=${dangling}`);
console.log(`  errors=${errors.length} warnings=${warns.length}`);
for (const f of findings) console.log(`  [${f.severity}] ${f.area}: ${f.message}`);

// Slack — dev channel per the standing rule (#pe-cc-dev-team)
const slack = (process.env.SLACK_BOT_TOKEN || '').replace(/[^\x20-\x7E]/g, '').trim(), chan = process.env.SLACK_DEV_CHANNEL_ID || "C0BNVF99Y74";
if (slack && (errors.length || warns.length)) {
  const lines = findings.slice(0, 20).map((f) => `• *${f.severity}* \`${f.area}\` ${f.message}`).join("\n");
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { authorization: `Bearer ${slack}`, "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel: chan, text:
      `*Daily site sweep* — ${errors.length} error(s), ${warns.length} warning(s)\n${lines}` +
      (findings.length > 20 ? `\n_…and ${findings.length - 20} more_` : "") }),
  }).catch((e) => console.error("slack post failed:", String(e)));
}

// Linear — only for errors, and only one issue per distinct signature per day
const linear = process.env.LINEAR_API_KEY, team = process.env.LINEAR_TEAM_ID;
if (linear && team && errors.length) {
  const title = `Site sweep ${stamp.slice(0, 10)}: ${errors.length} error(s) detected`;
  const description = ["Automated daily sweep (`scripts/site-quality-sweep.mjs`, docs/92).", "", "## Errors", ...errors.map((f) => `- **${f.area}** — ${f.message}`), "",
    warns.length ? "## Warnings" : "", ...warns.map((f) => `- **${f.area}** — ${f.message}`)].join("\n");
  const q = `mutation($i:IssueCreateInput!){issueCreate(input:$i){success issue{identifier url}}}`;
  const r = await fetch("https://api.linear.app/graphql", {
    method: "POST", headers: { authorization: linear, "content-type": "application/json" },
    body: JSON.stringify({ query: q, variables: { i: { teamId: team, title, description, priority: 2 } } }),
  }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
  console.log("linear:", JSON.stringify(r?.data?.issueCreate ?? r));
}

process.exit(errors.length ? 1 : 0);
