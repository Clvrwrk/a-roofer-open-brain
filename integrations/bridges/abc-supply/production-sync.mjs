#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

// Columns that legitimately change every run and must NOT count as a data change.
// Declared at module top so the hoisted supabaseUpsert can use it during top-level await.
const HASH_IGNORE_KEYS = new Set(["abc_fetched_at", "abc_last_seen_at", "abc_first_seen_at", "content_hash"]);
// Volatile subfields inside the raw payload. ABC bumps raw.lastModifiedDate on every record
// touch even when no mapped field changes; ignoring it keeps the gate + archive meaningful.
// Must stay in sync with raw_volatile in public.abc_log_change().
const RAW_VOLATILE_KEYS = new Set(["lastModifiedDate"]);

const ROOT = resolve(new URL("../../..", import.meta.url).pathname);
const ENV_PATH = resolve(ROOT, ".env");

const DEFAULTS = {
  sandbox: {
    apiBaseUrl: "https://partners-sb.abcsupply.com",
    authBaseUrl: "https://sandbox.auth.partners.abcsupply.com/oauth2/aus1vp07knpuqf6Xz0h8",
  },
  production: {
    apiBaseUrl: "https://partners.abcsupply.com",
    authBaseUrl: "https://auth.partners.abcsupply.com/oauth2/ausvvp0xuwGKLenYy357",
  },
};

const DEFAULT_SCOPES =
  "location.read product.read account.read pricing.read order.read allOrder.read notification.read invoice.read invoice.history.read";
const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN",
  "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
  "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT",
  "VT", "VA", "WA", "WV", "WI", "WY",
];

const nowIso = new Date().toISOString();
const startedAt = performance.now();
const args = parseArgs(process.argv.slice(2));
const dotenv = parseDotenv(ENV_PATH);
const env = { ...dotenv, ...process.env };
const abcEnv = String(args.env || env.ABC_SUPPLY_ENV || "production").toLowerCase();
const configDefaults = DEFAULTS[abcEnv] || DEFAULTS.production;
const apiBaseUrl = stripTrailingSlash(env.ABC_SUPPLY_API_BASE_URL || configDefaults.apiBaseUrl);
const authBaseUrl = stripTrailingSlash(env.ABC_SUPPLY_AUTH_BASE_URL || configDefaults.authBaseUrl);
const clientId = env.ABC_SUPPLY_CLIENT_ID || env.ClientID;
const clientSecret = env.ABC_SUPPLY_CLIENT_SECRET || env.Client_Secret;
const supabaseUrl = stripTrailingSlash(env.SUPABASE_URL || env.PUBLIC_SUPABASE_URL || "");
const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const writeOutput = !args["no-output"];
const skipCatalog = Boolean(args["skip-catalog"]);
const skipAccounts = Boolean(args["skip-accounts"]);
const skipBranches = Boolean(args["skip-branches"]);
const skipAudit = Boolean(args["skip-audit"]);
const auditOnly = Boolean(args["audit-only"]);
const reviewDue = Boolean(args["review-due"]);
const reviewLimit = numberArg("review-limit", 2000);
const catalogPagesLimit = args["catalog-pages"] ? Number(args["catalog-pages"]) : Infinity;
const catalogStartPage = numberArg("catalog-start-page", 1);
const retryLimit = numberArg("retries", 3);
const accountPagesLimit = args["account-pages"] ? Number(args["account-pages"]) : Infinity;
const accountDetailLimit = args["account-detail-limit"] ? Number(args["account-detail-limit"]) : Infinity;
const branchDetailLimit = args["branch-detail-limit"] ? Number(args["branch-detail-limit"]) : Infinity;
const catalogItemsPerPage = numberArg("catalog-items-per-page", 1000);
const accountItemsPerPage = numberArg("account-items-per-page", 100);
const pricingCandidateLimit = numberArg("pricing-candidates", 12);
const pricingBranchLimit = numberArg("pricing-branches", 4);
const contactCandidateLimit = numberArg("contact-candidates", 12);
const branchStates = String(args.states || env.ABC_SUPPLY_BRANCH_STATES || US_STATES.join(","))
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);

const summary = {
  generatedAt: nowIso,
  environment: abcEnv,
  apiBaseUrl,
  authBaseUrl,
  mode: {
    auditOnly,
    skipCatalog,
    skipAccounts,
    skipBranches,
    skipAudit,
    catalogItemsPerPage,
    catalogStartPage,
    catalogPagesLimit: Number.isFinite(catalogPagesLimit) ? catalogPagesLimit : "all",
    retryLimit,
    accountPagesLimit: Number.isFinite(accountPagesLimit) ? accountPagesLimit : "all",
    accountDetailLimit: Number.isFinite(accountDetailLimit) ? accountDetailLimit : "all",
    branchDetailLimit: Number.isFinite(branchDetailLimit) ? branchDetailLimit : "all",
    pricingCandidateLimit,
    pricingBranchLimit,
    contactCandidateLimit,
    branchStates: branchStates.length,
  },
  envShape: {
    ABC_SUPPLY_CLIENT_ID: Boolean(env.ABC_SUPPLY_CLIENT_ID),
    ABC_SUPPLY_CLIENT_SECRET: Boolean(env.ABC_SUPPLY_CLIENT_SECRET),
    ABC_SUPPLY_ENV: env.ABC_SUPPLY_ENV ? String(env.ABC_SUPPLY_ENV) : null,
    SUPABASE_URL: Boolean(supabaseUrl),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(supabaseServiceRoleKey),
  },
  token: null,
  endpointAccess: [],
  sync: {
    productCatalog: null,
    vendorBranches: null,
    regions: null,
  },
  skippedWrites: [
    "PUT /api/product/v1/items/{billToNumber}/favorites/{itemNumber}",
    "POST /api/order/v2/orders",
    "POST /api/notification/v2/webhooks",
    "PATCH /api/notification/v2/webhooks/{webhookId}",
    "DELETE /api/notification/v2/webhooks/{webhookId}",
  ],
  skippedSensitiveReads: ["GET /api/invoice/v1/invoices/pdf/{invoiceId}"],
};

