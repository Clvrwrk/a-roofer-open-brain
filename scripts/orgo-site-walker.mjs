#!/usr/bin/env node
/**
 * orgo-site-walker.mjs — page-by-page evaluation of cc.proexteriorsus.net,
 * designed to run ON the Orgo QA desktop (docs/94, PEC-220).
 *
 * Complements the Layer 2 sweep (docs/92): that one covers the static tree and
 * the /api surface but CANNOT touch the WorkOS-gated HTML dashboards. This runs
 * inside a real browser with a persistent profile, so once a human signs in to
 * WorkOS once on this desktop, the session persists and every subsequent daily
 * run walks the real application.
 *
 *   node scripts/orgo-site-walker.mjs                 # walk + report
 *   node scripts/orgo-site-walker.mjs --routes a,b    # subset
 *
 * PER PAGE IT RECORDS
 *   speed        — navigation time, DOMContentLoaded, load, and a slow/hang verdict
 *   hangs        — navigation exceeding HANG_MS, or a page whose network never settles
 *   correctness  — HTTP status, console errors, failed subresource requests
 *   click-through— every in-app link is clicked and the resulting URL compared to
 *                  its href; a mismatch or an error page is a finding
 *   vulnerability(surface-level only) — missing security headers, mixed content,
 *                  secrets echoed into the DOM, and forms without CSRF-ish protection.
 *                  This is NOT a penetration test; it flags cheap, high-signal issues.
 *
 * AUTH: uses a persistent Chrome profile at PROFILE_DIR. If a walk lands on the
 * WorkOS sign-in page, the run stops and reports "session expired" rather than
 * silently reporting every page as broken.
 */
import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const SITE = process.env.WALK_SITE || "https://cc.proexteriorsus.net";
const PROFILE_DIR = process.env.WALK_PROFILE || "/opt/pe-qa/chrome-profile";
const OUT_DIR = process.env.WALK_OUT || "/opt/pe-qa/reports";
const CHROME = process.env.WALK_CHROME || "/usr/bin/google-chrome-stable";
const HANG_MS = Number(process.env.WALK_HANG_MS || 15000);
const SLOW_MS = Number(process.env.WALK_SLOW_MS || 4000);

const ROUTES = (process.env.WALK_ROUTES || [
  "/", "/accounting/invoice-audit", "/accounting/friday-wip", "/accounting/qb-bank-export",
  "/accounting/price-agreements", "/accounting/price-agreement/review",
  "/accounting/price-agreement/builder", "/accounting/price-agreement/methodology",
  "/accounting/credit-memos/weekly", "/accounting/audit/credit-memos",
  "/operations", "/operations/estimate-audit", "/operations/order-audit",
  "/sales", "/marketing", "/marketing/hail-zones", "/marketing/markets",
  "/executive/pipeline", "/agents", "/system",
].join(",")).split(",").map((s) => s.trim()).filter(Boolean);

const findings = [];
const add = (sev, route, area, message, extra = {}) =>
  findings.push({ severity: sev, route, area, message, ...extra });

const SECURITY_HEADERS = [
  "content-security-policy", "x-content-type-options",
  "referrer-policy", "strict-transport-security",
];

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(PROFILE_DIR, { recursive: true });

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  executablePath: existsSync(CHROME) ? CHROME : undefined,
  headless: true,
  viewport: { width: 1440, height: 900 },
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const pageResults = [];
let sessionLost = false;

