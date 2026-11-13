#!/usr/bin/env node
// srs-intake.mjs — one command for the manual SRS batch (docs/89, .claude/skills/srs-intake).
//
//   bash scripts/srs-intake.sh --file="<SRSICORP_...csv>" [--pdf-dir="<folder>"]
//        [--preflight-only] [--report-only] [--skip-pdfs] [--skip-qb]
//
// Run it through scripts/srs-intake.sh: that wrapper resolves the Supabase key from
// 1Password with `op run`. This script reads credentials from the environment ONLY. It
// never falls back to a .env file, because a stale .env pointing at another project is
// exactly what stopped the 2026-11-10 batch.
//
// Stages, in order. A failed preflight stops before anything is written.
//   1 preflight   key reaches the right project; every document reconciles to its printed
//                 totals; every branch code resolves to a branch with a pricing office;
//                 every document matches its PDF line for line
//   2 ingest      integrations/bridges/ingest-vendor-invoice-csv.mjs (the one writer; runs
//                 alex_no_price_triage itself)
//   3 pdfs        scripts/invoice-audit-v2/link-vendor-invoice-pdfs.mjs
//   4 audit       refresh mv_invoice_audit_line, credit_memo_claims_sync_all, credit_memo_reconcile
//   5 report      exports/srs-intake-<date>/ : REVIEW.md + report.json (candidates only —
//                 this script records no audit decision and creates no credit memo request)
//   6 qb draft    scripts/build-inv-processed-weekly.mjs, prep only. Never --stamp from here.

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const VENDOR = "srs";
const FILE = args.file && resolve(String(args.file));
if (!FILE || !existsSync(FILE)) { console.error('--file="<SRS portal csv>" is required and must exist'); process.exit(1); }
const PDF_DIR = resolve(String(args["pdf-dir"] || dirname(FILE)));

const URL_ = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!URL_ || !KEY) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not in the environment. Run via scripts/srs-intake.sh."); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rest(path, init = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path.split("?")[0]} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}
// PostgREST truncates silently at the row cap: paginate, and chunk every .in() list.
async function fetchAll(path, pageSize = 1000) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const page = await rest(`${path}${path.includes("?") ? "&" : "?"}limit=${pageSize}&offset=${from}`);
    out.push(...page);
    if (page.length < pageSize) return out;
  }
}
const inList = (vals) => `in.(${vals.map((v) => `"${String(v).replace(/"/g, "")}"`).join(",")})`;
async function fetchIn(path, column, values, size = 60) {
  const out = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(...await fetchAll(`${path}${path.includes("?") ? "&" : "?"}${column}=${encodeURIComponent(inList(values.slice(i, i + size)))}`));
  }
  return out;
}
const rpc = (fn, body = {}) => rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(body) });