if (!clientId || !clientSecret) failClosed("Missing ABC production credentials.");
if (!auditOnly && (!supabaseUrl || !supabaseServiceRoleKey)) {
  failClosed("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for table sync.");
}

let token = await getToken();
summary.token = token.summary;

const context = {
  soldToNumber: null,
  billToNumber: null,
  shipToNumber: null,
  shipToCandidates: [],
  pricingCandidates: [],
  branchNumbers: [],
  itemNumber: null,
  pricingItemNumber: null,
  assetId: null,
  invoiceId: null,
  templateId: null,
  orderNumber: null,
};

if (reviewDue) {
  // Cycle-counting mode: refresh only the catalog items whose review is due, not the full 331k.
  await syncCatalogReviewDue();
} else {
  if (!skipAccounts) await syncAccounts();
  if (!skipBranches) await syncBranches();
  if (!skipCatalog) await syncProductCatalog();
  if (!skipAudit) await auditReadableEndpoints();
}

summary.requestStats = {
  wallMs: elapsed(startedAt),
  rateLimitedResponses: summary.endpointAccess.filter((endpoint) => endpoint.status === 429).length,
  endpointRequests: summary.endpointAccess.filter((endpoint) => typeof endpoint.status === "number").length,
};

if (writeOutput) {
  const outPath =
    args.out ||
    resolve(ROOT, "integrations/bridges/abc-supply/.production-runs", `${nowIso.replace(/[:.]/g, "-")}.json`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  summary.outputPath = outPath;
}

console.log(JSON.stringify(args.compact ? compactSummary(summary) : summary, null, 2));

async function syncProductCatalog() {
  const sync = {
    table: "abc_product_catalog",
    endpoint: "GET /api/product/v1/items",
    pagesAttempted: 0,
    itemsFetched: 0,
    rowsUpserted: 0,
    totalPages: null,
    totalItems: null,
    failed: [],
  };
  summary.sync.productCatalog = sync;
  if (auditOnly) return;

  for (let pageNumber = catalogStartPage; pageNumber <= catalogPagesLimit; pageNumber += 1) {
    progress(`catalog page ${pageNumber}`);
    const query = new URLSearchParams({
      itemsPerPage: String(catalogItemsPerPage),
      pageNumber: String(pageNumber),
      familyItems: "false",
    });
    if (args["catalog-since"]) query.set("sinceLastModifiedDateTime", String(args["catalog-since"]));

    const { ok, status, json, error } = await abcRequestWithRetry({
      name: `Product: Get All Items page ${pageNumber}`,
      method: "GET",
      path: `/api/product/v1/items?${query}`,
      scope: "product.read",
    });
    sync.pagesAttempted += 1;
    if (!ok) {
      sync.failed.push({ pageNumber, status, error });
      break;
    }

    const items = Array.isArray(json?.items) ? json.items : [];
    sync.itemsFetched += items.length;
    sync.totalPages = json?.pagination?.totalPages ?? sync.totalPages;
    sync.totalItems = json?.pagination?.totalItems ?? sync.totalItems;
    if (items[0]?.itemNumber) context.itemNumber ||= items[0].itemNumber;
    context.assetId ||= firstImageAssetId(items.find((item) => firstImageAssetId(item)));

    const rows = items.map(productRow);
    sync.rowsUpserted += await supabaseUpsert("abc_product_catalog", rows, "item_number");
    progress(`catalog page ${pageNumber}: fetched=${sync.itemsFetched} upserted=${sync.rowsUpserted} totalPages=${sync.totalPages ?? "unknown"}`);

    if (!items.length || (sync.totalPages && pageNumber >= sync.totalPages)) break;
  }
}

// Cycle-counting review pass: refresh only catalog items whose review is due (per the
// review_class cadence set by public.abc_recompute_review_schedule()). Gated upsert archives
// any real change; then the reviewed items are stamped and their next-due advanced.
async function syncCatalogReviewDue() {
  const sync = {
    mode: "catalog-review-due",
    endpoint: "GET /api/product/v1/items/{itemNumber}",
    due: 0,
    itemsFetched: 0,
    rowsUpserted: 0,
    reviewed: 0,
    failed: [],
  };
  summary.sync.catalogReviewDue = sync;
  if (!supabaseUrl || !supabaseServiceRoleKey) failClosed("Missing Supabase config for --review-due.");

  const supaHeaders = {
    apikey: supabaseServiceRoleKey,
    Authorization: `Bearer ${supabaseServiceRoleKey}`,
    Accept: "application/json",
  };

  // 0) Recompute classification + schedule from the purchase ledger first (unless suppressed),
  //    so today's velocity/recency drives which items are due.
  if (!args["skip-recompute"]) {
    progress("recomputing review schedule");
    const rpc = await fetch(`${supabaseUrl}/rest/v1/rpc/abc_recompute_review_schedule`, {
      method: "POST",
      headers: { ...supaHeaders, "Content-Type": "application/json" },
      body: "{}",
    });
    if (!rpc.ok) {
      const payload = await safeReadResponse(rpc);
      throw new Error(`Supabase recompute RPC failed: ${rpc.status} ${JSON.stringify(summarizeErrorPayload(payload))}`);
    }
    sync.recompute = await rpc.json().catch(() => null);
  }

  // 1) Pull the due queue (tracked items only; dormant items have null next-due and never appear).
  const dueUrl =
    `${supabaseUrl}/rest/v1/abc_product_catalog` +
    `?select=item_number,review_cadence` +
    `&review_class=not.is.null` +
    `&catalog_next_review_due_at=lte.${encodeURIComponent(nowIso)}` +
    `&order=catalog_next_review_due_at.asc&limit=${reviewLimit}`;
  const dueResp = await fetch(dueUrl, { headers: supaHeaders });
  if (!dueResp.ok) {
    const payload = await safeReadResponse(dueResp);
    throw new Error(`Supabase due-queue fetch failed: ${dueResp.status} ${JSON.stringify(summarizeErrorPayload(payload))}`);
  }
  const due = await dueResp.json();
  sync.due = due.length;

  // 2) Refresh each due item from ABC; only successfully-fetched items get stamped reviewed.
  const rows = [];
  const reviewedByCadence = new Map();
  for (let i = 0; i < due.length; i += 1) {
    const entry = due[i];
    progress(`review-due ${i + 1}/${due.length} ${entry.item_number}`);
    const { ok, status, json, error } = await abcRequestWithRetry({
      name: "Product: Get Item (review-due)",
      method: "GET",
      path: `/api/product/v1/items/${encodeURIComponent(entry.item_number)}`,
      scope: "product.read",
    });
    if (!ok) {
      sync.failed.push({ item: maskId(entry.item_number), status, error });
      continue;
    }
    const item = json?.item || (Array.isArray(json?.items) ? json.items[0] : null) || json;
    if (!item || !(item.itemNumber || item.number)) {
      sync.failed.push({ item: maskId(entry.item_number), status: "empty" });
      continue;
    }
    rows.push(productRow(item));
    sync.itemsFetched += 1;
    const cadence = entry.review_cadence || "monthly";
    if (!reviewedByCadence.has(cadence)) reviewedByCadence.set(cadence, []);
    reviewedByCadence.get(cadence).push(entry.item_number);
  }

  // 3) Gated upsert — writes (and archives) only items whose data actually changed.
  if (rows.length) sync.rowsUpserted = await supabaseUpsert("abc_product_catalog", rows, "item_number");

  // 4) Stamp reviewed + advance next-due per cadence (review columns are not archived).
  const cadenceDays = { weekly: 7, monthly: 30, quarterly: 91, annual: 365 };
  for (const [cadence, items] of reviewedByCadence) {
    const nextDue = new Date(Date.now() + (cadenceDays[cadence] ?? 30) * 86400000).toISOString();
    for (const chunk of chunks(items, 200)) {
      const inList = chunk.map(pgrstQuote).join(",");
      const url = `${supabaseUrl}/rest/v1/abc_product_catalog?item_number=in.(${encodeURIComponent(inList)})`;
      const response = await fetch(url, {
        method: "PATCH",
        headers: { ...supaHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ catalog_last_reviewed_at: nowIso, catalog_next_review_due_at: nextDue }),
      });
      if (!response.ok) {
        const payload = await safeReadResponse(response);
        throw new Error(`Supabase review stamp failed: ${response.status} ${JSON.stringify(summarizeErrorPayload(payload))}`);
      }
      sync.reviewed += chunk.length;
    }
  }
}

