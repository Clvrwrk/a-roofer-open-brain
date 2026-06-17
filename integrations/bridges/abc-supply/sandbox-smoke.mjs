#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

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

const DEFAULT_SCOPE_ATTEMPTS = [
  "location.read product.read account.read pricing.read order.read allOrder.read notification.read invoice.read invoice.history.read",
  "location.read product.read account.read pricing.read order.read notification.read invoice.read invoice.history.read",
  "location.read product.read account.read order.read notification.read invoice.read invoice.history.read",
  "location.read product.read account.read",
  "location.read product.read notification.read",
];

const UOM_FIELD_PATTERN = /(uom|unitOfMeasure|unitOfMeasurement|measure|measurementUnit|stockingUnit|sellingUnit|baseUnit|length|width|height|weight|quantity)/i;
const PRICE_DATE_FIELD_PATTERN = /(date|effective|expiration|expires|validFrom|validTo|asOf)/i;

const nowIso = new Date().toISOString();
const runStartedAt = performance.now();
const args = new Set(process.argv.slice(2));
const writeOutput = !args.has("--no-output");
const includePdf = args.has("--include-pdf");
const state = {
  soldToNumber: null,
  billToNumber: null,
  shipToNumber: null,
  branchNumber: null,
  itemNumber: null,
  assetId: null,
  orderNumber: null,
  confirmationNumber: null,
  templateId: null,
  webhookId: null,
  invoiceId: null,
  accountBranchNumbers: [],
  branchNumbers: [],
  availabilityBranchNumbers: [],
  pricedBranchNumbers: [],
  productUomFields: [],
  pricingUomFields: [],
  pricingDateFields: [],
  pricingLineStatusCodes: [],
};

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
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const dotenv = parseDotenv(ENV_PATH);
const env = { ...process.env, ...dotenv };
const abcEnv = (env.ABC_SUPPLY_ENV || "sandbox").toLowerCase();
const configDefaults = DEFAULTS[abcEnv] || DEFAULTS.sandbox;
const apiBaseUrl = stripTrailingSlash(env.ABC_SUPPLY_API_BASE_URL || configDefaults.apiBaseUrl);
const authBaseUrl = stripTrailingSlash(env.ABC_SUPPLY_AUTH_BASE_URL || configDefaults.authBaseUrl);
const clientId = env.ABC_SUPPLY_CLIENT_ID || env.ClientID;
const clientSecret = env.ABC_SUPPLY_CLIENT_SECRET || env.Client_Secret;

const summary = {
  generatedAt: nowIso,
  environment: abcEnv,
  apiBaseUrl,
  authBaseUrl,
  envShape: {
    ABC_SUPPLY_CLIENT_ID: Boolean(env.ABC_SUPPLY_CLIENT_ID),
    ABC_SUPPLY_CLIENT_SECRET: Boolean(env.ABC_SUPPLY_CLIENT_SECRET),
    ABC_SUPPLY_API_BASE_URL: Boolean(env.ABC_SUPPLY_API_BASE_URL),
    ABC_SUPPLY_AUTH_BASE_URL: Boolean(env.ABC_SUPPLY_AUTH_BASE_URL),
    ABC_SUPPLY_SCOPES: Boolean(env.ABC_SUPPLY_SCOPES),
    fallbackClientLabelsPresent: Boolean(env.ClientID || env.Client_Secret),
  },
  token: null,
  derived: {},
  endpoints: [],
  skippedMutations: [
    "PUT /api/product/v1/items/{billToNumber}/favorites/{itemNumber}",
    "POST /api/order/v2/orders",
    "POST /api/notification/v2/webhooks",
    "PATCH /api/notification/v2/webhooks/{webhookId}",
    "DELETE /api/notification/v2/webhooks/{webhookId}",
  ],
  skippedSensitiveReads: includePdf ? [] : ["GET /api/invoice/v1/invoices/pdf/{invoiceId}"],
};

if (!clientId || !clientSecret) {
  failClosed("Missing ABC sandbox credentials. Set ABC_SUPPLY_CLIENT_ID and ABC_SUPPLY_CLIENT_SECRET.");
}

const token = await getToken();
summary.token = token.summary;

await searchAccountsFromSandbox();

await runEndpoint({
  name: "Location: Search Branches",
  method: "GET",
  path: `/api/location/v1/branches?state=${encodeURIComponent(env.ABC_SUPPLY_SMOKE_BRANCH_STATE || "WI")}`,
  scope: "location.read",
  onSuccess: (payload) => {
    const branchNumbers = collectBranchNumbers(payload);
    addUniqueValues(state.branchNumbers, branchNumbers);
    state.branchNumber ||= branchNumbers[0] || firstBranchNumberFromBranchSearch(payload);
    return {
      shape: Array.isArray(payload) ? "array" : typeof payload,
      count: Array.isArray(payload) ? payload.length : undefined,
      branchNumbersSeen: branchNumbers.length,
      branchNumberSample: branchNumbers.slice(0, 5),
    };
  },
});

await runEndpoint({
  name: "Location: Get Branch",
  method: "GET",
  path: `/api/location/v1/branches/${encodePath(state.branchNumber)}`,
  scope: "location.read",
  requires: ["branchNumber"],
});

