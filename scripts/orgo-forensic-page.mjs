#!/usr/bin/env node
/**
 * orgo-forensic-page.mjs — take ONE page apart: every control, every filter.
 *
 * The daily walk is wide and shallow. This is the deep pass the chaos scheduler
 * assigns one route per day (scripts/chaos-forensic-assign.mjs).
 *
 *   node scripts/orgo-forensic-page.mjs --route /accounting/invoice-audit
 *   node scripts/orgo-forensic-page.mjs                    # ask the scheduler
 *
 * ─── SAFETY, WHICH IS THE WHOLE DESIGN PROBLEM ───────────────────────────────
 * This runs against PRODUCTION accounting. The controls on these pages include
 * "Process", "Approve & Send", "Export in QB Bank Export", "Chase in Weekly CM".
 * A naive click-everything bot would stamp invoices, fire vendor credit-memo
 * emails and write QuickBooks ledgers — nightly, unattended. So there are three
 * independent layers, and the last one does not depend on getting the first two
 * right:
 *
 *   1. ALLOW  — only controls that are demonstrably view-affecting get clicked:
 *               filters, selects, checkboxes, tabs, expanders, sort headers.
 *   2. DENY   — anything whose text, name, id or aria-label matches the mutation
 *               vocabulary is skipped and REPORTED as skipped, never silently.
 *   3. ABORT  — every non-GET request is killed at the network layer. Even if a
 *               click slips past 1 and 2, the write never reaches the server.
 *               This is the backstop; treat 1 and 2 as best-effort.
 *
 * A control that is skipped is a coverage gap, not a pass — the report says so,
 * because "we clicked everything safe" quietly reads as "we clicked everything".
 */
import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const SITE = process.env.WALK_SITE || "https://cc.proexteriorsus.net";
const PROFILE_DIR = process.env.WALK_PROFILE || "/opt/pe-cc-agents/maya-qa/chrome-profile";
const OUT_DIR = process.env.WALK_OUT || "/opt/pe-cc-agents/maya-qa/reports";
const CHROME = process.env.WALK_CHROME || "/usr/bin/google-chrome";
const SETTLE_MS = Number(process.env.FORENSIC_SETTLE_MS || 900);
// Hard wall clock. Friday WIP ran past 10 minutes in testing: a heavy page with many
// controls multiplies settle time by control count. An unattended nightly job that can
// hang forever is worse than one that reports partial coverage, so it reports and exits.
const BUDGET_MS = Number(process.env.FORENSIC_BUDGET_MS || 8 * 60 * 1000);
const startedAt = Date.now();
const outOfTime = () => Date.now() - startedAt > BUDGET_MS;

const argRoute = (() => { const i = process.argv.indexOf("--route"); return i >= 0 ? process.argv[i + 1] : null; })();
const route = argRoute || (() => {
  const out = execFileSync("node", [join(import.meta.dirname, "chaos-forensic-assign.mjs"), "--json"], { encoding: "utf8" });
  return JSON.parse(out).route;
})();

// Any of these in a control's text/name/id/aria-label means "this writes something".
const MUTATION = /\b(send|approve|process|export|delete|remove|pay|paid|submit|save|confirm|reset|promote|mark|cancel|withdraw|issue|post|sync|run|trigger|apply|create|add|update|edit|upload|import|stamp|close|chase|receive)\b/i;
// Controls that only change what you are looking at.
const VIEW_ROLES = new Set(["tab", "combobox", "listbox", "option", "switch", "radio", "checkbox"]);

const findings = [];
const add = (sev, area, msg) => findings.push({ severity: sev, area, message: msg });

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(PROFILE_DIR, { recursive: true });

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  executablePath: existsSync(CHROME) ? CHROME : undefined,
  headless: true,
  viewport: { width: 1440, height: 900 },
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