async function abcRequestWithRetry(endpoint) {
  let last;
  for (let attempt = 1; attempt <= retryLimit; attempt += 1) {
    last = await abcRequest(endpoint);
    if (last.ok) return last;
    if (![429, 500, 502, 503, 504].includes(Number(last.status))) return last;
    progress(`${endpoint.name}: retry ${attempt}/${retryLimit} after status ${last.status}`);
    await sleep(Math.min(30000, 1000 * 2 ** (attempt - 1)));
  }
  return last;
}

async function syncBranches() {
  const branchMap = new Map();
  const sync = {
    table: "abc_vendor_branches",
    endpoint: "GET /api/location/v1/branches + GET /api/location/v1/branches/{branchNumber}",
    statesAttempted: 0,
    branchSummaries: 0,
    branchDetailsFetched: 0,
    rowsUpserted: 0,
    failed: [],
  };
  summary.sync.vendorBranches = sync;

  for (const state of branchStates) {
    progress(`branch search ${state}`);
    const { ok, status, json, error } = await abcRequest({
      name: `Location: Search Branches ${state}`,
      method: "GET",
      path: `/api/location/v1/branches?state=${encodeURIComponent(state)}`,
      scope: "location.read",
    });
    sync.statesAttempted += 1;
    if (!ok) {
      sync.failed.push({ state, status, error });
      continue;
    }
    for (const branch of Array.isArray(json) ? json : []) {
      const number = branch?.branch?.number || branch?.number || branch?.branchNumber;
      if (number) branchMap.set(String(number), branch);
    }
  }

  sync.branchSummaries = branchMap.size;
  addUnique(context.branchNumbers, [...branchMap.keys()]);
  if (auditOnly) return;

  const rows = [];
  let branchDetailsAttempted = 0;
  for (const branchNumber of branchMap.keys()) {
    if (branchDetailsAttempted >= branchDetailLimit) break;
    branchDetailsAttempted += 1;
    progress(`branch detail ${branchDetailsAttempted}/${branchMap.size} ${branchNumber}`);
    const { ok, status, json, error } = await abcRequest({
      name: `Location: Get Branch ${branchNumber}`,
      method: "GET",
      path: `/api/location/v1/branches/${encodeURIComponent(branchNumber)}`,
      scope: "location.read",
    });
    if (!ok) {
      sync.failed.push({ branchNumber, status, error });
      rows.push(branchRow(branchMap.get(branchNumber)));
      continue;
    }
    sync.branchDetailsFetched += 1;
    rows.push(branchRow(json));
  }

  sync.rowsUpserted = await supabaseUpsert("abc_vendor_branches", rows, "branch_number");
}