await runEndpoint({
  name: "Product: Get Hierarchy",
  method: "GET",
  path: "/api/product/v1/hierarchy?itemsPerPage=1&pageNumber=1",
  scope: "product.read",
});

await runEndpoint({
  name: "Product: Search Items",
  method: "POST",
  path: "/api/product/v1/search/items?familyItems=false",
  scope: "product.read",
  body: {
    filters: [
      {
        key: "itemDescription",
        condition: "contains",
        values: [env.ABC_SUPPLY_SMOKE_ITEM_QUERY || "Roofing"],
        joinCondition: null,
      },
    ],
    pagination: {
      itemsPerPage: numberEnv("ABC_SUPPLY_SMOKE_PAGE_SIZE", 5),
      pageNumber: 1,
    },
  },
  onSuccess: (payload) => {
    const item = firstItem(payload);
    captureItem(item);
    return genericSummary(payload);
  },
});

await runEndpoint({
  name: "Product: Get All Items",
  method: "GET",
  path: "/api/product/v1/items?itemsPerPage=2&pageNumber=1",
  scope: "product.read",
  onSuccess: (payload) => {
    const item = firstItem(payload);
    captureItem(item);
    return genericSummary(payload);
  },
});

await runEndpoint({
  name: "Product: Get Item",
  method: "GET",
  path: `/api/product/v1/items/${encodePath(state.itemNumber)}`,
  scope: "product.read",
  requires: ["itemNumber"],
  onSuccess: (payload) => {
    captureItem(payload);
    addUniqueValues(state.productUomFields, fieldPaths(payload, UOM_FIELD_PATTERN));
    return genericSummary(payload);
  },
});

await runEndpoint({
  name: "Product: Search Item Availability",
  method: "POST",
  path: "/api/product/v1/search/availability/items",
  scope: "product.read",
  requires: ["itemNumber"],
  body: {
    filters: [
      {
        key: "itemNumber",
        condition: "equals",
        values: [state.itemNumber],
      },
    ],
    pagination: {
      itemsPerPage: numberEnv("ABC_SUPPLY_SMOKE_PAGE_SIZE", 5),
      pageNumber: 1,
    },
  },
  onSuccess: (payload) => {
    const branchNumbers = collectAvailabilityBranchNumbers(payload);
    addUniqueValues(state.availabilityBranchNumbers, branchNumbers);
    return {
      ...genericSummary(payload),
      availabilityBranchNumbersSeen: branchNumbers.length,
      availabilityBranchNumberSample: branchNumbers.slice(0, 5),
    };
  },
});

await runEndpoint({
  name: "Product: Get Item Availability",
  method: "GET",
  path: `/api/product/v1/availability/items/${encodePath(state.itemNumber)}/branches`,
  scope: "product.read",
  requires: ["itemNumber"],
  onSuccess: (payload) => {
    const branchNumbers = collectAvailabilityBranchNumbers(payload);
    addUniqueValues(state.availabilityBranchNumbers, branchNumbers);
    return {
      ...genericSummary(payload),
      availabilityBranchNumbersSeen: branchNumbers.length,
      availabilityBranchNumberSample: branchNumbers.slice(0, 5),
    };
  },
});

await runEndpoint({
  name: "Product: Get Item Image",
  method: "GET",
  path: `/api/product/v1/items/${encodePath(state.assetId)}/images`,
  scope: "product.read",
  requires: ["assetId"],
  binary: true,
});

await runEndpoint({
  name: "Order: Get Order History",
  method: "GET",
  path: `/api/order/v2/orders/orderHistory?${new URLSearchParams({
    startDate: env.ABC_SUPPLY_SMOKE_ORDER_START || "2024-03-15",
    endDate: env.ABC_SUPPLY_SMOKE_ORDER_END || "2024-06-15",
    itemsPerPage: String(numberEnv("ABC_SUPPLY_SMOKE_PAGE_SIZE", 5)),
    pageNumber: "1",
  })}`,
  scope: "order.read",
  onSuccess: (payload) => {
    const order = firstArrayItem(payload?.items);
    state.orderNumber ||= order?.orderNumber;
    state.confirmationNumber ||= order?.confirmationNumber;
    return genericSummary(payload);
  },
});

await runEndpoint({
  name: "Order: Get Order",
  method: "GET",
  path: state.orderNumber
    ? `/api/order/v2/orders/${encodePath(state.orderNumber)}`
    : `/api/order/v2/orders?confirmationNumber=${encodeURIComponent(state.confirmationNumber)}`,
  scope: "order.read",
  requiresAny: ["orderNumber", "confirmationNumber"],
  onSuccess: (payload) => {
    captureAccountRefs(payload);
    return genericSummary(payload);
  },
});

await runAccountDetailEndpoints();

for (const suffix of ["recents", "frequents", "favorites"]) {
  const query = new URLSearchParams({
    itemsPerPage: String(numberEnv("ABC_SUPPLY_SMOKE_PAGE_SIZE", 5)),
    pageNumber: "1",
  });
  if (state.branchNumber) query.set("branchNumber", String(state.branchNumber));
  await runEndpoint({
    name: `Product: Get ${capitalize(suffix)} Items`,
    method: "GET",
    path: `/api/product/v1/items/${encodePath(state.billToNumber)}/${suffix}?${query}`,
    scope: "product.read",
    requires: ["billToNumber"],
  });
}

