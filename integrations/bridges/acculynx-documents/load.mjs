#!/usr/bin/env node
// AccuLynx job documents → Open Brain (docs/121, migration 320).
//
//   node integrations/bridges/acculynx-documents/load.mjs --root <PE_Job_Documents folder>
//        [--collection acculynx-collection-2026-10-01] [--job <acculynx job id>] [--limit-jobs N]
//        [--concurrency 4] [--no-text] [--dry-run] [--env-file PATH] [--expect-ref <project ref>]
//
// AccuLynx's API has no document GET, so documents arrive as a browser collection: under --root,
// `<collection>/<job id>-inventory.json` lists every document AccuLynx showed on the job (folder,
// source URL, SHA-256, file-check result) and the files sit elsewhere under --root. Files were
// renamed and moved after download, so the inventory's saved_path is not trusted: each file is
// found by its SHA-256 (sizes narrow the candidates before hashing).
//
// Writes: acculynx_job_documents (upsert on job + document key), acculynx_document_collection_jobs,
// acculynx_document_load_runs, and the private `acculynx-job-documents` bucket at
// sha256/<2>/<sha>.<ext> (content-addressed: duplicates share one object, objects are never
// overwritten). Then runs apply_job_document_type_map() and link_acculynx_job_documents().
// Upserts never carry type, link or removal columns, so a rerun cannot undo a person's change.
// Never deletes anything. Reads AccuLynx nothing (local files only).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional tools: pdftotext + pdfinfo (poppler) for
// the text layer and page count; without them, or with --no-text, text columns are left alone.

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename, extname, join, resolve } from "node:path";

const run = promisify(execFile);
const ROOT = resolve(new URL("../../..", import.meta.url).pathname);
const args = parseArgs(process.argv.slice(2));
// An explicit --env-file wins over the shell: login shells on this fleet export other projects'
// SUPABASE_URL values (docs/120 §4).
const fileEnv = parseDotenv(args["env-file"] || resolve(ROOT, ".env"));
const env = args["env-file"] ? { ...process.env, ...fileEnv } : { ...fileEnv, ...process.env };
const dryRun = Boolean(args["dry-run"]);
const BUCKET = "acculynx-job-documents";
const TEXT_CAP = 200_000;
const supabaseUrl = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const projectRef = (supabaseUrl.match(/^https:\/\/([^.]+)\./) || [])[1] || "(unknown)";
const log = (...m) => console.log(new Date().toISOString(), ...m);

const MIME = {
  ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".heic": "image/heic", ".webp": "image/webp", ".mp4": "video/mp4", ".mov": "video/quicktime",
  ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xml": "application/xml", ".zip": "application/zip",
};
const STATUS = { verified: "verified", verification_failed: "failed", download_blocked: "not_downloaded", blocked: "not_downloaded" };

// ── Supabase (PostgREST + Storage, service role) ──────────────────────────────────
function sbHeaders(extra = {}) {
  if (!supabaseUrl || !serviceKey) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, ...extra };
}

async function sb(path, { method = "GET", body, headers = {} } = {}) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${supabaseUrl}${path}`, {
      method,
      headers: sbHeaders({ "Content-Type": "application/json", ...headers }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) return text ? JSON.parse(text) : null;
    if (res.status >= 500 && attempt < 4) { await sleep(1500 * attempt); continue; }
    throw new Error(`Supabase ${method} ${path.split("?")[0]} → ${res.status} ${text.slice(0, 300)}`);
  }
}

async function upsert(table, rows, onConflict) {
  if (dryRun || rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 200) {
    await sb(`/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: "POST",
      body: rows.slice(i, i + 200),
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    });
  }
}

// Existing rows for these jobs, paged (PostgREST caps a response at 1,000 rows).
async function existingRows(jobIds) {
  const out = new Map();
  for (let i = 0; i < jobIds.length; i += 40) {
    const list = jobIds.slice(i, i + 40).map((id) => `"${id}"`).join(",");
    for (let offset = 0; ; offset += 1000) {
      const rows = await sb(`/rest/v1/acculynx_job_documents?select=acculynx_job_id,acculynx_document_key,sha256,storage_status,storage_path,stored_at` +
        `&acculynx_job_id=in.(${list})&order=id&limit=1000&offset=${offset}`);
      for (const r of rows) out.set(`${r.acculynx_job_id}|${r.acculynx_document_key}`, r);
      if (rows.length < 1000) break;
    }
  }
  return out;
}

// Content-addressed: an existing object holds the same bytes, so "already exists" is success.
// Gateway timeouts (504) happen under load; retry server errors with backoff.
async function putObject(path, filePath, type) {
  const body = await readFile(filePath);
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: sbHeaders({ "Content-Type": type, "x-upsert": "false", "Cache-Control": "max-age=31536000" }),
      body,
      signal: AbortSignal.timeout(300_000),
    });
    if (res.ok) return;
    const text = await res.text();
    if (res.status === 409 || /already exists|Duplicate/i.test(text)) return;
    if (res.status >= 500 && attempt < 4) { await sleep(2000 * attempt); continue; }
    throw new Error(`upload → ${res.status} ${text.slice(0, 200)}`);
  }
}

