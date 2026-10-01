#!/usr/bin/env node
// CompanyCam → Open Brain mirror (docs/120, migration 318).
//
//   node integrations/bridges/companycam/sync.mjs nightly            # incremental metadata + link + priority
//   node integrations/bridges/companycam/sync.mjs full               # full sweep (also detects removals)
//   node integrations/bridges/companycam/sync.mjs copy [--max-priority 1] [--limit 500] [--concurrency 10]
//                                                 [--originals | --then-originals]
//   node integrations/bridges/companycam/sync.mjs status
//
// Options: --dry-run (fetch + map, write nothing), --pages N (cap pages per stream; for tests),
//          --env-file PATH (dotenv to merge under process.env; defaults to <repo>/.env).
//
// Env: COMPANYCAM_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Reads CompanyCam only (read-only-client.mjs is GET-only). Writes the mirror tables and the
// private `companycam-photos` storage bucket. Never deletes: rows missing from a full sweep get
// removed_at; storage objects are never removed by this script.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createCompanyCamClient } from "./read-only-client.mjs";

const ROOT = resolve(new URL("../../..", import.meta.url).pathname);
const args = parseArgs(process.argv.slice(2));
const mode = args._[0] || "nightly";
// An explicit --env-file wins over the shell: login shells on this fleet export other projects'
// SUPABASE_URL values, and a mirror written to the wrong project is silent data loss.
const fileEnv = parseDotenv(args["env-file"] || resolve(ROOT, ".env"));
const env = args["env-file"] ? { ...process.env, ...fileEnv } : { ...fileEnv, ...process.env };
const dryRun = Boolean(args["dry-run"]);
const pageCap = args.pages ? Number(args.pages) : Infinity;
const BUCKET = "companycam-photos";
const PHOTO_INCLUDE = "tags,annotations,comments";

const supabaseUrl = String(env.SUPABASE_URL || env.PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const log = (...m) => console.log(new Date().toISOString(), ...m);

const cc = mode === "status" || mode === "copy" ? null : createCompanyCamClient({ token: env.COMPANYCAM_ACCESS_TOKEN, log });

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
    if (res.ok) {
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    }
    const text = await res.text();
    if (res.status >= 500 && attempt < 4) { await sleep(1500 * attempt); continue; }
    throw new Error(`Supabase ${method} ${path.split("?")[0]} → ${res.status} ${text.slice(0, 300)}`);
  }
}

// Every row in one call carries the same keys (PostgREST unions keys across a batch and nulls
// the missing ones — playbook 2), and storage/link columns are never in these payloads, so an
// upsert can't wipe copy state or human links.
async function upsert(table, rows) {
  if (dryRun || rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 500) {
    await sb(`/rest/v1/${table}?on_conflict=id`, {
      method: "POST",
      body: rows.slice(i, i + 500),
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    });
  }
}

const rpc = (name, body = {}) => (dryRun ? null : sb(`/rest/v1/rpc/${name}`, { method: "POST", body }));

async function getState(stream) {
  const rows = await sb(`/rest/v1/companycam_sync_state?stream=eq.${stream}&select=*`);
  return rows?.[0] || null;
}
async function setState(stream, patch) {
  if (dryRun) return;
  await sb(`/rest/v1/companycam_sync_state?on_conflict=stream`, {
    method: "POST",
    body: [{ stream, last_run_at: new Date().toISOString(), ...patch }],
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  });
}

// ── Mapping ────────────────────────────────────────────────────────────────────────
const ts = (v) => (v ? new Date(typeof v === "number" ? v * 1000 : v).toISOString() : null);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function mapProject(p, runId) {
  const a = p.address || {};
  const now = new Date().toISOString();
  return {
    id: String(p.id),
    company_id: p.company_id ?? null,
    name: p.name ?? null,
    status: p.status ?? null,
    archived: Boolean(p.archived),
    is_public: p.public ?? null,
    street_address_1: a.street_address_1 || null,
    street_address_2: a.street_address_2 || null,
    city: a.city || null,
    state: a.state || null,
    postal_code: a.postal_code || null,
    country: a.country || null,
    latitude: num(p.coordinates?.lat),
    longitude: num(p.coordinates?.lon),
    project_url: p.project_url ?? null,
    public_url: p.public_url ?? null,
    embedded_project_url: p.embedded_project_url ?? null,
    photo_count: p.photo_count ?? null,
    document_count: p.document_count ?? null,
    creator_name: p.creator_name ?? null,
    cc_created_at: ts(p.created_at),
    cc_updated_at: ts(p.updated_at),
    raw: p,
    synced_at: now,
    last_seen_by_api: now,
    seen_run_id: runId,
    removed_at: null,
  };
}

