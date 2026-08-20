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
 *   DB (against the prod Supabase, read-only)
 *     - money columns that can go structurally dead ("$0 looks like success")
 *     - claim lines that became money without an agreement citation
 *     - recovered credits still being reported as owed
 *     - agreements governing prices after expiry, or with no source document
 *
 * WHAT IT DELIBERATELY DOES NOT COVER
 *   The HTML dashboards are WorkOS-gated and an agent has no human session
 *   (see the workos-agent-auth skill), so this cannot fetch them from prod.
 *   Page-level rendering/console checks would need a browser AND a session; that
 *   is a separate job, not something to fake here. Static analysis covers the
 *   page tree instead.
 *
 * ENV: AGENT_SERVICE_TOKEN (or AGENT_SERVICE_TOKENS csv), SLACK_BOT_TOKEN,
 *      LINEAR_API_KEY, SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — each optional;
 *      the sweep degrades loudly, never silently.
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

// ---------- db tier ----------
// Read-only. Every check here is a defect that actually shipped and was invisible
// until someone went looking — a money column reading $0 because its predicate was
// unreachable, recovered credits still counted as owed, claim lines that became money
// with no agreement behind them. A wrong number that LOOKS like a good outcome is the
// one nobody reports, so it has to be a machine that notices.
//
// Counting, never listing: PostgREST truncates a large select silently, so every check
// reads an exact count out of Content-Range and only fetches rows to name examples.
if (!STATIC_ONLY) {
  const dbUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const dbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!dbUrl || !dbKey) {
    add("warn", "db", "no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — skipped all DB checks (set them to enable money-truth coverage)");
  } else {
    const hdrs = { apikey: dbKey, authorization: `Bearer ${dbKey}`, accept: "application/json" };
    // exact count via Content-Range; rows[] carries at most `sample` examples
    const q = async (path, sample = 0) => {
      try {
        const res = await fetch(`${dbUrl}/rest/v1/${path}`, {
          headers: { ...hdrs, prefer: "count=exact", range: `0-${Math.max(sample - 1, 0)}` },
        });
        if (!res.ok) return { error: `${res.status} ${(await res.text()).slice(0, 160)}` };
        const total = Number(String(res.headers.get("content-range") || "").split("/")[1]);
        return { count: Number.isFinite(total) ? total : 0, rows: sample ? await res.json() : [] };
      } catch (e) { return { error: String(e) }; }
    };
    const today = new Date().toISOString().slice(0, 10);

    // 1 · a claim line that became money with no agreement citation behind it (mig 248)
    const uncited = await q("invoice_line_reaudit?classification=eq.discrepancy&or=(office_id.is.null,agreement_id.is.null)&select=invoice_number,item_number", 3);
    if (uncited.error) add("error", "db", `uncited-claim-lines check failed: ${uncited.error}`);
    else if (uncited.count > 0)
      add("error", "db", `${uncited.count} discrepancy line(s) carry no office/agreement citation — money without provenance (e.g. ${uncited.rows.map((r) => `${r.invoice_number}/${r.item_number}`).join(", ")})`);

    // 2 · a credit came back but the claim lines never settled, so at_risk still counts it (mig 246)
    const received = await q("credit_memo_requests?status=eq.received&select=invoice_number", 500);
    if (received.error) add("error", "db", `received-credit check failed: ${received.error}`);
    else if (received.rows.length) {
      const nums = received.rows.map((r) => r.invoice_number).filter(Boolean);
      const stranded = await q(`v_invoice_audit_invoice?at_risk=gt.0&invoice_number=in.(${nums.map((n) => `"${n}"`).join(",")})&select=invoice_number,at_risk`, 5);
      if (stranded.error) add("error", "db", `received-credit check failed: ${stranded.error}`);
      else if (stranded.count > 0)
        add("error", "db", `${stranded.count} received credit memo(s) still counted as money owed — mark-received did not settle the lines (e.g. ${stranded.rows.map((r) => `${r.invoice_number} $${r.at_risk}`).join(", ")})`);
    }

    // 3 · a money column reading $0 everywhere while the work that feeds it exists.
    //     This is the at_risk/credit_memo_amount failure mode: $0 looks like success.
    const disputed = await q("v_invoice_line_audit_current?audit_status=eq.disputed&select=invoice_line_id");
    const recovered = await q("v_invoice_audit_invoice?credit_memo_amount=gt.0&select=invoice_number");
    const atRisk = await q("v_invoice_audit_invoice?at_risk=gt.0&select=invoice_number");
    if (!disputed.error && !atRisk.error && disputed.count > 0 && atRisk.count === 0)
      add("error", "db", `at_risk is $0 on every invoice while ${disputed.count} disputed line(s) exist — the column has gone structurally dead`);
    if (!recovered.error && !received.error && received.rows?.length > 0 && recovered.count === 0)
      add("error", "db", `credit_memo_amount is $0 on every invoice while ${received.rows.length} credit memo(s) are marked received — recovered money is invisible`);

    // 4 · an expired agreement still flagged active is still pricing invoices today
    const expired = await q(`price_agreements?is_active=is.true&expiry_date=lt.${today}&select=agreement_number,expiry_date&order=expiry_date.asc`, 5);
    if (!expired.error && expired.count > 0)
      add("warn", "db", `${expired.count} active price agreement(s) are past expiry and may still be pricing invoices (oldest: ${expired.rows.map((r) => `${r.agreement_number || "unnumbered"} exp ${r.expiry_date}`).join(", ")})`);

    // 5 · an agreement with no source document cannot be shown to a vendor in a dispute
    const noPdf = await q("price_agreements?is_active=is.true&source_pdf_url=is.null&select=agreement_number", 5);
    if (!noPdf.error && noPdf.count > 0)
      add("warn", "db", `${noPdf.count} active price agreement(s) have no source PDF on file — a claim citing them has no document to show`);
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