async function syncAccounts() {
  const sync = {
    table: "abc_regions",
    endpoint: "POST /api/account/v1/search/accounts + account detail GETs",
    accountTypesAttempted: [],
    accountsFetched: 0,
    detailsFetched: 0,
    rowsUpserted: 0,
    failed: [],
  };
  summary.sync.regions = sync;

  const accountRefs = new Map();
  for (const accountType of ["Ship-To", "Bill-To", "Sold-To"]) {
    let pageNumber = 1;
    sync.accountTypesAttempted.push(accountType);
    for (;;) {
      if (pageNumber > accountPagesLimit) break;
      progress(`account search ${accountType} page ${pageNumber}`);
      const body = {
        filters: [
          { key: "accountType", condition: "equals", values: [accountType], joinCondition: "and" },
          { key: "storefront", condition: "equals", values: ["abc"] },
        ],
        pagination: { itemsPerPage: accountItemsPerPage, pageNumber },
      };
      const { ok, status, json, error } = await abcRequest({
        name: `Account: Search Accounts ${accountType} page ${pageNumber}`,
        method: "POST",
        path: "/api/account/v1/search/accounts",
        scope: "account.read",
        body,
      });
      if (!ok) {
        sync.failed.push({ accountType, pageNumber, status, error });
        break;
      }

      const rows = accountRowsFromSearch(json, accountType);
      for (const row of rows) accountRefs.set(`${row.account_type}:${row.account_number}`, row);
      sync.accountsFetched += rows.length;

      const totalPages = json?.pagination?.totalPages || pageNumber;
      if (pageNumber >= totalPages) break;
      pageNumber += 1;
    }
  }

  const rows = [];
  let detailsAttempted = 0;
  for (const row of accountRefs.values()) {
    if (detailsAttempted >= accountDetailLimit) {
      rows.push(row);
      continue;
    }
    detailsAttempted += 1;
    progress(`account detail ${detailsAttempted}/${accountRefs.size} ${row.account_type}`);
    const detail = await fetchAccountDetail(row);
    if (detail?.raw) {
      sync.detailsFetched += 1;
      rows.push({ ...row, ...detail });
    } else {
      rows.push(row);
    }
  }

  const shipToRows = rows.filter((row) => row.account_type === "Ship-To");
  const firstShipTo = shipToRows[0];
  const firstBillTo = rows.find((row) => row.account_type === "Bill-To");
  const firstSoldTo = rows.find((row) => row.account_type === "Sold-To");
  context.shipToNumber ||= firstShipTo?.account_number || null;
  context.billToNumber ||= firstBillTo?.account_number || firstShipTo?.bill_to_number || null;
  context.soldToNumber ||= firstSoldTo?.account_number || firstBillTo?.sold_to_number || firstShipTo?.sold_to_number || null;
  context.shipToCandidates = shipToRows.map((row) => row.account_number).filter(Boolean);
  addUnique(context.branchNumbers, rows.flatMap((row) => row.branch_numbers || []));
  context.pricingCandidates = shipToRows
    .map((row) => ({
      shipToNumber: row.account_number,
      branchNumbers: row.branch_numbers || [],
    }))
    .filter((candidate) => candidate.shipToNumber && candidate.branchNumbers.length);

  if (!auditOnly) sync.rowsUpserted = await supabaseUpsert("abc_regions", rows, "region_code");
}

async function auditReadableEndpoints() {
  await maybeAudit({
    name: "Product: Get Hierarchy",
    method: "GET",
    path: "/api/product/v1/hierarchy?itemsPerPage=1&pageNumber=1",
    scope: "product.read",
  });
  await maybeAudit({
    name: "Product: Search Items",
    method: "POST",
    path: "/api/product/v1/search/items?familyItems=false",
    scope: "product.read",
    body: {
      filters: [{ key: "itemDescription", condition: "contains", values: ["Roofing"], joinCondition: null }],
      pagination: { itemsPerPage: 5, pageNumber: 1 },
    },
  });
  await maybeAudit({
    name: "Product: Get Item",
    method: "GET",
    path: `/api/product/v1/items/${encodeURIComponent(context.itemNumber || "")}`,
    scope: "product.read",
    requires: Boolean(context.itemNumber),
  });
  await maybeAudit({
    name: "Product: Search Item Availability",
    method: "POST",
    path: "/api/product/v1/search/availability/items",
    scope: "product.read",
    requires: Boolean(context.itemNumber),
    body: {
      filters: [{ key: "itemNumber", condition: "equals", values: [context.itemNumber] }],
      pagination: { itemsPerPage: 5, pageNumber: 1 },
    },
  });
  await maybeAudit({
    name: "Product: Get Item Availability",
    method: "GET",
    path: `/api/product/v1/availability/items/${encodeURIComponent(context.itemNumber || "")}/branches`,
    scope: "product.read",
    requires: Boolean(context.itemNumber),
  });
  await maybeAudit({
    name: "Product: Get Item Image",
    method: "GET",
    path: `/api/product/v1/items/${encodeURIComponent(context.assetId || "")}/images`,
    scope: "product.read",
    binary: true,
    requires: Boolean(context.assetId),
  });
  const recents = await maybeAudit({
    name: "Product: Get Recents Items",
    method: "GET",
    path: `/api/product/v1/items/${encodeURIComponent(context.billToNumber || "")}/recents?itemsPerPage=5&pageNumber=1`,
    scope: "product.read",
    requires: Boolean(context.billToNumber),
  });
  context.pricingItemNumber ||= firstItemNumber(recents?.json?.items);
  const frequents = await maybeAudit({
    name: "Product: Get Frequent Items",
    method: "GET",
    path: `/api/product/v1/items/${encodeURIComponent(context.billToNumber || "")}/frequents?itemsPerPage=5&pageNumber=1`,
    scope: "product.read",
    requires: Boolean(context.billToNumber),
  });
  context.pricingItemNumber ||= firstItemNumber(frequents?.json?.items);
  const favorites = await maybeAudit({
    name: "Product: Get Favorite Items",
    method: "GET",
    path: `/api/product/v1/items/${encodeURIComponent(context.billToNumber || "")}/favorites?itemsPerPage=5&pageNumber=1`,
    scope: "product.read",
    requires: Boolean(context.billToNumber),
  });
  context.pricingItemNumber ||= firstItemNumber(favorites?.json?.items);

  await auditPricingCandidates();

  await auditShipToContactCandidates();

  const orderQuery = new URLSearchParams({
    startDate: args["order-start"] || "2026-01-01",
    endDate: args["order-end"] || nowIso.slice(0, 10),
    itemsPerPage: "5",
    pageNumber: "1",
  });
  const orderHistory = await maybeAudit({
    name: "Order: Get Order History",
    method: "GET",
    path: `/api/order/v2/orders/orderHistory?${orderQuery}`,
    scope: "order.read",
  });
  context.orderNumber ||= firstItem(orderHistory?.json?.items)?.orderNumber || null;
  await maybeAudit({
    name: "Order: Get Order",
    method: "GET",
    path: `/api/order/v2/orders/${encodeURIComponent(context.orderNumber || "")}`,
    scope: "order.read",
    requires: Boolean(context.orderNumber),
  });
  const templates = await maybeAudit({
    name: "Order: Get Order Templates",
    method: "GET",
    path: `/api/order/v2/orders/templates?accountNumber=${encodeURIComponent(context.billToNumber || "")}&itemsPerPage=5&pageNumber=1`,
    scope: "order.read",
    requires: Boolean(context.billToNumber),
  });
  context.templateId ||= firstItem(templates?.json?.templates)?.templateId || firstItem(templates?.json?.items)?.id || null;
  await maybeAudit({
    name: "Order: Get Order Template By ID",
    method: "GET",
    path: `/api/order/v2/orders/templates/${encodeURIComponent(context.templateId || "")}`,
    scope: "order.read",
    requires: Boolean(context.templateId),
  });

  await maybeAudit({
    name: "Notification: Get Webhooks",
    method: "GET",
    path: "/api/notification/v2/webhooks",
    scope: "notification.read",
  });

  const invoiceHistory = await maybeAudit({
    name: "Invoice: Get Invoice History",
    method: "GET",
    path: `/api/invoice/v1/invoices/history/${encodeURIComponent(context.billToNumber || "")}?startDate=2026-01-01T00:00:00Z&endDate=${encodeURIComponent(nowIso)}&itemsPerPage=5&pageNumber=1`,
    scope: "invoice.history.read",
    requires: Boolean(context.billToNumber),
  });
  context.invoiceId ||= firstItem(invoiceHistory?.json?.items)?.invoiceId || firstItem(invoiceHistory?.json?.items)?.invoiceNumber || null;
  await maybeAudit({
    name: "Invoice: Get Invoice By ID",
    method: "GET",
    path: `/api/invoice/v1/invoices/id/${encodeURIComponent(context.invoiceId || "")}`,
    scope: "invoice.read",
    requires: Boolean(context.invoiceId),
  });
}