const cents = (n) => Math.round((n ?? 0) * 100);
const usd = (n) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (s) => { const v = String(s ?? "").replace(/[",$\s]/g, "").replace(/(\d)-$/, "-$1"); return v === "" ? null : Number(v); };
const qtyUom = (s) => { const m = String(s ?? "").match(/([\d,.]+)\s*\/\s*([A-Z]+)/i); return m ? { qty: num(m[1]), uom: m[2].toUpperCase() } : null; };
const usDate = (s) => { const m = String(s ?? "").match(/(\d\d)\/(\d\d)\/(\d\d)(\d\d)?/); return m ? `${m[4] ? m[3] + m[4] : "20" + m[3]}-${m[1]}-${m[2]}` : null; };

function parseCsv(text) {
  const rows = []; let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ── read the CSV the same way the loader does (first INVOICE_NUMBER column wins) ─────────
function readBatch(file) {
  const rows = parseCsv(readFileSync(file, "utf8").replace(/^﻿/, ""));
  const header = rows.shift();
  const idx = {}; header.forEach((h, i) => { if (idx[h] === undefined) idx[h] = i; });
  const c = (r, name) => (idx[name] === undefined ? "" : (r[idx[name]] ?? "").trim());
  const docs = new Map(); const statement = []; let afterRule = false;
  for (const r of rows) {
    const n = c(r, "INVOICE_NUMBER");
    if (!n) {
      // Statement block: no invoice number, an amount in NET_AMOUNT_COL. A value that follows
      // a dashed rule is a total, not an open item.
      const raw = c(r, "NET_AMOUNT_COL");
      if (/^-{3,}$/.test(raw)) { afterRule = true; continue; }
      const a = num(raw);
      if (a !== null && isFinite(a)) { if (!afterRule) statement.push(a); afterRule = false; }
      continue;
    }
    if (!docs.has(n)) docs.set(n, {
      invoice_number: n, doc_type: /credit/i.test(c(r, "DOC_TYPE")) ? "credit" : "invoice",
      invoice_date: usDate(c(r, "INVOICE_DATE")), branch_key: c(r, "BRANCH_NUMBER"), return_address: c(r, "RETURN_ADDRESS"),
      po_number: c(r, "PO_NUMBER"), ship_to: c(r, "SHIPPING_ADDRESS"), total_due: num(c(r, "TOTAL_DUE")),
      lines: [], charges: {}, text: [],
    });
    const d = docs.get(n);
    const desc = c(r, "DESC_COL");
    if (desc) d.text.push(desc);
    if (c(r, "QTY_SHIP_COL") !== "" && c(r, "NET_AMOUNT_COL") !== "") {
      const price = qtyUom(c(r, "ITEM_UNIT_PRICE_COL"));
      d.lines.push({ item: desc, ship_qty: num(c(r, "QTY_SHIP_COL")), price: price?.qty ?? null, price_uom: price?.uom ?? null, extended: num(c(r, "NET_AMOUNT_COL")) });
    } else {
      const a = num(c(r, "NET_AMOUNT_COL"));
      if (a !== null && isFinite(a)) {
        const k = /SUB-TOTAL/i.test(desc) ? "subTotal" : /^DELIVERY/i.test(desc) ? "delivery" : /^FREIGHT/i.test(desc) ? "freight"
          : /^Sales Tax/i.test(desc) ? "tax" : /^RESTOCK/i.test(desc) ? "restock" : `unknown:${desc}`;
        d.charges[k] = a;
      }
    }
  }
  for (const d of docs.values()) {
    d.originals = [...new Set(d.text.flatMap((t) => [...t.matchAll(/Orig\.?\s*Inv\.?\s*#?\s*:?\s*([0-9][0-9-]{6,})/gi)].map((m) => m[1])))].filter((o) => o !== d.invoice_number);
    delete d.text;
  }
  return { docs: [...docs.values()], statement };
}

// ── PDF text, parsed with the loader's line pattern ───────────────────────────────────────
const PDF_N = String.raw`-?[\d,]*\.?\d+`;
const PDF_LINE_RE = new RegExp(String.raw`^\s*(-?\d+)\s+(-?\d+)\s+([A-Z]{2,3})\s+(\S+)\s+.*?(${PDF_N})\s*\/\s*([A-Z]+)\s+(${PDF_N})\s*\/\s*([A-Z]+)\s+(${PDF_N})\s*$`);
function readPdf(file) {
  const text = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8", maxBuffer: 64e6 });
  const lines = text.split("\n").map((l) => l.match(PDF_LINE_RE)).filter(Boolean)
    .map((m) => ({ item: m[4], ship_qty: num(m[2]), price: num(m[7]), extended: num(m[9]) }));
  return {
    invoice_number: (text.match(/Invoice #\s*:\s*(\S+)/) || [])[1] ?? null,
    branch: (text.match(/Branch\s*:\s*(\S+)/) || [])[1] ?? null,
    balance: num(((text.match(/BALANCE\s+(-?\$?-?[\d,]+\.\d{2})/) || [])[1] ?? "").replace("$", "")),
    lines,
  };
}

function reconcile(d) {
  const p = [];
  const unknown = Object.keys(d.charges).filter((k) => k.startsWith("unknown:"));
  if (unknown.length) p.push(`unrecognised footer row(s): ${unknown.map((k) => k.slice(8)).join(", ")}`);
  if (d.charges.subTotal === undefined) p.push("no SUB-TOTAL row");
  const lineSum = d.lines.reduce((s, l) => s + cents(l.extended), 0);
  if (d.charges.subTotal !== undefined && lineSum !== cents(d.charges.subTotal)) p.push(`lines ${(lineSum / 100).toFixed(2)} != SUB-TOTAL ${d.charges.subTotal.toFixed(2)}`);
  const total = cents(d.charges.subTotal) + cents(d.charges.delivery) + cents(d.charges.freight) + cents(d.charges.restock) + cents(d.charges.tax);
  if (total !== cents(d.total_due)) p.push(`SUB-TOTAL + charges ${(total / 100).toFixed(2)} != TOTAL DUE ${Number(d.total_due).toFixed(2)}`);
  return p;
}

function comparePdf(d) {
  const f = join(PDF_DIR, `invoice_${d.invoice_number}.pdf`);
  if (!existsSync(f)) return { state: "missing", problems: [] };
  const pdf = readPdf(f); const p = [];
  if (pdf.invoice_number !== d.invoice_number) p.push(`PDF invoice # ${pdf.invoice_number}`);
  if (pdf.balance === null || cents(pdf.balance) !== cents(d.total_due)) p.push(`PDF balance ${pdf.balance} vs CSV ${d.total_due}`);
  if (pdf.branch && pdf.branch !== d.branch_key) p.push(`PDF branch ${pdf.branch} vs CSV ${d.branch_key}`);
  if (pdf.lines.length !== d.lines.length) p.push(`PDF ${pdf.lines.length} lines vs CSV ${d.lines.length}`);
  else pdf.lines.forEach((l, i) => {
    const c = d.lines[i];
    if (l.item !== c.item || l.ship_qty !== c.ship_qty || Math.abs((l.price ?? 0) - (c.price ?? 0)) > 1e-6 || cents(l.extended) !== cents(c.extended))
      p.push(`line ${i + 1}: PDF ${l.item} ${l.ship_qty} @ ${l.price} = ${l.extended} vs CSV ${c.item} ${c.ship_qty} @ ${c.price} = ${c.extended}`);
  });
  return { state: p.length ? "mismatch" : "match", problems: p };
}

function run(label, cmd, argv) {
  console.log(`\n── ${label} ──`);
  const r = spawnSync(cmd, argv, { cwd: ROOT, stdio: "inherit", env: process.env });
  if (r.status !== 0) { console.error(`${label} failed (exit ${r.status}). Stopping.`); process.exit(r.status || 1); }
}

// ══ 1 preflight ═══════════════════════════════════════════════════════════════════════════
console.log("── preflight ──");
// The key must belong to the project the URL names. Compare the JWT's ref claim to the host;
// print neither.
const host = URL_.replace(/^https:\/\//, "").split(".")[0];
if (KEY.startsWith("eyJ") && KEY.split(".").length === 3) {
  let ref = null;
  try { ref = JSON.parse(Buffer.from(KEY.split(".")[1], "base64url").toString("utf8")).ref ?? null; } catch { /* opaque key */ }
  if (ref && ref !== host) { console.error("The service key belongs to a different Supabase project than SUPABASE_URL. Fix config/srs-intake.env.tpl."); process.exit(1); }
}
let vendor;
try { [vendor] = await rest(`vendors?select=id,slug&slug=eq.${VENDOR}`); }
catch (e) { console.error(`Cannot read the brain: ${e.message}\nThe key does not reach the prod brain. Nothing was written.`); process.exit(1); }
if (!vendor) { console.error(`vendor '${VENDOR}' not found. Nothing was written.`); process.exit(1); }

const { docs, statement } = readBatch(FILE);
if (!docs.length) { console.error("no documents found in the CSV"); process.exit(1); }
const sha256 = createHash("sha256").update(readFileSync(FILE)).digest("hex");
const numbers = docs.map((d) => d.invoice_number);

const aliases = await fetchAll(`vendor_branch_alias?vendor_id=eq.${vendor.id}&select=alias_key,status,vendor_branch_id`);
const codes = [...new Set(docs.map((d) => d.branch_key))];
const direct = await fetchIn(`vendor_branches?vendor_id=eq.${vendor.id}&select=id,branch_number,branch_name,pricing_territory_office_id,pricing_status`, "branch_number", codes);
const aliasIds = aliases.filter((a) => codes.includes(a.alias_key) && a.vendor_branch_id).map((a) => a.vendor_branch_id);
const viaAlias = aliasIds.length ? await fetchIn(`vendor_branches?select=id,branch_number,branch_name,pricing_territory_office_id,pricing_status`, "id", aliasIds) : [];
const offices = await fetchAll("office?select=id,name");
const officeName = new Map(offices.map((o) => [o.id, o.name]));
const branchOf = (code) => {
  const a = aliases.find((x) => x.alias_key === code && x.status === "resolved");
  const b = (a && viaAlias.find((x) => x.id === a.vendor_branch_id)) || direct.find((x) => x.branch_number === code);
  return b ? { branch: b.branch_number, name: b.branch_name, office: officeName.get(b.pricing_territory_office_id) ?? null, covered: b.pricing_status === "covered" } : null;
};

const existing = new Map((await fetchIn(`vendor_invoices?vendor_id=eq.${vendor.id}&select=invoice_number,total_due`, "invoice_number", numbers)).map((r) => [r.invoice_number, r]));
const blockers = []; const warnings = [];
for (const d of docs) {
  d.reconcile = reconcile(d);
  d.pdf = comparePdf(d);
  d.branch = branchOf(d.branch_key);
  d.already_ingested = existing.has(d.invoice_number);
  d.po_is_job = /^[A-Z]{2,4}-?\d+/i.test(d.po_number || "");
  for (const p of d.reconcile) blockers.push(`${d.invoice_number}: ${p}`);
  for (const p of d.pdf.problems) blockers.push(`${d.invoice_number}: ${p}`);
  if (!d.branch) blockers.push(`${d.invoice_number}: branch code ${d.branch_key} is unknown (printed as "${d.return_address}"). Add a vendor_branch_alias only on an exact street match, and get Chris's confirmation.`);
  else if (!d.branch.office) warnings.push(`${d.invoice_number}: branch ${d.branch.branch} has no pricing office, so every line will be No-Price`);
  if (d.pdf.state === "missing") warnings.push(`${d.invoice_number}: no PDF in ${PDF_DIR}`);
  if (d.doc_type === "invoice" && !d.po_is_job) warnings.push(`${d.invoice_number}: PO "${d.po_number}" is not a job number`);
  if (d.already_ingested && cents(existing.get(d.invoice_number).total_due) !== cents(d.total_due)) warnings.push(`${d.invoice_number}: already in the brain with a different total (${existing.get(d.invoice_number).total_due})`);
}
const invoices = docs.filter((d) => d.doc_type === "invoice"), credits = docs.filter((d) => d.doc_type === "credit");
console.log(`file ${basename(FILE)}  sha256 ${sha256.slice(0, 12)}…`);
console.log(`${invoices.length} invoices ${usd(invoices.reduce((s, d) => s + d.total_due, 0))}, ${credits.length} credit memos ${usd(credits.reduce((s, d) => s + d.total_due, 0))}, ${docs.reduce((s, d) => s + d.lines.length, 0)} lines`);
console.log(`new ${docs.filter((d) => !d.already_ingested).length}, already in the brain ${docs.filter((d) => d.already_ingested).length}; PDFs matched ${docs.filter((d) => d.pdf.state === "match").length}/${docs.length}; statement open items ${statement.length}`);
console.log(`branches: ${codes.map((c) => `${c}→${branchOf(c)?.branch ?? "UNKNOWN"}${branchOf(c)?.office ? ` (${branchOf(c).office})` : ""}`).join(", ")}`);
for (const w of warnings) console.log(`  warning  ${w}`);
if (blockers.length) {
  for (const b of blockers) console.error(`  BLOCKER  ${b}`);
  console.error(`\n${blockers.length} blocker(s). Nothing was written.`);
  process.exit(2);
}
console.log("preflight passed");
if (args["preflight-only"]) process.exit(0);

// ══ 2 ingest · 3 pdfs · 4 audit ═══════════════════════════════════════════════════════════
const REPORT_ONLY = !!args["report-only"]; // resume after an interrupted run: skips ingest and PDFs
if (!REPORT_ONLY) run("ingest", "node", ["integrations/bridges/ingest-vendor-invoice-csv.mjs", `--vendor=${VENDOR}`, `--file=${FILE}`]);
if (!REPORT_ONLY && !args["skip-pdfs"]) run("link PDFs", "node", ["scripts/invoice-audit-v2/link-vendor-invoice-pdfs.mjs", `--vendor=${VENDOR}`, `--dir=${PDF_DIR}`]);

console.log("\n── audit refresh ──");
// The refresh takes about a minute, far past the 8 s statement_timeout PostgREST gives
// service_role, so it cannot be called directly. Queue it; pg_cron job 15 services the
// queue every minute. Wait until the queue row shows a refresh newer than our request.
await rpc("request_matview_refresh", { p_matview: "mv_invoice_audit_line", p_reason: `srs intake ${basename(FILE)}`, p_by: "srs-intake" });
{
  const t0 = Date.now(); let done = false;
  while (Date.now() - t0 < 6 * 60e3) {
    const [q] = await rest("matview_refresh_request?matview_name=eq.mv_invoice_audit_line&select=requested_at,last_refreshed_at,last_duration_ms");
    if (q && q.last_refreshed_at && q.last_refreshed_at >= q.requested_at) { console.log(`matview refreshed (${q.last_duration_ms} ms)`); done = true; break; }
    await new Promise((r) => setTimeout(r, 10e3));
  }
  if (!done) { console.error("mv_invoice_audit_line was not refreshed within 6 minutes (is pg_cron job 15 running?). Re-run with --report-only once it has."); process.exit(1); }
}
// Migration 343 gives both functions a 300 s limit; without it they outrun PostgREST's 8 s.
// A timeout here is reported, not fatal: the report still builds, and the skill tells the
// operator to run the two functions in a SQL session and re-run with --report-only.
const needsSqlSession = [];
for (const fn of ["credit_memo_claims_sync_all", "credit_memo_reconcile"]) {
  try { console.log(`${fn}: ${JSON.stringify(await rpc(fn))}`); }
  catch (e) {
    if (!/57014|statement timeout/.test(e.message)) throw e;
    needsSqlSession.push(fn);
    console.log(`${fn}: TIMED OUT over the API. Run \`select public.${fn}();\` in a SQL session, then re-run with --report-only.`);
  }
}

// ══ 5 report ══════════════════════════════════════════════════════════════════════════════
console.log("\n── report ──");
const dbInv = await fetchIn(`vendor_invoices?vendor_id=eq.${vendor.id}&select=id,invoice_number,doc_type,invoice_date,branch_key,po_number,total_due,sub_total,sales_tax,raw`, "invoice_number", numbers);
if (dbInv.length !== docs.length) { console.error(`expected ${docs.length} documents in the brain, found ${dbInv.length}`); process.exit(1); }
const invById = new Map(dbInv.map((i) => [i.id, i]));
const dbLines = await fetchIn(`vendor_invoice_lines?vendor_id=eq.${vendor.id}&select=id,invoice_id,invoice_number,line_number,item_number,item_description,price_qty,price_uom,price_per_uom,extended_price`, "invoice_number", numbers);
const lineIds = dbLines.map((l) => l.id);
// The matview carries no vendor column; keep only rows that are OUR line ids.
const auditRows = (await fetchIn("mv_invoice_audit_line?select=line_id,negotiated_price,negotiated_uom,variance_ext,uom_mismatch", "line_id", lineIds, 40));
const auditBy = new Map(auditRows.map((a) => [a.line_id, a]));
const decisions = new Map((await fetchIn("v_invoice_line_audit_current?select=invoice_line_id,audit_status,decision,approved_by", "invoice_line_id", lineIds, 40)).map((r) => [r.invoice_line_id, r]));

// 150 days of the same items, this vendor, for price-drift and UOM evidence.
const items = [...new Set(dbLines.map((l) => l.item_number).filter(Boolean))];
const since = new Date(Date.now() - 150 * 864e5).toISOString().slice(0, 10);
const history = (await fetchIn(`vendor_invoice_lines?vendor_id=eq.${vendor.id}&select=id,invoice_number,item_number,price_uom,price_per_uom,price_qty,vendor_invoices!inner(invoice_date,branch_key,doc_type)&vendor_invoices.invoice_date=gte.${since}&vendor_invoices.doc_type=eq.invoice`, "item_number", items, 30))
  .map((h) => ({ ...h, date: h.vendor_invoices.invoice_date, branch: h.vendor_invoices.branch_key }));

const candidates = [];
for (const l of dbLines) {
  const inv = invById.get(l.invoice_id);
  if (inv.doc_type !== "invoice") continue;
  const a = auditBy.get(l.id);
  const base = { invoice_number: l.invoice_number, line_number: l.line_number, item_number: l.item_number, description: (l.item_description || "").split(" | ")[0], qty: Number(l.price_qty), uom: l.price_uom, billed: Number(l.price_per_uom), branch: inv.branch_key };
  if (a && Number(a.variance_ext) > 0.005) {
    candidates.push({ ...base, kind: "over_agreement", agreement_backed: true, reference: Number(a.negotiated_price), ask_pre_tax: Number(a.variance_ext), basis: `agreement price ${a.negotiated_price}/${a.negotiated_uom}` });
    continue;
  }
  if (a && a.uom_mismatch) { candidates.push({ ...base, kind: "uom_refused", agreement_backed: false, reference: Number(a.negotiated_price), ask_pre_tax: null, basis: `agreement is per ${a.negotiated_uom}; the audit refuses rather than converts` }); continue; }
  const same = history.filter((h) => h.item_number === l.item_number && h.branch === inv.branch_key && h.id !== l.id);
  const sameUom = same.filter((h) => h.price_uom === l.price_uom);
  const otherUom = same.filter((h) => h.price_uom !== l.price_uom && Math.abs(Number(h.price_per_uom) - Number(l.price_per_uom)) < 0.005);
  if (otherUom.length) {
    const o = otherUom[0];
    candidates.push({ ...base, kind: "uom_anomaly", agreement_backed: false, reference: null, ask_pre_tax: null, basis: `same ${l.price_per_uom} was billed per ${o.price_uom} on ${o.invoice_number} (${o.date}); here it is per ${l.price_uom}. Confirm the quantity received.` });
    continue;
  }
  if (a && a.negotiated_price !== null) continue; // priced at or under the agreement
  // Reference = the lowest price SRS billed for this item, unit and branch in the 45 days
  // before this invoice. A short window keeps one-off old prices from posing as the norm.
  const from = new Date(new Date(inv.invoice_date).getTime() - 45 * 864e5).toISOString().slice(0, 10);
  const prior = sameUom.filter((h) => h.date >= from && h.date <= inv.invoice_date && Number(h.price_per_uom) > 0);
  if (prior.length) {
    const low = prior.reduce((m, h) => (Number(h.price_per_uom) < Number(m.price_per_uom) ? h : m));
    const diff = Number(l.price_per_uom) - Number(low.price_per_uom);
    if (diff > 0.005) candidates.push({ ...base, kind: "price_drift", agreement_backed: false, reference: Number(low.price_per_uom), ask_pre_tax: Math.round(diff * Number(l.price_qty) * 100) / 100, basis: `no agreement price; SRS billed ${low.price_per_uom}/${low.price_uom} on ${low.invoice_number} (${low.date})` });
  }
}

// One row per item and price for people to read; report.json keeps every line.
const grouped = [...candidates.reduce((m, c) => {
  const k = c.kind === "uom_anomaly" ? `${c.kind}|${c.item_number}|${c.branch}` : `${c.kind}|${c.item_number}|${c.branch}|${c.billed}|${c.reference}`;
  if (!m.has(k)) m.set(k, { ...c, invoices: [], qty: 0, ask_pre_tax: c.ask_pre_tax === null ? null : 0 });
  const g = m.get(k);
  g.invoices.push(c.invoice_number); g.qty = Math.round((g.qty + c.qty) * 100) / 100;
  if (g.ask_pre_tax !== null) g.ask_pre_tax = Math.round((g.ask_pre_tax + (c.ask_pre_tax ?? 0)) * 100) / 100;
  return m;
}, new Map()).values()].sort((x, y) => (y.agreement_backed - x.agreement_backed) || ((y.ask_pre_tax ?? 1e9) - (x.ask_pre_tax ?? 1e9)));

const receipts = credits.length ? await fetchIn(`credit_memo_receipts?vendor_slug=eq.${VENDOR}&select=cm_invoice_number,cm_total,match_state,review_status,matched_request_id,original_invoice_number,expected_credit`, "cm_invoice_number", credits.map((c) => c.invoice_number)) : [];
const creditReview = credits.map((c) => {
  const r = receipts.find((x) => x.cm_invoice_number === c.invoice_number);
  const named = c.originals;
  const belongs = !!(r && r.matched_request_id && named.includes(r.original_invoice_number));
  const preTaxEqual = !!(r && belongs && r.expected_credit !== null && cents(-(c.charges.subTotal ?? 0)) === cents(r.expected_credit));
  return {
    cm_invoice_number: c.invoice_number, total: c.total_due, sub_total: c.charges.subTotal ?? null, names_invoices: named, po_number: c.po_number,
    receipt_state: r?.match_state ?? "no receipt row", review_status: r?.review_status ?? null, linked_request_invoice: r?.matched_request_id ? r.original_invoice_number : null, expected_credit: r?.expected_credit ?? null,
    suggestion: !r ? "no receipt row was created; check the reconcile output"
      : preTaxEqual ? "satisfies the linked request: the credit before tax equals the expected credit"
      : belongs ? "names the linked request's invoice but the amount differs; a person decides"
      : r.matched_request_id ? "does NOT belong to the linked request (it names a different invoice or none); treat as a return or unrequested credit"
      : "no open request; a return or unrequested credit",
  };
});

// ══ 6 QB draft (prep only) ════════════════════════════════════════════════════════════════
if (!args["skip-qb"]) run("QB draft (prep only, nothing stamped)", "node", ["scripts/build-inv-processed-weekly.mjs"]);
const weekly = await fetchAll(`v_inv_processed_weekly?vendor_slug=eq.${VENDOR}&select=invoice_number,invoice_date,total_due,disposition`);
const weeklySet = new Set(weekly.map((w) => w.invoice_number));
const batchSet = new Set(numbers);
const pool = new Map(); for (const a of statement) pool.set(cents(a), (pool.get(cents(a)) ?? 0) + 1);
const carried = weekly.filter((w) => !batchSet.has(w.invoice_number)).sort((x, y) => x.invoice_date.localeCompare(y.invoice_date));
// Batch documents claim their statement rows first, so a carried row cannot borrow one.
for (const d of docs) { const k = cents(d.total_due); if (pool.get(k) > 0) pool.set(k, pool.get(k) - 1); }
const carriedOff = []; const carriedOn = [];
for (const w of carried) { const k = cents(w.total_due); if (pool.get(k) > 0) { pool.set(k, pool.get(k) - 1); carriedOn.push(w); } else carriedOff.push(w); }
const sum = (rows) => rows.reduce((s, r) => s + Number(r.total_due), 0);
const qb = {
  rows: weekly.length, value: sum(weekly),
  new_rows: weekly.filter((w) => batchSet.has(w.invoice_number)).length, new_value: sum(weekly.filter((w) => batchSet.has(w.invoice_number))),
  held_out: invoices.filter((d) => !weeklySet.has(d.invoice_number)).map((d) => ({ invoice_number: d.invoice_number, total_due: d.total_due })),
  carried_rows: carried.length, carried_value: sum(carried),
  statement_available: statement.length > 0,
  carried_on_statement: { rows: carriedOn.length, value: sum(carriedOn) },
  carried_off_statement: { rows: carriedOff.length, value: sum(carriedOff), first: carriedOff[0]?.invoice_date ?? null, last: carriedOff.at(-1)?.invoice_date ?? null },
};

const status = { passed_by_alex: 0, priced_ok: 0, over: 0, other_pending: 0 };
for (const l of dbLines) {
  if (invById.get(l.invoice_id).doc_type !== "invoice") continue;
  const a = auditBy.get(l.id), dcs = decisions.get(l.id);
  if (a && Number(a.variance_ext) > 0.005) status.over++;
  else if (a && a.negotiated_price !== null) status.priced_ok++;
  else if (dcs?.audit_status === "passed") status.passed_by_alex++;
  else status.other_pending++;
}

const stamp = new Date().toISOString().slice(0, 10);
const outDir = resolve(ROOT, "exports", `srs-intake-${stamp}`);
mkdirSync(outDir, { recursive: true });
const report = {
  file: basename(FILE), sha256, run_at: new Date().toISOString(),
  counts: { invoices: invoices.length, invoice_value: sum(invoices), credit_memos: credits.length, credit_value: sum(credits), lines: dbLines.length },
  needs_sql_session: needsSqlSession,
  branches: codes.map((c) => ({ code: c, ...branchOf(c) })), warnings, audit: status, candidates: grouped, candidate_lines: candidates, credits: creditReview, qb,
  documents: docs.map((d) => ({ invoice_number: d.invoice_number, doc_type: d.doc_type, invoice_date: d.invoice_date, branch_key: d.branch_key, po_number: d.po_number, po_is_job: d.po_is_job, total_due: d.total_due, lines: d.lines.length, pdf: d.pdf.state, was_already_ingested: d.already_ingested })),
};
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2) + "\n");

const kindLabel = { over_agreement: "Over agreement", price_drift: "Price moved, no agreement", uom_anomaly: "Unit of measure looks wrong", uom_refused: "Agreement is in a different unit" };
const md = [
  `# SRS intake review — ${stamp}`, "",
  `Source: \`${basename(FILE)}\` (sha256 \`${sha256.slice(0, 12)}…\`). Generated by \`scripts/srs-intake.sh\`. Candidates only: no audit decision, credit memo request or receipt disposition was recorded.`, "",
  ...(needsSqlSession.length ? [`**Not run: ${needsSqlSession.join(", ")} timed out over the API.** The credit sections below may be stale until they are run in a SQL session and this report is rebuilt with \`--report-only\`.`, ""] : []),
  "## Ingest", "",
  `- ${invoices.length} invoices (${usd(sum(invoices))}), ${credits.length} credit memos (${usd(sum(credits))}), ${dbLines.length} lines.`,
  "- Every document reconciles to its printed sub-total and total.",
  `- PDFs matched line for line: ${docs.filter((d) => d.pdf.state === "match").length} of ${docs.length}.`,
  `- Branches: ${report.branches.map((b) => `${b.code} → ${b.branch} (${b.office ?? "no pricing office"})`).join("; ")}.`,
  ...(warnings.length ? ["", "Warnings:", ...warnings.map((w) => `- ${w}`)] : []), "",
  "## Audit", "",
  "| Invoice lines | Count |", "|---|---:|",
  `| No agreement price, passed by the No-Price triage | ${status.passed_by_alex} |`,
  `| At or under the agreement price | ${status.priced_ok} |`,
  `| Over the agreement price | ${status.over} |`,
  `| Still pending for another reason | ${status.other_pending} |`, "",
  "## Credit memo candidates", "",
  grouped.length ? "| Item | Invoices | Qty | Billed | Reference | Pre-tax ask | Type | Basis |" : "None found.",
  ...(grouped.length ? ["|---|---|---:|---:|---:|---:|---|---|", ...grouped.map((c) => `| ${c.item_number} ${c.description} | ${[...new Set(c.invoices)].join(", ")} | ${c.kind === "uom_anomaly" ? "—" : `${c.qty} ${c.uom}`} | ${usd(c.billed)} | ${c.reference === null ? "—" : usd(c.reference)} | ${c.ask_pre_tax === null ? "confirm" : usd(c.ask_pre_tax)} | ${kindLabel[c.kind]}${c.agreement_backed ? " (agreement-backed)" : ""} | ${c.basis} |`)] : []), "",
  "Only agreement-backed rows can go through the credit packet generator. The others need a yes or no from a person first.", "",
  "## Credits received", "",
  creditReview.length ? "| Credit | Total | Names invoice(s) | Receipt state | Linked request | Suggestion |" : "No credit memos in this batch.",
  ...(creditReview.length ? ["|---|---:|---|---|---|---|", ...creditReview.map((c) => `| ${c.cm_invoice_number} | ${usd(c.total)} | ${c.names_invoices.join(", ") || "none"} | ${c.receipt_state} | ${c.linked_request_invoice ? `${c.linked_request_invoice} (${usd(Number(c.expected_credit))})` : "—"} | ${c.suggestion} |`)] : []), "",
  "## QuickBooks draft", "",
  `SRS file: ${qb.rows} invoices, ${usd(qb.value)}. Prep only; nothing stamped.`, "",
  `- New in this batch: ${qb.new_rows} (${usd(qb.new_value)}).`,
  `- Carried over, never stamped: ${qb.carried_rows} (${usd(qb.carried_value)}).`,
  ...(qb.statement_available ? [`- Of the carried-over rows, ${qb.carried_on_statement.rows} (${usd(qb.carried_on_statement.value)}) are still open on the statement in this CSV; ${qb.carried_off_statement.rows} (${usd(qb.carried_off_statement.value)}${qb.carried_off_statement.first ? `, dated ${qb.carried_off_statement.first} to ${qb.carried_off_statement.last}` : ""}) are not. Check QuickBooks for those before loading.`] : ["- This CSV has no statement block, so open/closed status of carried-over rows is unknown."]),
  ...(qb.held_out.length ? [`- Batch invoices not in the file: ${qb.held_out.map((h) => `${h.invoice_number} (${usd(h.total_due)})`).join(", ")}. Each has an undecided over-agreement line.`] : []),
  "- Credit memos are excluded by contract.", "",
].join("\n");
writeFileSync(join(outDir, "REVIEW.md"), md + "\n");
console.log(`candidates ${grouped.length} (${grouped.filter((c) => c.agreement_backed).length} agreement-backed, ${candidates.length} lines); credits ${creditReview.length}; QB rows ${qb.rows} (${qb.new_rows} new)`);
console.log(`written -> ${outDir}/REVIEW.md, report.json`);