await runPricingPerBranchEndpoints();

await runEndpoint({
  name: "Order: Get Order Templates",
  method: "GET",
  path: `/api/order/v2/orders/templates?${new URLSearchParams({
    accountNumber: state.billToNumber || "",
    itemsPerPage: String(numberEnv("ABC_SUPPLY_SMOKE_PAGE_SIZE", 5)),
    pageNumber: "1",
  })}`,
  scope: "order.read",
  requires: ["billToNumber"],
  onSuccess: (payload) => {
    const template = firstArrayItem(payload?.templates) || firstArrayItem(payload?.items);
    state.templateId ||= template?.templateId || template?.id;
    return genericSummary(payload);
  },
});

await runEndpoint({
  name: "Order: Get Order Template By ID",
  method: "GET",
  path: `/api/order/v2/orders/templates/${encodePath(state.templateId)}`,
  scope: "order.read",
  requires: ["templateId"],
});

await runEndpoint({
  name: "Notification: Get Webhooks",
  method: "GET",
  path: "/api/notification/v2/webhooks",
  scope: "notification.read",
  onSuccess: (payload) => {
    const webhook = firstArrayItem(payload?.webhooks) || firstArrayItem(payload?.items) || firstArrayItem(payload);
    state.webhookId ||= webhook?.webhookId || webhook?.id;
    return genericSummary(payload);
  },
});

await runEndpoint({
  name: "Notification: Get Webhook",
  method: "GET",
  path: `/api/notification/v2/webhooks/${encodePath(state.webhookId)}`,
  scope: "notification.read",
  requires: ["webhookId"],
});

await runEndpoint({
  name: "Invoice: Get Invoice History",
  method: "GET",
  path: `/api/invoice/v1/invoices/history/${encodePath(state.billToNumber)}?${new URLSearchParams({
    startDate: env.ABC_SUPPLY_SMOKE_INVOICE_START || "2024-01-01T00:00:00Z",
    endDate: env.ABC_SUPPLY_SMOKE_INVOICE_END || nowIso,
    itemsPerPage: String(numberEnv("ABC_SUPPLY_SMOKE_PAGE_SIZE", 5)),
    pageNumber: "1",
  })}`,
  scope: "invoice.history.read",
  requires: ["billToNumber"],
  onSuccess: (payload) => {
    const invoice = firstArrayItem(payload?.items);
    state.invoiceId ||= invoice?.invoiceId || invoice?.invoiceNumber || invoice?.id;
    return genericSummary(payload);
  },
});

await runEndpoint({
  name: "Invoice: Get Invoice By ID",
  method: "GET",
  path: `/api/invoice/v1/invoices/id/${encodePath(state.invoiceId)}`,
  scope: "invoice.read",
  requires: ["invoiceId"],
});

if (includePdf) {
  await runEndpoint({
    name: "Invoice: Get Invoice PDF",
    method: "GET",
    path: `/api/invoice/v1/invoices/pdf/${encodePath(state.invoiceId)}`,
    scope: "invoice.read",
    requires: ["invoiceId"],
    binary: true,
  });
}

summary.derived = {
  soldToNumber: maskId(state.soldToNumber),
  billToNumber: maskId(state.billToNumber),
  shipToNumber: maskId(state.shipToNumber),
  branchNumber: state.branchNumber || null,
  accountBranchNumbersDiscovered: state.accountBranchNumbers.slice(0, 10),
  branchNumbersDiscovered: state.branchNumbers.slice(0, 10),
  availabilityBranchNumbersDiscovered: state.availabilityBranchNumbers.slice(0, 10),
  pricedBranchNumbers: state.pricedBranchNumbers.slice(0, 10),
  itemNumber: state.itemNumber || null,
  assetId: state.assetId || null,
  orderNumber: maskId(state.orderNumber),
  confirmationNumber: maskId(state.confirmationNumber),
  templateId: maskId(state.templateId),
  webhookId: maskId(state.webhookId),
  invoiceId: maskId(state.invoiceId),
  productUomFieldPaths: state.productUomFields.slice(0, 20),
  pricingUomFieldPaths: state.pricingUomFields.slice(0, 20),
  pricingDateFieldPaths: state.pricingDateFields.slice(0, 20),
  pricingLineStatusCodes: state.pricingLineStatusCodes,
};

summary.totals = {
  passed: summary.endpoints.filter((e) => e.statusClass === "2xx").length,
  skipped: summary.endpoints.filter((e) => e.status === "skipped").length,
  failedOrDenied: summary.endpoints.filter((e) => e.status !== "skipped" && e.statusClass !== "2xx").length,
  mutationsSkipped: summary.skippedMutations.length,
  sensitiveReadsSkipped: summary.skippedSensitiveReads.length,
};

summary.requestStats = buildRequestStats();
summary.supabaseCoverage = buildSupabaseCoverage();

