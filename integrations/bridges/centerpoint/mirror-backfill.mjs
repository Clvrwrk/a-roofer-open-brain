#!/usr/bin/env node
/**
 * CenterPoint Connect → Supabase mirror (PEC-110 / docs/78).
 *
 * READ-ONLY against https://api.centerpointconnect.io/centerpoint/
 * Never POST/PATCH/DELETE to CenterPoint. Upserts only into PE Supabase.
 *
 * Env: SUPABASE_* from repo .env; CENTERPOINT_API_TOKEN from master.env.
 *
 *   node integrations/bridges/centerpoint/mirror-backfill.mjs --mode=smoke
 *   node integrations/bridges/centerpoint/mirror-backfill.mjs --mode=backfill
 *   node integrations/bridges/centerpoint/mirror-backfill.mjs --mode=backfill --skip=files,model_files
 *   node integrations/bridges/centerpoint/mirror-backfill.mjs --only=companies,productions
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const API_BASE = "https://api.centerpointconnect.io/centerpoint";

/** All GET list collections from OpenAPI (metadata for files — no binary download). */
const ALL_RESOURCES = [
  "companies",
  "productions",
  "opportunities",
  "properties",
  "profiles",
  "employees",
  "invoices",
  "services",
  "service_agreements",
  "materials",
  "products",
  "product_templates",
  "purchase_orders",
  "tasks",
  "work_time_entries",
  "production_days",
  "production_items",
  "production_materials",
  "cost_codes",
  "tax_codes",
  "budget_types",
  "budget",
  "warranties",
  "locations",
  "files",
  "model_files",
  "product_template_tags",
  "transactions",
];

const SMOKE_RESOURCES = ["companies", "productions", "opportunities", "properties", "invoices"];

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

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const i = s.indexOf("=");
    out[s.slice(0, i).trim()] = s.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function stripSlash(s) {
  return String(s || "").replace(/\/$/, "");
}

