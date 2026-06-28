#!/usr/bin/env node
/**
 * Google Search Console URL Inspection for criticalPages (read-only).
 * Env: GOOGLE_APPLICATION_CREDENTIALS or GSC_SERVICE_ACCOUNT_JSON (path to SA JSON)
 *      GSC_SITE_URL (e.g. sc-domain:proexteriorsus.com or https://proexteriorsus.com/)
 * Output: reports/seo-maintenance/gsc-url-inspection-latest.json
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createSign } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const configPath = join(repoRoot, "seo-maintenance.config.json");
const outDir = join(repoRoot, "reports/seo-maintenance");
const outFile = join(outDir, "gsc-url-inspection-latest.json");

const saPath =
  process.env.GSC_SERVICE_ACCOUNT_JSON?.trim() ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();

function loadConfig() {
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const siteUrl =
    process.env.GSC_SITE_URL?.trim() ||
    config.searchConsoleSiteUrl ||
    config.googleSearchConsole?.siteUrl;
  const pages = (config.criticalPages ?? []).filter((u) =>
    u.includes("proexteriorsus.com"),
  );
  return { siteUrl, pages };
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }),
  );
  const signInput = `${header}.${claim}`;
  const sign = createSign("RSA-SHA256");
  sign.update(signInput);
  sign.end();
  const signature = sign
    .sign(sa.private_key)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const jwt = `${signInput}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error_description ?? body.error ?? res.statusText);
  }
  return body.access_token;
}

async function inspectUrl(token, siteUrl, inspectionUrl) {
  const res = await fetch(
    "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inspectionUrl, siteUrl }),
    },
  );
  const body = await res.json();
  if (!res.ok) {
    return { inspectionUrl, error: body.error?.message ?? res.statusText };
  }
  const idx = body.inspectionResult?.indexStatusResult;
  const verdict = idx?.verdict ?? "UNKNOWN";
  const coverage = idx?.coverageState ?? "UNKNOWN";
  const indexed =
    verdict === "PASS" || coverage?.toLowerCase().includes("indexed");
  return {
    inspectionUrl,
    verdict,
    coverageState: coverage,
    indexed,
    lastCrawlTime: idx?.lastCrawlTime ?? null,
  };
}

async function main() {
  if (!saPath) {
    console.error(
      "Missing GOOGLE_APPLICATION_CREDENTIALS or GSC_SERVICE_ACCOUNT_JSON",
    );
    process.exit(2);
  }

  const { siteUrl, pages } = loadConfig();
  if (!siteUrl) {
    console.error("Missing GSC_SITE_URL or searchConsoleSiteUrl in config");
    process.exit(2);
  }

  const sa = JSON.parse(readFileSync(saPath, "utf8"));
  const token = await getAccessToken(sa);

  const results = [];
  for (const url of pages) {
    console.log(`GSC inspect: ${url}`);
    results.push(await inspectUrl(token, siteUrl, url));
  }

  const indexedCount = results.filter((r) => r.indexed).length;
  const checked = results.filter((r) => !r.error).length;

  mkdirSync(outDir, { recursive: true });
  const summary = {
    generatedAt: new Date().toISOString(),
    siteUrl,
    results,
    confirmedGoogleIndexScore:
      checked > 0 ? indexedCount / checked : null,
    allIndexed: checked > 0 && indexedCount === checked,
  };
  writeFileSync(outFile, JSON.stringify(summary, null, 2));
  console.log(`Wrote ${outFile}`);
  process.exit(summary.allIndexed ? 0 : 1);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