if (writeOutput) {
  const outPath =
    env.ABC_SUPPLY_SMOKE_OUT ||
    resolve(ROOT, "integrations/bridges/abc-supply/.sandbox-runs", `${nowIso.replace(/[:.]/g, "-")}.json`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  summary.outputPath = outPath;
}

console.log(JSON.stringify(summary, null, 2));

async function searchAccountsFromSandbox() {
  await runEndpoint({
    name: "Account: Search Accounts (Ship-To recommended)",
    method: "POST",
    path: "/api/account/v1/search/accounts",
    scope: "account.read",
    body: accountSearchBody([
      {
        key: "accountType",
        condition: "equals",
        values: ["Ship-To"],
        joinCondition: "and",
      },
      {
        key: "storefront",
        condition: "equals",
        values: ["abc"],
      },
    ]),
    onSuccess: (payload) => summarizeAndCaptureAccountSearch(payload, { filter: "accountType=Ship-To" }),
  });
  if (state.soldToNumber || state.billToNumber || state.shipToNumber) return;

  const configured = env.ABC_SUPPLY_SMOKE_ACCOUNT_STATES || env.ABC_SUPPLY_SMOKE_ACCOUNT_STATE;
  const accountStates = unique(
    (configured || "WI,TX,IL,MD,MT,CA,FL,GA,NC,OH,PA").split(",").map((value) => value.trim().toUpperCase())
  ).filter(Boolean);

  for (const stateCode of accountStates) {
    await runEndpoint({
      name: `Account: Search Accounts (${stateCode})`,
      method: "POST",
      path: "/api/account/v1/search/accounts",
      scope: "account.read",
      body: accountSearchBody([
        {
          key: "address.state",
          condition: "equals",
          values: [stateCode],
          joinCondition: "and",
        },
        {
          key: "storefront",
          condition: "equals",
          values: ["abc"],
        },
      ]),
      onSuccess: (payload) => summarizeAndCaptureAccountSearch(payload, { stateCode }),
    });
    if (state.soldToNumber || state.billToNumber || state.shipToNumber) return;
  }

  await runEndpoint({
    name: "Account: Search Accounts (storefront only)",
    method: "POST",
    path: "/api/account/v1/search/accounts",
    scope: "account.read",
    body: accountSearchBody([
      {
        key: "storefront",
        condition: "equals",
        values: ["abc"],
      },
    ]),
    onSuccess: (payload) => summarizeAndCaptureAccountSearch(payload, { stateCode: null }),
  });
}

async function runAccountDetailEndpoints() {
  await runEndpoint({
    name: "Account: Get Sold-To",
    method: "GET",
    path: `/api/account/v1/soldtos/${encodePath(state.soldToNumber)}`,
    scope: "account.read",
    requires: ["soldToNumber"],
  });

  await runEndpoint({
    name: "Account: Get Bill-To",
    method: "GET",
    path: `/api/account/v1/billtos/${encodePath(state.billToNumber)}`,
    scope: "account.read",
    requires: ["billToNumber"],
  });

  await runEndpoint({
    name: "Account: Get Ship-To",
    method: "GET",
    path: `/api/account/v1/shiptos/${encodePath(state.shipToNumber)}`,
    scope: "account.read",
    requires: ["shipToNumber"],
    onSuccess: (payload) => {
      captureAccountRefs(payload);
      return genericSummary(payload);
    },
  });

  await runEndpoint({
    name: "Account: Get Ship-To Contacts",
    method: "GET",
    path: `/api/accounts/v1/shiptos/${encodePath(state.shipToNumber)}/contacts`,
    scope: "account.read",
    requires: ["shipToNumber"],
  });

  await runEndpoint({
    name: "Account: Get Ship-To Contacts (account v1 fallback)",
    method: "GET",
    path: `/api/account/v1/shiptos/${encodePath(state.shipToNumber)}/contacts`,
    scope: "account.read",
    requires: ["shipToNumber"],
  });
}

async function runPricingPerBranchEndpoints() {
  const shipToAvailableBranches = state.accountBranchNumbers.filter((branchNumber) =>
    state.availabilityBranchNumbers.includes(branchNumber)
  );
  const branchPool = shipToAvailableBranches.length ? shipToAvailableBranches : state.accountBranchNumbers;
  const candidateBranches = unique([
    branchPool.includes(state.branchNumber) ? state.branchNumber : null,
    ...branchPool,
  ].filter(Boolean)).slice(0, numberEnv("ABC_SUPPLY_SMOKE_PRICE_BRANCH_LIMIT", 3));

  if (!state.shipToNumber || !state.itemNumber || candidateBranches.length === 0) {
    summary.endpoints.push({
      name: "Pricing: Price Items (per branch)",
      method: "POST",
      pathTemplate: "/api/pricing/v2/prices",
      scope: "pricing.read",
      status: "skipped",
      reason: [
        !state.shipToNumber ? "missing derived shipToNumber" : null,
        !state.itemNumber ? "missing derived itemNumber" : null,
        candidateBranches.length === 0 ? "missing branch candidates" : null,
      ].filter(Boolean).join("; "),
    });
    return;
  }

  for (const branchNumber of candidateBranches) {
    await runEndpoint({
      name: `Pricing: Price Items (branch ${branchNumber})`,
      method: "POST",
      path: "/api/pricing/v2/prices",
      scope: "pricing.read",
      body: {
        requestId: `open-brain-smoke-${Date.now()}-${branchNumber}`,
        shipToNumber: state.shipToNumber,
        branchNumber: String(branchNumber),
        purpose: "ordering",
        lines: [
          {
            id: "1",
            itemNumber: state.itemNumber,
            quantity: 1,
          },
        ],
      },
      onSuccess: (payload) => summarizeAndCapturePricing(payload, branchNumber),
    });
  }
}

function accountSearchBody(filters) {
  return {
    filters,
    pagination: {
      itemsPerPage: numberEnv("ABC_SUPPLY_SMOKE_PAGE_SIZE", 5),
      pageNumber: 1,
    },
  };
}

function summarizeAndCaptureAccountSearch(payload, meta) {
  captureAccountRefs(payload);
  addUniqueValues(state.accountBranchNumbers, collectBranchNumbers(payload));
  return {
    ...meta,
    soldTos: count(payload?.soldTos),
    billTos: count(payload?.billTos),
    shipTos: count(payload?.shipTos),
    pagination: summarizePagination(payload?.pagination),
  };
}

function summarizeAndCapturePricing(payload, branchNumber) {
  addUniqueValues(state.pricedBranchNumbers, [String(branchNumber)]);
  addUniqueValues(state.pricingUomFields, fieldPaths(payload, UOM_FIELD_PATTERN));
  addUniqueValues(state.pricingDateFields, fieldPaths(payload, PRICE_DATE_FIELD_PATTERN));

  const base = genericSummary(payload);
  const lines = Array.isArray(payload?.lines) ? payload.lines : [];
  const lineStatusCodes = unique(lines.map((line) => line?.status?.code).filter(Boolean));
  addUniqueValues(state.pricingLineStatusCodes, lineStatusCodes);

  return {
    ...base,
    branchNumber: String(branchNumber),
    linesCount: lines.length,
    lineStatusCodes,
    uomFieldPaths: fieldPaths(payload, UOM_FIELD_PATTERN).slice(0, 12),
    dateFieldPaths: fieldPaths(payload, PRICE_DATE_FIELD_PATTERN).slice(0, 12),
  };
}

async function getToken() {
  const configuredScope = env.ABC_SUPPLY_SCOPES?.trim();
  const scopeAttempts = configuredScope ? [configuredScope] : DEFAULT_SCOPE_ATTEMPTS;
  const tokenUrl = `${authBaseUrl}/v1/token`;
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const failures = [];

  for (const scope of scopeAttempts) {
    const started = performance.now();
    const params = new URLSearchParams({ grant_type: "client_credentials", scope });
    let response;
    let payload;
    try {
      response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: params,
      });
      payload = await safeReadResponse(response);
    } catch (error) {
      failures.push({
        scope,
        status: "network_error",
        category: "network_failure",
        durationMs: elapsed(started),
        message: sanitizeMessage(error?.message),
      });
      continue;
    }

    if (response.ok && payload?.json?.access_token) {
      return {
        accessToken: payload.json.access_token,
        scope,
        summary: {
          status: response.status,
          statusClass: statusClass(response.status),
          scopeRequested: scope,
          scopeReturned: payload.json.scope || null,
          tokenType: payload.json.token_type || null,
          expiresInSeconds: payload.json.expires_in || null,
          durationMs: elapsed(started),
          attemptsBeforeSuccess: failures.length,
        },
      };
    }

    failures.push({
      scope,
      status: response.status,
      statusClass: statusClass(response.status),
      category: classifyTokenFailure(response.status, payload?.json || payload?.text),
      durationMs: elapsed(started),
      error: summarizeErrorPayload(payload),
    });

    if (!shouldRetryScopeFailure(response.status, payload?.json || payload?.text, configuredScope)) {
      break;
    }
  }

  summary.token = { status: "failed", failures };
  await maybeWriteFailedSummary();
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = 1;
  throw new Error("ABC sandbox token exchange failed; see redacted summary above.");
}