function sha(obj) {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

function chunked(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function parseTs(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function pickStatus(attrs) {
  if (!attrs || typeof attrs !== "object") return null;
  for (const k of ["status", "salesStatus", "stage", "state", "workflowStatus"]) {
    if (attrs[k] != null && attrs[k] !== "") return String(attrs[k]);
  }
  return null;
}

function pickName(attrs) {
  if (!attrs || typeof attrs !== "object") return null;
  for (const k of ["name", "title", "label", "displayName", "number", "invoiceNumber", "fileName", "filename"]) {
    if (attrs[k] != null && attrs[k] !== "") return String(attrs[k]);
  }
  return null;
}

function mapResource(item, pullBatch, collection) {
  const attrs = item.attributes || {};
  // Identity = list path (collection). JSON:API data.type often collides
  // (opportunities/services → "productions"; profiles → "employees").
  const row = {
    resource_type: collection,
    api_type: item.type || null,
    cp_id: String(item.id),
    name: pickName(attrs),
    status: pickStatus(attrs),
    created_at_src: parseTs(attrs.createdAt),
    updated_at_src: parseTs(attrs.updatedAt),
    deleted_at_src: parseTs(attrs.deletedAt),
    attributes: attrs,
    relationships: item.relationships || {},
    raw: item,
    pull_batch: pullBatch,
    fetched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  row.content_hash = sha({
    collection: row.resource_type,
    api_type: row.api_type,
    id: row.cp_id,
    attributes: attrs,
    relationships: row.relationships,
  });
  return row;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function cpGet(token, path, query = {}, { retries = 5 } = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v != null) qs.set(k, String(v));
  }
  const url = `${API_BASE}/${path}${qs.toString() ? `?${qs}` : ""}`;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: token,
          Accept: "application/vnd.api+json",
          "User-Agent": "pe-ob-centerpoint-mirror/1.0",
        },
      });
      const text = await res.text();
      if (res.ok) return text ? JSON.parse(text) : {};
      // Upstream timeouts / rate limits — retry with backoff
      if ([408, 425, 429, 500, 502, 503, 504].includes(res.status) && attempt < retries) {
        const wait = Math.min(60_000, 1500 * 2 ** attempt);
        console.warn(`    retry ${path} page after HTTP ${res.status} (wait ${wait}ms)`);
        await sleep(wait);
        continue;
      }
      throw new Error(`CenterPoint GET /${path} → ${res.status} ${text.slice(0, 300)}`);
    } catch (err) {
      lastErr = err;
      if (attempt < retries && /fetch failed|ECONNRESET|ETIMEDOUT|socket/i.test(String(err.message || err))) {
        const wait = Math.min(60_000, 1500 * 2 ** attempt);
        console.warn(`    retry ${path} after network error (wait ${wait}ms)`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function supabaseUpsert(supabaseUrl, key, table, rows, onConflict, { soft = false } = {}) {
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
      const msg = `Supabase upsert ${table} failed: ${res.status} ${body.slice(0, 400)}`;
      if (soft) {
        console.warn(`  warning: ${msg}`);
        return;
      }
      throw new Error(msg);
    }
  }
}

async function syncCollection(token, resource, pullBatch, dryRun, sbUrl, sbKey, pageSize, maxPages) {
  let page = 1;
  let fetched = 0;
  let upserted = 0;
  let pages = 0;
  let lastPage = 1;

  while (page <= lastPage && pages < maxPages) {
    const data = await cpGet(token, resource, {
      "page[size]": pageSize,
      "page[number]": page,
    });
    const items = Array.isArray(data.data) ? data.data : data.data ? [data.data] : [];
    const metaPage = data.meta?.page || {};
    if (metaPage.lastPage != null) lastPage = Number(metaPage.lastPage) || 1;
    else if (items.length < pageSize) lastPage = page;

    const rows = items.map((it) => mapResource(it, pullBatch, resource));
    fetched += rows.length;
    if (!dryRun && rows.length) {
      await supabaseUpsert(sbUrl, sbKey, "cp_resources", rows, "resource_type,cp_id");
      upserted += rows.length;
    }
    pages += 1;
    const logEvery = lastPage > 500 ? 10 : 25;
    if (pages % logEvery === 0 || page === lastPage || pages === 1) {
      console.log(`    ${resource}: page ${page}/${lastPage} fetched=${fetched}`);
    }
    if (!items.length) break;
    page += 1;
  }

  if (!dryRun) {
    await supabaseUpsert(
      sbUrl,
      sbKey,
      "cp_sync_watermarks",
      [
        {
          resource_type: resource,
          watermark_at: new Date().toISOString(),
          last_run_key: pullBatch,
          last_count: upserted,
          updated_at: new Date().toISOString(),
        },
      ],
      "resource_type",
      { soft: true },
    );
  }

  return { fetched, upserted, pages, lastPage };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = String(args.mode || "backfill");
  const dryRun = Boolean(args["dry-run"]);
  const pageSize = Number(args["page-size"] || (mode === "smoke" ? 5 : 100));
  const maxPages = Number(args["max-pages"] || (mode === "smoke" ? 1 : 100000));

  // master.env often carries a different Supabase project. For this PE brain mirror,
  // repo .env wins for SUPABASE_*; CENTERPOINT_* come from master/process.
  const master = loadEnvFile(resolve(homedir(), ".config/cleverwork/master.env"));
  const repoEnv = loadEnvFile(resolve(ROOT, ".env"));
  const env = { ...master, ...process.env };
  for (const [k, v] of Object.entries(repoEnv)) {
    if (k.startsWith("SUPABASE_") || k.startsWith("PUBLIC_SUPABASE")) env[k] = v;
  }

  const token = env.CENTERPOINT_API_TOKEN;
  if (!token) throw new Error("Missing CENTERPOINT_API_TOKEN");

  const sbUrl = stripSlash(env.SUPABASE_URL || env.PUBLIC_SUPABASE_URL || "");
  const sbKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !sbKey) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const peHost = "rnhmvcpsvtqjlffpsayu.supabase.co";
  if (!sbUrl.includes(peHost)) {
    throw new Error(
      `Refusing Supabase host ${new URL(sbUrl).host}; PE brain must be ${peHost} (check repo .env)`,
    );
  }

  let selected = mode === "smoke" ? [...SMOKE_RESOURCES] : [...ALL_RESOURCES];
  if (args.only) {
    selected = String(args.only)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (args.skip) {
    const skip = new Set(
      String(args.skip)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    selected = selected.filter((r) => !skip.has(r));
  }

  const nowIso = new Date().toISOString();
  const runKey = `cp-mirror-${mode}-${nowIso.replace(/[:.]/g, "-")}`;
  const pullBatch = runKey;
  const summary = {
    runKey,
    mode,
    dryRun,
    appId: env.CENTERPOINT_APP_ID || null,
    appName: env.CENTERPOINT_APP_NAME || null,
    startedAt: nowIso,
    entities: {},
    warnings: [],
    status: "running",
  };

  console.log(
    `cp-mirror start mode=${mode} dryRun=${dryRun} host=${new URL(sbUrl).host} entities=${selected.join(",")} pageSize=${pageSize}`,
  );

  // Gate: companies list must succeed
  const probe = await cpGet(token, "companies", { "page[size]": 1 });
  const totalCompanies = probe.meta?.page?.total;
  console.log(`company_gate=OK total_companies=${totalCompanies}`);

  if (!dryRun) {
    await supabaseUpsert(
      sbUrl,
      sbKey,
      "cp_sync_runs",
      [
        {
          run_key: runKey,
          app_id: env.CENTERPOINT_APP_ID || null,
          mode,
          status: "running",
          started_at: nowIso,
          entities: selected,
        },
      ],
      "run_key",
      { soft: true },
    );
  }

  try {
    for (const resource of selected) {
      const t0 = Date.now();
      console.log(`  sync ${resource}…`);
      const result = await syncCollection(
        token,
        resource,
        pullBatch,
        dryRun,
        sbUrl,
        sbKey,
        pageSize,
        maxPages,
      );
      summary.entities[resource] = { ...result, ms: Date.now() - t0 };
      console.log(
        `  ${resource}: fetched=${result.fetched} upserted=${result.upserted} pages=${result.pages} ms=${Date.now() - t0}`,
      );
    }

    summary.status = "ok";
    if (!dryRun) {
      await supabaseUpsert(
        sbUrl,
        sbKey,
        "cp_sync_runs",
        [
          {
            run_key: runKey,
            app_id: env.CENTERPOINT_APP_ID || null,
            mode,
            status: "ok",
            started_at: nowIso,
            finished_at: new Date().toISOString(),
            entities: selected,
            stats: summary.entities,
            warnings: summary.warnings,
            content_hash: sha(summary),
          },
        ],
        "run_key",
        { soft: true },
      );
    }
  } catch (err) {
    summary.status = "failed";
    summary.error = err.message;
    if (!dryRun) {
      await supabaseUpsert(
        sbUrl,
        sbKey,
        "cp_sync_runs",
        [
          {
            run_key: runKey,
            mode,
            status: "failed",
            finished_at: new Date().toISOString(),
            entities: selected,
            stats: summary.entities,
            error: err.message,
          },
        ],
        "run_key",
        { soft: true },
      );
    }
    throw err;
  }

  const outDir = resolve(ROOT, "integrations/bridges/centerpoint/.mirror-runs");
  await mkdir(outDir, { recursive: true });
  const outPath = resolve(outDir, `${runKey}.json`);
  await writeFile(outPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ status: summary.status, runKey, outputPath: outPath, entities: summary.entities }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
