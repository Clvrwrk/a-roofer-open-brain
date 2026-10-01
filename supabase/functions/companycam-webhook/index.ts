// companycam-webhook — receiver for CompanyCam webhook deliveries (docs/120 §5, migration 318c).
//
// URL: https://<project>.supabase.co/functions/v1/companycam-webhook   (verify_jwt = false:
// CompanyCam cannot send a Supabase JWT; authenticity is the HMAC below).
//
// Contract:
//   - POST only. Every delivery is logged to companycam_webhook_events, verified or not.
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
// Secrets come from Supabase Vault via companycam_secret(): companycam_webhook_token and
// companycam_access_token. Never logged, never in this file (hard rule 2).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { mapPhoto, mapProject, mapVideo } from "./mapping.mjs";

const API = "https://app.companycam.com/public_api/v1";
const BUCKET = "companycam-photos";
const PHOTO_INCLUDE = "tags,annotations,comments";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

let secretCache: { webhookToken: string; apiToken: string; at: number } | null = null;
async function secrets() {
  if (secretCache && Date.now() - secretCache.at < 300_000) return secretCache;
  const [w, a] = await Promise.all([
    sb.rpc("companycam_secret", { p_name: "companycam_webhook_token" }),
    sb.rpc("companycam_secret", { p_name: "companycam_access_token" }),
  ]);
  secretCache = { webhookToken: (w.data as string) ?? "", apiToken: (a.data as string) ?? "", at: Date.now() };
  return secretCache;
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

async function processEvent(eventType: string, payload: any, apiToken: string): Promise<string> {
  const [resource, action] = eventType.split(".");
  if (resource === "photo" || (resource === "comment" && payload?.commentable_type === "Photo")) {
    const id = resource === "photo" ? payload?.id : payload?.commentable_id;
    if (!id) return "no photo id";
    const photo = await ccGet(`/photos/${id}?include=${PHOTO_INCLUDE}`, apiToken);
    if (!photo) {
      await sb.from("companycam_photos").update({ removed_at: new Date().toISOString() }).eq("id", String(id));
      return "photo gone (404) → removed_at";
    }
    await upsert("companycam_photos", mapPhoto(photo));
    await sb.rpc("refresh_companycam_project_priority", { p_project_id: String(photo.project_id) });
    const copied = action === "created" || action === "updated" ? await copyDisplaySizes(photo).catch((e) => `copy failed: ${e.message}`) : false;
    return `photo ${action} upserted${copied === true ? " + display copy" : typeof copied === "string" ? `; ${copied}` : ""}`;
  }
  if (resource === "project") {
    const id = payload?.id;
    if (!id) return "no project id";
    if (action === "deleted") {
      await sb.from("companycam_projects").update({ removed_at: new Date().toISOString() }).eq("id", String(id));
      return "project deleted → removed_at";
    }
    const project = await ccGet(`/projects/${id}`, apiToken);
    if (!project) {
      await sb.from("companycam_projects").update({ removed_at: new Date().toISOString() }).eq("id", String(id));
      return "project gone (404) → removed_at";
    }
    await upsert("companycam_projects", mapProject(project));
    if (action === "created" || action === "updated" || action === "merged") {
      await sb.rpc("link_companycam_projects");
      await sb.rpc("refresh_companycam_project_priority", { p_project_id: String(id) });
    }
    return `project ${action} upserted`;
  }
  if (resource === "video") {
    const id = payload?.id;
    if (!id) return "no video id";
    const video = await ccGet(`/videos/${id}`, apiToken);
    if (!video) return "video gone (404)";
    await upsert("companycam_videos", mapVideo(video));
    return `video ${action} upserted (copy worker fetches bytes)`;
  }
  return "logged only";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const raw = await req.text();
  const signature = req.headers.get("x-companycam-signature") ?? "";
  const { webhookToken, apiToken } = await secrets();
  const ok = Boolean(webhookToken && signature) && constantTimeEqual(await hmacSha1Base64(webhookToken, raw), signature);

  let body: any = null;
  try { body = JSON.parse(raw); } catch { /* recorded as unparseable below */ }
  const eventType = typeof body?.event_type === "string" ? body.event_type.slice(0, 80) : null;
  const payload = body?.payload ?? null;
  const resourceId = payload?.id != null ? String(payload.id).slice(0, 40) : null;

  const { data: ev } = await sb.from("companycam_webhook_events").insert({
    webhook_id: body?.webhook_id != null ? String(body.webhook_id) : null,
    event_type: eventType,
    resource_type: eventType?.split(".")[0] ?? null,
    resource_id: resourceId,
    signature_ok: ok,
    payload: ok ? body : null, // unverified bodies are not stored
  }).select("id").single();

  if (!ok) return new Response(JSON.stringify({ error: "invalid_signature" }), { status: 401 });
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
