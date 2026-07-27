#!/usr/bin/env node
/**
 * QuickBooks Online → Supabase historical mirror (PEC-102 / docs/76).
 *
 * READ-ONLY against production QBO via read-only-client.mjs (PEC-98).
 * Never POST/PUT/PATCH/DELETE company data.
 *
 *   node integrations/bridges/quickbooks/mirror-backfill.mjs --mode=smoke
 *   node integrations/bridges/quickbooks/mirror-backfill.mjs --mode=backfill
 *   node integrations/bridges/quickbooks/mirror-backfill.mjs --mode=thursday
 *   node integrations/bridges/quickbooks/mirror-backfill.mjs --only=accounts,purchases --dry-run
 *
 * Env: SUPABASE_* from repo .env; QUICKBOOKS_* from master.env or process.env.
 * Requires QUICKBOOKS_ACCESS_MODE=read_only and QUICKBOOKS_WRITE_ENABLED=false.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  accessMode,
  isReadOnlyMode,
  qboGet,
  qboQuery,
  realmId,
  refreshAccessToken,
  writesEnabled,
} from "./read-only-client.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");

const ENTITY_SPECS = [
  {
    key: "company",
    qbo: "CompanyInfo",
    table: "qbo_company_info",
    kind: "singleton",
    map: mapCompanyInfo,
  },
  {
    key: "accounts",
    qbo: "Account",
    table: "qbo_accounts",
    kind: "query",
    // Sparse field lists 400 on some PE CoA rows; use *.
    select: "*",
    map: mapAccount,
  },
  {
    key: "customers",
    qbo: "Customer",
    table: "qbo_customers",
    kind: "query",
    select: "*",
    map: mapCustomer,
  },
  {
    key: "vendors",
    qbo: "Vendor",
    table: "qbo_vendors",
    kind: "query",
    select: "*",
    map: mapVendor,
  },
  {
    key: "classes",
    qbo: "Class",
    table: "qbo_classes",
    kind: "query",
    select: "*",
    map: mapClass,
  },
  {
    key: "invoices",
    qbo: "Invoice",
    table: "qbo_invoices",
    kind: "query",
    select: "*",
    map: mapInvoice,
  },
  {
    key: "payments",
    qbo: "Payment",
    table: "qbo_payments",
    kind: "query",
    select: "*",
    map: mapPayment,
  },
  {
    key: "bills",
    qbo: "Bill",
    table: "qbo_bills",
    kind: "query",
    select: "*",
    map: mapBill,
  },
  {
    key: "billpayments",
    qbo: "BillPayment",
    table: "qbo_bill_payments",
    kind: "query",
    select: "*",
    map: mapBillPayment,
  },
  {
    key: "purchases",
    qbo: "Purchase",
    table: "qbo_purchases",
    kind: "query",
    select: "*",
    map: mapPurchase,
  },
  {
    key: "deposits",
    qbo: "Deposit",
    table: "qbo_deposits",
    kind: "query",
    select: "*",
    map: mapDeposit,
  },
  {
    key: "journals",
    qbo: "JournalEntry",
    table: "qbo_journal_entries",
    kind: "query",
    select: "*",
    map: mapJournal,
  },
  {
    key: "vendorcredits",
    qbo: "VendorCredit",
    table: "qbo_vendor_credits",
    kind: "query",
    select: "*",
    map: mapVendorCredit,
  },
  {
    key: "creditmemos",
    qbo: "CreditMemo",
    table: "qbo_credit_memos",
    kind: "query",
    select: "*",
    map: mapCreditMemo,
  },
  {
    key: "transfers",
    qbo: "Transfer",
    table: "qbo_transfers",
    kind: "query",
    select: "*",
    map: mapTransfer,
  },
  {
    key: "reports",
    qbo: null,
    table: "qbo_report_snapshots",
    kind: "reports",
  },
];

const REPORTS = [
  { name: "BalanceSheet", path: "reports/BalanceSheet", params: { date_macro: "Today" } },
  { name: "ProfitAndLoss", path: "reports/ProfitAndLoss", params: { date_macro: "This Fiscal Year-to-date" } },
  { name: "TrialBalance", path: "reports/TrialBalance", params: { date_macro: "Today" } },
  { name: "CashFlow", path: "reports/CashFlow", params: { date_macro: "This Fiscal Year-to-date" } },
  { name: "AgedReceivableDetail", path: "reports/AgedReceivableDetail", params: {} },
  { name: "AgedPayableDetail", path: "reports/AgedPayableDetail", params: {} },
];

const SMOKE_ENTITIES = new Set(["company", "accounts", "vendors", "purchases", "reports"]);
const PAGE_SIZE = 100; // QBO max page; never trust a full page of 1000 without splitting windows
const MAX_PAGES_DEFAULT = 10000;

main().catch((err) => {
  console.error("STATUS=FAIL", err.message);
  process.exit(1);
});

async function main() {
  loadEnvFiles();
  enforceProdKeys();

  const args = parseArgs(process.argv.slice(2));
  const mode = String(args.mode || "backfill");
  const dryRun = Boolean(args["dry-run"]);
  const pageSize = Number(args["page-size"] || PAGE_SIZE);
  const maxPages = Number(args["max-pages"] || (mode === "smoke" ? 3 : MAX_PAGES_DEFAULT));
  const accountingMethod = String(args["accounting-method"] || "Cash");

  if (!isReadOnlyMode()) {
    throw new Error(
      `Refusing to run: QUICKBOOKS_ACCESS_MODE=${accessMode()} WRITE_ENABLED=${writesEnabled()}. Mirror requires read_only.`,
    );
  }

  const realm = realmId();
  if (!realm) throw new Error("Missing QUICKBOOKS_REALM_ID / QUICKBOOKS_PROD_REALM_ID");

  const supabaseUrl = stripSlash(process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || "");
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  let selected = ENTITY_SPECS.map((e) => e.key);
  if (args.only) {
    selected = String(args.only)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (mode === "smoke") {
    selected = [...SMOKE_ENTITIES];
  }

  const nowIso = new Date().toISOString();
  const runKey = `qbo-mirror-${mode}-${nowIso.replace(/[:.]/g, "-")}`;
  const pullBatch = runKey;
  const summary = {
    generatedAt: nowIso,
    runKey,
    mode,
    dryRun,
    realmFingerprint: createHash("sha256").update(realm).digest("hex").slice(0, 12),
    accessMode: accessMode(),
    writeEnabled: writesEnabled(),
    selected,
    entities: {},
    warnings: [],
  };

  console.log(`qbo-mirror start mode=${mode} dryRun=${dryRun} entities=${selected.join(",")}`);

  const { accessToken } = await refreshAccessToken();
  let token = accessToken;

  // Company gate
  const info = await qboGet(token, `companyinfo/${realm}`);
  const companyName = info?.CompanyInfo?.CompanyName || "";
  summary.companyName = companyName;
  if (!/pro\s*exteriors/i.test(companyName)) {
    throw new Error(`Company gate failed: expected Pro Exteriors LLC, got "${companyName}"`);
  }
  console.log(`company_gate=OK name=${companyName}`);

  if (!dryRun) {
    await supabaseUpsert(
      supabaseUrl,
      supabaseKey,
      "qbo_sync_runs",
      [
        {
          run_key: runKey,
          realm_id: realm,
          mode,
          status: "running",
          started_at: nowIso,
          entities: selected,
          stats: {},
        },
      ],
      "run_key",
    );
  }

  try {
    for (const key of selected) {
      const spec = ENTITY_SPECS.find((e) => e.key === key);
      if (!spec) {
        summary.warnings.push(`unknown entity: ${key}`);
        continue;
      }
      const t0 = Date.now();
      let result;
      if (spec.kind === "singleton") {
        result = await syncSingleton(token, realm, spec, pullBatch, dryRun, supabaseUrl, supabaseKey);
      } else if (spec.kind === "reports") {
        result = await syncReports(token, realm, pullBatch, dryRun, supabaseUrl, supabaseKey, accountingMethod);
      } else {
        result = await syncQueryEntity(
          () => token,
          async () => {
            const r = await refreshAccessToken();
            token = r.accessToken;
            return token;
          },
          realm,
          spec,
          pullBatch,
          dryRun,
          supabaseUrl,
          supabaseKey,
          pageSize,
          maxPages,
        );
      }
      summary.entities[key] = { ...result, ms: Date.now() - t0 };
      console.log(
        `  ${key}: fetched=${result.fetched} upserted=${result.upserted} pages=${result.pages || 0} ms=${Date.now() - t0}`,
      );
    }

    summary.status = "ok";
    if (!dryRun) {
      // Keep qbo_registers."<exact QBO name>" views in sync with CoA (PEC-109)
      try {
        const refreshed = await supabaseRpc(supabaseUrl, supabaseKey, "qbo_refresh_register_views");
        summary.register_views = refreshed;
        console.log(`  register_views: refreshed=${refreshed}`);
      } catch (regErr) {
        summary.warnings.push(`qbo_refresh_register_views: ${regErr.message}`);
        console.warn(`  register_views refresh warning: ${regErr.message}`);
      }

      await supabaseUpsert(
        supabaseUrl,
        supabaseKey,
        "qbo_sync_runs",
        [
          {
            run_key: runKey,
            realm_id: realm,
            mode,
            status: "ok",
            started_at: nowIso,
            finished_at: new Date().toISOString(),
            entities: selected,
            stats: { ...summary.entities, register_views: summary.register_views },
            warnings: summary.warnings,
            content_hash: sha(summary),
          },
        ],
        "run_key",
      );
    }
  } catch (err) {
    summary.status = "failed";
    summary.error = err.message;
    if (!dryRun) {
      await supabaseUpsert(
        supabaseUrl,
        supabaseKey,
        "qbo_sync_runs",
        [
          {
            run_key: runKey,
            realm_id: realm,
            mode,
            status: "failed",
            finished_at: new Date().toISOString(),
            entities: selected,
            stats: summary.entities,
            error: err.message,
          },
        ],
        "run_key",
      ).catch(() => {});
    }
    throw err;
  }

  const outDir = resolve(ROOT, "integrations/bridges/quickbooks/.mirror-runs");
  await mkdir(outDir, { recursive: true });
  const outPath = resolve(outDir, `${runKey}.json`);
  await writeFile(outPath, JSON.stringify(summary, null, 2));
  summary.outputPath = outPath;
  console.log(JSON.stringify({ status: summary.status, runKey, outputPath: outPath, entities: summary.entities }, null, 2));
}

async function syncSingleton(token, realm, spec, pullBatch, dryRun, sbUrl, sbKey) {
  const data = await qboGet(token, `companyinfo/${realm}`);
  const row = spec.map(data.CompanyInfo || data, realm, pullBatch);
  if (!dryRun) await supabaseUpsert(sbUrl, sbKey, spec.table, [row], "realm_id,qbo_id");
  await touchWatermark(sbUrl, sbKey, realm, spec.qbo, pullBatch, 1, dryRun);
  return { fetched: 1, upserted: dryRun ? 0 : 1, pages: 1 };
}

async function syncQueryEntity(getToken, refresh, realm, spec, pullBatch, dryRun, sbUrl, sbKey, pageSize, maxPages) {
  let start = 1;
  let pages = 0;
  let fetched = 0;
  let upserted = 0;
  let maxUpdated = null;

  while (pages < maxPages) {
    let token = getToken();
    const select = spec.select === "*" ? "*" : spec.select;
    const sql = `select ${select} from ${spec.qbo} startposition ${start} maxresults ${pageSize}`;
    let data;
    try {
      data = await qboQuery(token, sql);
    } catch (err) {
      if (/AuthenticationFailed|Unauthorized|401/i.test(err.message)) {
        token = await refresh();
        data = await qboQuery(token, sql);
      } else if (/Invalid query|Object Not Found/i.test(err.message) && fetched === 0 && pages === 0) {
        // Entity may be unavailable for this company/edition
        return { fetched: 0, upserted: 0, pages: 0, skipped: err.message };
      } else {
        throw err;
      }
    }

    const rows = data?.QueryResponse?.[spec.qbo] || [];
    if (!rows.length) break;

    const mapped = rows.map((r) => {
      const m = spec.map(r, realm, pullBatch);
      const lu = m.txn_updated_at;
      if (lu && (!maxUpdated || lu > maxUpdated)) maxUpdated = lu;
      return m;
    });
    fetched += mapped.length;
    if (!dryRun) {
      await supabaseUpsert(sbUrl, sbKey, spec.table, mapped, "realm_id,qbo_id");
      upserted += mapped.length;
    }

    pages += 1;
    process.stdout.write(`\r  ${spec.key} page ${pages} start=${start} total=${fetched}   `);
    if (rows.length < pageSize) break;
    start += pageSize;
  }
  if (pages) process.stdout.write("\n");

  await touchWatermark(sbUrl, sbKey, realm, spec.qbo, pullBatch, fetched, dryRun, maxUpdated);
  return { fetched, upserted, pages };
}

async function syncReports(token, realm, pullBatch, dryRun, sbUrl, sbKey, accountingMethod) {
  let fetched = 0;
  let upserted = 0;
  const today = new Date().toISOString().slice(0, 10);
  const rows = [];

  for (const rep of REPORTS) {
    const qs = new URLSearchParams({
      ...rep.params,
      accounting_method: accountingMethod,
    });
    const data = await qboGet(token, `${rep.path}?${qs.toString()}`);
    const report = data?.Header ? data : data;
    const raw = report;
    const contentHash = sha(raw);
    const header = raw.Header || {};
    rows.push({
      realm_id: realm,
      report_name: rep.name,
      as_of_date: (header.EndPeriod || header.Time || today).toString().slice(0, 10),
      start_date: header.StartPeriod ? String(header.StartPeriod).slice(0, 10) : null,
      end_date: header.EndPeriod ? String(header.EndPeriod).slice(0, 10) : null,
      accounting_method: accountingMethod,
      summarize_column_by: header.SummarizeColumnsBy || null,
      raw,
      content_hash: contentHash,
      pull_batch: pullBatch,
      fetched_at: new Date().toISOString(),
    });
    fetched += 1;
  }

  if (!dryRun && rows.length) {
    // report snapshots unique includes content_hash — insert via upsert on that constraint name
    await supabaseUpsert(
      sbUrl,
      sbKey,
      "qbo_report_snapshots",
      rows,
      "realm_id,report_name,content_hash",
    );
    upserted = rows.length;
  }
  await touchWatermark(sbUrl, sbKey, realm, "Report", pullBatch, fetched, dryRun);
  return { fetched, upserted, pages: 1 };
}

async function touchWatermark(sbUrl, sbKey, realm, entity, runKey, count, dryRun, watermarkAt = null) {
  if (dryRun) return;
  await supabaseUpsert(
    sbUrl,
    sbKey,
    "qbo_sync_watermarks",
    [
      {
        realm_id: realm,
        entity,
        watermark_at: watermarkAt || new Date().toISOString(),
        last_run_key: runKey,
        last_count: count,
        updated_at: new Date().toISOString(),
      },
    ],
    "realm_id,entity",
  );
}

// --- mappers ----------------------------------------------------------------

function baseRow(entity, realm, pullBatch) {
  const meta = entity.MetaData || {};
  const raw = entity;
  return {
    realm_id: realm,
    qbo_id: String(entity.Id),
    sync_token: entity.SyncToken != null ? String(entity.SyncToken) : null,
    txn_updated_at: meta.LastUpdatedTime || null,
    raw,
    content_hash: sha(raw),
    pull_batch: pullBatch,
    fetched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function mapCompanyInfo(e, realm, pullBatch) {
  return {
    realm_id: realm,
    qbo_id: String(e.Id || realm),
    company_name: e.CompanyName || null,
    legal_name: e.LegalName || null,
    country: e.Country || null,
    fiscal_year_start_month: e.FiscalYearStartMonth != null ? Number(e.FiscalYearStartMonth) : null,
    raw: e,
    content_hash: sha(e),
    pull_batch: pullBatch,
    fetched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function mapAccount(e, realm, pullBatch) {
  return {
    ...baseRow(e, realm, pullBatch),
    name: e.Name || null,
    fully_qualified_name: e.FullyQualifiedName || null,
    account_type: e.AccountType || null,
    account_sub_type: e.AccountSubType || null,
    classification: e.Classification || null,
    active: e.Active ?? null,
    current_balance: num(e.CurrentBalance),
    currency_ref: ref(e.CurrencyRef),
    parent_ref: ref(e.ParentRef),
  };
}

function mapCustomer(e, realm, pullBatch) {
  return {
    ...baseRow(e, realm, pullBatch),
    display_name: e.DisplayName || null,
    company_name: e.CompanyName || null,
    active: e.Active ?? null,
    balance: num(e.Balance),
    currency_ref: ref(e.CurrencyRef),
  };
}

function mapVendor(e, realm, pullBatch) {
  return {
    ...baseRow(e, realm, pullBatch),
    display_name: e.DisplayName || null,
    company_name: e.CompanyName || null,
    active: e.Active ?? null,
    balance: num(e.Balance),
    currency_ref: ref(e.CurrencyRef),
  };
}

function mapClass(e, realm, pullBatch) {
  return {
    ...baseRow(e, realm, pullBatch),
    name: e.Name || null,
    fully_qualified_name: e.FullyQualifiedName || null,
    active: e.Active ?? null,
    parent_ref: ref(e.ParentRef),
  };
}

function mapInvoice(e, realm, pullBatch) {
  return {
    ...baseRow(e, realm, pullBatch),
    doc_number: e.DocNumber || null,
    txn_date: dateOnly(e.TxnDate),
    due_date: dateOnly(e.DueDate),
    total_amt: num(e.TotalAmt),
    balance: num(e.Balance),
    currency_ref: ref(e.CurrencyRef),
    customer_ref: ref(e.CustomerRef),
    customer_name: e.CustomerRef?.name || null,
    private_note: e.PrivateNote || null,
    email_status: e.EmailStatus || null,
    lines: e.Line || [],
  };
}

function mapPayment(e, realm, pullBatch) {
  return {
    ...baseRow(e, realm, pullBatch),
    txn_date: dateOnly(e.TxnDate),
    total_amt: num(e.TotalAmt),
    currency_ref: ref(e.CurrencyRef),
    customer_ref: ref(e.CustomerRef),
    customer_name: e.CustomerRef?.name || null,
    deposit_to_account_ref: ref(e.DepositToAccountRef),
    private_note: e.PrivateNote || null,
    lines: e.Line || [],
  };
}

function mapBill(e, realm, pullBatch) {
  return {
    ...baseRow(e, realm, pullBatch),
    doc_number: e.DocNumber || null,
    txn_date: dateOnly(e.TxnDate),
    due_date: dateOnly(e.DueDate),
    total_amt: num(e.TotalAmt),
    balance: num(e.Balance),
    currency_ref: ref(e.CurrencyRef),
    vendor_ref: ref(e.VendorRef),
    vendor_name: e.VendorRef?.name || null,
    private_note: e.PrivateNote || null,
    lines: e.Line || [],
  };
}

function mapBillPayment(e, realm, pullBatch) {
  return {
    ...baseRow(e, realm, pullBatch),
    doc_number: e.DocNumber || null,
    txn_date: dateOnly(e.TxnDate),
    total_amt: num(e.TotalAmt),
    pay_type: e.PayType || null,
    vendor_ref: ref(e.VendorRef),
    vendor_name: e.VendorRef?.name || null,
    bank_account_ref: ref(e.CheckPayment?.BankAccountRef || e.CreditCardPayment?.CCAccountRef),
    private_note: e.PrivateNote || null,
    lines: e.Line || [],
  };
}

function mapPurchase(e, realm, pullBatch) {
  return {
    ...baseRow(e, realm, pullBatch),
    doc_number: e.DocNumber || null,
    txn_date: dateOnly(e.TxnDate),
    total_amt: num(e.TotalAmt),
    payment_type: e.PaymentType || null,
    credit: Boolean(e.Credit),
    account_ref: ref(e.AccountRef),
    account_name: e.AccountRef?.name || null,
    entity_ref: ref(e.EntityRef),
    entity_name: e.EntityRef?.name || null,
    private_note: e.PrivateNote || null,
    lines: e.Line || [],
  };
}

function mapDeposit(e, realm, pullBatch) {
  return {
    ...baseRow(e, realm, pullBatch),
    txn_date: dateOnly(e.TxnDate),
    total_amt: num(e.TotalAmt),
    deposit_to_account_ref: ref(e.DepositToAccountRef),
    deposit_to_account_name: e.DepositToAccountRef?.name || null,
    private_note: e.PrivateNote || null,
    lines: e.Line || [],
  };
}

function mapJournal(e, realm, pullBatch) {
  return {
    ...baseRow(e, realm, pullBatch),
    doc_number: e.DocNumber || null,
    txn_date: dateOnly(e.TxnDate),
    private_note: e.PrivateNote || null,
    lines: e.Line || [],
  };
}

function mapVendorCredit(e, realm, pullBatch) {
  return {
    ...baseRow(e, realm, pullBatch),
    doc_number: e.DocNumber || null,
    txn_date: dateOnly(e.TxnDate),
    total_amt: num(e.TotalAmt),
    balance: num(e.Balance),
    vendor_ref: ref(e.VendorRef),
    vendor_name: e.VendorRef?.name || null,
    private_note: e.PrivateNote || null,
    lines: e.Line || [],
  };
}

function mapCreditMemo(e, realm, pullBatch) {
  return {
    ...baseRow(e, realm, pullBatch),
    doc_number: e.DocNumber || null,
    txn_date: dateOnly(e.TxnDate),
    total_amt: num(e.TotalAmt),
    balance: num(e.Balance),
    customer_ref: ref(e.CustomerRef),
    customer_name: e.CustomerRef?.name || null,
    private_note: e.PrivateNote || null,
    lines: e.Line || [],
  };
}

function mapTransfer(e, realm, pullBatch) {
  return {
    ...baseRow(e, realm, pullBatch),
    txn_date: dateOnly(e.TxnDate),
    amount: num(e.Amount),
    from_account_ref: ref(e.FromAccountRef),
    to_account_ref: ref(e.ToAccountRef),
    private_note: e.PrivateNote || null,
  };
}

// --- supabase helpers -------------------------------------------------------

async function supabaseUpsert(supabaseUrl, key, table, rows, onConflict) {
  if (!rows.length) return;
  for (const chunk of chunked(rows, 100)) {
    const params = new URLSearchParams({ on_conflict: onConflict });
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${params}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supabase upsert ${table} failed: ${res.status} ${body.slice(0, 400)}`);
    }
  }
}

/** Call a Postgres function exposed via PostgREST RPC. */
async function supabaseRpc(supabaseUrl, key, fnName, args = {}) {
  const res = await fetch(`${stripSlash(supabaseUrl)}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase rpc ${fnName} failed: ${res.status} ${body.slice(0, 400)}`);
  }
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