async function auditPricingCandidates() {
  const itemNumber = context.pricingItemNumber || context.itemNumber;
  if (!itemNumber || !context.pricingCandidates.length) {
    summary.endpointAccess.push({
      name: "Pricing: Price Items",
      method: "POST",
      pathTemplate: "/api/pricing/v2/prices",
      scope: "pricing.read",
      status: "skipped",
      reason: "missing item or Ship-To branch candidates",
    });
    return;
  }

  let attempts = 0;
  for (const candidate of context.pricingCandidates.slice(0, pricingCandidateLimit)) {
    for (const branchNumber of candidate.branchNumbers.slice(0, pricingBranchLimit)) {
      attempts += 1;
      const result = await maybeAudit({
        name: `Pricing: Price Items candidate ${attempts}`,
        method: "POST",
        path: "/api/pricing/v2/prices",
        scope: "pricing.read",
        body: {
          requestId: `open-brain-prod-audit-${Date.now()}-${attempts}`,
          shipToNumber: candidate.shipToNumber,
          branchNumber: String(branchNumber),
          purpose: "ordering",
          lines: [{ id: "1", itemNumber, quantity: 1 }],
        },
      });
      if (result?.ok) return;
    }
  }
}

async function auditShipToContactCandidates() {
  const candidates = context.shipToCandidates.slice(0, contactCandidateLimit);
  if (!candidates.length) {
    summary.endpointAccess.push({
      name: "Account: Get Ship-To Contacts",
      method: "GET",
      pathTemplate: "/api/account/v1/shiptos/{shipToNumber}/contacts",
      scope: "account.read",
      status: "skipped",
      reason: "missing Ship-To candidates",
    });
    return;
  }

  for (let index = 0; index < candidates.length; index += 1) {
    const result = await maybeAudit({
      name: `Account: Get Ship-To Contacts candidate ${index + 1}`,
      method: "GET",
      path: `/api/account/v1/shiptos/${encodeURIComponent(candidates[index])}/contacts`,
      scope: "account.read",
    });
    if (result?.ok) return;
  }
}

async function maybeAudit(endpoint) {
  if (endpoint.requires === false) {
    summary.endpointAccess.push({
      name: endpoint.name,
      method: endpoint.method,
      pathTemplate: stripDynamicValues(endpoint.path),
      scope: endpoint.scope,
      status: "skipped",
      reason: "missing derived identifier",
    });
    return null;
  }
  return abcRequest(endpoint);
}

