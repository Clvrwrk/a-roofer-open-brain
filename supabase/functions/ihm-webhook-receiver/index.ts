import {completeStoredWebhook,reportIhmOutcome} from "./observability.ts";
import {verifySignature} from "./security.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const WEBHOOK_SECRET = Deno.env.get("IHM_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// HMAC-SHA256 signature verification


// Detect webhook type from payload structure.
// Order matters: most specific structural keys first.
function detectWebhookType(payload: Record<string, unknown>): string {
  // Type 1 — Monitoring Alerts
  if ("monitoringAlert_id" in payload || "swathSize" in payload) return "monitoring_alert";
  // Type 3 — Impact Reports. IHM sends reportPdf ({data:<base64>}) + reconMarkerReport_id.
  // (legacy reportUrl/report_url kept as fallbacks)
  if ("reconMarkerReport_id" in payload || "reportPdf" in payload || "reportUrl" in payload || "report_url" in payload) return "impact_report";
  // Type 2 — Recon Pics
  if ("photoUrl" in payload || "photo_url" in payload || "reconPic_id" in payload || "photo" in payload || "imageUrl" in payload) return "recon_pic";
  // Type 4 — Marker Status Changes
  if ("changeDate" in payload && "source" in payload) return "marker_status_changed";
  // Type 6 — Hail Alerts (forecast/area broadcasts)
  if ("alertCategory" in payload || "AlertCategory" in payload) return "hail_alert";
  if (payload.category && typeof payload.category === "string") return "hail_alert";
  return "unknown";
}

// Strip the multi-MB base64 reportPdf blob before persisting to a typed table.
// Returns [leanPayload, pdfByteLength].
function stripReportPdf(p: Record<string, unknown>): [Record<string, unknown>, number] {
  const clone: Record<string, unknown> = { ...p };
  let len = 0;
  const pdf = clone["reportPdf"] as unknown;
  if (pdf && typeof pdf === "object" && pdf !== null && "data" in (pdf as Record<string, unknown>)) {
    const data = (pdf as Record<string, unknown>).data;
    if (typeof data === "string") len = data.length;
  } else if (typeof pdf === "string") {
    len = (pdf as string).length;
  }
  delete clone["reportPdf"];
  return [clone, len];
}

async function insertMonitoringAlert(sb: SupabaseClient, rawId: number, p: Record<string, unknown>) {
  await sb.from("ihm_monitoring_alerts").insert({
    raw_id: rawId, monitoring_alert_id: p.monitoringAlert_id, recon_marker_id: p.reconMarker_id,
    file_date: p.fileDate, detected_at: p.detected, level_detected: p.levelDetected, swath_size: p.swathSize,
    user_email: p.userEmail, user_name: p.userName, marker_status: p.markerStatus, customer_name: p.customerName,
    phone_number: p.phoneNumber, mobile_number: p.mobileNumber, email: p.email, street: p.street, city: p.city,
    state: p.state, zip_code: p.zipCode, lat: p.lat, lng: p.long, comments: p.comments, external_key: p.externalKey, time_zone: p.timeZone,
  }).throwOnError();
}

async function insertMarkerChange(sb: SupabaseClient, rawId: number, p: Record<string, unknown>) {
  await sb.from("ihm_marker_changes").insert({
    raw_id: rawId, recon_marker_id: p.reconMarker_id, change_date: p.changeDate, source: p.source, map_date: p.mapDate,
    marker_created: p.markerCreated, user_email: p.userEmail, user_name: p.userName, marker_status: p.markerStatus,
    customer_name: p.customerName, phone_number: p.phoneNumber, mobile_number: p.mobileNumber, email: p.email,
    street: p.street, city: p.city, state: p.state, zip_code: p.zipCode, lat: p.lat, lng: p.long, comments: p.comments,
    external_key: p.externalKey, time_zone: p.timeZone, monitoring_size: p.monitoringSize,
  }).throwOnError();
}

