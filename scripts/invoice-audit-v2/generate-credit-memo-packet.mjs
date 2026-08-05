#!/usr/bin/env node
// generate-credit-memo-packet.mjs — Invoice Audit v2 (docs/81 §3 decision 8)
// Builds the weekly, vendor-specific credit memo request packet from a re-audit run:
//   HTML email draft + MD version + line-detail CSV + week-scoped tracker CSV.
// Vendor-specific emails; spreadsheets/CSVs are cross-vendor per docs/81.
// Nothing sends from here — output is drafts for the human verifiers (Chris & Lucinda).
//
//   node scripts/invoice-audit-v2/generate-credit-memo-packet.mjs \
//     --run=wave_b_2026-08-05_r3 [--vendor=abc] [--outdir=outputs/credit-memo-YYYY-MM-DD]
//
// Line floor: credits under $0.05 are rounding artifacts and excluded upstream.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);

function parseDotenv(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      out[m[1]] = v;
    }
  } catch {}
  return out;
}

const env = { ...parseDotenv(resolve(ROOT, ".env")), ...process.env };
const SUPABASE_URL = (env.SUPABASE_URL || env.PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !KEY) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const argOf = (name, dflt) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=").slice(1).join("=") : dflt;
};
const RUN = argOf("run");
const VENDOR = argOf("vendor", "abc");
const VENDOR_LABEL = { abc: "ABC Supply", qxo: "QXO", srs: "SRS Distribution" }[VENDOR] || VENDOR;
if (!RUN) { console.error("--run=<run_label> required"); process.exit(1); }
const today = new Date().toISOString().slice(0, 10);
const OUTDIR = resolve(ROOT, argOf("outdir", `outputs/credit-memo-${today}`));

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, authorization: `Bearer ${KEY}`, prefer: "count=exact" },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