async function fetchAccountDetail(row) {
  const pathByType = {
    "Sold-To": `/api/account/v1/soldtos/${encodeURIComponent(row.account_number)}`,
    "Bill-To": `/api/account/v1/billtos/${encodeURIComponent(row.account_number)}`,
    "Ship-To": `/api/account/v1/shiptos/${encodeURIComponent(row.account_number)}`,
  };
  const path = pathByType[row.account_type];
  if (!path) return null;
  const { ok, status, json, error } = await abcRequest({
    name: `Account: Get ${row.account_type}`,
    method: "GET",
    path,
    scope: "account.read",
  });
  if (!ok) {
    summary.sync.regions.failed.push({ accountType: row.account_type, accountNumber: maskId(row.account_number), status, error });
    return null;
  }
  const payload = json?.soldTo || json?.billTo || json?.shipTo || json;
  return {
    sold_to_number: numberFrom(payload?.soldTo) || row.sold_to_number,
    bill_to_number: numberFrom(payload?.billTo) || row.bill_to_number,
    ship_to_number: row.account_type === "Ship-To" ? row.account_number : row.ship_to_number,
    branch_numbers: unique([...(row.branch_numbers || []), ...collectBranchNumbers(payload)]),
    address_json: payload?.address || payload?.addresses || null,
    raw: json,
    source_endpoint: `GET ${path.replace(row.account_number, `{${row.account_type.replace("-", "").toLowerCase()}Number}`)}`,
    abc_last_seen_at: nowIso,
    abc_fetched_at: nowIso,
  };
}

async function abcRequest(endpoint) {
  await ensureToken();
  const started = performance.now();
  const headers = {
    Authorization: `Bearer ${token.accessToken}`,
    Accept: endpoint.binary ? "*/*" : "application/json",
  };
  const options = { method: endpoint.method, headers };
  if (endpoint.body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(endpoint.body);
  }

  let response;
  let payload;
  try {
    response = await fetch(`${apiBaseUrl}${endpoint.path}`, options);
    payload = await safeReadResponse(response, endpoint.binary);
  } catch (error) {
    const record = {
      name: endpoint.name,
      method: endpoint.method,
      pathTemplate: stripDynamicValues(endpoint.path),
      scope: endpoint.scope,
      status: "network_error",
      category: "network_failure",
      durationMs: elapsed(started),
      message: sanitizeMessage(error?.message),
    };
    summary.endpointAccess.push(record);
    return { ok: false, status: "network_error", error: record.message };
  }

  const record = {
    name: endpoint.name,
    method: endpoint.method,
    pathTemplate: stripDynamicValues(endpoint.path),
    scope: endpoint.scope,
    status: response.status,
    statusClass: statusClass(response.status),
    durationMs: elapsed(started),
    contentType: response.headers.get("content-type") || null,
  };

  if (response.ok) {
    const json = payload?.json;
    record.summary = endpoint.binary ? payload?.binary : genericSummary(json);
    summary.endpointAccess.push(record);
    return { ok: true, status: response.status, json, binary: payload?.binary };
  }

  record.category = classifyEndpointFailure(response.status, payload?.json || payload?.text);
  record.error = summarizeErrorPayload(payload);
  summary.endpointAccess.push(record);
  return { ok: false, status: response.status, error: record.error };
}

async function getToken() {
  const tokenUrl = `${authBaseUrl}/v1/token`;
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const scope = env.ABC_SUPPLY_SCOPES?.trim() || DEFAULT_SCOPES;
  const started = performance.now();
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope }),
  });
  const payload = await safeReadResponse(response);
  if (!response.ok || !payload?.json?.access_token) {
    summary.token = {
      status: response.status,
      statusClass: statusClass(response.status),
      durationMs: elapsed(started),
      error: summarizeErrorPayload(payload),
    };
    throw new Error("ABC production token exchange failed.");
  }

  return {
    accessToken: payload.json.access_token,
    expiresAtMs: Date.now() + Math.max(Number(payload.json.expires_in || 0) - 120, 60) * 1000,
    summary: {
      status: response.status,
      statusClass: statusClass(response.status),
      scopeRequested: scope,
      scopeReturned: payload.json.scope || null,
      tokenType: payload.json.token_type || null,
      expiresInSeconds: payload.json.expires_in || null,
      durationMs: elapsed(started),
    },
  };
}

async function ensureToken() {
  if (token?.expiresAtMs && Date.now() < token.expiresAtMs) return;
  progress("refreshing ABC OAuth token");
  token = await getToken();
  summary.tokenRefreshes = (summary.tokenRefreshes || 0) + 1;
}

