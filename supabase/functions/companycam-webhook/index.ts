// companycam-webhook — receiver for CompanyCam webhook deliveries (docs/120 §5, migration 318c).
//
// URL: https://<project>.supabase.co/functions/v1/companycam-webhook   (verify_jwt = false:
// CompanyCam cannot send a Supabase JWT; authenticity is the HMAC below).
//
// Contract:
//   - POST only. Every verified delivery is logged to companycam_webhook_events; unsigned ones
//     are refused before any database write (function log only).
//   - Authenticity: X-CompanyCam-Signature = Base64(HMAC-SHA1(webhook token, raw body)),
//     compared in constant time over the RAW body. Unverified → 401, nothing else happens.
//   - The payload is untrusted data. It only tells us WHICH resource changed; the receiver
//     re-reads that resource from the CompanyCam API (GET only) and upserts the canonical
//     object through the shared mapping (./mapping.mjs), the same as the nightly sync.
//   - Processing failures still return 200 (recorded on the event row): CompanyCam disables a
//     webhook after 25 errors, and the nightly sync is the backstop for anything missed.
//   - New photos get their display sizes (thumbnail + web) copied into the private bucket
//     straight away; originals and videos are left to the copy worker.
//
// Secrets come from Supabase Vault via companycam_secret(): companycam_webhook_token (plus
// companycam_webhook_token_next during a rotation) and companycam_access_token. Never logged, never in this file (hard rule 2).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { mapPhoto, mapProject, mapVideo } from "./mapping.mjs";

const API = "https://app.companycam.com/public_api/v1";
const BUCKET = "companycam-photos";
const PHOTO_INCLUDE = "tags,annotations,comments";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

// Signing tokens accepted: the current one and, during a rotation, the next one
// (register-webhook.mjs --rotate stores `_next` before CompanyCam switches, then promotes it).
let secretCache: { signingTokens: string[]; apiToken: string; at: number } | null = null;
async function secrets(force = false) {
  // A forced refresh (after a signature miss) is allowed at most every 30 s, so forged
  // requests cannot turn into one Vault read each.
  const age = secretCache ? Date.now() - secretCache.at : Infinity;
  if (secretCache && (force ? age < 30_000 : age < 300_000)) return secretCache;
  const [w, n, a] = await Promise.all([
    sb.rpc("companycam_secret", { p_name: "companycam_webhook_token" }),
    sb.rpc("companycam_secret", { p_name: "companycam_webhook_token_next" }),
    sb.rpc("companycam_secret", { p_name: "companycam_access_token" }),
  ]);
  const signingTokens = [w.data, n.data].filter((t): t is string => typeof t === "string" && t.length > 0);
  secretCache = { signingTokens: [...new Set(signingTokens)], apiToken: (a.data as string) ?? "", at: Date.now() };
  return secretCache;
}

async function signatureMatches(tokens: string[], raw: string, signature: string) {
  if (!signature) return false;
  for (const t of tokens) if (constantTimeEqual(await hmacSha1Base64(t, raw), signature)) return true;
  return false;
}

// supabase-js returns { error } instead of throwing; make every write fail loudly.
async function must<T extends { error: { message: string } | null }>(label: string, op: PromiseLike<T>) {
  const r = await op;
  if (r.error) throw new Error(`${label}: ${r.error.message}`);
  return r;
}

async function hmacSha1Base64(key: string, body: string) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(body)));
  return btoa(String.fromCharCode(...sig));
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function ccGet(path: string, apiToken: string) {
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`CompanyCam GET ${path.split("?")[0]} → ${res.status}`);
  return (await res.json()).data;
}

async function upsert(table: string, row: Record<string, unknown>) {
  const { error } = await sb.from(table).upsert(row, { onConflict: "id" });
  if (error) throw new Error(`${table} upsert: ${error.message}`);
}