function mapPhoto(p, runId) {
  const uri = (type) => p.uris?.find((u) => u.type === type)?.url ?? null;
  const ann = p.annotations;
  const hasAnn = Boolean(ann && ((ann.text?.length || 0) + (ann.stickers?.length || 0) + (ann.shapes?.length || 0)));
  return {
    id: String(p.id),
    project_id: String(p.project_id),
    company_id: p.company_id ?? null,
    creator_id: p.creator_id ?? null,
    creator_name: p.creator_name ?? null,
    captured_at: ts(p.captured_at),
    cc_created_at: ts(p.created_at),
    cc_updated_at: ts(p.updated_at),
    latitude: num(p.coordinates?.lat),
    longitude: num(p.coordinates?.lon),
    status: p.status ?? null,
    processing_status: p.processing_status ?? null,
    internal: p.internal ?? null,
    origin: p.origin ?? null,
    description: p.description?.plain_text_content ?? null,
    tags: (p.tags || []).map((t) => t.display_value).filter(Boolean),
    has_annotations: hasAnn,
    thumbnail_url: uri("thumbnail"),
    web_url: uri("web"),
    original_url: uri("original"),
    raw: p,
    synced_at: new Date().toISOString(),
    seen_run_id: runId,
    removed_at: null,
  };
}

// ── Streams ────────────────────────────────────────────────────────────────────────
// Projects come back newest-updated first. Incremental stops one page after passing the
// watermark (minus an hour of overlap); full walks active and archived lists completely.
async function syncProjects({ full, runId }) {
  const state = await getState("projects");
  const since = !full && state?.watermark ? new Date(state.watermark).getTime() - 3600_000 : null;
  let seen = 0, maxUpdated = state?.watermark ? new Date(state.watermark).getTime() : 0;
  const touched = [];
  for (const archived of full ? ["false", "true"] : ["false"]) {
    let pages = 0;
    for await (const page of cc.paginate("/projects", { limit: 100, archived })) {
      const rows = page.map((p) => mapProject(p, runId));
      await upsert("companycam_projects", rows);
      seen += rows.length;
      for (const r of rows) {
        const u = new Date(r.cc_updated_at || 0).getTime();
        if (u > maxUpdated) maxUpdated = u;
        if (since === null || u >= since) touched.push(r.id);
      }
      if (++pages >= pageCap) break;
      if (since !== null && rows.every((r) => new Date(r.cc_updated_at || 0).getTime() < since)) break;
    }
  }
  let removed = 0;
  if (full && pageCap === Infinity && !dryRun) {
    removed = (await rpc("mark_companycam_projects_removed", { p_run_id: runId })) ?? 0;
  }
  await setState("projects", { watermark: maxUpdated ? new Date(maxUpdated).toISOString() : null,
    last_run_stats: { mode: full ? "full" : "nightly", seen, touched: touched.length, removed, run_id: runId } });
  log(`projects: ${seen} upserted, ${touched.length} changed since watermark, ${removed} marked removed`);
  return touched;
}