// Stable, order-independent serialization so the same data always hashes the same.
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonicalize(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function contentHashOf(row) {
  const filtered = {};
  for (const key of Object.keys(row)) {
    if (HASH_IGNORE_KEYS.has(key)) continue;
    if (key === "raw" && row.raw && typeof row.raw === "object" && !Array.isArray(row.raw)) {
      const rawCopy = {};
      for (const rk of Object.keys(row.raw)) {
        if (!RAW_VOLATILE_KEYS.has(rk)) rawCopy[rk] = row.raw[rk];
      }
      filtered.raw = rawCopy;
    } else {
      filtered[key] = row[key];
    }
  }
  return createHash("sha256").update(JSON.stringify(canonicalize(filtered))).digest("hex");
}

function pgrstQuote(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

// Change-gated upsert: only rows whose content_hash differs from what's stored are written.
// Unchanged rows are skipped entirely (no timestamp bump), satisfying "only update if changed".
// Applied writes fire the DB archive trigger (public.abc_change_log).
async function supabaseUpsert(table, rows, onConflict) {
  if (!rows.length) return 0;

  // 1) Hash every candidate row over its meaningful (non-volatile) columns.
  const candidates = rows.map((row) => ({
    row,
    key: String(row[onConflict]),
    hash: contentHashOf(row),
  }));

  // 2) Fetch the stored hash for these keys so we can tell new/changed from unchanged.
  const storedHash = new Map();
  for (const chunk of chunks(candidates, 150)) {
    const inList = chunk.map((c) => pgrstQuote(c.key)).join(",");
    const url =
      `${supabaseUrl}/rest/v1/${table}` +
      `?select=${encodeURIComponent(onConflict)},content_hash` +
      `&${encodeURIComponent(onConflict)}=in.(${encodeURIComponent(inList)})`;
    const response = await fetch(url, {
      headers: {
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      const payload = await safeReadResponse(response);
      throw new Error(`Supabase hash prefetch failed for ${table}: ${response.status} ${JSON.stringify(summarizeErrorPayload(payload))}`);
    }
    for (const existing of await response.json()) {
      storedHash.set(String(existing[onConflict]), existing.content_hash ?? null);
    }
  }

  // 3) Keep only new rows (key absent) or changed rows (hash differs).
  const changed = candidates.filter((c) => storedHash.get(c.key) !== c.hash);
  if (!changed.length) return 0;

  // 4) Upsert changed rows, stamping the new content_hash so the next run can compare.
  let count = 0;
  for (const chunk of chunks(changed, 200)) {
    const payload = chunk.map((c) => ({ ...c.row, content_hash: c.hash }));
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
      method: "POST",
      headers: {
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errPayload = await safeReadResponse(response);
      throw new Error(`Supabase upsert failed for ${table}: ${response.status} ${JSON.stringify(summarizeErrorPayload(errPayload))}`);
    }
    count += chunk.length;
  }
  return count;
}

function productRow(item) {
  return {
    item_number: String(item.itemNumber || item.number),
    family_id: item.familyId || null,
    family_name: item.familyName || null,
    supplier_name: item.supplierName || null,
    item_description: item.itemDescription || null,
    marketing_description: item.marketingDescription || null,
    status: item.status || null,
    is_dimensional: typeof item.isDimensional === "boolean" ? item.isDimensional : null,
    weights: item.weights || null,
    dimensions: item.dimensions || null,
    uoms: item.uoms || null,
    images: item.images || item.imageAssets || null,
    hierarchy: item.hierarchy || item.productHierarchy || null,
    raw: item,
    source_endpoint: "GET /api/product/v1/items",
    abc_last_seen_at: nowIso,
    abc_fetched_at: nowIso,
  };
}

function branchRow(payload) {
  const branch = payload?.branch || payload;
  const address = payload?.address || null;
  const locale = payload?.locale || null;
  return {
    branch_number: String(branch?.number || branch?.branchNumber),
    branch_name: branch?.name || `ABC Supply ${branch?.number || branch?.branchNumber}`,
    city: address?.city || null,
    state: address?.state || null,
    region_code: null,
    is_primary: null,
    storefront: branch?.storefront || null,
    branch_status: branch?.status || null,
    branch_type: branch?.type || null,
    address_json: address,
    postal: address?.postal || null,
    country: address?.country || null,
    latitude: parseNumber(locale?.lat),
    longitude: parseNumber(locale?.long),
    contact_json: payload?.contact || null,
    manager_json: payload?.manager || null,
    hours_json: payload?.hoursOfOperation || null,
    products_json: payload?.products || null,
    services_json: payload?.services || null,
    links_json: payload?.links || null,
    nearby_branches_json: payload?.nearByBranches || null,
    raw: payload,
    source_endpoint: "GET /api/location/v1/branches/{branchNumber}",
    abc_last_seen_at: nowIso,
    abc_fetched_at: nowIso,
  };
}

function accountRowsFromSearch(payload, requestedType) {
  const out = [];
  const pushRows = (items, accountType) => {
    for (const item of Array.isArray(items) ? items : []) {
      const number = numberFrom(item);
      if (!number) continue;
      out.push(accountRow(item, accountType, number));
    }
  };
  pushRows(payload?.soldTos, "Sold-To");
  pushRows(payload?.billTos, "Bill-To");
  pushRows(payload?.shipTos, "Ship-To");
  if (!out.length && Array.isArray(payload?.items)) pushRows(payload.items, requestedType);
  return out;
}

function accountRow(item, accountType, accountNumber) {
  const branchNumbers = collectBranchNumbers(item);
  return {
    region_code: `API_${accountType.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_${String(accountNumber).replace(/[^A-Za-z0-9]+/g, "_")}`,
    region_name: `ABC ${accountType} ${accountNumber}`,
    primary_state: item?.address?.state || null,
    primary_city: item?.address?.city || null,
    account_type: accountType,
    account_number: String(accountNumber),
    sold_to_number: accountType === "Sold-To" ? String(accountNumber) : numberFrom(item?.soldTo),
    bill_to_number: accountType === "Bill-To" ? String(accountNumber) : numberFrom(item?.billTo),
    ship_to_number: accountType === "Ship-To" ? String(accountNumber) : numberFrom(item?.shipTo),
    storefront: item?.storefront || item?.storeFront || "abc",
    branch_numbers: branchNumbers,
    address_json: item?.address || null,
    raw: item,
    source_endpoint: "POST /api/account/v1/search/accounts",
    abc_last_seen_at: nowIso,
    abc_fetched_at: nowIso,
  };
}

async function safeReadResponse(response, binary = false) {
  const contentType = response.headers.get("content-type") || "";
  if (binary || !contentType.includes("application/json")) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (contentType.includes("application/json")) {
      try {
        return { json: JSON.parse(buffer.toString("utf8")) };
      } catch {
        return { binary: { bytes: buffer.byteLength, contentType } };
      }
    }
    return { binary: { bytes: buffer.byteLength, contentType }, text: buffer.toString("utf8", 0, Math.min(buffer.length, 500)) };
  }
  return { json: await response.json() };
}

function parseDotenv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [rawKey, ...rest] = arg.slice(2).split("=");
    out[rawKey] = rest.length ? rest.join("=") : true;
  }
  return out;
}

function genericSummary(payload) {
  if (payload === null || payload === undefined) return { shape: "empty" };
  if (Array.isArray(payload)) return { shape: "array", count: payload.length, firstKeys: keys(payload[0]) };
  if (typeof payload === "object") {
    const out = { shape: "object", keys: keys(payload) };
    if (payload.pagination) out.pagination = payload.pagination;
    for (const key of ["items", "templates", "webhooks", "soldTos", "billTos", "shipTos", "branches", "availability"]) {
      if (Array.isArray(payload[key])) out[`${key}Count`] = payload[key].length;
    }
    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    if (lines.length) out.lineStatusCodes = unique(lines.map((line) => line?.status?.code).filter(Boolean));
    return out;
  }
  return { shape: typeof payload };
}

function summarizeErrorPayload(payload) {
  const value = payload?.json ?? payload?.text ?? null;
  if (!value) return null;
  if (typeof value === "string") return { text: sanitizeMessage(value.slice(0, 240)) };
  if (typeof value === "object") {
    const message = value.error_description || value.errorMessage || value.message || value.error || value.title || null;
    return { keys: keys(value), message: message ? sanitizeMessage(String(message).slice(0, 240)) : null };
  }
  return { type: typeof value };
}

function classifyEndpointFailure(status, payload) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload || {});
  if (status === 401) return "unauthorized_or_missing_scope";
  if (status === 403) return "forbidden_or_track_limited";
  if (status === 404) return "not_found_or_no_fixture";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_error";
  if (/scope/i.test(text)) return "scope_limited";
  return "request_rejected";
}

