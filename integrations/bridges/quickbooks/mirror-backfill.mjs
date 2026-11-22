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
 *   node integrations/bridges/quickbooks/mirror-backfill.mjs --mode=cdc
 *   node integrations/bridges/quickbooks/mirror-backfill.mjs --only=accounts,purchases --dry-run
 *
 * Presence flags (mig 348). Nothing is ever deleted from the mirror:
 *   - every row a pull returns gets last_seen_at / last_seen_run_key, and its
 *     missing_since / qbo_deleted_at are cleared;
 *   - after a COMPLETE full pull of an entity, rows it did not return get
 *     missing_since (qbo_mark_missing), unless the pull returned far fewer rows
 *     than the mirror holds (guard: --missing-guard, default 0.8);
 *   - the change feed (QuickBooks CDC, GET /cdc) reports deletions; those rows
 *     get qbo_deleted_at (qbo_mark_deleted). It runs after every full pull and
 *     on its own with --mode=cdc.
 * Readers use the v_qbo_<table>_current views; v_qbo_ar_reconciliation checks the
 * mirror against the AgedReceivableDetail report after each run.
 *
 * Env: SUPABASE_* from repo .env; QUICKBOOKS_* from master.env or process.env.
 * Requires QUICKBOOKS_ACCESS_MODE=read_only and QUICKBOOKS_WRITE_ENABLED=false.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

// Intuit rotates the refresh token on refresh; the successor must outlive this
// process or the next run fails invalid_grant (PEC-175, twice). Persist it to
// master.env (atomic tmp+rename, 0600) and to process.env so mid-run refreshes
// use the successor. 1Password "QBO - PROD TOKENS" stays the re-auth source of
// record and drifts from the host copy after first rotation by design.
// Log rotation events only — never token values.
async function refreshAccessTokenPersisting() {
  const before = process.env.QUICKBOOKS_REFRESH_TOKEN;
  const r = await refreshAccessToken();
  persistRotatedRefreshToken(before, r.refreshToken);
  return r;
}

function persistRotatedRefreshToken(oldToken, newToken) {
  if (!newToken || newToken === oldToken) return;
  process.env.QUICKBOOKS_REFRESH_TOKEN = newToken;
  if (process.env.QUICKBOOKS_PROD_REFRESH_TOKEN) process.env.QUICKBOOKS_PROD_REFRESH_TOKEN = newToken;
  const envPath = resolve(homedir(), ".config/cleverwork/master.env");
  try {
    if (!existsSync(envPath)) {
      console.log("qbo_refresh_token=rotated persist=skipped (no master.env)");
      return;
    }
    let touched = false;
    const out = readFileSync(envPath, "utf8")
      .split("\n")
      .map((line) => {
        const m = line.match(/^(QUICKBOOKS(?:_PROD)?_REFRESH_TOKEN)=/);
        if (!m) return line;
        touched = true;
        return `${m[1]}=${newToken}`;
      })
      .join("\n");
    if (!touched) {
      console.log("qbo_refresh_token=rotated persist=skipped (no refresh-token key in master.env)");
      return;
    }
    const tmpPath = `${envPath}.tmp-${process.pid}`;
    writeFileSync(tmpPath, out, { mode: 0o600 });
    renameSync(tmpPath, envPath);
    console.log("qbo_refresh_token=rotated persist=master.env");
  } catch (err) {
    console.log(`qbo_refresh_token=rotated persist=FAILED (${err.message})`);
  }
}

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
// Full-pull modes: a run in one of these, not truncated by --max-pages, may flag missing rows.
const FULL_PULL_MODES = new Set(["backfill", "thursday"]);
const MISSING_GUARD_DEFAULT = 0.8;
// QuickBooks CDC returns changes from at most the last 30 days.
const CDC_MAX_LOOKBACK_MS = 29.5 * 24 * 3600 * 1000;
const CDC_OVERLAP_MS = 10 * 60 * 1000;
const CDC_MAX_PER_ENTITY = 1000;
// AR reconciliation tolerance (share of the report's open invoice total).
const AR_DRIFT_TOLERANCE = 0.01;
const PAGE_SIZE = 100; // QBO max page; never trust a full page of 1000 without splitting windows
const MAX_PAGES_DEFAULT = 10000;

// Run only when executed directly, so tests can import the pure helpers.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error("STATUS=FAIL", err.message);
    process.exit(1);
  });
}