// Photos come back newest-created first. Incremental stops once a page is entirely older than
// the watermark; then re-reads every photo of projects that changed (tags, reassignment,
// descriptions don't move created_at). Full walks everything and marks absentees removed.
async function syncPhotos({ full, runId, changedProjects = [] }) {
  const state = await getState("photos");
  const since = !full && state?.watermark ? new Date(state.watermark).getTime() - 6 * 3600_000 : null;
  let seen = 0, pages = 0, maxCreated = state?.watermark ? new Date(state.watermark).getTime() : 0;
  for await (const page of cc.paginate("/photos", { limit: 100, include: PHOTO_INCLUDE })) {
    const rows = page.map((p) => mapPhoto(p, runId));
    await upsert("companycam_photos", rows);
    seen += rows.length;
    for (const r of rows) maxCreated = Math.max(maxCreated, new Date(r.cc_created_at || 0).getTime());
    if (++pages % 50 === 0) log(`photos: ${seen} so far (${cc.calls} API calls)`);
    if (pages >= pageCap) break;
    if (since !== null && rows.every((r) => new Date(r.cc_created_at || 0).getTime() < since)) break;
  }
  // /photos?project_ids[] (not /projects/{id}/photos, which rejects `include`). Skipped on the
  // very first run, when every project counts as changed and the walk above already read all.
  let reread = 0;
  const reReadable = !full && state?.watermark ? changedProjects.slice(0, 400) : [];
  for (let i = 0; i < reReadable.length; i += 20) {
    for await (const page of cc.paginate("/photos", { limit: 100, include: PHOTO_INCLUDE, project_ids: reReadable.slice(i, i + 20) })) {
      const rows = page.map((p) => mapPhoto(p, runId));
      await upsert("companycam_photos", rows);
      reread += rows.length;
    }
  }
  let removed = 0;
  if (full && pageCap === Infinity && !dryRun) {
    // Server-side so the 311k-row comparison never crosses the wire.
    removed = (await rpc("mark_companycam_photos_removed", { p_run_id: runId })) ?? 0;
  }
  await setState("photos", { watermark: maxCreated ? new Date(maxCreated).toISOString() : null,
    last_run_stats: { mode: full ? "full" : "nightly", seen, reread, removed, run_id: runId, api_calls: cc.calls } });
  log(`photos: ${seen} upserted, ${reread} re-read from ${reReadable.length} changed projects, ${removed} marked removed`);
}

async function linkAndPrioritise() {
  const link = await rpc("link_companycam_projects");
  log("link:", JSON.stringify(link));
  const prio = await rpc("refresh_companycam_copy_priority");
  log("priority:", JSON.stringify(prio));
}

// ── Copy worker ───────────────────────────────────────────────────────────────────
// Two passes, both in priority order (open jobs first):
//   display pass (default)  thumbnail + web (~50 KB/photo) → storage_status 'copied'; what apps show.
//   originals pass          `--originals`, or automatically once the display queue is empty when
//                           `--then-originals` is set: adds the ~420 KB original to copied rows.
// Objects live at <project_id>/<photo_id>/<variant>.jpg. Annotated variants are kept only when
// the photo has annotations (otherwise CompanyCam serves identical bytes).
async function copyWorker() {
  const maxPriority = Number(args["max-priority"] ?? 9);
  const limit = Number(args.limit ?? 500);
  const concurrency = Math.max(1, Math.min(48, Number(args.concurrency ?? 16)));
  const released = await rpc("release_stale_companycam_copies");
  if (released) log(`copy: returned ${released} stale claims to the queue`);
  const stats = { display: 0, originals: 0, failed: 0, bytes: 0 };
  const passes = args.originals ? ["originals"] : args["then-originals"] ? ["display", "originals"] : ["display"];
  for (const pass of passes) {
    const claimFn = pass === "display" ? "claim_companycam_copy_batch" : "claim_companycam_original_batch";
    const variants = pass === "display" ? String(args.variants || "thumbnail,web").split(",") : ["original"];
    while (stats.display + stats.originals + stats.failed < limit) {
      const room = limit - stats.display - stats.originals - stats.failed;
      const batch = await sb(`/rest/v1/rpc/${claimFn}`, { method: "POST", body: { p_limit: Math.min(Math.max(50, concurrency * 6), room), p_max_priority: maxPriority } });
      if (!batch?.length) break;
      const queue = [...batch];
      await Promise.all(Array.from({ length: concurrency }, async () => {
        for (let photo = queue.shift(); photo; photo = queue.shift()) {
          try {
            const r = await copyOne(photo, variants, pass === "originals");
            stats.bytes += r.bytes; stats[pass]++;
          } catch (err) {
            stats.failed++;
            const body = pass === "display"
              ? { storage_status: "failed", copy_error: String(err.message).slice(0, 500) }
              : { copy_error: `original: ${String(err.message).slice(0, 480)}` }; // display copy stays good
            await sb(`/rest/v1/companycam_photos?id=eq.${photo.id}`, { method: "PATCH", body, headers: { Prefer: "return=minimal" } });
          }
        }
      }));
      log(`copy[${pass}]: ${stats.display} display, ${stats.originals} originals, ${stats.failed} failed, ${(stats.bytes / 1048576).toFixed(1)} MB`);
    }
  }
  await setState("copy", { last_run_stats: { ...stats, max_priority: maxPriority, passes } });
  log(`copy finished: ${JSON.stringify(stats)}`);
}