async function runEndpoint(endpoint) {
  const missing = endpoint.requires?.filter((key) => !state[key]) || [];
  const hasAny = endpoint.requiresAny?.some((key) => state[key]);
  if (missing.length || (endpoint.requiresAny && !hasAny)) {
    summary.endpoints.push({
      name: endpoint.name,
      method: endpoint.method,
      pathTemplate: stripDynamicValues(endpoint.path),
      scope: endpoint.scope,
      status: "skipped",
      reason: missing.length
        ? `missing derived ${missing.join(", ")}`
        : `missing one of ${endpoint.requiresAny.join(", ")}`,
    });
    return;
  }

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
    summary.endpoints.push({
      name: endpoint.name,
      method: endpoint.method,
      pathTemplate: stripDynamicValues(endpoint.path),
      scope: endpoint.scope,
      status: "network_error",
      category: "network_failure",
      durationMs: elapsed(started),
      message: sanitizeMessage(error?.message),
    });
    return;
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
    record.summary = endpoint.onSuccess
      ? endpoint.onSuccess(payload?.json ?? payload?.binary)
      : endpoint.binary
        ? binarySummary(payload)
        : genericSummary(payload?.json);
  } else {
    record.category = classifyEndpointFailure(response.status, payload?.json || payload?.text);
    record.error = summarizeErrorPayload(payload);
  }

  summary.endpoints.push(record);
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

