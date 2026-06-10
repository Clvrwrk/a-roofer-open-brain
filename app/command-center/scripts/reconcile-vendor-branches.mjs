#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PAGE_SIZE = 1000;
const WRITE = process.argv.includes("--write");

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

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeBranchNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const alnum = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const noPrefix = alnum.replace(/^ABC/, "");
  return noPrefix.replace(/^0+/, "") || noPrefix || alnum;
}

function parseJsonish(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function firstStringDeep(value, keys) {
  const root = parseJsonish(value);
  if (!root) return null;
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    for (const [key, entry] of Object.entries(current)) {
      if (wanted.has(key.toLowerCase()) && typeof entry === "string" && entry.trim()) return entry.trim();
      if (entry && typeof entry === "object") stack.push(entry);
    }
  }
  return null;
}

function apiAddress(row) {
  return firstStringDeep(row.address_json, ["address", "address1", "addressLine1", "street", "streetAddress", "line1"]);
}

function apiPhone(row) {
  return firstStringDeep(row.contact_json, ["phone", "phoneNumber", "telephone", "mainPhone"]);
}

function addressKey(city, state, address) {
  const normalizedAddress = normalizeText(address);
  if (!normalizedAddress) return "";
  return [normalizeText(city), normalizeText(state), normalizedAddress].join("|");
}

function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

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

async function patchRow(table, id, patch) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      ...headers,
      prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`${table}/${id}: ${response.status} ${await response.text()}`);
}

const [vendors, canonicalBranches, abcApiBranches] = await Promise.all([
  fetchAll("vendors", "id,name,slug,is_active"),
  fetchAll("vendor_branches", "id,vendor_id,branch_number,branch_name,address,city,state,phone,latitude,longitude,is_active"),
  fetchAll("abc_vendor_branches", "branch_number,branch_name,address_json,contact_json,city,state,latitude,longitude"),
]);

const abcVendor = vendors.find((vendor) => /\babc\b|abc supply/i.test([vendor.name, vendor.slug].filter(Boolean).join(" ")));
if (!abcVendor) {
  console.error("ABC vendor was not found in canonical vendors.");
  process.exit(1);
}

const canonicalAbc = canonicalBranches.filter((branch) => branch.vendor_id === abcVendor.id && branch.is_active !== false);
const apiByNumber = new Map();
const apiByAddress = new Map();

for (const apiBranch of abcApiBranches) {
  const number = normalizeBranchNumber(apiBranch.branch_number);
  if (number) apiByNumber.set(number, apiBranch);
  const key = addressKey(apiBranch.city, apiBranch.state, apiAddress(apiBranch));
  if (key) apiByAddress.set(key, apiBranch);
}

const changes = [];
const unmatched = [];
const branchNumberMismatches = [];

for (const branch of canonicalAbc) {
  const byNumber = apiByNumber.get(normalizeBranchNumber(branch.branch_number));
  const byAddress = apiByAddress.get(addressKey(branch.city, branch.state, branch.address));
  const apiBranch = byNumber || byAddress;

  if (!apiBranch) {
    unmatched.push({
      id: branch.id,
      branchNumber: branch.branch_number,
      branchName: branch.branch_name,
      city: branch.city,
      state: branch.state,
    });
    continue;
  }

  if (!byNumber && apiBranch.branch_number && normalizeBranchNumber(branch.branch_number) !== normalizeBranchNumber(apiBranch.branch_number)) {
    branchNumberMismatches.push({
      id: branch.id,
      canonicalBranchNumber: branch.branch_number,
      apiBranchNumber: apiBranch.branch_number,
      branchName: branch.branch_name,
      city: branch.city,
      state: branch.state,
    });
  }

  const patch = {};
  const apiStreet = apiAddress(apiBranch);
  const phone = apiPhone(apiBranch);
  if (!present(branch.branch_name) && present(apiBranch.branch_name)) patch.branch_name = apiBranch.branch_name;
  if (!present(branch.address) && present(apiStreet)) patch.address = apiStreet;
  if (!present(branch.city) && present(apiBranch.city)) patch.city = apiBranch.city;
  if (!present(branch.state) && present(apiBranch.state)) patch.state = apiBranch.state;
  if (!present(branch.phone) && present(phone)) patch.phone = phone;
  if (!present(branch.latitude) && present(apiBranch.latitude)) patch.latitude = apiBranch.latitude;
  if (!present(branch.longitude) && present(apiBranch.longitude)) patch.longitude = apiBranch.longitude;

  if (Object.keys(patch).length > 0) {
    changes.push({
      id: branch.id,
      branchNumber: branch.branch_number,
      apiBranchNumber: apiBranch.branch_number,
      branchName: branch.branch_name,
      patch,
    });
  }
}

if (WRITE) {
  for (const change of changes) {
    await patchRow("vendor_branches", change.id, change.patch);
  }
}

console.log(JSON.stringify({
  mode: WRITE ? "write" : "dry-run",
  vendor: { id: abcVendor.id, name: abcVendor.name, slug: abcVendor.slug },
  apiMirrorRows: abcApiBranches.length,
  canonicalRows: canonicalAbc.length,
  backfillCandidates: changes.length,
  written: WRITE ? changes.length : 0,
  unmatchedCanonicalRows: unmatched.length,
  branchNumberMismatches: branchNumberMismatches.length,
  samples: {
    backfills: changes.slice(0, 10),
    unmatched: unmatched.slice(0, 10),
    branchNumberMismatches: branchNumberMismatches.slice(0, 10),
  },
}, null, 2));
