#!/usr/bin/env node
// Ingest QXO / SRS portal CSV exports (Billtrust-style denormalized) into
// vendor_invoices + vendor_invoice_lines (+ AR fields from QXO statements).
// docs/80 §2-§5. Idempotent: upserts on (vendor_id, account_number, invoice_number);
// lines are replaced per invoice on re-parse (delete+insert inside the invoice only).
//
// Usage:
//   node integrations/bridges/ingest-vendor-invoice-csv.mjs --vendor=srs --file=<detail.csv>
//   node integrations/bridges/ingest-vendor-invoice-csv.mjs --vendor=qxo --file=<detail.csv>
//   node integrations/bridges/ingest-vendor-invoice-csv.mjs --vendor=qxo --statement --file=<statement.csv>
//   node integrations/bridges/ingest-vendor-invoice-csv.mjs --vendor=srs --pdf --file=<invoice.pdf>
//
// The --pdf arm exists because the SRS portal CSV is a bulk export; single invoices also
// arrive as PDFs in the accounting mailbox. It parses to the SAME normalized rows and
// writes through the SAME upsertInvoice/replaceLines/upsertUomEvidence, so there is one
// writer and one contract (docs/80). It is STRICTLY reconciled: the parsed lines must sum
// to the printed SUB-TOTAL and SUB-TOTAL + charges + tax must equal the printed BALANCE,
// or nothing is written. Prefer the CSV when you have it — the PDF truncates PO NUMBER to
// 16 characters, and that field is the AccuLynx job key.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