async function maybeWriteFailedSummary() {
  if (!writeOutput) return;
  const outPath =
    env.ABC_SUPPLY_SMOKE_OUT ||
    resolve(ROOT, "integrations/bridges/abc-supply/.sandbox-runs", `${nowIso.replace(/[:.]/g, "-")}.json`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  summary.outputPath = outPath;
}

function failClosed(message) {
  summary.token = { status: "not_attempted", category: "missing_credentials", message };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(1);
}

function captureAccountRefs(payload) {
  if (!payload || typeof payload !== "object") return;
  addUniqueValues(state.branchNumbers, collectBranchNumbers(payload));

  const soldTo =
    payload.soldTo ||
    payload.salesOrder?.soldTo ||
    firstArrayItem(payload.soldTos) ||
    firstArrayItem(payload?.items)?.soldTo;
  const billTo =
    payload.billTo ||
    payload.salesOrder?.billTo ||
    firstArrayItem(payload.billTos) ||
    firstArrayItem(payload?.items)?.billTo ||
    firstArrayItem(payload.shipTos)?.billTo;
  const shipTo =
    payload.shipTo ||
    payload.salesOrder?.shipTo ||
    firstArrayItem(payload.shipTos) ||
    firstArrayItem(payload?.items)?.shipTo;
  const branch =
    payload.branch ||
    payload.salesOrder?.branch ||
    firstArrayItem(payload.branches) ||
    firstArrayItem(payload?.items)?.branch;

  state.soldToNumber ||= numberFrom(soldTo) || numberFrom(billTo?.soldTo) || numberFrom(shipTo?.soldTo);
  state.billToNumber ||= numberFrom(billTo) || numberFrom(shipTo?.billTo);
  state.shipToNumber ||= numberFrom(shipTo);
  state.branchNumber ||= numberFrom(branch) || firstBranchNumber(soldTo) || firstBranchNumber(billTo) || firstBranchNumber(shipTo);
}

function captureItem(item) {
  if (!item || typeof item !== "object") return;
  state.itemNumber ||= item.itemNumber || item.number;
  const image = firstArrayItem(item.images) || firstArrayItem(item.imageAssets);
  state.assetId ||= image?.assetId || image?.id;
  state.branchNumber ||= firstBranchNumber(item);
  addUniqueValues(state.branchNumbers, collectBranchNumbers(item));
  addUniqueValues(state.productUomFields, fieldPaths(item, UOM_FIELD_PATTERN));
}

function firstItem(payload) {
  if (Array.isArray(payload)) return payload[0];
  return (
    firstArrayItem(payload?.items) ||
    firstArrayItem(payload?.products) ||
    firstArrayItem(payload?.results) ||
    firstArrayItem(payload?.data)
  );
}

function firstBranchNumber(entity) {
  const branch = firstArrayItem(entity?.branches);
  return branch?.number || branch?.branchNumber || branch?.branch?.number || null;
}

function firstBranchNumberFromBranchSearch(payload) {
  const row = firstArrayItem(payload) || firstArrayItem(payload?.branches) || firstArrayItem(payload?.items);
  return row?.branch?.number || row?.number || row?.branchNumber || null;
}

function collectBranchNumbers(payload) {
  const out = [];
  const visit = (value, context = "") => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 50)) visit(item, context);
      return;
    }

    const directBranchNumber =
      value.branchNumber ||
      value.branch?.number ||
      value.branch?.branchNumber ||
      null;
    if (directBranchNumber) out.push(String(directBranchNumber));

    if (isBranchObject(value, context)) {
      const branchNumber = numberFrom(value);
      if (branchNumber) out.push(String(branchNumber));
    }

    for (const key of ["branches", "items", "soldTos", "billTos", "shipTos", "availability", "branchAvailability"]) {
      if (value[key]) visit(value[key], key);
    }
    if (value.branch) visit(value.branch, "branch");
  };

  visit(payload);
  return unique(out).filter(Boolean);
}

function collectAvailabilityBranchNumbers(payload) {
  const fromBranches = collectBranchNumbers(payload);
  const fromLooseKeys = fieldValuesByKey(payload, /branchNumber/i)
    .map((value) => String(value))
    .filter(Boolean);
  return unique([...fromBranches, ...fromLooseKeys]);
}

function isBranchObject(value, context) {
  if (!value || typeof value !== "object") return false;
  return Boolean(
    context === "branches" ||
      context === "branch" ||
      value.type === "Branch" ||
      value.storefront ||
      value.branchName ||
      value.branchNumber
  );
}

function fieldValuesByKey(payload, pattern, max = 40) {
  const out = [];
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 8 || out.length >= max) return;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 20)) visit(item, depth + 1);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (pattern.test(key) && (typeof child === "string" || typeof child === "number")) {
        out.push(child);
      }
      visit(child, depth + 1);
      if (out.length >= max) return;
    }
  };
  visit(payload);
  return out;
}