// ── Local files ────────────────────────────────────────────────────────────────────
function sha256File(path) {
  return new Promise((ok, fail) => {
    const h = createHash("sha256");
    createReadStream(path).on("data", (c) => h.update(c)).on("error", fail).on("end", () => ok(h.digest("hex")));
  });
}

function* walk(dir, skip) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!skip.has(p)) yield* walk(p, skip); }
    else if (e.isFile() && !e.name.endsWith(".zip") && !e.name.endsWith(".crdownload")) yield p;
  }
}

// Hash only files whose size matches a document we need; returns sha → path.
async function indexFiles(root, skipDirs, wanted) {
  const sizes = new Set([...wanted.values()]);
  const bySha = new Map();
  let scanned = 0, hashed = 0;
  for (const p of walk(root, skipDirs)) {
    scanned++;
    const size = statSync(p).size;
    if (!sizes.has(size)) continue;
    hashed++;
    const sha = await sha256File(p);
    if (wanted.has(sha) && !bySha.has(sha)) bySha.set(sha, p);
  }
  return { bySha, scanned, hashed };
}

function documentKey(doc) {
  const m = String(doc.source_url || "").match(/^https:\/\/my\.acculynx\.com\/store\/companies\/[^/]+\/(.+)$/);
  return m ? m[1] : `name:${doc.display_name}`;
}

function extensionFor(doc, filePath) {
  for (const n of [filePath && basename(filePath), doc.native_save_name, doc.source_basename, doc.display_name]) {
    const e = n ? extname(n).toLowerCase() : "";
    if (MIME[e]) return e;
  }
  const t = String(doc.ui_type || "").toLowerCase();
  return MIME[`.${t}`] ? `.${t}` : "";
}

async function pdfText(path) {
  try {
    const [{ stdout: text }, { stdout: info }] = await Promise.all([
      run("pdftotext", ["-q", "-enc", "UTF-8", path, "-"], { maxBuffer: 64 * 1024 * 1024 }),
      run("pdfinfo", [path], { maxBuffer: 1024 * 1024 }),
    ]);
    // Postgres text cannot hold NUL; keep the layer bounded.
    const clean = text.replace(/\u0000/g, "").trim();
    const pages = Number((info.match(/^Pages:\s+(\d+)/m) || [])[1]) || null;
    return { text: clean.slice(0, TEXT_CAP) || null, chars: clean.length, pages };
  } catch {
    return { text: null, chars: 0, pages: null };
  }
}

async function haveTool(name) {
  try { await run(name, ["-v"]); return true; } catch (e) { return e.code !== "ENOENT"; }
}

