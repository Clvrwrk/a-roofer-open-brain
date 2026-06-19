// On-demand ABC invoice-PDF fetch for the Invoice Audit "Invoice" button.
// When an invoice has no stored PDF yet, fetch it live from ABC
// (GET /api/invoice/v1/invoices/pdf/{invoiceId}), upload to the `invoices` storage
// bucket, and best-effort upsert invoice_documents so the next view is instant.
// Mirrors the OAuth client-credentials flow used by the abc-supply bridge.
//
// Activation requires ABC_SUPPLY_CLIENT_ID / ABC_SUPPLY_CLIENT_SECRET in the runtime
// env (Coolify). Absent creds → returns null and the caller falls back to 404.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

const ABC_DEFAULTS = {
  sandbox: { authBaseUrl: "https://sandbox.auth.partners.abcsupply.com/oauth2/aus1vp07knpuqf6Xz0h8", apiBaseUrl: "https://partners-sb.abcsupply.com" },
  production: { authBaseUrl: "https://auth.partners.abcsupply.com/oauth2/ausvvp0xuwGKLenYy357", apiBaseUrl: "https://partners.abcsupply.com" },
};
const DEFAULT_SCOPES = "invoice.read invoice.history.read";
const BUCKET = "invoices";
const stripSlash = (s: string) => s.replace(/\/+$/, "");

export interface StoredPdfRef {
  bucket: string;
  path: string;
}

let tokenCache: { token: string; expiresAtMs: number } | null = null;

async function getAbcToken(env: RuntimeEnv): Promise<string | null> {
  const clientId = env.ABC_SUPPLY_CLIENT_ID;
  const clientSecret = env.ABC_SUPPLY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  if (tokenCache && Date.now() < tokenCache.expiresAtMs) return tokenCache.token;

  const abcEnv = String(env.ABC_SUPPLY_ENV || "production").toLowerCase();
  const cfg = ABC_DEFAULTS[abcEnv as "sandbox" | "production"] ?? ABC_DEFAULTS.production;
  const authBaseUrl = stripSlash(env.ABC_SUPPLY_AUTH_BASE_URL || cfg.authBaseUrl);
  const scope = env.ABC_SUPPLY_SCOPES?.trim() || DEFAULT_SCOPES;

  const res = await fetch(`${authBaseUrl}/v1/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) return null;
  tokenCache = { token: json.access_token, expiresAtMs: Date.now() + Math.max(Number(json.expires_in || 0) - 120, 60) * 1000 };
  return tokenCache.token;
}

function fmtDate(d: string | null): string {
  if (!d) return "00000000";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "00000000";
  return `${String(dt.getMonth() + 1).padStart(2, "0")}${String(dt.getDate()).padStart(2, "0")}${dt.getFullYear()}`;
}

// Fetch + store the PDF for a single invoice. Returns the storage ref to serve, or null.
export async function fetchAndStoreInvoicePdf(
  client: SupabaseClient,
  invoiceNumber: string,
  env: RuntimeEnv = getRuntimeEnv(),
): Promise<StoredPdfRef | null> {
  const token = await getAbcToken(env);
  if (!token) return null;

  const abcEnv = String(env.ABC_SUPPLY_ENV || "production").toLowerCase();
  const cfg = ABC_DEFAULTS[abcEnv as "sandbox" | "production"] ?? ABC_DEFAULTS.production;
  const apiBaseUrl = stripSlash(env.ABC_SUPPLY_API_BASE_URL || cfg.apiBaseUrl);

  const { data: inv } = await client
    .from("abc_invoices")
    .select("invoice_id,sold_to_number,bill_to_number,invoice_date")
    .eq("invoice_number", invoiceNumber)
    .limit(1)
    .maybeSingle();
  if (!inv?.invoice_id) return null;

  const pdfRes = await fetch(`${apiBaseUrl}/api/invoice/v1/invoices/pdf/${encodeURIComponent(inv.invoice_id)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "*/*" },
  });
  if (!pdfRes.ok) return null;
  const buf = Buffer.from(await pdfRes.arrayBuffer());
  const ct = pdfRes.headers.get("content-type") || "";
  if (buf.length < 200 || !(ct.includes("pdf") || buf.subarray(0, 4).toString() === "%PDF")) return null;

  const cust = inv.sold_to_number || inv.bill_to_number || "unknown";
  const path = `${cust}_${invoiceNumber}_${fmtDate(inv.invoice_date)}.pdf`;

  const { error: upErr } = await client.storage.from(BUCKET).upload(path, buf, { contentType: "application/pdf", upsert: true });
  if (upErr) return null;

  // Best-effort metadata row so the next load is instant (failure here is non-fatal —
  // we still return the freshly uploaded path for the caller to sign).
  const { data: vendorRows, error: vendErr } = await client
    .from("invoice_documents")
    .select("vendor_id")
    .not("vendor_id", "is", null)
    .limit(1);
  const vendorId = vendorRows?.[0]?.vendor_id ?? null;
  if (vendErr) console.error("[invoice-pdf] vendor lookup error:", vendErr.message);
  if (vendorId) {
    const { error: upsertErr } = await client.from("invoice_documents").upsert(
      {
        vendor_id: vendorId,
        customer_number: cust,
        invoice_number: invoiceNumber,
        invoice_date: inv.invoice_date ? String(inv.invoice_date).slice(0, 10) : null,
        storage_bucket: BUCKET,
        storage_path: path,
        original_filename: path,
        sha256: createHash("sha256").update(buf).digest("hex"),
        file_size_bytes: buf.length,
        source: "portal_sync",
        uploaded_by: "invoice-audit-on-demand",
        uploaded_at: new Date().toISOString(),
      },
      { onConflict: "vendor_id,invoice_number" },
    );
    if (upsertErr) console.error("[invoice-pdf] upsert error:", upsertErr.message);
  } else {
    console.error("[invoice-pdf] no vendor_id resolved; skipping metadata upsert");
  }

  return { bucket: BUCKET, path };
}