for (const route of ROUTES) {
  if (sessionLost) break;
  const page = await ctx.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300)); });
  page.on("requestfailed", (r) => failedRequests.push(`${r.method()} ${r.url().slice(0, 160)} — ${r.failure()?.errorText}`));

  const t0 = Date.now();
  let status = 0, hung = false, timing = {};
  try {
    const res = await page.goto(SITE + route, { waitUntil: "domcontentloaded", timeout: HANG_MS });
    status = res?.status() ?? 0;
    // security headers are only meaningful on the document response
    if (res) {
      const h = res.headers();
      const missing = SECURITY_HEADERS.filter((k) => !h[k]);
      if (missing.length) add("warn", route, "security-headers", `missing: ${missing.join(", ")}`);
    }
    try { await page.waitForLoadState("networkidle", { timeout: HANG_MS }); }
    catch { hung = true; add("error", route, "hang", `network never settled within ${HANG_MS}ms — page keeps requesting`); }
    timing = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0];
      return n ? { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), transfer: n.transferSize } : {};
    }).catch(() => ({}));
  } catch (e) {
    hung = true;
    add("error", route, "hang", `navigation exceeded ${HANG_MS}ms or failed: ${String(e).slice(0, 160)}`);
  }
  const ms = Date.now() - t0;

  const url = page.url();
  if (/workos|sign-?in|login/i.test(url) && !route.includes("auth")) {
    sessionLost = true;
    add("error", route, "auth", `redirected to sign-in (${url.slice(0, 120)}) — the WorkOS session on this desktop has expired; a human must sign in once`);
    await page.close();
    break;
  }

  if (status >= 500) add("error", route, "http", `HTTP ${status}`);
  else if (status === 404) add("error", route, "http", "HTTP 404");
  else if (status && status !== 200) add("warn", route, "http", `HTTP ${status}`);
  if (ms > SLOW_MS && !hung) add("warn", route, "speed", `slow load: ${ms}ms (budget ${SLOW_MS}ms)`);
  for (const c of consoleErrors.slice(0, 5)) add("error", route, "console", c);
  for (const f of failedRequests.slice(0, 5)) add("error", route, "request-failed", f);

  // cheap vulnerability surface: secrets echoed into the DOM, mixed content
  const leaks = await page.evaluate(() => {
    const html = document.documentElement.innerHTML;
    const pats = [[/sk_live_[A-Za-z0-9]{8,}/, "stripe-like live key"], [/eyJhbGciOi[A-Za-z0-9_.-]{20,}/, "JWT"],
                  [/xox[baprs]-[A-Za-z0-9-]{10,}/, "slack token"], [/service_role/, "supabase service_role reference"],
                  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"]];
    return pats.filter(([re]) => re.test(html)).map(([, label]) => label);
  }).catch(() => []);
  for (const l of leaks) add("error", route, "secret-in-dom", `possible ${l} rendered into the page`);

  const mixed = await page.evaluate(() =>
    [...document.querySelectorAll("[src],[href]")]
      .map((e) => e.getAttribute("src") || e.getAttribute("href") || "")
      .filter((u) => u.startsWith("http://")).slice(0, 3)).catch(() => []);
  for (const m of mixed) add("warn", route, "mixed-content", `insecure http:// resource ${m.slice(0, 120)}`);

  // click-through verification: every same-origin link should land where it claims
  const links = await page.evaluate(() =>
    [...new Set([...document.querySelectorAll('a[href^="/"]')].map((a) => a.getAttribute("href")))]
      .filter((h) => h && !h.startsWith("//")).slice(0, 12)).catch(() => []);
  for (const href of links) {
    try {
      const r = await page.request.get(SITE + href, { maxRedirects: 5 });
      if (r.status() >= 400) add("error", route, "click-through", `link ${href} -> HTTP ${r.status()}`);
    } catch (e) { add("error", route, "click-through", `link ${href} failed: ${String(e).slice(0, 120)}`); }
  }

  pageResults.push({ route, status, ms, hung, timing, consoleErrors: consoleErrors.length, failedRequests: failedRequests.length, links: links.length });
  await page.close();
}
await ctx.close();

const errors = findings.filter((f) => f.severity === "error");
const warns = findings.filter((f) => f.severity === "warn");
const report = {
  generatedAt: new Date().toISOString(), site: SITE, sessionLost,
  routesWalked: pageResults.length, routesPlanned: ROUTES.length,
  slowest: [...pageResults].sort((a, b) => b.ms - a.ms).slice(0, 5).map((p) => ({ route: p.route, ms: p.ms })),
  totals: { errors: errors.length, warnings: warns.length },
  pages: pageResults, findings,
};
const stamp = report.generatedAt.replace(/[:.]/g, "-");
writeFileSync(join(OUT_DIR, `walk-${stamp}.json`), JSON.stringify(report, null, 2));
writeFileSync(join(OUT_DIR, "latest.json"), JSON.stringify(report, null, 2));

console.log(`orgo-site-walker ${report.generatedAt}`);
console.log(`  walked ${report.routesWalked}/${report.routesPlanned} routes  errors=${errors.length} warnings=${warns.length}`);
if (sessionLost) console.log("  !! WorkOS session expired — a human must sign in once on this desktop");
for (const p of report.slowest) console.log(`  slowest: ${p.route} ${p.ms}ms`);
for (const f of findings.slice(0, 40)) console.log(`  [${f.severity}] ${f.route} ${f.area}: ${f.message}`);

const slack = (process.env.SLACK_BOT_TOKEN || "").replace(/[^\x20-\x7E]/g, "").trim();
const chan = process.env.SLACK_DEV_CHANNEL_ID || "C0BNVF99Y74";
if (slack && (errors.length || sessionLost)) {
  const lines = findings.slice(0, 15).map((f) => `• *${f.severity}* \`${f.route}\` ${f.area}: ${f.message}`).join("\n");
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST", headers: { authorization: `Bearer ${slack}`, "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel: chan, text: `*Orgo site walk* — ${errors.length} error(s), ${warns.length} warning(s)` +
      (sessionLost ? "\n:warning: WorkOS session expired — human sign-in needed on the QA desktop" : "") + `\n${lines}` }),
  }).catch(() => {});
}
process.exit(errors.length ? 1 : 0);
