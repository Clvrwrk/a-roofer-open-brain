#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PAGE_SIZE = 1000;
const EXPECTED_MIN = 200;
const EXPECTED_MAX = 350;
const FAIL_ON_GAPS = process.argv.includes("--fail-on-gaps");
const ACTIVE_ONLY = process.argv.includes("--active-only");

function parseDotenv(source) {
  const parsed = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[key] = value.replace(/\\n/g, "\n");
  }
  return parsed;
}

function loadEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = new Set();
  for (const start of [resolve(process.cwd()), here, "/Users/chussey/Documents/a-roofers-open-brain"]) {
    let current = start;
    for (let depth = 0; depth < 8; depth += 1) {
      candidates.add(join(current, ".env"));
      candidates.add(join(current, ".env.local"));
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  return [...candidates].reduce((env, file) => {
    if (!existsSync(file)) return env;
    return { ...env, ...parseDotenv(readFileSync(file, "utf8")) };
  }, process.env);
}

const env = loadEnv();
const supabaseUrl = (env.SUPABASE_URL || env.PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL/PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "content-type": "application/json",
  prefer: "count=exact",
};

async function fetchAll(table, select, extra = "") {
  const rows = [];
  let from = 0;
  for (;;) {
    const params = new URLSearchParams({ select });
    const url = `${supabaseUrl}/rest/v1/${table}?${params.toString()}${extra ? `&${extra}` : ""}`;
    const response = await fetch(url, {
      headers: {
        ...headers,
        range: `${from}-${from + PAGE_SIZE - 1}`,
      },
    });
    if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
    from += batch.length;
  }
}

function skuText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text.toUpperCase().replace(/\s+/g, " ");
  }
  return null;
}

function itemSku(item) {
  return skuText(item.raw_item_number, item.product_id, item.raw_description_normalized, item.raw_description);
}

function colorwaySku(item) {
  const sku = itemSku(item);
  if (!sku) return null;
  const colorway = skuText(item.color_variant_id, item.raw_description_normalized, item.raw_description);
  return colorway ? `${sku}|${colorway}` : sku;
}

function summarizeItems(items) {
  const itemSkus = new Set();
  const colorwaySkus = new Set();
  let approvedLines = 0;
  let reviewLines = 0;
  let pricedLines = 0;

  for (const item of items) {
    const itemKey = itemSku(item);
    const colorwayKey = colorwaySku(item);
    if (itemKey) itemSkus.add(itemKey);
    if (colorwayKey) colorwaySkus.add(colorwayKey);
    if (String(item.approval_status ?? "").toLowerCase() === "approved") approvedLines += 1;
    if (String(item.needs_review ?? "").toLowerCase() === "true") reviewLines += 1;
    if (item.negotiated_price !== null && item.negotiated_price !== undefined) pricedLines += 1;
  }

  return {
    lineCount: items.length,
    uniqueItemCount: itemSkus.size,
    uniqueSkuCount: Math.max(itemSkus.size, colorwaySkus.size),
    approvedLines,
    reviewLines,
    pricedLines,
  };
}

function auditStatus(stats) {
  if (stats.lineCount === 0) return "missing_lines";
  if (stats.lineCount < EXPECTED_MIN || stats.uniqueSkuCount < EXPECTED_MIN) return "below_expected";
  if (stats.uniqueSkuCount > EXPECTED_MAX) return "above_expected_review";
  return "complete";
}

const [agreements, items] = await Promise.all([
  fetchAll(
    "price_agreements",
    "id,vendor_id,vendor_branch_id,region_id,agreement_number,version_label,account_number,effective_date,expiry_date,is_active,ceo_verified,source_file,created_at,updated_at",
  ),
  fetchAll(
    "price_agreement_items",
    "agreement_id,product_id,color_variant_id,raw_item_number,raw_description,raw_description_normalized,negotiated_price,approval_status,needs_review",
  ),
]);

const itemsByAgreement = new Map();
for (const item of items) {
  if (!item.agreement_id) continue;
  const list = itemsByAgreement.get(item.agreement_id) ?? [];
  list.push(item);
  itemsByAgreement.set(item.agreement_id, list);
}

const rows = agreements
  .filter((agreement) => !ACTIVE_ONLY || agreement.is_active !== false)
  .map((agreement) => {
    const stats = summarizeItems(itemsByAgreement.get(agreement.id) ?? []);
    const status = auditStatus(stats);
    return {
      agreementId: agreement.id,
      agreementNumber: agreement.agreement_number,
      versionLabel: agreement.version_label,
      accountNumber: agreement.account_number,
      active: agreement.is_active !== false,
      ceoVerified: agreement.ceo_verified === true,
      effectiveDate: agreement.effective_date,
      expiryDate: agreement.expiry_date,
      sourceFile: agreement.source_file,
      ...stats,
      expectedSkuMin: EXPECTED_MIN,
      expectedSkuMax: EXPECTED_MAX,
      auditStatus: status,
    };
  })
  .sort((a, b) => {
    const statusRank = { missing_lines: 0, below_expected: 1, above_expected_review: 2, complete: 3 };
    return (
      statusRank[a.auditStatus] - statusRank[b.auditStatus] ||
      a.lineCount - b.lineCount ||
      String(a.sourceFile ?? "").localeCompare(String(b.sourceFile ?? ""))
    );
  });

const gaps = rows.filter((row) => row.auditStatus !== "complete");
const summary = {
  mode: FAIL_ON_GAPS ? "fail-on-gaps" : "audit",
  scope: ACTIVE_ONLY ? "active-only" : "all-agreements",
  expectedSkuMin: EXPECTED_MIN,
  expectedSkuMax: EXPECTED_MAX,
  agreementCount: rows.length,
  itemRowCount: items.length,
  completeCount: rows.filter((row) => row.auditStatus === "complete").length,
  gapCount: gaps.length,
  missingLineCount: rows.filter((row) => row.auditStatus === "missing_lines").length,
  belowExpectedCount: rows.filter((row) => row.auditStatus === "below_expected").length,
  aboveExpectedReviewCount: rows.filter((row) => row.auditStatus === "above_expected_review").length,
};

console.log(JSON.stringify({ summary, gaps, agreements: rows }, null, 2));

if (FAIL_ON_GAPS && gaps.length > 0) process.exitCode = 1;