// --- env / utils ------------------------------------------------------------

function loadEnvFiles() {
  const paths = [
    resolve(ROOT, ".env"),
    resolve(homedir(), ".config/cleverwork/master.env"),
  ];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const parsed = parseDotenv(p);
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] == null || process.env[k] === "") process.env[k] = v;
    }
  }
}

function enforceProdKeys() {
  process.env.QUICKBOOKS_ACCESS_MODE = process.env.QUICKBOOKS_ACCESS_MODE || "read_only";
  process.env.QUICKBOOKS_WRITE_ENABLED = process.env.QUICKBOOKS_WRITE_ENABLED || "false";
  process.env.QUICKBOOKS_SANDBOX_MODE = "false";
  process.env.QUICKBOOKS_ENV = "production";
  if (process.env.QUICKBOOKS_PROD_CLIENT_ID) {
    process.env.QUICKBOOKS_CLIENT_ID = process.env.QUICKBOOKS_PROD_CLIENT_ID;
    process.env.QUICKBOOKS_CLIENT_SECRET = process.env.QUICKBOOKS_PROD_CLIENT_SECRET;
    process.env.QUICKBOOKS_REFRESH_TOKEN = process.env.QUICKBOOKS_PROD_REFRESH_TOKEN;
    process.env.QUICKBOOKS_REALM_ID = process.env.QUICKBOOKS_PROD_REALM_ID;
  }
}

function parseDotenv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq < 0) out[a.slice(2)] = true;
    else out[a.slice(2, eq)] = a.slice(eq + 1);
  }
  return out;
}

function stripSlash(s) {
  return String(s || "").replace(/\/$/, "");
}

function sha(obj) {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

function ref(r) {
  if (!r) return null;
  return r.value != null ? String(r.value) : null;
}

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dateOnly(v) {
  if (!v) return null;
  return String(v).slice(0, 10);
}

function chunked(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