// PostgREST caps at 1000 rows; page defensively (memory: postgrest-silent-truncation)
async function restAll(path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const page = await rest(`${path}${path.includes("?") ? "&" : "?"}limit=1000&offset=${from}`);
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

const money = (n) => `$${Number(n).toFixed(2)}`;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const lines = (await restAll(
  `invoice_line_reaudit?run_label=eq.${encodeURIComponent(RUN)}&classification=eq.discrepancy` +
  `&select=invoice_number,item_number,item_description,quantity,uom,invoiced_price,office_name,` +
  `office_price,variance_ext,match_method,agreement_number,agreement_effective,agreement_expiry,paexp_tag` +
  `&order=invoice_number.asc,variance_ext.desc`
)).filter((l) => Number(l.variance_ext) >= 0.05);

if (!lines.length) { console.error(`No discrepancy lines for run ${RUN}`); process.exit(1); }

const invNums = [...new Set(lines.map((l) => l.invoice_number))];
const invMeta = Object.fromEntries(
  (await restAll(`abc_invoices?invoice_number=in.(${invNums.map((n) => `"${n}"`).join(",")})&select=invoice_number,invoice_date`))
    .map((r) => [r.invoice_number, (r.invoice_date || "").slice(0, 10)])
);

const byInvoice = new Map();
for (const l of lines) {
  if (!byInvoice.has(l.invoice_number)) byInvoice.set(l.invoice_number, []);
  byInvoice.get(l.invoice_number).push(l);
}
const invTotal = (inv) => byInvoice.get(inv).reduce((s, l) => s + Number(l.variance_ext), 0);
const grandTotal = invNums.reduce((s, n) => s + invTotal(n), 0);

const reasonFor = (l) => {
  const eff = `${l.agreement_effective}${l.agreement_expiry ? ` to ${l.agreement_expiry}` : ""}`;
  const pct = ((Number(l.invoiced_price) - Number(l.office_price)) / Number(l.office_price) * 100).toFixed(1);
  let r = `Billed ${money(l.invoiced_price)} against ${money(l.office_price)} on the ${l.office_name} office price agreement ` +
          `${l.agreement_number} (eff. ${eff}) - overcharge ${pct}%.`;
  if (l.paexp_tag) r += ` The agreement had lapsed without a successor and remains in force per our supply arrangement (${l.paexp_tag}).`;
  if (l.match_method !== "item_number") r += ` Matched by ${l.match_method === "item_family" ? "item family" : "product description"}.`;
  return r;
};

mkdirSync(OUTDIR, { recursive: true });

// ---------- HTML email ----------
let html = `<!doctype html><meta charset="utf-8"><title>Credit memo request - ${VENDOR_LABEL}</title><body style="margin:24px;background:#fff">`;
html += `<p style="font-family:Arial;font-size:13px;color:#888">Subject: Credit memo request - Pro Exteriors LLC - ${invNums.length} invoices, ${money(grandTotal)}<br>Select all below, copy, paste into Gmail.</p><hr>`;
html += `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.5;max-width:760px">`;
html += `<p>Casey,</p>`;
html += `<p>Following your challenge to our July 28 request, we have completed a full line-by-line re-audit. Every invoice below has been re-priced against the price agreement in force for its own Pro Exteriors office location on the invoice date, rather than the pooled benchmark we used previously. This request supersedes the July 28 request ($1,941.44) in its entirety.</p>`;
html += `<p>We are requesting credit memos on ${lines.length} lines across ${invNums.length} invoices. Total credit requested: <b>${money(grandTotal)}</b>. Detail and per-line reasoning are listed by invoice, and the same detail is attached as a spreadsheet.</p>`;
html += `<p>Where an agreement lapsed with no successor in place, we have priced against that agreement, which remains in force for the location until replaced; those lines are marked with a PAEXP reference.</p>`;
html += `<p>Please issue the credits against the original invoice numbers and confirm, so we can clear them from our pending schedule.</p>`;
for (const inv of invNums) {
  html += `<p style="margin:22px 0 6px;font-size:15px"><b>Invoice ${esc(inv)}</b>${invMeta[inv] ? ` (${invMeta[inv]})` : ""} &nbsp;&mdash;&nbsp; credit requested: <b>${money(invTotal(inv))}</b></p>`;
  html += `<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #d0d0d0"><tr style="background:#f2f2f2"><th align="left" style="border:1px solid #d0d0d0">Item</th><th align="right" style="border:1px solid #d0d0d0">Qty</th><th align="right" style="border:1px solid #d0d0d0">Invoiced</th><th align="right" style="border:1px solid #d0d0d0">Agreement price</th><th align="right" style="border:1px solid #d0d0d0">Credit</th></tr>`;
  for (const l of byInvoice.get(inv)) {
    html += `<tr><td style="border:1px solid #d0d0d0">${esc(l.item_description)}<br><span style="color:#666;font-size:12px">${esc(reasonFor(l))}</span></td>` +
      `<td align="right" style="border:1px solid #d0d0d0">${Number(l.quantity)}</td>` +
      `<td align="right" style="border:1px solid #d0d0d0">${money(l.invoiced_price)}</td>` +
      `<td align="right" style="border:1px solid #d0d0d0">${money(l.office_price)}</td>` +
      `<td align="right" style="border:1px solid #d0d0d0"><b>${money(l.variance_ext)}</b></td></tr>`;
  }
  html += `</table>`;
}
html += `<p>Thanks,</p><p>[Name]<br>Pro Exteriors LLC - Accounts Payable</p></div></body>`;
writeFileSync(resolve(OUTDIR, `credit_memo_request_email_${VENDOR}.html`), html);

// ---------- MD ----------
let md = `# Credit Memo Request - ${VENDOR_LABEL} - ${today}\n\n`;
md += `Supersedes the 2026-07-28 batch request ($1,941.44, challenged). Re-audited line-by-line against each invoice's own PE office price agreement in force at invoice date (run \`${RUN}\`).\n\n`;
md += `**${lines.length} lines across ${invNums.length} invoices — total credit requested: ${money(grandTotal)}**\n\n`;
for (const inv of invNums) {
  md += `## Invoice ${inv}${invMeta[inv] ? ` (${invMeta[inv]})` : ""} — ${money(invTotal(inv))}\n\n`;
  md += `| Item | Qty | Invoiced | Agreement price | Credit | Basis |\n|---|---:|---:|---:|---:|---|\n`;
  for (const l of byInvoice.get(inv)) {
    md += `| ${l.item_description} | ${Number(l.quantity)} | ${money(l.invoiced_price)} | ${money(l.office_price)} | **${money(l.variance_ext)}** | ${reasonFor(l)} |\n`;
  }
  md += `\n`;
}
writeFileSync(resolve(OUTDIR, `credit_memo_request_${VENDOR}.md`), md);

// ---------- detail CSV (cross-vendor columns; this run is single-vendor) ----------
const detailHdr = ["Vendor","Invoice #","Invoice Date","PE Office","Item #","Item Description","Qty","UOM",
  "Invoiced Price","Agreement Price","Line Credit","Agreement #","Agreement Effective","Agreement Expiry","Match Method","PAEXP Tag"];
let detail = detailHdr.join(",") + "\n";
for (const l of lines) {
  detail += [VENDOR_LABEL, l.invoice_number, invMeta[l.invoice_number] || "", l.office_name, l.item_number,
    l.item_description, Number(l.quantity), l.uom, Number(l.invoiced_price).toFixed(2), Number(l.office_price).toFixed(2),
    Number(l.variance_ext).toFixed(2), l.agreement_number, l.agreement_effective || "", l.agreement_expiry || "",
    l.match_method, l.paexp_tag || ""].map(csvCell).join(",") + "\n";
}
writeFileSync(resolve(OUTDIR, "credit_memo_request_detail.csv"), detail);

// ---------- tracker CSV (this week's CM invoices only; date = email generated) ----------
let tracker = "Vendor,Invoice #,Requested Credit Memo Total,Date Credit Memo Email Generated\n";
for (const inv of invNums) tracker += [VENDOR_LABEL, inv, invTotal(inv).toFixed(2), today].map(csvCell).join(",") + "\n";
writeFileSync(resolve(OUTDIR, "credit_memo_request_tracker.csv"), tracker);

console.log(JSON.stringify({
  run: RUN, vendor: VENDOR, outdir: OUTDIR,
  invoices: invNums.length, lines: lines.length, total: Number(grandTotal.toFixed(2)),
  files: [`credit_memo_request_email_${VENDOR}.html`, `credit_memo_request_${VENDOR}.md`,
          "credit_memo_request_detail.csv", "credit_memo_request_tracker.csv"],
}, null, 2));