// Display sizes only (~50 KB): the photo is viewable from the brain within seconds.
async function copyDisplaySizes(photo: any) {
  const paths: Record<string, string> = {};
  let bytes = 0;
  for (const variant of ["thumbnail", "web"]) {
    const src = photo.uris?.find((u: any) => u.type === variant)?.url;
    if (!src) continue;
    const res = await fetch(src);
    if (!res.ok) throw new Error(`fetch ${variant} → ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const type = res.headers.get("content-type") || "image/jpeg";
    const path = `${photo.project_id}/${photo.id}/${variant}.jpg`;
    const { error } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: type, upsert: true, cacheControl: "31536000" });
    if (error) throw new Error(`upload ${variant}: ${error.message}`);
    paths[variant] = path;
    bytes += buf.length;
  }
  if (!paths.thumbnail && !paths.web) return false;
  const { error } = await sb.from("companycam_photos").update({
    storage_status: "copied", storage_paths: paths, storage_bytes: bytes, copied_at: new Date().toISOString(), copy_error: null,
  }).eq("id", String(photo.id)).neq("storage_status", "copied");
  if (error) throw new Error(`photo copy state: ${error.message}`);
  return true;
}

// CompanyCam ids are numeric strings. Anything else never reaches a URL path (a signed payload
// is still data, and `../` in an id would otherwise resolve to another API route).
const CC_ID = /^\d{1,20}$/;
const safeId = (v: unknown) => (v != null && CC_ID.test(String(v)) ? String(v) : null);

async function processEvent(eventType: string, payload: any, apiToken: string): Promise<string> {
  const [resource, action] = eventType.split(".");
  if (resource === "photo" || (resource === "comment" && payload?.commentable_type === "Photo")) {
    const id = safeId(resource === "photo" ? payload?.id : payload?.commentable_id);
    if (!id) return "no valid photo id";
    const photo = await ccGet(`/photos/${id}?include=${PHOTO_INCLUDE}`, apiToken);
    if (!photo) {
      await must("photo removed_at", sb.from("companycam_photos").update({ removed_at: new Date().toISOString() }).eq("id", String(id)));
      return "photo gone (404) → removed_at";
    }
    await upsert("companycam_photos", mapPhoto(photo));
    await must("photo priority", sb.rpc("refresh_companycam_project_priority", { p_project_id: String(photo.project_id) }));
    const copied = action === "created" || action === "updated" ? await copyDisplaySizes(photo).catch((e) => `copy failed: ${e.message}`) : false;
    return `photo ${action} upserted${copied === true ? " + display copy" : typeof copied === "string" ? `; ${copied}` : ""}`;
  }
  if (resource === "project") {
    const id = safeId(payload?.id);
    if (!id) return "no valid project id";
    if (action === "deleted") {
      await must("project removed_at", sb.from("companycam_projects").update({ removed_at: new Date().toISOString() }).eq("id", String(id)));
      return "project deleted → removed_at";
    }
    const project = await ccGet(`/projects/${id}`, apiToken);
    if (!project) {
      await must("project removed_at", sb.from("companycam_projects").update({ removed_at: new Date().toISOString() }).eq("id", String(id)));
      return "project gone (404) → removed_at";
    }
    await upsert("companycam_projects", mapProject(project));
    if (action === "created" || action === "updated" || action === "merged") {
      await must("link", sb.rpc("link_companycam_projects"));
      await must("project priority", sb.rpc("refresh_companycam_project_priority", { p_project_id: String(id) }));
    }
    return `project ${action} upserted`;
  }
  if (resource === "video") {
    const id = safeId(payload?.id);
    if (!id) return "no valid video id";
    const video = await ccGet(`/videos/${id}`, apiToken);
    if (!video) {
      await must("video removed_at", sb.from("companycam_videos").update({ removed_at: new Date().toISOString() }).eq("id", String(id)));
      return "video gone (404) → removed_at";
    }
    await upsert("companycam_videos", mapVideo(video));
    return `video ${action} upserted (copy worker fetches bytes)`;
  }
  return "logged only";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const raw = await req.text();
  const signature = req.headers.get("x-companycam-signature") ?? "";
  if (raw.length > 1_000_000) return new Response(JSON.stringify({ error: "too_large" }), { status: 413 });
  let { signingTokens, apiToken } = await secrets();
  let ok = await signatureMatches(signingTokens, raw, signature);
  if (!ok && signature) {
    // A rotation may have landed after our cache filled: re-read Vault once before refusing.
    ({ signingTokens, apiToken } = await secrets(true));
    ok = await signatureMatches(signingTokens, raw, signature);
  }

  // Verify first: an unsigned request writes nothing to the database (function log only), so an
  // anonymous caller cannot add rows to the audit table.
  if (!ok) {
    console.warn(`[companycam-webhook] rejected unsigned/invalid delivery (${raw.length} bytes)`);
    return new Response(JSON.stringify({ error: "invalid_signature" }), { status: 401 });
  }

  let body: any = null;
  try { body = JSON.parse(raw); } catch { /* signed but unparseable: logged below */ }
  const eventType = typeof body?.event_type === "string" ? body.event_type.slice(0, 80) : null;
  const payload = body?.payload ?? null;
  const clip = (v: unknown, n: number) => (v == null ? null : String(v).slice(0, n));
  const { data: ev } = await sb.from("companycam_webhook_events").insert({
    webhook_id: clip(body?.webhook_id, 20),
    event_type: eventType,
    resource_type: clip(eventType?.split(".")[0], 20),
    resource_id: clip(payload?.id, 20),
    signature_ok: true,
    payload: body,
  }).select("id").single();

  if (!eventType || !apiToken) return new Response(JSON.stringify({ ok: true, note: "nothing to do" }), { status: 200 });

  let result = "", error: string | null = null;
  try { result = await processEvent(eventType, payload, apiToken); }
  catch (e) { error = (e as Error).message.slice(0, 500); }
  if (ev?.id) {
    await sb.from("companycam_webhook_events").update({ processed_at: new Date().toISOString(), process_result: result || null, process_error: error })
      .eq("id", ev.id);
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