function fieldPaths(payload, pattern, max = 40) {
  const out = [];
  const visit = (value, path = "$", depth = 0) => {
    if (!value || typeof value !== "object" || depth > 8 || out.length >= max) return;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 2)) visit(item, `${path}[]`, depth + 1);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      const nextPath = `${path}.${key}`;
      if (pattern.test(key)) out.push(nextPath.replace(/\[\]\[\]/g, "[]"));
      visit(child, nextPath, depth + 1);
      if (out.length >= max) return;
    }
  };
  visit(payload);
  return unique(out);
}

function firstArrayItem(value) {
  return Array.isArray(value) && value.length ? value[0] : null;
}

function numberFrom(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return String(value);
  return value.number || value.branchNumber || value.accountNumber || value.id || null;
}

function genericSummary(payload) {
  if (payload === null || payload === undefined) return { shape: "empty" };
  if (Array.isArray(payload)) return { shape: "array", count: payload.length, firstKeys: keys(payload[0]) };
  if (typeof payload === "object") {
    const out = { shape: "object", keys: keys(payload) };
    if (payload.pagination) out.pagination = summarizePagination(payload.pagination);
    for (const key of ["items", "templates", "webhooks", "soldTos", "billTos", "shipTos", "branches"]) {
      if (Array.isArray(payload[key])) out[`${key}Count`] = payload[key].length;
    }
    return out;
  }
  return { shape: typeof payload };
}

function binarySummary(payload) {
  return payload?.binary || { shape: "binary", bytes: null };
}

function summarizeErrorPayload(payload) {
  const value = payload?.json ?? payload?.text ?? null;
  if (!value) return null;
  if (typeof value === "string") return { text: sanitizeMessage(value.slice(0, 240)) };
  if (typeof value === "object") {
    const message =
      value.error_description ||
      value.errorMessage ||
      value.message ||
      value.error ||
      value.title ||
      null;
    return {
      keys: keys(value),
      message: message ? sanitizeMessage(String(message).slice(0, 240)) : null,
    };
  }
  return { type: typeof value };
}

function classifyTokenFailure(status, payload) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload || {});
  if (status === 401 || /invalid_client/i.test(text)) return "invalid_client";
  if (status === 400 && /invalid_scope|scope/i.test(text)) return "invalid_scope";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_error";
  return "token_rejected";
}

function classifyEndpointFailure(status, payload) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload || {});
  if (status === 401) return "unauthorized_or_missing_scope";
  if (status === 403) return "forbidden_or_track_limited";
  if (status === 404) return "not_found_or_no_sandbox_fixture";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_error";
  if (/scope/i.test(text)) return "scope_limited";
  return "request_rejected";
}

function shouldRetryScopeFailure(status, payload, configuredScope) {
  if (configuredScope) return false;
  const category = classifyTokenFailure(status, payload);
  return category === "invalid_scope";
}

function summarizePagination(value) {
  if (!value || typeof value !== "object") return undefined;
  return {
    itemsPerPage: value.itemsPerPage ?? null,
    pageNumber: value.pageNumber ?? null,
    totalPages: value.totalPages ?? null,
    totalItems: value.totalItems ?? null,
  };
}

function stripDynamicValues(path) {
  const [pathOnly, query] = path.split("?");
  const stripped = pathOnly
    .replace(/\/soldtos\/[^/]+$/, "/soldtos/{soldToNumber}")
    .replace(/\/billtos\/[^/]+$/, "/billtos/{billToNumber}")
    .replace(/\/shiptos\/[^/]+\/contacts$/, "/shiptos/{shipToNumber}/contacts")
    .replace(/\/shiptos\/[^/]+$/, "/shiptos/{shipToNumber}")
    .replace(/\/branches\/[^/]+$/, "/branches/{branchNumber}")
    .replace(/\/items\/[^/]+\/(recents|frequents|favorites)$/, "/items/{billToNumber}/$1")
    .replace(/\/items\/[^/]+\/images$/, "/items/{assetId}/images")
    .replace(/\/items\/[^/]+$/, "/items/{itemNumber}")
    .replace(/\/availability\/items\/[^/]+\/branches$/, "/availability/items/{itemNumber}/branches")
    .replace(/\/orders\/templates\/[^/]+$/, "/orders/templates/{templateId}")
    .replace(/\/orders\/(?!orderHistory$|templates$)[^/]+$/, "/orders/{orderNumber}")
    .replace(/\/webhooks\/[^/]+$/, "/webhooks/{webhookId}")
    .replace(/\/history\/[^/]+$/, "/history/{billToNumber}")
    .replace(/\/invoices\/id\/[^/]+$/, "/invoices/id/{invoiceId}")
    .replace(/\/invoices\/pdf\/[^/]+$/, "/invoices/pdf/{invoiceId}");
  return query === undefined ? stripped : `${stripped}?{query}`;
}

function maskId(value) {
  if (!value) return null;
  const text = String(value);
  if (text.length <= 4) return "***";
  return `${"*".repeat(Math.min(8, text.length - 4))}${text.slice(-4)}`;
}

function keys(value) {
  return value && typeof value === "object" ? Object.keys(value).slice(0, 12) : [];
}

function count(value) {
  return Array.isArray(value) ? value.length : 0;
}

function unique(values) {
  return [...new Set(values)];
}

function addUniqueValues(target, values) {
  for (const value of values || []) {
    if (value !== null && value !== undefined && !target.includes(String(value))) {
      target.push(String(value));
    }
  }
}