function stripDynamicValues(path) {
  const [pathOnly, query] = path.split("?");
  const stripped = pathOnly
    .replace(/\/soldtos\/[^/]+$/, "/soldtos/{soldToNumber}")
    .replace(/\/billtos\/[^/]+$/, "/billtos/{billToNumber}")
    .replace(/\/shiptos\/[^/]+\/contacts$/, "/shiptos/{shipToNumber}/contacts")
    .replace(/\/shiptos\/[^/]+$/, "/shiptos/{shipToNumber}")
    .replace(/\/branches\/[^/]+$/, "/branches/{branchNumber}")
    .replace(/\/items\/[^/]+\/images$/, "/items/{assetId}/images")
    .replace(/\/items\/[^/]+\/(recents|frequents|favorites)$/, "/items/{billToNumber}/$1")
    .replace(/\/items\/[^/]+$/, "/items/{itemNumber}")
    .replace(/\/availability\/items\/[^/]+\/branches$/, "/availability/items/{itemNumber}/branches")
    .replace(/\/orders\/templates\/[^/]+$/, "/orders/templates/{templateId}")
    .replace(/\/orders\/(?!orderHistory$|templates$)[^/]+$/, "/orders/{orderNumber}")
    .replace(/\/history\/[^/]+$/, "/history/{billToNumber}")
    .replace(/\/invoices\/id\/[^/]+$/, "/invoices/id/{invoiceId}");
  return query === undefined ? stripped : `${stripped}?{query}`;
}

function collectBranchNumbers(payload) {
  const out = [];
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 6) return;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 100)) visit(item, depth + 1);
      return;
    }
    const number =
      value.branchNumber ||
      value.branch?.number ||
      value.branch?.branchNumber ||
      (value.homeBranch !== undefined ? value.number : null) ||
      (value.type && value.storefront ? value.number : null);
    if (number) out.push(String(number));
    if (Array.isArray(value.branches)) visit(value.branches, depth + 1);
    if (value.branch) visit(value.branch, depth + 1);
  };
  visit(payload);
  return unique(out);
}

function numberFrom(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return String(value);
  return value.number || value.accountNumber || value.branchNumber || value.id || null;
}

function addUnique(target, values) {
  for (const value of values || []) {
    const text = String(value);
    if (text && !target.includes(text)) target.push(text);
  }
}

function firstItem(value) {
  return Array.isArray(value) && value.length ? value[0] : null;
}

function firstImageAssetId(item) {
  const images = item?.images || item?.imageAssets || [];
  const image = firstItem(images);
  return image?.assetId || image?.id || null;
}

function firstItemNumber(items) {
  const item = firstItem(items);
  return numberFrom(item?.item) || item?.itemNumber || item?.number || null;
}

function chunks(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function keys(value) {
  return value && typeof value === "object" ? Object.keys(value).slice(0, 12) : [];
}

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberArg(key, fallback) {
  const parsed = Number(args[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function elapsed(started) {
  return Math.round(performance.now() - started);
}

function statusClass(status) {
  return typeof status === "number" ? `${Math.floor(status / 100)}xx` : status;
}

function maskId(value) {
  if (!value) return null;
  const text = String(value);
  if (text.length <= 4) return "***";
  return `${"*".repeat(Math.min(8, text.length - 4))}${text.slice(-4)}`;
}

function sanitizeMessage(value) {
  return String(value || "")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/Basic\s+[A-Za-z0-9._~+/=-]+/gi, "Basic [redacted]")
    .replace(clientId || "never-match-client-id", "[client_id]")
    .replace(clientSecret || "never-match-client-secret", "[client_secret]")
    .replace(supabaseServiceRoleKey || "never-match-service-role", "[service_role]");
}

function failClosed(message) {
  summary.token = { status: "not_attempted", category: "missing_config", message };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(1);
}

function progress(message) {
  if (args.quiet) return;
  console.error(`[abc-production-sync] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compactSummary(value) {
  return {
    generatedAt: value.generatedAt,
    environment: value.environment,
    apiBaseUrl: value.apiBaseUrl,
    mode: value.mode,
    token: value.token,
    tokenRefreshes: value.tokenRefreshes || 0,
    sync: value.sync,
    skippedWrites: value.skippedWrites,
    skippedSensitiveReads: value.skippedSensitiveReads,
    requestStats: value.requestStats,
    endpointAccessTotals: {
      passed: value.endpointAccess.filter((endpoint) => endpoint.statusClass === "2xx").length,
      skipped: value.endpointAccess.filter((endpoint) => endpoint.status === "skipped").length,
      failedOrDenied: value.endpointAccess.filter((endpoint) => endpoint.status !== "skipped" && endpoint.statusClass !== "2xx").length,
      rateLimited: value.endpointAccess.filter((endpoint) => endpoint.status === 429).length,
    },
    outputPath: value.outputPath,
  };
}