async function insertHailAlert(sb: SupabaseClient, rawId: number, p: Record<string, unknown>) {
  await sb.from("ihm_hail_alerts").insert({
    raw_id: rawId, alert_category: p.alertCategory ?? p.AlertCategory ?? p.category,
    user_email: p.userEmail ?? p.UserEmail, user_name: p.userName ?? p.UserName, payload: p,
    lat: p.lat ?? p.Lat ?? p.latitude, lng: p.long ?? p.Long ?? p.longitude,
    location_text: p.locationText ?? p.location ?? p.message ?? p.city,
    severity: p.severity ?? p.hailSize ?? p.size, event_time: p.eventTime ?? p.eventDate ?? p.fileDate ?? p.detected,
  }).throwOnError();
}

async function insertReconPic(sb: SupabaseClient, rawId: number, p: Record<string, unknown>) {
  await sb.from("ihm_recon_pics").insert({
    raw_id: rawId, recon_marker_id: p.reconMarker_id, user_email: p.userEmail, user_name: p.userName,
    street: p.street, city: p.city, state: p.state, zip_code: p.zipCode, lat: p.lat, lng: p.long,
    photo_url: p.photoUrl ?? p.photo_url ?? p.imageUrl, external_key: p.externalKey, payload: p,
  }).throwOnError();
}

async function insertImpactReport(sb: SupabaseClient, rawId: number, p: Record<string, unknown>) {
  const [lean, pdfLen] = stripReportPdf(p);
  await sb.from("ihm_impact_reports").upsert({
    raw_id: rawId,
    recon_marker_id: p.reconMarker_id,
    recon_marker_report_id: p.reconMarkerReport_id,
    user_email: p.userEmail, user_name: p.userName,
    street: p.street, city: p.city, state: p.state, zip_code: p.zipCode,
    lat: p.lat, lng: p.long,
    report_url: p.reportUrl ?? p.report_url ?? null,
    marker_status: p.markerStatus, locked: p.locked,
    report_pdf_len: pdfLen, has_pdf: pdfLen > 0,
    external_key: p.externalKey, payload: lean,
  }, { onConflict: "recon_marker_report_id", ignoreDuplicates: true }).throwOnError();
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }
  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-signature") ?? "";
  const verified = await verifySignature(rawBody, signature, WEBHOOK_SECRET);
  // Reject before parsing, creating a privileged client or writing any raw/typed row.
  if (!verified) {
    return new Response(JSON.stringify({ error: "Invalid webhook signature" }),
      { status: 401, headers: { "Content-Type": "application/json" } });
  }

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json" } }); }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return new Response(JSON.stringify({error:'Invalid payload shape'}),{status:400,headers:{'Content-Type':'application/json'}});
  }
  const webhookType = detectWebhookType(payload);
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: rawRow, error: rawErr } = await sb.from("ihm_webhook_raw")
    .insert({ webhook_type: webhookType, payload, signature, verified }).select("id").single();

  if (rawErr || !rawRow) {
    console.error("ihm_raw_storage_failed");
    await reportIhmOutcome(sb,false,'webhook_storage_failed');
    return new Response(JSON.stringify({ error: "Storage failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  const rawId = rawRow.id;

  const processed=await completeStoredWebhook(sb,rawId,async()=>{
    switch (webhookType) {
      case "monitoring_alert": await insertMonitoringAlert(sb, rawId, payload); break;
      case "marker_status_changed": await insertMarkerChange(sb, rawId, payload); break;
      case "hail_alert": await insertHailAlert(sb, rawId, payload); break;
      case "recon_pic": await insertReconPic(sb, rawId, payload); break;
      case "impact_report": await insertImpactReport(sb, rawId, payload); break;
      default: throw new Error('unsupported_webhook_type');
    }
  },(ok,code)=>reportIhmOutcome(sb,ok,code));

  return new Response(JSON.stringify({ ok: true, processed, type: webhookType, raw_id: rawId, verified }),
    { status: 200, headers: { "Content-Type": "application/json", "Connection": "keep-alive" } });
});