// ── Main ───────────────────────────────────────────────────────────────────────────
async function main() {
  if (!args.root) throw new Error("--root <folder holding the collection and its files> is required");
  const root = resolve(args.root);
  const collection = args.collection || "acculynx-collection-2026-10-01";
  const collDir = join(root, collection);
  if (!existsSync(collDir)) throw new Error(`collection folder not found: ${collDir}`);
  if (args["expect-ref"] && args["expect-ref"] !== projectRef) throw new Error(`target project ${projectRef} ≠ --expect-ref ${args["expect-ref"]}`);
  const withText = !args["no-text"] && (await haveTool("pdftotext")) && (await haveTool("pdfinfo"));
  const concurrency = Math.max(1, Number(args.concurrency || 4));
  const runId = `${collection}:${new Date().toISOString()}`;
  log(`target project ${projectRef} · collection ${collection} · ${dryRun ? "DRY RUN" : "writing"} · text ${withText ? "on" : "off"}`);

  const summaryPath = join(collDir, "first-pass-summary.json");
  const collectedAt = existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, "utf8")).finalized_at || null : null;

  let inventories = readdirSync(collDir).filter((f) => f.endsWith("-inventory.json"))
    .map((f) => JSON.parse(readFileSync(join(collDir, f), "utf8")));
  if (args.job) inventories = inventories.filter((j) => j.job_id === args.job);
  if (args["limit-jobs"]) inventories = inventories.slice(0, Number(args["limit-jobs"]));
  const docs = inventories.flatMap((j) => j.documents.map((d) => ({ job: j, doc: d })));
  log(`${inventories.length} jobs · ${docs.length} documents listed`);

  const wanted = new Map(docs.filter((x) => x.doc.sha256).map((x) => [x.doc.sha256, x.doc.bytes]));
  const { bySha, scanned, hashed } = await indexFiles(root, new Set([collDir]), wanted);
  log(`files: ${scanned} scanned, ${hashed} hashed, ${bySha.size} of ${wanted.size} wanted hashes found`);

  if (!dryRun) {
    await sb(`/rest/v1/acculynx_document_load_runs`, {
      method: "POST", body: [{ run_id: runId, collection_id: collection }], headers: { Prefer: "return=minimal" },
    });
  }
  const existing = dryRun ? new Map() : await existingRows(inventories.map((j) => j.job_id));

  const stats = { documents: docs.length, stored: 0, uploaded: 0, already_stored: 0, missing_file: 0, not_downloaded: 0, upload_failed: 0, text_layers: 0 };
  const uploads = new Map(); // sha → Promise (one upload per unique file per run)
  const rows = new Array(docs.length);

  let next = 0;
  async function worker() {
    while (next < docs.length) {
      const i = next++;
      const { job, doc } = docs[i];
      const key = documentKey(doc);
      const prior = existing.get(`${job.job_id}|${key}`);
      const sha = doc.sha256 || null;
      const filePath = sha ? bySha.get(sha) : null;
      const ext = extensionFor(doc, filePath);
      const type = MIME[ext] || "application/octet-stream";
      const path = sha ? `sha256/${sha.slice(0, 2)}/${sha}${ext}` : null;
      const raw = { ...doc };
      delete raw.saved_path;

      let storage_status, stored_at = null, store_error = null;
      if (!sha) { storage_status = "not_downloaded"; stats.not_downloaded++; }
      else if (prior?.storage_status === "stored" && prior.storage_path === path) {
        storage_status = "stored"; stored_at = prior.stored_at; stats.already_stored++;
      } else if (!filePath) { storage_status = "missing_file"; stats.missing_file++; }
      else {
        try {
          if (!dryRun) {
            if (!uploads.has(sha)) uploads.set(sha, putObject(path, filePath, type).then(() => { stats.uploaded++; }));
            await uploads.get(sha);
          }
          storage_status = "stored"; stored_at = new Date().toISOString();
        } catch (e) {
          storage_status = "failed"; store_error = String(e.message || e).slice(0, 500); stats.upload_failed++;
        }
      }
      if (storage_status === "stored") stats.stored++;

      const row = {
        acculynx_job_id: job.job_id,
        acculynx_document_key: key,
        display_name: doc.display_name ?? null,
        source_folder: doc.source_folder ?? null,
        source_url: doc.source_url ?? null,
        source_ui_type: doc.ui_type ?? null,
        source_ui_size: doc.ui_size ?? null,
        sha256: sha,
        bytes: doc.bytes ?? null,
        mime_type: sha ? type : null,
        check_status: STATUS[doc.status] || "failed",
        check_issues: [...(doc.verification_issues || []), ...(doc.download_blocker ? [String(doc.download_blocker)] : [])],
        storage_status,
        storage_path: storage_status === "stored" ? path : null,
        stored_at,
        store_error,
        collection_id: collection,
        collected_at: collectedAt,
        load_run_id: runId,
        loaded_at: new Date().toISOString(),
        raw,
      };
      if (withText) {
        const t = filePath && type === "application/pdf" ? await pdfText(filePath) : { text: null, chars: 0, pages: null };
        if (t.text) stats.text_layers++;
        Object.assign(row, { text_content: t.text, text_chars: t.chars || null, page_count: t.pages, text_extracted_at: filePath ? new Date().toISOString() : null });
      }
      rows[i] = row;
      if ((i + 1) % 100 === 0) log(`${i + 1}/${docs.length} documents`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  await upsert("acculynx_job_documents", rows, "acculynx_job_id,acculynx_document_key");

  const jobRows = inventories.map((j) => ({
    collection_id: collection,
    acculynx_job_id: j.job_id,
    outcome: j.documents.length === 0 ? "inspected_empty" : j.documents.every((d) => d.status === "verified") ? "complete" : "exception",
    documents_listed: j.documents.length,
    folders_checked: Array.isArray(j.folders_checked) ? j.folders_checked.length : Number(j.folders_checked) || null,
    coverage_method: typeof j.coverage_method === "string" ? j.coverage_method : JSON.stringify(j.coverage_method ?? null),
    priority: j.priority ?? null,
    load_run_id: runId,
    loaded_at: new Date().toISOString(),
  }));
  await upsert("acculynx_document_collection_jobs", jobRows, "collection_id,acculynx_job_id");

  const typeMap = dryRun ? null : await sb(`/rest/v1/rpc/apply_job_document_type_map`, { method: "POST", body: {} });
  const links = dryRun ? null : await sb(`/rest/v1/rpc/link_acculynx_job_documents`, { method: "POST", body: {} });
  Object.assign(stats, { unique_files: wanted.size, files_found: bySha.size, type_map: typeMap, links });
  if (!dryRun) {
    await sb(`/rest/v1/acculynx_document_load_runs?run_id=eq.${encodeURIComponent(runId)}`, {
      method: "PATCH", body: { finished_at: new Date().toISOString(), stats }, headers: { Prefer: "return=minimal" },
    });
  }
  log("done", JSON.stringify(stats));
}

// ── Helpers ────────────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) { out[key] = next; i++; } else out[key] = true;
  }
  return out;
}

function parseDotenv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const idx = t.indexOf("=");
    if (idx === -1) continue;
    const key = t.slice(0, idx).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = t.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

main().catch((e) => { console.error(e.stack || e.message || e); process.exit(1); });
