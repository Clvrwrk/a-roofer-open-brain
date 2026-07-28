#!/usr/bin/env node
/**
 * QuickBooks Online read-only HTTP client (PEC-98).
 *
 * Hard rule: production (and default) access is extract/mirror only.
 * - Allowed: GET against QBO company API; SELECT queries; OAuth refresh_token POST
 *   to Intuit's token endpoint only.
 * - Forbidden: POST/PUT/PATCH/DELETE against any QuickBooks company API host,
 *   unless QUICKBOOKS_WRITE_ENABLED=true AND QUICKBOOKS_ACCESS_MODE=read_write
 *   (both required; defaults deny).
 *
 * Does not print secrets. Load env via ~/.config/cleverwork/master.env or process.env.
 */

import { createHash } from "node:crypto";

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function env(name, fallback = "") {
  const v = process.env[name];
  return v == null || v === "" ? fallback : v;
}

export function accessMode() {
  return (env("QUICKBOOKS_ACCESS_MODE", "read_only") || "read_only").toLowerCase();
}

export function writesEnabled() {
  return env("QUICKBOOKS_WRITE_ENABLED", "false").toLowerCase() === "true";
}

export function isReadOnlyMode() {
  return accessMode() === "read_only" || !writesEnabled();
}

export function apiBase() {
  const sandbox =
    env("QUICKBOOKS_SANDBOX_MODE", "true").toLowerCase() === "true" ||
    env("QUICKBOOKS_ENV", "sandbox").toLowerCase() === "sandbox";
  return sandbox
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
}

export function realmId() {
  return env("QUICKBOOKS_REALM_ID") || env("QUICKBOOKS_PROD_REALM_ID");
}

function assertSafeMethod(method, url) {
  const m = String(method || "GET").toUpperCase();
  const u = String(url);
  const isTokenEndpoint = u.startsWith(TOKEN_URL);
  const isQboCompanyApi =
    u.includes("quickbooks.api.intuit.com") && !isTokenEndpoint;

  if (isTokenEndpoint) {
    if (m !== "POST") {
      throw new Error(`QBO read-only client: token endpoint only allows POST (got ${m})`);
    }
    return;
  }

  if (!isQboCompanyApi) {
    throw new Error(`QBO read-only client: URL not allowed: ${u.split("?")[0]}`);
  }

  if (MUTATING.has(m)) {
    if (isReadOnlyMode()) {
      throw new Error(
        `QBO READ-ONLY GUARD (PEC-98): blocked ${m} to company API. ` +
          `Mirror/extract only. Set QUICKBOOKS_ACCESS_MODE=read_write AND ` +
          `QUICKBOOKS_WRITE_ENABLED=true only with human-approved Linear ticket.`,
      );
    }
  }

  if (m !== "GET" && isReadOnlyMode()) {
    throw new Error(`QBO READ-ONLY GUARD: only GET allowed in read_only mode (got ${m})`);
  }
}

function assertSafeQuery(sql) {
  const s = String(sql || "").trim().toLowerCase();
  if (!s.startsWith("select")) {
    throw new Error("QBO READ-ONLY GUARD: query must be SELECT-only");
  }
  for (const bad of [
    "insert ",
    "update ",
    "delete ",
    "drop ",
    "alter ",
    "create ",
    "merge ",
    "truncate ",
  ]) {
    if (s.includes(bad)) {
      throw new Error(`QBO READ-ONLY GUARD: forbidden SQL keyword in query (${bad.trim()})`);
    }
  }
}

export async function refreshAccessToken() {
  const clientId = env("QUICKBOOKS_CLIENT_ID");
  const clientSecret = env("QUICKBOOKS_CLIENT_SECRET");
  const refresh = env("QUICKBOOKS_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refresh) {
    throw new Error("Missing QUICKBOOKS_CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN");
  }

  assertSafeMethod("POST", TOKEN_URL);

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refresh,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body,
  });

  const data = await res.json();
  if (!res.ok) {
    const err = data?.error || res.status;
    throw new Error(`QBO token refresh failed: ${err}`);
  }

  const access = data.access_token || data.accessToken;
  const newRefresh = data.refresh_token || data.refreshToken;
  if (!access) throw new Error("QBO token refresh: no access_token in response");

  return {
    accessToken: access,
    refreshToken: newRefresh || refresh,
    expiresIn: data.expires_in || data.expiresIn || 3600,
  };
}

/**
 * GET a path under /v3/company/{realmId}/…
 * @param {string} accessToken
 * @param {string} pathRelative e.g. "companyinfo/{realmId}" or "query?query=..."
 */
export async function qboGet(accessToken, pathRelative, { minorversion = 75 } = {}) {
  const realm = realmId();
  if (!realm) throw new Error("Missing QUICKBOOKS_REALM_ID");
  if (!accessToken) throw new Error("Missing access token");

  const rel = String(pathRelative).replace(/^\//, "");
  const joiner = rel.includes("?") ? "&" : "?";
  const url = `${apiBase()}/v3/company/${realm}/${rel}${joiner}minorversion=${minorversion}`;
  assertSafeMethod("GET", url);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  const data = await res.json();
  if (!res.ok || data.Fault) {
    const msg =
      data?.Fault?.Error?.[0]?.Message ||
      data?.Fault?.Error?.[0]?.Detail ||
      `HTTP ${res.status}`;
    throw new Error(`QBO GET failed: ${msg}`);
  }
  return data;
}

export async function qboQuery(accessToken, selectSql, opts) {
  assertSafeQuery(selectSql);
  const q = encodeURIComponent(selectSql);
  return qboGet(accessToken, `query?query=${q}`, opts);
}

/** Redacted smoke: companyinfo + Account count. Prints no tokens. */
export async function smokeReadOnly() {
  const mode = accessMode();
  const write = writesEnabled();
  const realm = realmId();
  console.log("qbo_access_mode=", mode);
  console.log("qbo_write_enabled=", write);
  console.log("qbo_read_only_enforced=", isReadOnlyMode());
  console.log("qbo_api_base=", apiBase());
  console.log("qbo_realm_set=", Boolean(realm));
  console.log(
    "qbo_realm_fingerprint=",
    realm ? createHash("sha256").update(realm).digest("hex").slice(0, 12) : "none",
  );

  const { accessToken } = await refreshAccessToken();
  const info = await qboGet(accessToken, `companyinfo/${realm}`);
  const company = info.CompanyInfo || {};
  console.log("company_status=OK");
  console.log("CompanyName=", company.CompanyName || "(none)");
  console.log("Country=", company.Country || "(none)");

  const acct = await qboQuery(accessToken, "select count(*) from Account");
  console.log("account_totalCount=", acct?.QueryResponse?.totalCount ?? "?");

  // Prove mutating call is blocked in read_only mode
  let blocked = false;
  try {
    assertSafeMethod("POST", `${apiBase()}/v3/company/${realm}/invoice`);
  } catch {
    blocked = true;
  }
  console.log("mutating_post_blocked=", blocked);
  if (isReadOnlyMode() && !blocked) {
    throw new Error("GUARD FAILED: mutating POST was not blocked");
  }
  return { companyName: company.CompanyName, blocked };
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("read-only-client.mjs") ||
    process.argv[1].includes("read-only-client"));

if (isMain) {
  smokeReadOnly().catch((err) => {
    console.error("STATUS=FAIL", err.message);
    process.exit(1);
  });
}