function buildRequestStats() {
  const attempted = summary.endpoints.filter((endpoint) => typeof endpoint.status === "number");
  const durations = attempted.map((endpoint) => endpoint.durationMs).filter((value) => typeof value === "number");
  const tokenAttempts = summary.token?.status ? Number(summary.token.attemptsBeforeSuccess || 0) + 1 : 0;
  const wallMs = elapsed(runStartedAt);
  return {
    endpointRequests: attempted.length,
    tokenRequests: tokenAttempts,
    totalHttpRequests: attempted.length + tokenAttempts,
    wallMs,
    observedRequestsPerSecond: Number(((attempted.length + tokenAttempts) / Math.max(wallMs / 1000, 1)).toFixed(2)),
    rateLimitedResponses: attempted.filter((endpoint) => endpoint.status === 429).length,
    averageEndpointLatencyMs: durations.length
      ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
      : null,
    maxEndpointLatencyMs: durations.length ? Math.max(...durations) : null,
  };
}

function buildSupabaseCoverage() {
  return {
    locations: coverageRow(
      ["Account: Search Accounts", "Location: Search Branches", "Location: Get Branch"],
      ["vendors", "vendor_branches", "branch/location atoms"],
      "Ship-To account search and branch reads establish branch access before product and pricing ingestion."
    ),
    productCatalog: coverageRow(
      ["Product: Get Hierarchy", "Product: Search Items", "Product: Get All Items", "Product: Get Item", "Product: Get Item Image"],
      ["products", "product_taxonomy", "product_color_variants", "abc_product_categories"],
      "Get All Items is the full catalog path; search/detail/image provide shape checks and asset IDs."
    ),
    availability: coverageRow(
      ["Product: Search Item Availability", "Product: Get Item Availability"],
      ["branch-item availability cache", "availability atoms"],
      "ABC availability means a branch offers the item; it is not stock or inventory."
    ),
    pricingPerLocation: coverageRow(
      ["Pricing: Price Items"],
      ["product_vendor_price_observations", "price_agreements", "price_agreement_items", "abc_price_agreements", "abc_price_list_items"],
      `Pricing probes use Ship-To branch access first and are capped by ABC_SUPPLY_SMOKE_PRICE_BRANCH_LIMIT, currently ${numberEnv("ABC_SUPPLY_SMOKE_PRICE_BRANCH_LIMIT", 3)}.`
    ),
    priceDates: {
      ...coverageRow(
        ["Pricing: Price Items"],
        ["abc_price_change_log", "product_vendor_price_observations.effective_date"],
        "The Price Items docs do not require an explicit price date; the harness records any date/effective/asOf fields if ABC returns them."
      ),
      fieldPathsSeen: state.pricingDateFields.slice(0, 20),
    },
    uomCalculations: {
      ...coverageRow(
        ["Product: Get Item", "Pricing: Price Items"],
        ["product_uom_conversions", "product/product-pricing UOM metadata"],
        "ABC pricing accepts optional lines[].uom; if omitted, ABC prices in its internal stocking UOM and returns UOM fields for mapping."
      ),
      productFieldPathsSeen: state.productUomFields.slice(0, 20),
      pricingFieldPathsSeen: state.pricingUomFields.slice(0, 20),
    },
    orders: coverageRow(
      ["Order: Get Order History", "Order: Get Order", "Order: Get Order Templates", "Order: Get Order Template By ID"],
      ["supplier orders", "job-linked order atoms", "order template cache"],
      "Order placement stays behind the write-endpoint human review gate."
    ),
    invoices: coverageRow(
      ["Invoice: Get Invoice History", "Invoice: Get Invoice By ID", "Invoice: Get Invoice PDF"],
      ["invoice_documents", "accounting atoms", "invoice pricing gate"],
      includePdf ? "PDF read was explicitly enabled for this run." : "PDF read is intentionally skipped until storage and PII handling are reviewed."
    ),
    notifications: coverageRow(
      ["Notification: Get Webhooks", "Notification: Get Webhook"],
      ["webhook registrations", "order/invoice event atoms"],
      "Webhook create/update/delete are skipped until write-endpoint approval."
    ),
  };
}

function coverageRow(prefixes, targetTables, notes) {
  const matching = summary.endpoints.filter((endpoint) => prefixes.some((prefix) => endpoint.name.startsWith(prefix)));
  return {
    targetTables,
    endpointsAttempted: matching.length,
    passed: matching.filter((endpoint) => endpoint.statusClass === "2xx").length,
    failedOrDenied: matching.filter((endpoint) => endpoint.status !== "skipped" && endpoint.statusClass !== "2xx").length,
    skipped: matching.filter((endpoint) => endpoint.status === "skipped").length,
    notes,
  };
}

function numberEnv(key, fallback) {
  const parsed = Number(env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function encodePath(value) {
  return encodeURIComponent(String(value || ""));
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

function sanitizeMessage(value) {
  return String(value || "")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/Basic\s+[A-Za-z0-9._~+/=-]+/gi, "Basic [redacted]")
    .replace(clientId || "never-match-client-id", "[client_id]")
    .replace(clientSecret || "never-match-client-secret", "[client_secret]");
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
