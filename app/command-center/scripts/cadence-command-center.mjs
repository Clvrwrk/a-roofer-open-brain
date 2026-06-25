#!/usr/bin/env node
function firstConfiguredServiceToken() {
  const explicit = process.env.COMMAND_CENTER_SERVICE_TOKEN || process.env.AGENT_SERVICE_TOKEN || "";
  if (explicit) return explicit;

  const csv = process.env.AGENT_SERVICE_TOKENS || "";
  for (const rawEntry of csv.split(",")) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    const separator = entry.indexOf(":");
    if (separator > 0 && separator < entry.length - 1) return entry.slice(separator + 1).trim();
  }

  return "";
}

const base = (process.env.COMMAND_CENTER_BASE_URL || process.env.COMMAND_CENTER_SITE_URL || "http://127.0.0.1:4324").replace(/\/$/, "");
const serviceToken = firstConfiguredServiceToken();
const headers = { accept: "application/json" };
if (serviceToken) headers.authorization = `Bearer ${serviceToken}`;

const started = performance.now();
const response = await fetch(`${base}/api/performance/cadence`, { headers });
const text = await response.text();
let payload;
try {
  payload = JSON.parse(text);
} catch {
  payload = { raw: text.slice(0, 500) };
}
console.log(JSON.stringify({ base, status: response.status, durationMs: Math.round((performance.now() - started) * 10) / 10, payload }, null, 2));
if (!response.ok || payload?.ok === false) process.exit(1);