function parseDotenv(path) {
  try {
    const out = {};
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch { return {}; }
}
const env = { ...parseDotenv(resolve(ROOT, ".env")), ...process.env };
const URL_ = (env.SUPABASE_URL || env.PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function rest(path, init = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...HEADERS, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path} -> ${res.status}: ${await res.text()}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

// RFC-4180-ish CSV parser (quoted fields, embedded commas/quotes/newlines).
function parseCsv(text) {
  const rows = []; let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
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

const num = (s) => { const v = String(s ?? "").replace(/[",$\s]/g, "").replace(/(\d)-$/, "-$1"); return v === "" ? null : Number(v); };
const usDate = (s) => { const m = String(s ?? "").match(/(\d\d)\/(\d\d)\/(\d\d)(\d\d)?/); if (!m) return null; const yy = m[4] ? `${m[3]}${m[4]}` : `20${m[3]}`; return `${yy}-${m[1]}-${m[2]}`; };
// "42.00 /SQ" -> {qty:42, uom:"SQ"}
const qtyUom = (s) => { const m = String(s ?? "").match(/([\d,.]+)\s*\/\s*([A-Z]+)/i); return m ? { qty: num(m[1]), uom: m[2].toUpperCase() } : null; };

async function registerUpload(vendorId, file, kind, rowsParsed, status, error) {
  const sha = createHash("sha256").update(readFileSync(file)).digest("hex");
  const existing = await rest(`vendor_invoice_uploads?select=id&vendor_id=eq.${vendorId}&sha256=eq.${sha}`);
  if (existing.length) {
    await rest(`vendor_invoice_uploads?id=eq.${existing[0].id}`, { method: "PATCH", body: JSON.stringify({ parse_status: status, rows_parsed: rowsParsed, parse_error: error ?? null, parsed_at: new Date().toISOString() }), headers: { Prefer: "return=minimal" } });
    return existing[0].id;
  }
  const [row] = await rest("vendor_invoice_uploads", { method: "POST", body: JSON.stringify({ vendor_id: vendorId, file_name: basename(file), file_kind: kind, sha256: sha, source: "manual", parse_status: status, rows_parsed: rowsParsed, parse_error: error ?? null, parsed_at: new Date().toISOString() }), headers: { Prefer: "return=representation" } });
  return row.id;
}

function groupDetail(rows, header, cfg) {
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const col = (r, name) => (idx[name] === undefined ? "" : (r[idx[name]] ?? "").trim());
  const invoices = new Map();
  for (const r of rows) {
    const invNum = col(r, cfg.invoiceCol);
    if (!invNum) continue;
    if (!invoices.has(invNum)) invoices.set(invNum, { header: r, lines: [], notes: [] });
    const inv = invoices.get(invNum);
    const isLine = cfg.isLineRow(col, r);
    if (isLine) inv.lines.push({ row: r, extraDesc: [] });
    else {
      const d = col(r, cfg.descCol);
      if (d) (inv.lines.length ? inv.lines[inv.lines.length - 1].extraDesc : inv.notes).push(d);
    }
  }
  return { invoices, col };
}

async function upsertInvoice(payload) {
  const [row] = await rest(`vendor_invoices?on_conflict=vendor_id,account_number,invoice_number`, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  });
  return row;
}

async function replaceLines(invoiceId, lines) {
  // Scoped delete inside one invoice only (re-parse path), then insert.
  await rest(`vendor_invoice_lines?invoice_id=eq.${invoiceId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  if (lines.length) await rest("vendor_invoice_lines", { method: "POST", body: JSON.stringify(lines), headers: { Prefer: "return=minimal" } });
}

async function upsertUomEvidence(vendorId, item, shipUom, priceUom, factor) {
  if (!item || !shipUom || !priceUom || shipUom === priceUom || !factor || !isFinite(factor)) return;
  await rest(`vendor_item_uom_map?on_conflict=vendor_id,item_number,ship_uom,price_uom`, {
    method: "POST",
    body: JSON.stringify({ vendor_id: vendorId, item_number: item, ship_uom: shipUom, price_uom: priceUom, units_per_price_uom: Number(factor.toFixed(6)), source: "invoice_native", updated_at: new Date().toISOString() }),
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  });
}

async function ingestSrsDetail(vendorId, file) {
  const rows = parseCsv(readFileSync(file, "utf8"));
  const header = rows.shift();
  const { invoices, col } = groupDetail(rows, header, {
    invoiceCol: "INVOICE_NUMBER",
    descCol: "DESC_COL",
    isLineRow: (c, r) => c(r, "QTY_SHIP_COL") !== "" && c(r, "NET_AMOUNT_COL") !== "",
  });
  let n = 0;
  for (const [invNum, inv] of invoices) {
    const h = inv.header, c = (name) => col(h, name);
    const terms = c("TERMS");
    const invoice = await upsertInvoice({
      vendor_id: vendorId,
      account_number: c("ACCOUNT_NUMBER"),
      invoice_number: invNum,
      doc_type: /credit/i.test(c("DOC_TYPE")) ? "credit" : "invoice",
      invoice_date: usDate(c("INVOICE_DATE")),
      due_date: usDate((terms.match(/Due Date:\s*([\d/]+)/) || [])[1]),
      order_date: usDate(c("ORDER_DATE")),
      ship_date: usDate(c("SHIP_DATE")),
      branch_key: c("BRANCH_NUMBER") || null,
      po_number: c("PO_NUMBER") || null,
      ship_to_text: c("SHIPPING_ADDRESS") || null,
      salesperson: c("SALESPERSON") || null,
      terms: terms || null,
      ship_via: c("SHIP_VIA") || null,
      order_type: c("ORDER_TYPE") || null,
      total_due: num(c("TOTAL_DUE")),
      raw: { return_address: c("RETURN_ADDRESS"), notes: inv.notes, source_file: basename(file) },
      updated_at: new Date().toISOString(),
    });
    const lines = [];
    for (const [i, ln] of inv.lines.entries()) {
      const r = ln.row, cc = (name) => col(r, name);
      const conv = qtyUom(cc("QTY_CONVERTED_COL"));
      const price = qtyUom(cc("ITEM_UNIT_PRICE_COL"));
      const shipQty = num(cc("QTY_SHIP_COL"));
      const shipUom = cc("UM_ORDER_COL") || null;
      lines.push({
        vendor_id: vendorId, invoice_id: invoice.id, invoice_number: invNum, line_number: i + 1,
        item_number: cc("DESC_COL") || null,
        item_description: ln.extraDesc.join(" | ") || null,
        ship_qty: shipQty, ship_uom: shipUom,
        price_qty: conv?.qty ?? shipQty, price_uom: conv?.uom ?? shipUom,
        price_per_uom: price?.qty ?? null,
        unit_price: price?.qty ?? null,
        extended_price: num(cc("NET_AMOUNT_COL")),
        uom_source: "vendor_native",
      });
      if (conv && shipQty && conv.qty) await upsertUomEvidence(vendorId, cc("DESC_COL"), shipUom, conv.uom, shipQty / conv.qty);
    }
    await replaceLines(invoice.id, lines);
    n++;
  }
  return { invoices: n };
}

// ── SRS invoice PDF ────────────────────────────────────────────────────────────
// Same output shape as ingestSrsDetail. Layout text from `pdftotext -layout`.

// Centered fixed-width header tables ("PO NUMBER / REFERENCE NUMBER / JOB NUMBER / ...")
// are sliced on midpoints between header-token centres; splitting on whitespace
// misaligns the moment a column is blank, which is common (no REFERENCE, no JOB).
function sliceByHeader(headerLine, valueLine, tokens) {
  const centers = [];
  let from = 0;
  for (const t of tokens) {
    const i = headerLine.indexOf(t, from);
    if (i < 0) { centers.push(null); continue; }
    centers.push(i + t.length / 2);
    from = i + t.length;
  }
  const out = {};
  tokens.forEach((t, k) => {
    if (centers[k] === null) { out[t] = ""; return; }
    const prev = centers.slice(0, k).filter((c) => c !== null).pop();
    const next = centers.slice(k + 1).find((c) => c !== null);
    const lo = prev === undefined ? 0 : Math.ceil((prev + centers[k]) / 2);
    const hi = next === undefined ? valueLine.length : Math.floor((centers[k] + next) / 2);
    out[t] = valueLine.slice(lo, hi).trim();
  });
  return out;
}

// SRS prints a 0.01 converted qty as ".01 /BD" (invoice 0050471744-001, TOP4X4X8SFTER).
// Requiring a digit before the decimal silently drops that line — the invoice then misses
// SUB-TOTAL by exactly its $0.89, which is why the reconciliation gate below exists.
const PDF_N = String.raw`-?[\d,]*\.?\d+`;
const PDF_LINE_RE = new RegExp(String.raw`^\s*(-?\d+)\s+(-?\d+)\s+([A-Z]{2,3})\s+(\S+)\s+.*?(${PDF_N})\s*\/\s*([A-Z]+)\s+(${PDF_N})\s*\/\s*([A-Z]+)\s+(${PDF_N})\s*$`);
const PDF_CHARGE_RE = /^\s*(\*+SUB-TOTAL\*+|DELIVERY CHARGE|FREIGHT CHARGE|Sales Tax|RESTOCK[^\d]*)\s+.*?(-?[\d,]+\.\d{2})\s*$/i;
const PDF_NOISE = /^\s*(Page \d+ of \d+|TO VIEW AND PAY|TERMS:|BALANCE|QTY|ORDERED\s+SHIPPED|UOM\s+ITEM|Invoice # :|Invoice Date :|Account # :|Branch :|Phone # :|Fax # :|Delivery # :|REMIT TO:|BILL TO:|SHIP TO:|PO NUMBER|AGENTS|SRS BUILDING|P\.O\. BOX|DALLAS, TX 75284|PRO EXTERIORS|FAX|Phone:|INVOICE\s*$|CREDIT MEMO\s*$)/i;

function parseSrsInvoicePdf(file) {
  const text = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8", maxBuffer: 64e6 });
  const lines = text.split("\n");
  const grab = (re) => { for (const l of lines) { const m = l.match(re); if (m) return m[1].trim(); } return null; };

  const terms = grab(/^TERMS:\s*(.+)$/);
  const head = {
    docType: /CREDIT\s+MEMO/i.test(text) ? "credit" : "invoice",
    invoiceNumber: grab(/Invoice #\s*:\s*(\S+)/),
    invoiceDate: usDate(grab(/Invoice Date\s*:\s*(\S+)/)),
    account: grab(/Account #\s*:\s*(\S+)/),
    branch: grab(/Branch\s*:\s*(\S+)/),
    terms,
    dueDate: usDate((String(terms ?? "").match(/Due Date:\s*([\d/]+)/) || [])[1]),
    balance: num((text.match(/BALANCE\s+(-?\$[\d,]+\.\d{2})/) || [])[1]?.replace("$", "")),
  };

  // Header tables repeat on every page; take the first and remember the value-line indices
  // so they are not mistaken for line-item descriptions.
  const valueLineIdx = new Set();
  const table = (probe, tokens) => {
    const i = lines.findIndex(probe);
    if (i < 0) return {};
    lines.forEach((l, k) => { if (probe(l, k)) valueLineIdx.add(k + 1); });
    return sliceByHeader(lines[i], lines[i + 1] ?? "", tokens);
  };
  const t1 = table((l) => /PO NUMBER/.test(l) && /ORDER DATE/.test(l),
    ["PO NUMBER", "REFERENCE NUMBER", "JOB NUMBER", "ORDER DATE", "SHIP DATE", "SALES"]);
  const t2 = table((l) => /AGENTS/.test(l) && /ORDER TYPE/.test(l),
    ["AGENTS", "ORDER TYPE", "ORDERED BY", "SHIP VIA", "FREIGHT TERM", "CREATED BY"]);

  const shipTo = (() => {
    const i = lines.findIndex((l) => /SHIP TO:/.test(l));
    if (i < 0) return null;
    const at = lines[i].indexOf("SHIP TO:");
    return lines.slice(i + 1, i + 6).map((l) => l.slice(at).trim()).filter(Boolean).join(", ") || null;
  })();

  const items = [], notes = [], charges = {};
  lines.forEach((raw, k) => {
    const m = raw.match(PDF_LINE_RE);
    if (m) {
      items.push({
        qtyOrdered: num(m[1]), shipQty: num(m[2]), shipUom: m[3], itemNumber: m[4],
        priceQty: num(m[5]), priceQtyUom: m[6], pricePerUom: num(m[7]), priceUom: m[8],
        extended: num(m[9]), desc: [],
      });
      return;
    }
    const c = raw.match(PDF_CHARGE_RE);
    if (c) {
      const k2 = /SUB-TOTAL/i.test(c[1]) ? "subTotal" : /DELIVERY/i.test(c[1]) ? "delivery"
        : /FREIGHT/i.test(c[1]) ? "freight" : /Sales Tax/i.test(c[1]) ? "tax" : "restock";
      charges[k2] = num(c[2]);
      return;
    }
    const t = raw.trim();
    if (!t || PDF_NOISE.test(raw) || valueLineIdx.has(k)) return;
    if (items.length) items[items.length - 1].desc.push(t);
    else if (/Order Notes:|^DROP /i.test(t)) notes.push(t);
  });

  return { ...head, poNumber: t1["PO NUMBER"] || null, referenceNumber: t1["REFERENCE NUMBER"] || null,
    jobNumber: t1["JOB NUMBER"] || null, orderDate: usDate(t1["ORDER DATE"]), shipDate: usDate(t1["SHIP DATE"]),
    salesperson: t1["SALES"] || null, agents: t2["AGENTS"] || null, orderType: t2["ORDER TYPE"] || null,
    orderedBy: t2["ORDERED BY"] || null, shipVia: t2["SHIP VIA"] || null, createdBy: t2["CREATED BY"] || null,
    shipTo, items, charges, notes };
}

// A parsed PDF is only trustworthy if the vendor's own printed arithmetic reproduces.
// Both checks must hold or the document is refused — a silently dropped line is a silently
// understated invoice, and this pipeline feeds price audits and credit-memo claims.
function reconcileSrsPdf(p) {
  const cents = (n) => Math.round((n ?? 0) * 100);
  const lineSum = cents(p.items.reduce((s, i) => s + (i.extended ?? 0), 0));
  const sub = cents(p.charges.subTotal);
  const total = sub + cents(p.charges.delivery) + cents(p.charges.freight)
    + cents(p.charges.restock) + cents(p.charges.tax);
  const problems = [];
  if (!p.invoiceNumber) problems.push("no invoice number found");
  if (!p.items.length) problems.push("no line items parsed");
  if (p.charges.subTotal === undefined) problems.push("no SUB-TOTAL printed");
  else if (lineSum !== sub) problems.push(`lines ${(lineSum / 100).toFixed(2)} != SUB-TOTAL ${(sub / 100).toFixed(2)}`);
  if (p.balance === null || p.balance === undefined) problems.push("no BALANCE printed");
  else if (total !== cents(p.balance)) problems.push(`SUB-TOTAL+charges ${(total / 100).toFixed(2)} != BALANCE ${Number(p.balance).toFixed(2)}`);
  return problems;
}

async function ingestSrsPdfInvoice(vendorId, file) {
  const p = parseSrsInvoicePdf(file);
  const problems = reconcileSrsPdf(p);
  if (problems.length) throw new Error(`${basename(file)} did not reconcile — refusing to write: ${problems.join("; ")}`);

  const shipCost = (p.charges.delivery ?? 0) + (p.charges.freight ?? 0);
  const origInv = (p.items.flatMap((i) => i.desc).join(" ").match(/Orig Inv#:\s*(\S+)/) || [])[1] ?? null;

  const invoice = await upsertInvoice({
    vendor_id: vendorId,
    account_number: p.account,
    invoice_number: p.invoiceNumber,
    doc_type: p.docType,
    invoice_date: p.invoiceDate,
    due_date: p.dueDate,
    order_date: p.orderDate,
    ship_date: p.shipDate,
    branch_key: p.branch || null,
    po_number: p.poNumber || null,
    job_name: p.jobNumber || null,
    ship_to_text: p.shipTo || null,
    salesperson: p.salesperson || null,
    terms: p.terms || null,
    ship_via: p.shipVia || null,
    order_type: p.orderType || null,
    sub_total: p.charges.subTotal ?? null,
    sales_tax: p.charges.tax ?? null,
    restock_fee: p.charges.restock ?? null,
    ship_cost: shipCost || null,
    total_due: p.balance,
    raw: {
      source_file: basename(file), source_kind: "invoice_pdf", notes: p.notes,
      reference_number: p.referenceNumber, job_number: p.jobNumber, agents: p.agents,
      ordered_by: p.orderedBy, created_by: p.createdBy,
      delivery_charge: p.charges.delivery ?? null, freight_charge: p.charges.freight ?? null,
      orig_invoice_number: origInv, reconciled: true,
      po_number_may_be_truncated: (p.poNumber ?? "").length >= 16,
    },
    updated_at: new Date().toISOString(),
  });

  const lines = [];
  for (const [i, it] of p.items.entries()) {
    lines.push({
      vendor_id: vendorId, invoice_id: invoice.id, invoice_number: p.invoiceNumber, line_number: i + 1,
      item_number: it.itemNumber,
      item_description: it.desc.join(" | ") || null,
      ship_qty: it.shipQty, ship_uom: it.shipUom,
      price_qty: it.priceQty ?? it.shipQty, price_uom: it.priceUom ?? it.shipUom,
      price_per_uom: it.pricePerUom,
      unit_price: it.pricePerUom,
      extended_price: it.extended,
      uom_source: "vendor_native",
    });
    if (it.priceQty) await upsertUomEvidence(vendorId, it.itemNumber, it.shipUom, it.priceUom, it.shipQty / it.priceQty);
  }
  await replaceLines(invoice.id, lines);
  return { invoices: 1, lines: lines.length, invoice_number: p.invoiceNumber, doc_type: p.docType, balance: p.balance };
}

async function ingestQxoDetail(vendorId, file) {
  const rows = parseCsv(readFileSync(file, "utf8"));
  const header = rows.shift();
  const { invoices, col } = groupDetail(rows, header, {
    invoiceCol: "INVOICE_NUMBER",
    descCol: "DESC_COL",
    isLineRow: (c, r) => c(r, "PRODUCT_CODE_COL") !== "",
  });
  let n = 0;
  for (const [invNum, inv] of invoices) {
    const h = inv.header, c = (name) => col(h, name);
    const jobInfo = c("JOB_INFO");
    const [vendorJob, jobName] = jobInfo.includes("|") ? jobInfo.split("|").map((s) => s.trim()) : [null, jobInfo || null];
    const warehouse = c("WAREHOUSE_ADDRESS");
    const phone = (warehouse.match(/(\d{3})[-. ](\d{3})[-. ](\d{4})/) || []).slice(1).join("") || null;
    const invoice = await upsertInvoice({
      vendor_id: vendorId,
      account_number: c("ACCOUNT_NUMBER"),
      invoice_number: invNum,
      doc_type: /credit/i.test(c("DOC_TYPE")) ? "credit" : "invoice",
      invoice_date: usDate(c("DISPLAY_INVOICE_DATE")),
      due_date: usDate(c("DISPLAY_DUE_DATE")),
      po_number: c("PO_NUMBER") || null,
      job_name: jobName,
      vendor_job_number: vendorJob,
      ship_to_text: c("SHIPPING_ADDRESS") || null,
      salesperson: c("SALESPERSON") || null,
      terms: c("TERMS") || null,
      ship_via: c("SHIP_VIA") || null,
      sub_total: num(c("DISPLAY_SUB_TOTAL")),
      sales_tax: num(c("DISPLAY_SALES_TAX")),
      restock_fee: num(c("DISPLAY_RESTOCK_FEE")),
      ship_cost: num(c("DISPLAY_SHIP_COST")),
      total_due: num(c("DISPLAY_TOTAL_DUE")),
      raw: { warehouse_address: warehouse, warehouse_phone: phone, ordered_by: c("ORDERED_BY"), tax_rate: c("TAX_RATE"), notes: inv.notes, source_file: basename(file) },
      updated_at: new Date().toISOString(),
    });
    const lines = inv.lines.map((ln, i) => {
      const r = ln.row, cc = (name) => col(r, name);
      const shipUom = cc("UM_COL") || null;
      return {
        vendor_id: vendorId, invoice_id: invoice.id, invoice_number: invNum, line_number: i + 1,
        item_number: cc("PRODUCT_CODE_COL") || null,
        item_description: [cc("DESC_COL"), ...ln.extraDesc].filter(Boolean).join(" | ") || null,
        ship_qty: num(cc("QTY_COL")), ship_uom: shipUom,
        price_qty: num(cc("QTY_COL")), price_uom: shipUom,
        price_per_uom: num(cc("NET_PRICE_COL")),
        unit_price: num(cc("NET_PRICE_COL")),
        extended_price: num(cc("NET_AMOUNT_COL")),
        uom_source: "ship_uom_only",
      };
    });
    await replaceLines(invoice.id, lines);
    n++;
  }
  return { invoices: n };
}

async function ingestQxoStatement(vendorId, file) {
  const rows = parseCsv(readFileSync(file, "utf8"));
  const header = rows.shift();
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const col = (r, name) => (idx[name] === undefined ? "" : (r[idx[name]] ?? "").trim());
  // register rows only (invoice number + statement date present)
  const seen = new Map(); // key acct|inv -> {statements:Set, last:{...}}
  const allStatements = new Set();
  for (const r of rows) {
    const inv = col(r, "INV_NUM_COL"), stmt = usDate(col(r, "DISPLAY_STATEMENT_DATE"));
    if (!stmt) continue;
    allStatements.add(stmt);
    if (!inv) continue;
    const key = `${col(r, "ACCOUNT_NUMBER")}|${inv}`;
    if (!seen.has(key)) seen.set(key, { statements: new Set(), r: null, acct: col(r, "ACCOUNT_NUMBER"), inv });
    const e = seen.get(key);
    e.statements.add(stmt);
    e.r = r;
  }
  const statements = [...allStatements].sort();
  const latest = statements[statements.length - 1];
  let n = 0;
  for (const e of seen.values()) {
    const r = e.r;
    const type = col(r, "TYPE_COL");
    const lastSeen = [...e.statements].sort().pop();
    const open = lastSeen === latest;
    // paid proxy: first statement date AFTER the invoice's last appearance
    const after = statements.find((s) => s > lastSeen);
    await upsertInvoice({
      vendor_id: vendorId,
      account_number: e.acct,
      invoice_number: e.inv,
      doc_type: type === "C" ? "credit" : type === "S" ? "service_charge" : "invoice",
      invoice_date: usDate(col(r, "INV_DATE_COL")),
      due_date: usDate(col(r, "DUE_DATE_COL")),
      po_number: col(r, "REF_NUM_COL") || null,
      job_name: col(r, "JOB_DESC_COL") || col(r, "JOB_NAME_COL") || null,
      total_due: num(col(r, "INV_AMT_COL")),
      ar_status: open ? "open" : "closed",
      ar_total_due: open ? num(col(r, "AMOUNT_DUE_COL")) : 0,
      date_paid: open ? null : after ?? null,
      date_paid_is_proxy: !open && !!after,
      ar_synced_at: new Date().toISOString(),
      raw: { remit: col(r, "REMIT_ADDRESS"), remit_contact: col(r, "REMIT_CONTACT"), statements: [...e.statements].sort(), source_file: basename(file) },
      updated_at: new Date().toISOString(),
    });
    n++;
  }
  return { invoices: n, statements: statements.length };
}

async function main() {
  const slug = args.vendor;
  const file = args.file;
  if (!slug || !file) { console.error("--vendor=qxo|srs --file=<csv|pdf> [--statement] [--pdf]"); process.exit(1); }
  const [vendor] = await rest(`vendors?select=id,slug&slug=eq.${slug}`);
  if (!vendor) throw new Error(`vendor ${slug} not found`);
  let result, kind;
  try {
    if (args.statement) { kind = "statement_csv"; result = await ingestQxoStatement(vendor.id, file); }
    else if (args.pdf) { kind = "invoice_pdf"; result = await ingestSrsPdfInvoice(vendor.id, file); }
    else if (slug === "srs") { kind = "invoice_csv"; result = await ingestSrsDetail(vendor.id, file); }
    else { kind = "invoice_csv"; result = await ingestQxoDetail(vendor.id, file); }
    await registerUpload(vendor.id, file, kind, result.invoices, "parsed", null);
    console.log(`${slug} ${kind}: ${JSON.stringify(result)}`);
  } catch (e) {
    await registerUpload(vendor.id, file, kind ?? "invoice_csv", 0, "failed", e.message).catch(() => {});
    throw e;
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