async function main() {
  loadEnvFiles();
  enforceProdKeys();

  const args = parseArgs(process.argv.slice(2));
  const mode = String(args.mode || "backfill");
  const dryRun = Boolean(args["dry-run"]);
  const pageSize = Number(args["page-size"] || PAGE_SIZE);
  const maxPages = Number(args["max-pages"] || (mode === "smoke" ? 3 : MAX_PAGES_DEFAULT));
  const accountingMethod = String(args["accounting-method"] || "Cash");
  const missingGuard = Number(args["missing-guard"] || MISSING_GUARD_DEFAULT);
  const flagMissing = FULL_PULL_MODES.has(mode) && !args["no-flag-missing"];

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
  } else if (mode === "cdc") {
    selected = ["cdc"];
  }
  // Full pulls finish with a change-feed pass so deletions are recorded the same night.
  if (FULL_PULL_MODES.has(mode) && !args.only && !args["no-cdc"] && !selected.includes("cdc")) {
    selected.push("cdc");
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

  const { accessToken } = await refreshAccessTokenPersisting();
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
      if (key === "cdc") {
        const t0 = Date.now();
        const result = await syncCdc(
          () => token,
          async () => {
            const r = await refreshAccessTokenPersisting();
            token = r.accessToken;
            return token;
          },
          realm,
          pullBatch,
          dryRun,
          supabaseUrl,
          supabaseKey,
          summary,
        );
        summary.entities.cdc = { ...result, ms: Date.now() - t0 };
        console.log(
          `  cdc: changed=${result.changed} deleted=${result.deleted} flagged_deleted=${result.flaggedDeleted} ms=${Date.now() - t0}`,
        );
        continue;
      }
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
            const r = await refreshAccessTokenPersisting();
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
          { flagMissing, missingGuard, warnings: summary.warnings },
        );
      }
      summary.entities[key] = { ...result, ms: Date.now() - t0 };
      console.log(
        `  ${key}: fetched=${result.fetched} upserted=${result.upserted} pages=${result.pages || 0}` +
          (result.flaggedMissing != null ? ` flagged_missing=${result.flaggedMissing}` : "") +
          ` ms=${Date.now() - t0}`,
      );
    }

    // Nightly check: mirror open AR against the AgedReceivableDetail report (mig 348).
    if (!dryRun && (selected.includes("invoices") || selected.includes("cdc"))) {
      try {
        summary.ar_reconciliation = await checkArReconciliation(supabaseUrl, supabaseKey, realm, summary.warnings);
      } catch (recErr) {
        summary.warnings.push(`ar_reconciliation: ${recErr.message}`);
        console.warn(`  ar_reconciliation warning: ${recErr.message}`);
      }
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
            stats: {
              ...summary.entities,
              register_views: summary.register_views,
              ar_reconciliation: summary.ar_reconciliation,
            },
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

async function syncQueryEntity(
  getToken,
  refresh,
  realm,
  spec,
  pullBatch,
  dryRun,
  sbUrl,
  sbKey,
  pageSize,
  maxPages,
  { flagMissing = false, missingGuard = MISSING_GUARD_DEFAULT, warnings = [] } = {},
) {
  // Every row this pull returns is stamped last_seen_at >= pullStartedIso (same clock).
  const pullStartedIso = new Date().toISOString();
  let start = 1;
  let pages = 0;
  let fetched = 0;
  let upserted = 0;
  let maxUpdated = null;
  let complete = false;
  // Stable order so startposition paging cannot skip or repeat rows mid-run.
  let orderBy = " orderby Id";
  let orderByFallback = false;

  while (pages < maxPages) {
    let token = getToken();
    const select = spec.select === "*" ? "*" : spec.select;
    const sql = () => `select ${select} from ${spec.qbo}${orderBy} startposition ${start} maxresults ${pageSize}`;
    let data;
    try {
      data = await qboQuery(token, sql());
    } catch (err) {
      if (/AuthenticationFailed|Unauthorized|401/i.test(err.message)) {
        token = await refresh();
        data = await qboQuery(token, sql());
      } else if (orderBy && pages === 0 && /Invalid query|QueryParserError|parse|orderby/i.test(err.message)) {
        // Entity does not accept ORDERBY Id: fall back to the unordered query, and do not
        // flag missing rows from an unordered pull (paging may have skipped rows).
        orderBy = "";
        orderByFallback = true;
        warnings.push(`${spec.key}: orderby Id not accepted (${err.message}); paged unordered, missing-row flagging skipped`);
        try {
          data = await qboQuery(token, sql());
        } catch (err2) {
          if (/Invalid query|Object Not Found/i.test(err2.message) && fetched === 0) {
            return { fetched: 0, upserted: 0, pages: 0, skipped: err2.message };
          }
          throw err2;
        }
      } else if (/Invalid query|Object Not Found/i.test(err.message) && fetched === 0 && pages === 0) {
        // Entity may be unavailable for this company/edition
        return { fetched: 0, upserted: 0, pages: 0, skipped: err.message };
      } else {
        throw err;
      }
    }

    const rows = data?.QueryResponse?.[spec.qbo] || [];
    if (!rows.length) {
      complete = true;
      break;
    }

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
    if (rows.length < pageSize) {
      complete = true;
      break;
    }
    start += pageSize;
  }
  if (pages) process.stdout.write("\n");

  await touchWatermark(sbUrl, sbKey, realm, spec.qbo, pullBatch, fetched, dryRun, maxUpdated);

  const result = { fetched, upserted, pages };
  if (orderByFallback) result.orderby = "unsupported";

  if (flagMissing && !dryRun) {
    const decision = await flagMissingRows(sbUrl, sbKey, realm, spec, {
      complete,
      orderByFallback,
      fetched,
      pullStartedIso,
      missingGuard,
    });
    if (decision.skipped) {
      warnings.push(`${spec.key}: missing-row flagging skipped (${decision.skipped})`);
      result.flagMissingSkipped = decision.skipped;
    } else {
      result.flaggedMissing = decision.flagged;
    }
  }
  return result;
}

/**
 * After a full pull: stamp missing_since on rows the pull did not return.
 * Update-only (qbo_mark_missing); a row seen again later is cleared by the upsert.
 */
async function flagMissingRows(sbUrl, sbKey, realm, spec, { complete, orderByFallback, fetched, pullStartedIso, missingGuard }) {
  const verdict = missingFlagVerdict({ complete, orderByFallback, fetched, activeBefore: null, missingGuard });
  if (verdict) return { skipped: verdict };
  // Rows the mirror still treats as present that this pull did not touch.
  const notSeen = await supabaseCount(sbUrl, sbKey, spec.table, {
    realm_id: `eq.${realm}`,
    missing_since: "is.null",
    qbo_deleted_at: "is.null",
    last_seen_at: `lt.${pullStartedIso}`,
  });
  const guard = missingFlagVerdict({ complete, orderByFallback, fetched, activeBefore: fetched + notSeen, missingGuard });
  if (guard) return { skipped: guard };
  if (notSeen === 0) return { flagged: 0 };
  const flagged = await supabaseRpc(sbUrl, sbKey, "qbo_mark_missing", {
    p_table: spec.table,
    p_realm: realm,
    p_run_started: pullStartedIso,
  });
  return { flagged: Number(flagged) || 0 };
}

/**
 * Decide whether a pull may flag missing rows. Returns a reason to skip, or null.
 * Exported for tests.
 */
export function missingFlagVerdict({ complete, orderByFallback, fetched, activeBefore, missingGuard = MISSING_GUARD_DEFAULT }) {
  if (!complete) return "pull truncated by --max-pages";
  if (orderByFallback) return "unordered paging";
  if (activeBefore == null) return null;
  if (activeBefore > 0 && fetched < missingGuard * activeBefore) {
    return `pull returned ${fetched} of ${activeBefore} present rows (< ${Math.round(missingGuard * 100)}%)`;
  }
  return null;
}

// --- change feed (CDC) --------------------------------------------------------

/**
 * QuickBooks Change Data Capture: GET /cdc?entities=X&changedSince=ISO (read-only).
 * Changed entities are upserted like a full pull; entities reported with
 * status "Deleted" are flagged qbo_deleted_at (nothing is deleted).
 */
async function syncCdc(getToken, refresh, realm, pullBatch, dryRun, sbUrl, sbKey, summary) {
  const callStartedIso = new Date().toISOString();
  const prior = await readWatermark(sbUrl, sbKey, realm, "CDC");
  const changedSince = cdcChangedSince(prior, Date.now());
  const specs = ENTITY_SPECS.filter((e) => e.kind === "query");
  let changed = 0;
  let deleted = 0;
  let flaggedDeleted = 0;
  const perEntity = {};

  for (const spec of specs) {
    const path = `cdc?entities=${spec.qbo}&changedSince=${encodeURIComponent(changedSince)}`;
    let data;
    try {
      data = await qboGet(getToken(), path);
    } catch (err) {
      if (/AuthenticationFailed|Unauthorized|401/i.test(err.message)) {
        data = await qboGet(await refresh(), path);
      } else {
        summary.warnings.push(`cdc ${spec.qbo}: ${err.message}`);
        perEntity[spec.key] = { error: err.message };
        continue;
      }
    }
    const { live, removed } = splitCdcEntities(data, spec.qbo);
    if (live.length + removed.length >= CDC_MAX_PER_ENTITY) {
      summary.warnings.push(
        `cdc ${spec.qbo}: ${live.length + removed.length} changes returned (cap ${CDC_MAX_PER_ENTITY}); the full pull covers the rest`,
      );
    }
    if (!dryRun && live.length) {
      await supabaseUpsert(
        sbUrl,
        sbKey,
        spec.table,
        live.map((r) => spec.map(r, realm, pullBatch)),
        "realm_id,qbo_id",
      );
    }
    let flagged = 0;
    if (!dryRun && removed.length) {
      flagged = Number(
        await supabaseRpc(sbUrl, sbKey, "qbo_mark_deleted", {
          p_table: spec.table,
          p_realm: realm,
          p_rows: removed,
        }),
      ) || 0;
    }
    changed += live.length;
    deleted += removed.length;
    flaggedDeleted += flagged;
    perEntity[spec.key] = { changed: live.length, deleted: removed.length, flagged };
  }

  // Only advance the watermark when every entity read cleanly.
  const clean = Object.values(perEntity).every((v) => !v.error);
  if (clean) await touchWatermark(sbUrl, sbKey, realm, "CDC", pullBatch, changed + deleted, dryRun, callStartedIso);
  return { changed, deleted, flaggedDeleted, changedSince, perEntity, watermarkAdvanced: clean && !dryRun };
}

/** changedSince for the next CDC call: prior watermark minus an overlap, never older than QuickBooks allows. Exported for tests. */
export function cdcChangedSince(priorWatermarkIso, nowMs) {
  const floor = nowMs - CDC_MAX_LOOKBACK_MS;
  const prior = priorWatermarkIso ? Date.parse(priorWatermarkIso) - CDC_OVERLAP_MS : NaN;
  const since = Number.isFinite(prior) ? Math.max(prior, floor) : floor;
  return new Date(since).toISOString();
}

/**
 * Split a CDC response into live entities and deletions for one entity name.
 * Shape: { CDCResponse: [ { QueryResponse: [ { Invoice: [ ... ] } ] } ] }.
 * A deleted entity carries status "Deleted", its Id and MetaData only. Exported for tests.
 */
export function splitCdcEntities(data, entityName) {
  const live = [];
  const removed = [];
  for (const cdc of data?.CDCResponse || []) {
    for (const qr of cdc?.QueryResponse || []) {
      for (const e of qr?.[entityName] || []) {
        if (String(e?.status || "").toLowerCase() === "deleted") {
          removed.push({ id: String(e.Id), deleted_at: e?.MetaData?.LastUpdatedTime || null });
        } else if (e?.Id != null) {
          live.push(e);
        }
      }
    }
  }
  return { live, removed };
}

// --- AR reconciliation ---------------------------------------------------------

async function checkArReconciliation(sbUrl, sbKey, realm, warnings) {
  const rows = await supabaseSelect(sbUrl, sbKey, "v_qbo_ar_reconciliation", { realm_id: `eq.${realm}` });
  const r = rows[0];
  if (!r) return { status: "no_rows" };
  const out = {
    status: r.status,
    report_as_of: r.report_as_of,
    report_invoice_open: Number(r.report_invoice_open),
    mirror_current_open: Number(r.mirror_current_open),
    flagged_open: Number(r.flagged_open || 0),
    difference: Number(r.invoice_open_difference),
    difference_pct: r.invoice_open_difference_pct == null ? null : Number(r.invoice_open_difference_pct),
  };
  console.log(
    `  ar_reconciliation: status=${out.status} report=${out.report_invoice_open} mirror=${out.mirror_current_open} ` +
      `diff=${out.difference} (${out.difference_pct}%) flagged_open=${out.flagged_open}`,
  );
  if (out.status !== "ok") {
    warnings.push(
      `ar_reconciliation: ${out.status}; mirror open ${out.mirror_current_open} vs report ${out.report_invoice_open} ` +
        `(tolerance ${AR_DRIFT_TOLERANCE * 100}%)`,
    );
  }
  return out;
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
    // Presence flags (mig 348): a returned row exists in QuickBooks now.
    last_seen_run_key: pullBatch,
    last_seen_at: new Date().toISOString(),
    missing_since: null,
    qbo_deleted_at: null,
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

/** Exact row count for a filtered table (PostgREST HEAD + count=exact). */
async function supabaseCount(supabaseUrl, key, table, filters) {
  const params = new URLSearchParams({ select: "qbo_id", ...filters });
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${params}`, {
    method: "HEAD",
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact", Range: "0-0" },
  });
  if (!res.ok && res.status !== 206) throw new Error(`Supabase count ${table} failed: ${res.status}`);
  const range = res.headers.get("content-range") || "";
  const total = Number(range.split("/")[1]);
  if (!Number.isFinite(total)) throw new Error(`Supabase count ${table}: no total in content-range "${range}"`);
  return total;
}

async function supabaseSelect(supabaseUrl, key, table, filters = {}) {
  const params = new URLSearchParams({ select: "*", ...filters });
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${params}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Supabase select ${table} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function readWatermark(supabaseUrl, key, realm, entity) {
  const rows = await supabaseSelect(supabaseUrl, key, "qbo_sync_watermarks", {
    realm_id: `eq.${realm}`,
    entity: `eq.${entity}`,
  });
  return rows[0]?.watermark_at || null;
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