async function copyOne(photo, variants, mergeIntoExisting = false) {
  const raw = photo.raw || {};
  const want = [...variants];
  if (photo.has_annotations) want.push(...variants.map((v) => `${v}_annotation`));
  const url = (type) => raw.uris?.find((u) => u.type === type)?.url;
  // An unannotated photo's *_annotation URL is the base image's URL; don't store it twice.
  const jobs = want.map((variant) => ({ variant, src: url(variant) }))
    .filter(({ variant, src }) => src && !(variant.endsWith("_annotation") && url(variant.replace(/_annotation$/, "")) === src));
  // Variants of one photo move in parallel; photos are parallel across workers.
  const results = await Promise.all(jobs.map(async ({ variant, src }) => {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`fetch ${variant} → ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get("content-type") || "image/jpeg";
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    const path = `${photo.project_id}/${photo.id}/${variant}.${ext}`;
    const up = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: sbHeaders({ "Content-Type": type, "x-upsert": "true", "Cache-Control": "max-age=31536000" }),
      body: buf,
    });
    if (!up.ok) throw new Error(`upload ${variant} → ${up.status} ${(await up.text()).slice(0, 200)}`);
    return { variant, path, bytes: buf.length };
  }));
  const fresh = Object.fromEntries(results.map((r) => [r.variant, r.path]));
  const added = results.reduce((n, r) => n + r.bytes, 0);
  if (mergeIntoExisting) {
    if (!fresh.original) throw new Error("no original variant available");
    await sb(`/rest/v1/companycam_photos?id=eq.${photo.id}`, {
      method: "PATCH",
      body: { storage_paths: { ...(photo.storage_paths || {}), ...fresh }, storage_bytes: (photo.storage_bytes || 0) + added, copy_error: null },
      headers: { Prefer: "return=minimal" },
    });
  } else {
    if (!fresh.thumbnail && !fresh.web) throw new Error("no thumbnail/web variant available");
    await sb(`/rest/v1/companycam_photos?id=eq.${photo.id}`, {
      method: "PATCH",
      body: { storage_status: "copied", storage_paths: fresh, storage_bytes: added, copied_at: new Date().toISOString(), copy_error: null },
      headers: { Prefer: "return=minimal" },
    });
  }
  return { bytes: added };
}

async function status() {
  const progress = await sb(`/rest/v1/v_companycam_clone_progress?select=*&order=storage_priority,storage_status`);
  const state = await sb(`/rest/v1/companycam_sync_state?select=stream,watermark,last_run_at,last_run_stats`);
  console.log(JSON.stringify({ progress, state }, null, 2));
}

// ── Main ───────────────────────────────────────────────────────────────────────────
const runId = randomUUID();
try {
  if (mode === "nightly" || mode === "full") {
    const full = mode === "full";
    log(`companycam ${mode} start${dryRun ? " (dry run)" : ""} run=${runId} supabase=${new URL(supabaseUrl).host.split(".")[0]}`);
    const changed = await syncProjects({ full, runId });
    await syncPhotos({ full, runId, changedProjects: changed });
    await linkAndPrioritise();
    log(`companycam ${mode} done — ${cc.calls} API calls`);
  } else if (mode === "copy") {
    log(`companycam copy start supabase=${new URL(supabaseUrl).host.split(".")[0]}`);
    await copyWorker();
  } else if (mode === "status") {
    await status();
  } else {
    throw new Error(`unknown mode: ${mode}`);
  }
} catch (err) {
  console.error(err);
  process.exit(1);
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
