#!/usr/bin/env node
import { createHash } from "node:crypto";
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

const DEFAULT_SCOPES =
  "location.read product.read account.read pricing.read order.read allOrder.read notification.read invoice.read invoice.history.read";

const startedAt = performance.now();
const now = new Date();
const nowIso = now.toISOString();
const runKey = `abc-mirror-${nowIso.replace(/[:.]/g, "-")}`;
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
const selected = new Set(
  String(args.only || "branch-access,contacts,pricing,orders,invoices")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const writeOutput = !args["no-output"];
const dryRun = Boolean(args["dry-run"]);
const historyStart = String(args["history-start"] || "2000-01-01");
const historyEnd = String(args["history-end"] || nowIso.slice(0, 10));
const historyWindowYears = numberArg("history-window-years", 1);
const historyItemsPerPage = numberArg("history-items-per-page", 100);
const maxPagesPerWindow = numberArg("max-pages-per-window", 10000);
const orderDetailLimit = args["order-detail-limit"] ? Number(args["order-detail-limit"]) : Infinity;
const invoiceDetailLimit = args["invoice-detail-limit"] ? Number(args["invoice-detail-limit"]) : Infinity;
const detailConcurrency = numberArg("detail-concurrency", 6);
const pricingMaxBranches = args["pricing-max-branches"] ? Number(args["pricing-max-branches"]) : Infinity;
const pricingMaxItems = args["pricing-max-items"] ? Number(args["pricing-max-items"]) : Infinity;
const pricingBatchSize = Math.min(50, numberArg("pricing-batch-size", 50));
const pricingPurpose = String(args["pricing-purpose"] || "estimating");
const pricingDelayMs = numberArg("pricing-delay-ms", 250);
const maxRetries = numberArg("retries", 4);
const detailMode = String(args["detail-mode"] || "missing"); // missing | all | none
const includeInvoicePdf = Boolean(args["include-invoice-pdf"]);

const summary = {
  generatedAt: nowIso,
  runKey,
  environment: abcEnv,
  apiBaseUrl,
  mode: {
    selected: [...selected],
    dryRun,
    historyStart,
    historyEnd,
    historyWindowYears,
    historyItemsPerPage,
    maxPagesPerWindow,
    detailMode,
    orderDetailLimit: Number.isFinite(orderDetailLimit) ? orderDetailLimit : "all",
    invoiceDetailLimit: Number.isFinite(invoiceDetailLimit) ? invoiceDetailLimit : "all",
    detailConcurrency,
    pricingMaxBranches: Number.isFinite(pricingMaxBranches) ? pricingMaxBranches : "all",
    pricingMaxItems: Number.isFinite(pricingMaxItems) ? pricingMaxItems : "all",
    pricingBatchSize,
    pricingPurpose,
    includeInvoicePdf,
  },
  envShape: {
    ABC_SUPPLY_CLIENT_ID: Boolean(env.ABC_SUPPLY_CLIENT_ID),
    ABC_SUPPLY_CLIENT_SECRET: Boolean(env.ABC_SUPPLY_CLIENT_SECRET),
    ABC_SUPPLY_ENV: env.ABC_SUPPLY_ENV ? String(env.ABC_SUPPLY_ENV) : null,
    SUPABASE_URL: Boolean(supabaseUrl),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(supabaseServiceRoleKey),
  },
  token: null,
  requestStats: null,
  endpointAccess: [],
  warnings: [],
  sync: {
    branchAccess: null,
    contacts: null,
    pricing: null,
    orders: null,
    invoices: null,
    matches: null,
  },
  skippedWrites: [
    "PUT /api/product/v1/items/{billToNumber}/favorites/{itemNumber}",
    "POST /api/order/v2/orders",
    "POST /api/notification/v2/webhooks",
    "PATCH /api/notification/v2/webhooks/{webhookId}",
    "DELETE /api/notification/v2/webhooks/{webhookId}",
  ],
  skippedSensitiveReads: includeInvoicePdf ? [] : ["GET /api/invoice/v1/invoices/pdf/{invoiceId}"],
};

if (!clientId || !clientSecret) failClosed("Missing ABC credentials.");
if (!supabaseUrl || !supabaseServiceRoleKey) failClosed("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
if (includeInvoicePdf) {
  failClosed("Invoice PDF reads are disabled unless the script is modified after explicit human approval.");
}

let token = await getToken();
summary.token = token.summary;

let runId = null;
if (!dryRun) {
  const runRows = await supabaseUpsert(
    "abc_api_sync_runs",
    [
      {
        run_key: runKey,
        environment: abcEnv,
        script_name: "mirror-backfill.mjs",
        status: "running",
        mode: summary.mode,
        totals: {},
        started_at: nowIso,
      },
    ],
    "run_key",
    { returning: true }
  );
  runId = runRows[0]?.id || null;
}

const context = await loadMirrorContext();
if (selected.has("branch-access")) await syncBranchAccess(context);
if (selected.has("contacts")) await syncShipToContacts(context);
if (selected.has("pricing")) await syncPricing(context);
if (selected.has("orders")) await syncOrders(context);
if (selected.has("invoices")) await syncInvoices(context);
await syncMatches();

summary.requestStats = {
  wallMs: elapsed(startedAt),
  endpointRequests: summary.endpointAccess.filter((endpoint) => typeof endpoint.status === "number").length,
  rateLimitedResponses: summary.endpointAccess.filter((endpoint) => endpoint.status === 429).length,
  failedOrDenied: summary.endpointAccess.filter((endpoint) => endpoint.status !== "skipped" && endpoint.statusClass !== "2xx").length,
};

let outputPath = null;
if (writeOutput) {
  outputPath =
    args.out ||
    resolve(ROOT, "integrations/bridges/abc-supply/.mirror-runs", `${nowIso.replace(/[:.]/g, "-")}.json`);
  await mkdir(dirname(outputPath), { recursive: true });
  summary.outputPath = outputPath;
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

if (!dryRun) {
  await supabaseUpsert(
    "abc_api_sync_runs",
    [
      {
        run_key: runKey,
        environment: abcEnv,
        script_name: "mirror-backfill.mjs",
        status: "completed",
        mode: summary.mode,
        totals: compactTotals(summary),
        output_path: outputPath,
        started_at: nowIso,
        ended_at: new Date().toISOString(),
        errors: summary.endpointAccess.filter((endpoint) => endpoint.status !== "skipped" && endpoint.statusClass !== "2xx"),
      },
    ],
    "run_key"
  );
  await persistEndpointAccess();
}

console.log(JSON.stringify(args.compact ? compactSummary(summary) : summary, null, 2));

async function loadMirrorContext() {
  const [shipTos, billTos, agreements, priceItems, branches, existingOrders, existingInvoices] = await Promise.all([
    supabaseSelect("abc_regions", "account_type,account_number,sold_to_number,bill_to_number,ship_to_number,branch_numbers,raw", {
      account_type: "eq.Ship-To",
      limit: 2000,
    }),
    supabaseSelect("abc_regions", "account_type,account_number,sold_to_number,bill_to_number,ship_to_number,raw", {
      account_type: "eq.Bill-To",
      limit: 2000,
    }),
    supabaseSelect("abc_price_agreements", "*", { limit: 5000 }),
    supabaseSelect("abc_price_list_items", "*", { limit: 10000 }),
    supabaseSelect("abc_vendor_branches", "branch_number,branch_name,city,state,raw", { limit: 2000 }),
    detailMode === "missing" ? supabaseSelect("abc_orders", "order_number", { limit: 50000 }) : Promise.resolve([]),
    detailMode === "missing" ? supabaseSelect("abc_invoices", "invoice_number", { limit: 50000 }) : Promise.resolve([]),
  ]);

  const branchMap = new Map(branches.map((branch) => [String(branch.branch_number), branch]));
  const branchAccess = uniqueBranchAccess(shipTos, branchMap).slice(
    0,
    Number.isFinite(pricingMaxBranches) ? pricingMaxBranches : undefined
  );
  const billToNumbers = unique([
    ...billTos.map((row) => row.account_number),
    ...shipTos.map((row) => row.bill_to_number).filter(Boolean),
  ]);
  const priceItemsByItem = new Map();
  for (const item of priceItems) {
    if (!item.item_number) continue;
    const key = String(item.item_number);
    if (!priceItemsByItem.has(key)) priceItemsByItem.set(key, item);
  }
  const itemNumbers = [...priceItemsByItem.keys()].slice(
    0,
    Number.isFinite(pricingMaxItems) ? pricingMaxItems : undefined
  );

  return {
    shipTos,
    billTos,
    billToNumbers,
    agreements,
    priceItems,
    priceItemsByItem,
    itemNumbers,
    branches,
    branchMap,
    branchAccess,
    existingOrderNumbers: new Set(existingOrders.map((row) => row.order_number).filter(Boolean)),
    existingInvoiceNumbers: new Set(existingInvoices.map((row) => row.invoice_number).filter(Boolean)),
  };
}

async function syncBranchAccess(context) {
  const sync = {
    table: "abc_ship_to_branch_access",
    rowsPrepared: context.branchAccess.length,
    rowsUpserted: 0,
  };
  summary.sync.branchAccess = sync;
  if (dryRun) return;
  const rows = context.branchAccess.map((access) => ({
    ship_to_number: access.shipToNumber,
    bill_to_number: access.billToNumber,
    sold_to_number: access.soldToNumber,
    branch_number: access.branchNumber,
    branch_name: access.branchName,
    home_branch: access.homeBranch,
    storefront: access.storefront,
    branch_status: access.branchStatus,
    raw: access.raw,
    abc_last_seen_at: nowIso,
    abc_fetched_at: nowIso,
    updated_at: nowIso,
  }));
  sync.rowsUpserted = await supabaseUpsertCount("abc_ship_to_branch_access", rows, "ship_to_number,branch_number");
}

async function syncShipToContacts(context) {
  const sync = {
    table: "abc_ship_to_contacts",
    shipTosAttempted: 0,
    shipTosPassed: 0,
    contactsFetched: 0,
    rowsUpserted: 0,
    failed: [],
  };
  summary.sync.contacts = sync;
  const rows = [];
  for (const shipTo of context.shipTos) {
    const shipToNumber = shipTo.account_number;
    if (!shipToNumber) continue;
    progress(`contacts ship-to ${maskId(shipToNumber)}`);
    const result = await abcRequestWithRetry({
      name: "Account: Get Ship-To Contacts",
      method: "GET",
      path: `/api/account/v1/shiptos/${encodeURIComponent(shipToNumber)}/contacts`,
      scope: "account.read",
    });
    sync.shipTosAttempted += 1;
    if (!result.ok) {
      sync.failed.push({ shipToNumber: maskId(shipToNumber), status: result.status, error: result.error });
      continue;
    }
    sync.shipTosPassed += 1;
    const contacts = Array.isArray(result.json) ? result.json : [];
    sync.contactsFetched += contacts.length;
    for (const contact of contacts) {
      const email = textOrNull(contact.email);
      const phone = textOrNull(contact.phone);
      rows.push({
        dedupe_key: hashJson({
          shipToNumber,
          id: textOrNull(contact.id),
          email,
          phone,
          firstName: textOrNull(contact.firstName),
          lastName: textOrNull(contact.lastName),
        }),
        ship_to_number: shipToNumber,
        contact_id: textOrNull(contact.id),
        first_name: textOrNull(contact.firstName),
        last_name: textOrNull(contact.lastName),
        function_code: textOrNull(contact.functionCode),
        function_description: textOrNull(contact.functionDescription),
        phone,
        email,
        raw: contact,
        abc_last_seen_at: nowIso,
        abc_fetched_at: nowIso,
        updated_at: nowIso,
      });
    }
  }
  if (!dryRun) sync.rowsUpserted = await supabaseUpsertCount("abc_ship_to_contacts", rows, "dedupe_key");
}

async function syncPricing(context) {
  const sync = {
    tables: ["abc_price_agreements", "abc_price_agreement_branch_matches", "abc_price_observations", "abc_price_observation_lines"],
    branchAccessCount: context.branchAccess.length,
    itemCount: context.itemNumbers.length,
    agreementsCreated: 0,
    agreementMatchesUpserted: 0,
    pricingRequestsAttempted: 0,
    pricingRequestsPassed: 0,
    pricingObservationsUpserted: 0,
    pricingLinesUpserted: 0,
    okLines: 0,
    errorLines: 0,
    failed: [],
  };
  summary.sync.pricing = sync;
  if (!context.itemNumbers.length) {
    summary.warnings.push("No item-numbered abc_price_list_items were available for pricing backfill.");
    return;
  }

  const agreementMatches = [];
  for (const access of context.branchAccess) {
    const match = await ensureAgreementForBranch(access, context);
    if (match.created) sync.agreementsCreated += 1;
    agreementMatches.push(match);
  }

  if (!dryRun) {
    const rows = agreementMatches.map((match) => ({
      ship_to_number: match.access.shipToNumber,
      bill_to_number: match.access.billToNumber,
      sold_to_number: match.access.soldToNumber,
      branch_number: match.access.branchNumber,
      abc_price_agreement_id: match.agreement?.id || null,
      match_type: match.matchType,
      match_reason: match.matchReason,
      confidence_score: match.confidenceScore,
      raw: {
        access: match.access.raw,
        agreement: match.agreement,
      },
      updated_at: nowIso,
    }));
    sync.agreementMatchesUpserted = await supabaseUpsertCount(
      "abc_price_agreement_branch_matches",
      rows,
      "ship_to_number,branch_number"
    );
  }

  for (const match of agreementMatches) {
    for (const itemChunk of chunks(context.itemNumbers, pricingBatchSize)) {
      const requestHash = hashJson({
        day: nowIso.slice(0, 10),
        shipToNumber: match.access.shipToNumber,
        branchNumber: match.access.branchNumber,
        purpose: pricingPurpose,
        itemChunk,
      });
      const requestId = `open-brain-${nowIso.slice(0, 10).replace(/-/g, "")}-${match.access.branchNumber}-${requestHash.slice(0, 8)}`;
      const lines = itemChunk.map((itemNumber, index) => {
        const priceItem = context.priceItemsByItem.get(itemNumber);
        const line = {
          id: String(index + 1),
          itemNumber,
          quantity: 1,
        };
        const uom = cleanUom(priceItem?.unit);
        if (uom) line.uom = uom;
        return line;
      });
      const body = {
        requestId,
        shipToNumber: match.access.shipToNumber,
        branchNumber: match.access.branchNumber,
        purpose: pricingPurpose,
        lines,
      };

      progress(`pricing branch ${match.access.branchNumber} lines ${itemChunk.length}`);
      const result = await abcRequestWithRetry({
        name: "Pricing: Price Items",
        method: "POST",
        path: "/api/pricing/v2/prices",
        scope: "pricing.read",
        body,
      });
      sync.pricingRequestsAttempted += 1;
      if (!result.ok) {
        sync.failed.push({
          branchNumber: match.access.branchNumber,
          shipToNumber: maskId(match.access.shipToNumber),
          status: result.status,
          error: result.error,
        });
        await sleep(pricingDelayMs);
        continue;
      }
      sync.pricingRequestsPassed += 1;
      const responseLines = Array.isArray(result.json?.lines) ? result.json.lines : [];
      const okLineCount = responseLines.filter((line) => lineStatusCode(line) === "OK").length;
      const errorLineCount = responseLines.length - okLineCount;
      sync.okLines += okLineCount;
      sync.errorLines += errorLineCount;

      if (!dryRun) {
        const observationRows = await supabaseUpsert(
          "abc_price_observations",
          [
            {
              run_id: runId,
              request_hash: requestHash,
              abc_price_agreement_id: match.agreement?.id || null,
              ship_to_number: match.access.shipToNumber,
              bill_to_number: match.access.billToNumber,
              sold_to_number: match.access.soldToNumber,
              branch_number: match.access.branchNumber,
              purpose: pricingPurpose,
              request_id: requestId,
              observed_at: nowIso,
              status_code: result.status,
              line_count: responseLines.length,
              ok_line_count: okLineCount,
              error_line_count: errorLineCount,
              request_body: body,
              response_raw: result.json,
            },
          ],
          "request_hash",
          { returning: true }
        );
        sync.pricingObservationsUpserted += observationRows.length || 1;
        const observationId = observationRows[0]?.id;
        const lineRows = responseLines.map((line, index) => {
          const requested = lines[index] || lines.find((candidate) => candidate.id === String(line.id));
          const itemNumber = String(line.itemNumber || requested?.itemNumber || "");
          const priceItem = context.priceItemsByItem.get(itemNumber);
          return {
            observation_id: observationId,
            request_hash: requestHash,
            line_id: String(line.id || requested?.id || index + 1),
            item_number: itemNumber || null,
            quantity: parseNumber(line.quantity ?? requested?.quantity),
            requested_uom: textOrNull(requested?.uom),
            response_uom: textOrNull(line.uom || line.unitOfMeasure || line.priceUom),
            status_code: lineStatusCode(line),
            status_message: lineStatusMessage(line),
            unit_price: priceNumber(line, ["unitPrice", "price", "sellPrice", "netPrice"]),
            extended_price: priceNumber(line, ["extendedPrice", "lineTotal", "totalPrice", "amount"]),
            price: priceNumber(line, ["price", "unitPrice", "sellPrice", "netPrice", "extendedPrice"]),
            matched_price_list_item_id: priceItem?.id || null,
            product_catalog_item_number: null,
            price_raw: line,
          };
        });
        sync.pricingLinesUpserted += await supabaseUpsertCount("abc_price_observation_lines", lineRows, "request_hash,line_id");
        await syncUomEvidence(lineRows);
      }
      await sleep(pricingDelayMs);
    }
  }
}

async function syncOrders(context) {
  const sync = {
    tables: ["abc_order_history", "abc_orders", "abc_order_lines", "abc_order_shipments"],
    windowsAttempted: 0,
    historyRowsFetched: 0,
    historyRowsUpserted: 0,
    detailsAttempted: 0,
    detailsFetched: 0,
    detailRowsUpserted: 0,
    lineRowsUpserted: 0,
    shipmentRowsUpserted: 0,
    failed: [],
  };
  summary.sync.orders = sync;
  const orderNumbers = new Set();
  for (const window of dateWindows(historyStart, historyEnd, historyWindowYears)) {
    progress(`order history ${window.start}..${window.end}`);
    const rows = await fetchPaged({
      name: "Order: Get Order History",
      method: "GET",
      pathBuilder: (pageNumber) => {
        const query = new URLSearchParams({
          startDate: window.start,
          endDate: window.end,
          itemsPerPage: String(historyItemsPerPage),
          pageNumber: String(pageNumber),
        });
        return `/api/order/v2/orders/orderHistory?${query}`;
      },
      scope: "order.read",
      itemsPath: "items",
      sync,
      window,
    });
    sync.windowsAttempted += 1;
    sync.historyRowsFetched += rows.length;
    for (const row of rows) {
      const orderNumber = textOrNull(row.orderNumber || row.salesOrder?.number || row.salesOrder);
      if (orderNumber) orderNumbers.add(orderNumber);
    }
    if (!dryRun) {
      sync.historyRowsUpserted += await supabaseUpsertCount(
        "abc_order_history",
        rows.map((row) => orderHistoryRow(row, window)),
        "order_number"
      );
    }
  }

  if (detailMode === "none") return;
  const candidates = [...orderNumbers]
    .filter((orderNumber) => detailMode !== "missing" || !context.existingOrderNumbers.has(orderNumber))
    .slice(0, Number.isFinite(orderDetailLimit) ? orderDetailLimit : undefined);
  let completed = 0;
  for (const group of chunks(candidates, detailConcurrency)) {
    const results = await Promise.all(group.map(async (orderNumber) => {
      const result = await abcRequestWithRetry({
        name: "Order: Get Order",
        method: "GET",
        path: `/api/order/v2/orders/${encodeURIComponent(orderNumber)}`,
        scope: "order.read",
      });
      return { orderNumber, result };
    }));
    const orderRows = [];
    const lineRows = [];
    const shipmentRows = [];
    for (const { orderNumber, result } of results) {
      completed += 1;
      sync.detailsAttempted += 1;
      if (!result.ok) {
        sync.failed.push({ orderNumber, status: result.status, error: result.error });
        continue;
      }
      sync.detailsFetched += 1;
      orderRows.push(orderDetailRow(orderNumber, result.json));
      lineRows.push(...orderLineRows(orderNumber, result.json));
      shipmentRows.push(...orderShipmentRows(orderNumber, result.json));
    }
    progress(`order detail ${completed}/${candidates.length}`);
    if (!dryRun) {
      sync.detailRowsUpserted += await supabaseUpsertCount("abc_orders", orderRows, "order_number");
      sync.lineRowsUpserted += await supabaseUpsertCount("abc_order_lines", lineRows, "order_number,line_key");
      sync.shipmentRowsUpserted += await supabaseUpsertCount("abc_order_shipments", shipmentRows, "order_number,shipment_key");
    }
  }
}

async function syncInvoices(context) {
  const sync = {
    tables: ["abc_invoice_history", "abc_invoices", "abc_invoice_lines"],
    billToAccounts: context.billToNumbers.length,
    windowsAttempted: 0,
    historyRowsFetched: 0,
    historyRowsUpserted: 0,
    detailsAttempted: 0,
    detailsFetched: 0,
    detailRowsUpserted: 0,
    lineRowsUpserted: 0,
    failed: [],
  };
  summary.sync.invoices = sync;
  const invoices = new Map();
  for (const billToNumber of context.billToNumbers) {
    for (const window of dateWindows(historyStart, historyEnd, historyWindowYears)) {
      progress(`invoice history ${maskId(billToNumber)} ${window.start}..${window.end}`);
      const rows = await fetchPaged({
        name: "Invoice: Get Invoice History",
        method: "GET",
        pathBuilder: (pageNumber) => {
          const query = new URLSearchParams({
            startDate: `${window.start}T00:00:00Z`,
            endDate: `${window.end}T23:59:59Z`,
            itemsPerPage: String(historyItemsPerPage),
            pageNumber: String(pageNumber),
          });
          return `/api/invoice/v1/invoices/history/${encodeURIComponent(billToNumber)}?${query}`;
        },
        scope: "invoice.history.read",
        itemsPath: "items",
        sync,
        window,
      });
      sync.windowsAttempted += 1;
      sync.historyRowsFetched += rows.length;
      for (const row of rows) {
        const invoiceNumber = textOrNull(row.invoiceNumber || row.invoiceId);
        if (invoiceNumber) invoices.set(invoiceNumber, { row, billToNumber });
      }
      if (!dryRun) {
        // ABC's history endpoint can return the same invoice_number more than
        // once in a batch; dedupe by the conflict key (keep last) so the upsert
        // doesn't try to affect the same row twice in one statement.
        const historyRows = rows.map((row) => invoiceHistoryRow(row, billToNumber, window));
        const dedupedHistory = [...new Map(historyRows.map((r) => [r.invoice_number, r])).values()];
        sync.historyRowsUpserted += await supabaseUpsertCount(
          "abc_invoice_history",
          dedupedHistory,
          "invoice_number"
        );
      }
    }
  }

  if (detailMode === "none") return;
  const candidates = [...invoices.entries()]
    .filter(([invoiceNumber]) => detailMode !== "missing" || !context.existingInvoiceNumbers.has(invoiceNumber))
    .slice(0, Number.isFinite(invoiceDetailLimit) ? invoiceDetailLimit : undefined);
  let completed = 0;
  for (const group of chunks(candidates, detailConcurrency)) {
    const results = await Promise.all(group.map(async ([invoiceNumber, ref]) => {
      const invoiceId = textOrNull(ref.row.invoiceId || invoiceNumber);
      const result = await abcRequestWithRetry({
        name: "Invoice: Get Invoice By ID",
        method: "GET",
        path: `/api/invoice/v1/invoices/id/${encodeURIComponent(invoiceId)}`,
        scope: "invoice.read",
      });
      return { invoiceNumber, invoiceId, ref, result };
    }));
    const invoiceRows = [];
    const lineRows = [];
    for (const { invoiceNumber, invoiceId, ref, result } of results) {
      completed += 1;
      sync.detailsAttempted += 1;
      if (!result.ok) {
        sync.failed.push({ invoiceNumber, status: result.status, error: result.error });
        continue;
      }
      sync.detailsFetched += 1;
      invoiceRows.push(invoiceDetailRow(invoiceNumber, invoiceId, ref.billToNumber, result.json));
      lineRows.push(...invoiceLineRows(invoiceNumber, result.json));
    }
    progress(`invoice detail ${completed}/${candidates.length}`);
    if (!dryRun) {
      sync.detailRowsUpserted += await supabaseUpsertCount("abc_invoices", invoiceRows, "invoice_number");
      // Dedupe lines by the (invoice_number, line_key) conflict target.
      const dedupedLines = [...new Map(lineRows.map((r) => [`${r.invoice_number}|${r.line_key}`, r])).values()];
      sync.lineRowsUpserted += await supabaseUpsertCount("abc_invoice_lines", dedupedLines, "invoice_number,line_key");
    }
  }
}

async function syncMatches() {
  const sync = {
    invoiceDocumentMatches: 0,
    invoiceLineItemMatches: 0,
    orderInvoiceMatches: 0,
  };
  summary.sync.matches = sync;
  if (dryRun) return;
  const knownInvoices = new Set(
    (await supabaseSelect("abc_invoices", "invoice_number", { limit: 50000 }))
      .map((row) => row.invoice_number)
      .filter(Boolean)
  );
  if (!knownInvoices.size) return;
  const invoiceDocs = await supabaseSelect("invoice_documents", "id,invoice_number", { limit: 50000 });
  const invoiceDocRows = invoiceDocs
    .filter((row) => row.invoice_number && knownInvoices.has(row.invoice_number))
    .map((row) => ({
      dedupe_key: hashJson({ type: "invoice_document_number", invoiceNumber: row.invoice_number, invoiceDocumentId: row.id }),
      invoice_number: row.invoice_number,
      abc_invoice_number: row.invoice_number,
      invoice_document_id: row.id,
      match_type: "invoice_document_number",
      confidence_score: 100,
      raw: { source: "invoice_documents" },
    }));
  sync.invoiceDocumentMatches = await supabaseUpsertCount(
    "abc_invoice_matches",
    invoiceDocRows,
    "dedupe_key"
  );

  const invoiceLineCounts = await supabaseRpcLikeInvoiceCounts();
  const lineRows = invoiceLineCounts
    .filter((row) => knownInvoices.has(row.invoice_number))
    .map((row) => ({
      dedupe_key: hashJson({ type: "abc_line_items_invoice_number", invoiceNumber: row.invoice_number }),
      invoice_number: row.invoice_number,
      abc_invoice_number: row.invoice_number,
      abc_line_item_count: row.line_count,
      match_type: "abc_line_items_invoice_number",
      confidence_score: 95,
      raw: { source: "abc_line_items" },
    }));
  sync.invoiceLineItemMatches = await supabaseUpsertCount(
    "abc_invoice_matches",
    lineRows,
    "dedupe_key"
  );

  const invoiceHistory = await supabaseSelect("abc_invoice_history", "invoice_number,order_number", { limit: 50000 });
  const orderInvoiceRows = invoiceHistory
    .filter((row) => row.invoice_number && row.order_number)
    .map((row) => ({
      order_number: row.order_number,
      invoice_number: row.invoice_number,
      match_type: "invoice_history_order_number",
      raw: row,
    }));
  sync.orderInvoiceMatches = await supabaseUpsertCount(
    "abc_order_invoice_matches",
    orderInvoiceRows,
    "order_number,invoice_number,match_type"
  );
}

async function fetchPaged({ name, method, pathBuilder, scope, itemsPath, sync, window }) {
  const out = [];
  for (let pageNumber = 1; pageNumber <= maxPagesPerWindow; pageNumber += 1) {
    const result = await abcRequestWithRetry({
      name,
      method,
      path: pathBuilder(pageNumber),
      scope,
    });
    if (!result.ok) {
      sync.failed.push({ name, window, pageNumber, status: result.status, error: result.error });
      break;
    }
    const items = arrayAtPath(result.json, itemsPath);
    out.push(...items);
    const pagination = result.json?.pagination || {};
    const totalPages = Number(pagination.totalPages || pagination.pageCount || pageNumber);
    if (!items.length || pageNumber >= totalPages) break;
  }
  return out;
}

async function ensureAgreementForBranch(access, context) {
  const exact = latestAgreement(
    context.agreements.filter((agreement) => String(agreement.branch_number || "") === access.branchNumber)
  );
  if (exact) {
    return {
      access,
      agreement: exact,
      matchType: "existing_branch",
      matchReason: "Matched existing abc_price_agreements.branch_number.",
      confidenceScore: 100,
      created: false,
    };
  }

  const state = access.branchState;
  const regional = latestAgreement(
    context.agreements.filter((agreement) => agreement.region_code && state && String(agreement.region_code).toUpperCase() === state)
  );
  if (regional) {
    return {
      access,
      agreement: regional,
      matchType: "existing_region",
      matchReason: "Matched existing abc_price_agreements.region_code to branch state.",
      confidenceScore: 80,
      created: false,
    };
  }

  const agreementNumber = `API-${access.shipToNumber}-${access.branchNumber}`;
  const existing = context.agreements.find(
    (agreement) => agreement.agreement_number === agreementNumber && agreement.version_label === "api-current"
  );
  if (existing) {
    return {
      access,
      agreement: existing,
      matchType: "generated_api_existing",
      matchReason: "Reused generated ABC Pricing API agreement shell.",
      confidenceScore: 70,
      created: false,
    };
  }

  const row = {
    branch_number: access.branchNumber,
    region_code: null,
    agreement_number: agreementNumber,
    version_label: "api-current",
    abc_account_number: access.shipToNumber,
    effective_date: nowIso.slice(0, 10),
    expiry_date: null,
    staleness_status: "ok",
    source_file: "ABC Pricing API",
    notes: "Generated by mirror-backfill.mjs because no existing branch/region price agreement matched this Ship-To branch access.",
  };

  if (!dryRun && !context.branchMap.has(access.branchNumber)) {
    await supabaseUpsert(
      "abc_vendor_branches",
      [
        {
          branch_number: access.branchNumber,
          branch_name: access.branchName || `ABC Supply ${access.branchNumber}`,
          city: null,
          state: access.branchState || null,
          region_code: null,
          storefront: access.storefront || null,
          branch_status: access.branchStatus || null,
          raw: access.raw,
          source_endpoint: "GET /api/account/v1/shiptos/{shipToNumber}",
          abc_last_seen_at: nowIso,
          abc_fetched_at: nowIso,
        },
      ],
      "branch_number"
    );
    context.branchMap.set(access.branchNumber, {
      branch_number: access.branchNumber,
      branch_name: access.branchName || `ABC Supply ${access.branchNumber}`,
      state: access.branchState || null,
      raw: access.raw,
    });
  }

  if (dryRun) {
    return {
      access,
      agreement: { ...row, id: null },
      matchType: "generated_api_new",
      matchReason: "Would create generated ABC Pricing API agreement shell.",
      confidenceScore: 70,
      created: true,
    };
  }

  const prior = await supabaseSelect("abc_price_agreements", "*", {
    agreement_number: `eq.${agreementNumber}`,
    version_label: "eq.api-current",
    limit: 1,
  });
  const inserted = prior.length ? prior : await supabaseInsert("abc_price_agreements", [row], { returning: true });
  const agreement = inserted[0] || row;
  context.agreements.push(agreement);
  return {
    access,
    agreement,
    matchType: "generated_api_new",
    matchReason: "Created generated ABC Pricing API agreement shell.",
    confidenceScore: 70,
    created: !prior.length,
  };
}

async function syncUomEvidence(lineRows) {
  const rows = [];
  for (const row of lineRows) {
    if (!row.item_number || !row.requested_uom || !row.response_uom) continue;
    if (row.requested_uom === row.response_uom) continue;
    const raw = {
      requestHash: row.request_hash,
      lineId: row.line_id,
      requestedUom: row.requested_uom,
      responseUom: row.response_uom,
      priceRaw: row.price_raw,
    };
    rows.push({
      item_number: row.item_number,
      from_uom: row.requested_uom,
      to_uom: row.response_uom,
      conversion_factor: null,
      evidence_source: "ABC Pricing API",
      evidence_ref: `${row.request_hash}:${row.line_id}`,
      confidence_score: 50,
      raw,
      source_hash: hashJson(raw),
      updated_at: nowIso,
    });
  }
  await supabaseUpsertCount("abc_uom_calculations", rows, "source_hash");
}

async function persistEndpointAccess() {
  const rows = summary.endpointAccess.map((endpoint) => ({
    run_id: runId,
    name: endpoint.name || null,
    method: endpoint.method || null,
    path_template: endpoint.pathTemplate,
    scope: endpoint.scope || null,
    status_code: typeof endpoint.status === "number" ? endpoint.status : null,
    status_text: typeof endpoint.status === "string" ? endpoint.status : null,
    status_class: endpoint.statusClass || null,
    category: endpoint.category || null,
    duration_ms: endpoint.durationMs ?? null,
    request_summary: endpoint.requestSummary || null,
    response_summary: endpoint.summary || null,
    error: endpoint.error || null,
  }));
  await supabaseInsert("abc_endpoint_access_log", rows);
}

async function supabaseRpcLikeInvoiceCounts() {
  const rows = await supabaseSelect("abc_line_items", "invoice_number", { limit: 50000 });
  const counts = new Map();
  for (const row of rows) {
    if (!row.invoice_number) continue;
    counts.set(row.invoice_number, (counts.get(row.invoice_number) || 0) + 1);
  }
  return [...counts.entries()].map(([invoice_number, line_count]) => ({ invoice_number, line_count }));
}

async function abcRequestWithRetry(endpoint) {
  let last;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    last = await abcRequest(endpoint);
    if (last.ok) return last;
    if (![429, 500, 502, 503, 504].includes(Number(last.status))) return last;
    progress(`${endpoint.name}: retry ${attempt}/${maxRetries} after status ${last.status}`);
    await sleep(Math.min(30000, 1000 * 2 ** (attempt - 1)));
  }
  return last;
}

async function abcRequest(endpoint) {
  await ensureToken();
  const started = performance.now();
  const headers = {
    Authorization: `Bearer ${token.accessToken}`,
    Accept: "application/json",
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
    payload = await safeReadResponse(response);
  } catch (error) {
    const record = {
      name: endpoint.name,
      method: endpoint.method,
      pathTemplate: stripDynamicValues(endpoint.path),
      scope: endpoint.scope,
      status: "network_error",
      statusClass: "network_error",
      category: "network_failure",
      durationMs: elapsed(started),
      error: { message: sanitizeMessage(error?.message) },
    };
    summary.endpointAccess.push(record);
    return { ok: false, status: "network_error", error: record.error };
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
    record.summary = genericSummary(payload?.json);
    summary.endpointAccess.push(record);
    return { ok: true, status: response.status, json: payload?.json };
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
    throw new Error("ABC token exchange failed.");
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

async function supabaseSelect(table, select, filters = {}) {
  const requestedLimit = Number(filters.limit || 1000);
  const pageSize = Math.min(1000, requestedLimit);
  const params = new URLSearchParams({ select, limit: String(pageSize), offset: "0" });
  for (const [key, value] of Object.entries(filters)) {
    if (key === "limit") continue;
    params.set(key, String(value));
  }
  const rows = [];
  for (;;) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${params}`, {
      headers: supabaseHeaders(),
    });
    if (!response.ok) {
      const payload = await safeReadResponse(response);
      throw new Error(`Supabase select failed for ${table}: ${response.status} ${JSON.stringify(summarizeErrorPayload(payload))}`);
    }
    const chunk = await response.json();
    rows.push(...chunk);
    if (rows.length >= requestedLimit || chunk.length < pageSize) break;
    params.set("offset", String(Number(params.get("offset")) + pageSize));
  }
  return rows.slice(0, requestedLimit);
}

async function supabaseInsert(table, rows, options = {}) {
  if (!rows.length) return [];
  const out = [];
  for (const chunk of chunks(rows, 200)) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
      method: "POST",
      headers: supabaseHeaders(options.returning ? "return=representation" : undefined),
      body: JSON.stringify(chunk),
    });
    if (!response.ok) {
      const payload = await safeReadResponse(response);
      throw new Error(`Supabase insert failed for ${table}: ${response.status} ${JSON.stringify(summarizeErrorPayload(payload))}`);
    }
    if (options.returning) out.push(...(await response.json()));
  }
  return out;
}

async function supabaseUpsertCount(table, rows, onConflict) {
  if (!rows.length) return 0;
  await supabaseUpsert(table, rows, onConflict);
  return rows.length;
}

async function supabaseUpsert(table, rows, onConflict, options = {}) {
  if (!rows.length) return [];
  const out = [];
  for (const chunk of chunks(rows, 200)) {
    const params = new URLSearchParams({ on_conflict: onConflict });
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${params}`, {
      method: "POST",
      headers: supabaseHeaders(options.returning ? "resolution=merge-duplicates,return=representation" : "resolution=merge-duplicates"),
      body: JSON.stringify(chunk),
    });
    if (!response.ok) {
      const payload = await safeReadResponse(response);
      throw new Error(`Supabase upsert failed for ${table}: ${response.status} ${JSON.stringify(summarizeErrorPayload(payload))}`);
    }
    if (options.returning) out.push(...(await response.json()));
  }
  return out;
}

function supabaseHeaders(prefer) {
  const headers = {
    apikey: supabaseServiceRoleKey,
    Authorization: `Bearer ${supabaseServiceRoleKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

function uniqueBranchAccess(shipTos, branchMap) {
  const out = [];
  const seen = new Set();
  for (const row of shipTos) {
    const shipTo = row.raw?.shipTo || row.raw || {};
    const branches = Array.isArray(shipTo.branches) ? shipTo.branches : [];
    for (const branch of branches) {
      const number = textOrNull(branch.number || branch.branchNumber);
      if (!number) continue;
      const key = `${row.account_number}:${number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const branchRecord = branchMap.get(number) || {};
      out.push({
        shipToNumber: row.account_number,
        billToNumber: textOrNull(row.bill_to_number || shipTo.billTo?.number || shipTo.billTo),
        soldToNumber: textOrNull(row.sold_to_number || shipTo.soldTo?.number || shipTo.soldTo),
        branchNumber: number,
        branchName: textOrNull(branch.name || branchRecord.branch_name),
        branchState: textOrNull(branch.address?.state || branchRecord.state),
        homeBranch: typeof branch.homeBranch === "boolean" ? branch.homeBranch : null,
        storefront: textOrNull(branch.storefront || branchRecord.raw?.branch?.storefront),
        branchStatus: textOrNull(branch.status || branchRecord.branch_status),
        raw: branch,
      });
    }
  }
  return out;
}

function orderHistoryRow(row, window) {
  const orderNumber = textOrNull(row.orderNumber || row.salesOrder?.number || row.salesOrder);
  return {
    order_number: orderNumber,
    run_id: runId,
    date_window_start: window.start,
    date_window_end: window.end,
    branch_number: textOrNull(row.branchNumber || row.branch),
    branch_city_state: textOrNull(row.branchCityState),
    invoice_date: dateOrNull(row.invoiceDate),
    order_type: textOrNull(row.orderType),
    order_status: textOrNull(row.orderStatus),
    product_qty: parseNumber(row.productQty),
    raw: row,
    abc_last_seen_at: nowIso,
    abc_fetched_at: nowIso,
    updated_at: nowIso,
  };
}

function orderDetailRow(orderNumber, payload) {
  const salesOrder = payload?.salesOrder || {};
  const dates = payload?.dates || {};
  const branch = payload?.branch || {};
  return {
    order_number: orderNumber,
    run_id: runId,
    order_name: textOrNull(payload?.orderName || salesOrder.name),
    order_date: dateOrNull(payload?.orderDate || dates.orderDate || dates.createdDate),
    purchase_order_number: textOrNull(payload?.purchaseOrderNumber || salesOrder.purchaseOrderNumber),
    order_type: textOrNull(payload?.orderType || salesOrder.orderType),
    order_status: textOrNull(payload?.orderStatus || salesOrder.status),
    branch_number: textOrNull(branch.number || branch.branchNumber),
    sold_to_number: accountNumber(payload?.soldTo),
    bill_to_number: accountNumber(payload?.billTo),
    ship_to_number: accountNumber(payload?.shipTo),
    raw: payload,
    abc_last_seen_at: nowIso,
    abc_fetched_at: nowIso,
    updated_at: nowIso,
  };
}

function orderLineRows(orderNumber, payload) {
  const lines = Array.isArray(payload?.lines) ? payload.lines : [];
  return lines.map((line, index) => ({
    order_number: orderNumber,
    line_key: textOrNull(line.id || line.lineId || line.lineNumber || index + 1),
    line_number: textOrNull(line.lineNumber || line.id),
    item_number: textOrNull(line.itemNumber || line.item?.number),
    item_description: textOrNull(line.itemDescription || line.description || line.item?.description),
    quantity: parseNumber(line.quantity || line.orderQuantity),
    uom: textOrNull(line.uom || line.unitOfMeasure),
    status_code: lineStatusCode(line),
    status_message: lineStatusMessage(line),
    raw: line,
    updated_at: nowIso,
  }));
}

function orderShipmentRows(orderNumber, payload) {
  const shipments = Array.isArray(payload?.shipments) ? payload.shipments : [];
  return shipments.map((shipment, index) => ({
    order_number: orderNumber,
    shipment_key: textOrNull(shipment.id || shipment.shipmentId || shipment.deliveryNumber || index + 1),
    shipment_status: textOrNull(shipment.status || shipment.shipmentStatus),
    delivery_date: dateOrNull(shipment.deliveryDate || shipment.scheduledDate),
    raw: shipment,
    updated_at: nowIso,
  }));
}

function invoiceHistoryRow(row, billToNumber, window) {
  const invoiceNumber = textOrNull(row.invoiceNumber || row.invoiceId);
  return {
    invoice_number: invoiceNumber,
    run_id: runId,
    bill_to_number: billToNumber,
    date_window_start: `${window.start}T00:00:00Z`,
    date_window_end: `${window.end}T23:59:59Z`,
    invoice_date: dateOrNull(row.invoiceDate),
    order_number: textOrNull(row.orderNumber),
    order_name: textOrNull(row.orderName),
    order_date: dateOrNull(row.orderDate),
    purchase_order_number: textOrNull(row.purchaseOrderNumber),
    sales_type: textOrNull(row.salesType),
    is_credit_memo: typeof row.isCreditMemo === "boolean" ? row.isCreditMemo : null,
    original_invoice_reference: textOrNull(row.orginalInvoiceReference || row.originalInvoiceReference),
    raw: row,
    abc_last_seen_at: nowIso,
    abc_fetched_at: nowIso,
    updated_at: nowIso,
  };
}

function invoiceDetailRow(invoiceNumber, invoiceId, billToNumber, payload) {
  return {
    invoice_number: textOrNull(payload?.invoiceNumber || invoiceNumber),
    invoice_id: invoiceId,
    run_id: runId,
    bill_to_number: accountNumber(payload?.billTo) || billToNumber,
    sold_to_number: accountNumber(payload?.soldTo),
    ship_to_number: accountNumber(payload?.shipTo),
    order_number: textOrNull(payload?.orderNumber),
    order_name: textOrNull(payload?.orderName),
    order_date: dateOrNull(payload?.orderDate),
    invoice_date: dateOrNull(payload?.invoiceDate),
    purchase_order_number: textOrNull(payload?.purchaseOrderNumber),
    sales_type: textOrNull(payload?.salesType),
    is_credit_memo: typeof payload?.isCreditMemo === "boolean" ? payload.isCreditMemo : null,
    original_invoice_reference: textOrNull(payload?.orginalInvoiceReference || payload?.originalInvoiceReference),
    total_amount: priceNumber(payload?.invoiceAmounts || payload?.amounts || payload, ["totalAmount", "invoiceTotal", "total", "amount"]),
    raw: payload,
    abc_last_seen_at: nowIso,
    abc_fetched_at: nowIso,
    updated_at: nowIso,
  };
}

function invoiceLineRows(invoiceNumber, payload) {
  const lines = Array.isArray(payload?.lines) ? payload.lines : [];
  return lines.map((line, index) => ({
    invoice_number: invoiceNumber,
    line_key: textOrNull(line.id || line.lineId || line.lineNumber || index + 1),
    line_number: textOrNull(line.lineNumber || line.id),
    item_number: textOrNull(line.itemNumber || line.item?.number),
    item_description: textOrNull(line.itemDescription || line.description || line.item?.description),
    quantity: parseNumber(line.quantity || line.invoiceQuantity || line.shippedQuantity),
    uom: textOrNull(line.uom || line.unitOfMeasure),
    unit_price: priceNumber(line, ["unitPrice", "price", "sellPrice", "netPrice"]),
    extended_price: priceNumber(line, ["extendedPrice", "lineTotal", "totalPrice", "amount"]),
    raw: line,
    updated_at: nowIso,
  }));
}

function dateWindows(startDate, endDate, windowYears) {
  const out = [];
  let cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    const start = new Date(cursor);
    const next = new Date(cursor);
    next.setUTCFullYear(next.getUTCFullYear() + windowYears);
    next.setUTCDate(next.getUTCDate() - 1);
    const windowEnd = next < end ? next : end;
    out.push({ start: isoDate(start), end: isoDate(windowEnd) });
    cursor = new Date(windowEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function latestAgreement(agreements) {
  return agreements
    .filter(Boolean)
    .sort((a, b) => String(b.effective_date || "").localeCompare(String(a.effective_date || "")))[0] || null;
}

function lineStatusCode(line) {
  return textOrNull(line?.status?.code || line?.statusCode || line?.status);
}

function lineStatusMessage(line) {
  return textOrNull(line?.status?.message || line?.statusMessage || line?.message);
}

function priceNumber(value, keys) {
  if (!value || typeof value !== "object") return null;
  for (const key of keys) {
    const parsed = parseNumber(value[key]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function accountNumber(value) {
  if (!value) return null;
  if (typeof value === "string" || typeof value === "number") return String(value);
  return textOrNull(value.number || value.accountNumber || value.id);
}

function cleanUom(value) {
  const text = textOrNull(value);
  if (!text || !/^[A-Za-z0-9./_-]{1,12}$/.test(text)) return null;
  return text;
}

function textOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

async function safeReadResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const buffer = Buffer.from(await response.arrayBuffer());
  if (contentType.includes("application/json")) {
    try {
      return { json: JSON.parse(buffer.toString("utf8")) };
    } catch {
      return { text: buffer.toString("utf8", 0, Math.min(buffer.length, 500)) };
    }
  }
  return { text: buffer.toString("utf8", 0, Math.min(buffer.length, 500)) };
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

function arrayAtPath(payload, path) {
  const value = path.split(".").reduce((acc, key) => acc?.[key], payload);
  return Array.isArray(value) ? value : [];
}

function genericSummary(payload) {
  if (payload === null || payload === undefined) return { shape: "empty" };
  if (Array.isArray(payload)) return { shape: "array", count: payload.length, firstKeys: keys(payload[0]) };
  if (typeof payload === "object") {
    const out = { shape: "object", keys: keys(payload) };
    if (payload.pagination) out.pagination = payload.pagination;
    for (const key of ["items", "lines", "templates", "branches"]) {
      if (Array.isArray(payload[key])) out[`${key}Count`] = payload[key].length;
    }
    return out;
  }
  return { shape: typeof payload };
}

function summarizeErrorPayload(payload) {
  const value = payload?.json ?? payload?.text ?? null;
  if (!value) return null;
  if (typeof value === "string") return { text: sanitizeMessage(value.slice(0, 240)) };
  const message = value.error_description || value.errorMessage || value.message || value.error || value.title || null;
  return { keys: keys(value), message: message ? sanitizeMessage(String(message).slice(0, 240)) : null };
}

function classifyEndpointFailure(status, payload) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload || {});
  if (status === 401) return "unauthorized_or_missing_scope";
  if (status === 403) return "forbidden_or_account_limited";
  if (status === 404) return "not_found_or_no_fixture";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_error";
  if (/scope/i.test(text)) return "scope_limited";
  return "request_rejected";
}

function stripDynamicValues(path) {
  const [pathOnly, query] = path.split("?");
  const stripped = pathOnly
    .replace(/\/shiptos\/[^/]+\/contacts$/, "/shiptos/{shipToNumber}/contacts")
    .replace(/\/orders\/orderHistory$/, "/orders/orderHistory")
    .replace(/\/orders\/(?!orderHistory$|templates$)[^/]+$/, "/orders/{orderNumber}")
    .replace(/\/history\/[^/]+$/, "/history/{billToNumber}")
    .replace(/\/invoices\/id\/[^/]+$/, "/invoices/id/{invoiceId}");
  return query === undefined ? stripped : `${stripped}?{query}`;
}

function statusClass(status) {
  return typeof status === "number" ? `${Math.floor(status / 100)}xx` : status;
}

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function chunks(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean).map((value) => String(value)))];
}

function keys(value) {
  return value && typeof value === "object" ? Object.keys(value).slice(0, 12) : [];
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

function compactTotals(value) {
  return {
    branchAccess: value.sync.branchAccess,
    contacts: value.sync.contacts,
    pricing: value.sync.pricing,
    orders: value.sync.orders,
    invoices: value.sync.invoices,
    matches: value.sync.matches,
    requestStats: value.requestStats,
  };
}

function compactSummary(value) {
  return {
    generatedAt: value.generatedAt,
    runKey: value.runKey,
    environment: value.environment,
    mode: value.mode,
    token: value.token,
    tokenRefreshes: value.tokenRefreshes || 0,
    sync: value.sync,
    requestStats: value.requestStats,
    endpointAccessTotals: {
      passed: value.endpointAccess.filter((endpoint) => endpoint.statusClass === "2xx").length,
      failedOrDenied: value.endpointAccess.filter((endpoint) => endpoint.status !== "skipped" && endpoint.statusClass !== "2xx").length,
      rateLimited: value.endpointAccess.filter((endpoint) => endpoint.status === 429).length,
    },
    warnings: value.warnings,
    outputPath: value.outputPath,
  };
}

function failClosed(message) {
  summary.token = { status: "not_attempted", category: "missing_config", message };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(1);
}

function progress(message) {
  if (args.quiet) return;
  console.error(`[abc-mirror-backfill] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