// ── layer 3: the backstop. Nothing that mutates leaves the browser. ──
let blockedWrites = 0;
await ctx.route("**/*", (r) => {
  const m = r.request().method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return r.continue();
  blockedWrites += 1;
  add("warn", "blocked-write", `${m} ${r.request().url().replace(SITE, "")} aborted by the read-only backstop`);
  return r.abort();
});

const page = await ctx.newPage();
const consoleErrors = [];
const pageErrors = [];
// net::ERR_FAILED here is our own backstop aborting a write — counting it as a page
// defect would make every page with a mutating control look broken.
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const t = m.text();
  if (/ERR_FAILED|ERR_ABORTED|Failed to load resource/i.test(t)) return;
  consoleErrors.push(t.slice(0, 300));
});
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 300)));

const url = `${SITE}${route}`;
const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => ({ error: e }));
if (resp?.error) { add("error", "load", `${route} failed to load: ${resp.error}`); }

// Auth wall check — title/body, never the URL alone (that lesson cost a whole report).
const gated = await page.evaluate(() => {
  const t = (document.title || "").toLowerCase();
  const b = (document.body?.innerText || "").slice(0, 400).toLowerCase();
  return /sign in|log in|authkit|workos/.test(t) || /sign in to|continue with|authkit/.test(b);
}).catch(() => false);
if (gated) {
  add("error", "auth", "landed on the sign-in wall — the browser profile has no live WorkOS session; a human must sign in once on this desktop");
  await ctx.close();
  report();
}

// ── open every accordion first ──
// Controls nested in a closed <details> are in the DOM but not clickable, so they
// time out and read as 13 broken links when they are simply folded away. A human
// doing this by hand opens every section first; so do we.
// Capped, and deliberately so: on Invoice Audit the <details> element IS the data
// tree (Office -> Branch -> Invoice -> Line), so an uncapped expand opened 1,188 of
// them and rebuilt the whole page. We want folded CONTROLS reachable, not every data
// row rendered. Nav/aside sections first, then a small cap on the rest.
const opened = await page.evaluate((cap) => {
  const inChrome = (d) => !!d.closest("nav, aside, header, .side-rail, form");
  const all = [...document.querySelectorAll("details:not([open])")];
  const pick = [...all.filter(inChrome), ...all.filter((d) => !inChrome(d))].slice(0, cap);
  pick.forEach((d) => { d.open = true; });
  return pick.length;
}, Number(process.env.FORENSIC_ACCORDION_CAP || 30)).catch(() => 0);
if (opened) await page.waitForTimeout(SETTLE_MS);

// ── enumerate every interactive control ──
const controls = await page.evaluate(() => {
  const sel = 'button, [role=button], a[href], select, input, textarea, summary, [role=tab], th[data-sort], [data-filter]';
  const all = [...document.querySelectorAll(sel)];
  const perTag = {};
  return all.map((el, i) => {
    const tag = el.tagName.toLowerCase();
    perTag[tag] = (perTag[tag] ?? -1) + 1;
    const cs = getComputedStyle(el);
    return {
      idx: i,
      tagNth: perTag[tag],
      tag: el.tagName.toLowerCase(),
      type: (el.getAttribute("type") || "").toLowerCase(),
      role: (el.getAttribute("role") || "").toLowerCase(),
      text: (el.innerText || el.value || "").trim().slice(0, 60),
      name: el.getAttribute("name") || "",
      id: el.id || "",
      aria: el.getAttribute("aria-label") || "",
      href: el.getAttribute("href") || "",
      disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true",
      visible: cs.display !== "none" && cs.visibility !== "hidden" && el.offsetParent !== null,
      optionCount: el.tagName === "SELECT" ? el.options.length : 0,
    };
  });
}).catch(() => []);

const visible = controls.filter((c) => c.visible && !c.disabled);
let exercised = 0, skipped = 0;
const skippedControls = [];

for (const c of visible) {
  if (outOfTime()) {
    add("warn", "budget", `${route} — ${Math.round(BUDGET_MS / 1000)}s budget reached; stopped after ${exercised} control(s). Raise FORENSIC_BUDGET_MS or split this page.`);
    break;
  }
  const label = `${c.text || c.aria || c.name || c.id || c.tag}`.trim();
  const blob = `${c.text} ${c.name} ${c.id} ${c.aria}`;
  const isView = VIEW_ROLES.has(c.role) || c.tag === "select" || c.tag === "summary" ||
                 (c.tag === "input" && ["checkbox", "radio", "date", "search", "text"].includes(c.type)) ||
                 c.role === "tab" || c.href.startsWith("/");
  // layer 1 + 2
  if (MUTATION.test(blob) || (!isView && c.tag === "button")) {
    skipped += 1; skippedControls.push(label || c.tag);
    continue;
  }

  const before = consoleErrors.length + pageErrors.length;
  try {
    // Re-resolved every iteration from tag + ordinal: survives the client re-render
    // that a filter change triggers. A stamped attribute does not.
    const loc = page.locator(c.tag).nth(c.tagNth);
    if (c.tag === "select" && c.optionCount > 1) {
      // cycle every option — a filter that breaks on one value is the classic bug
      for (let o = 0; o < Math.min(c.optionCount, 8); o++) {
        await loc.selectOption({ index: o }, { timeout: 5000 });
        await page.waitForTimeout(SETTLE_MS);
        const broke = consoleErrors.length + pageErrors.length - before;
        if (broke > 0) add("error", "filter", `${route} — select "${label}" option ${o} raised ${broke} console/page error(s)`);
      }
    } else {
      await loc.click({ timeout: 5000, noWaitAfter: true });
      await page.waitForTimeout(SETTLE_MS);
    }
    exercised += 1;
    const broke = consoleErrors.length + pageErrors.length - before;
    if (broke > 0) add("error", "control", `${route} — "${label}" (${c.tag}) raised ${broke} console/page error(s)`);
    // a control that navigated away invalidates the rest of the sweep of this page
    if (!page.url().startsWith(url.split("?")[0])) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    }
  } catch (e) {
    add("warn", "control", `${route} — "${label}" (${c.tag}) could not be exercised: ${String(e).slice(0, 120)}`);
  }
}

if (consoleErrors.length) add("error", "console", `${route} — ${consoleErrors.length} console error(s): ${consoleErrors.slice(0, 3).join(" | ")}`);
if (pageErrors.length) add("error", "js", `${route} — ${pageErrors.length} uncaught exception(s): ${pageErrors.slice(0, 3).join(" | ")}`);
// Coverage is a first-class number: "we clicked everything safe" must not read as "everything".
add(skipped ? "warn" : "info", "coverage",
  `${route} — ${exercised}/${visible.length} controls exercised, ${skipped} skipped as mutating, ${opened} accordion(s) opened first${skipped ? `. Skipped: ${skippedControls.slice(0, 8).join(", ")}` : ""}`);

await ctx.close();
report();

function report() {
  const stamp = new Date().toISOString();
  const errors = findings.filter((f) => f.severity === "error");
  const warns = findings.filter((f) => f.severity === "warn");
  const out = { generatedAt: stamp, route, site: SITE, controls: { total: controls.length, visible: visible?.length ?? 0, exercised, skipped }, blockedWrites, findings };
  writeFileSync(join(OUT_DIR, `forensic-${stamp.slice(0, 10)}.json`), JSON.stringify(out, null, 2));
  console.log(`forensic ${stamp} route=${route}`);
  console.log(`  controls: ${exercised} exercised / ${skipped} skipped (mutating) / ${visible?.length ?? 0} visible`);
  console.log(`  errors=${errors.length} warnings=${warns.length} blockedWrites=${blockedWrites}`);
  for (const f of findings) console.log(`  [${f.severity}] ${f.area}: ${f.message}`);
  process.exit(errors.length ? 1 : 0);
}
