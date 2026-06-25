#!/usr/bin/env node
const base = (process.env.COMMAND_CENTER_BASE_URL || process.env.COMMAND_CENTER_SITE_URL || "http://127.0.0.1:4324").replace(/\/$/, "");
const serviceToken = process.env.COMMAND_CENTER_SERVICE_TOKEN || process.env.AGENT_SERVICE_TOKEN || "";
const headers = { accept: "application/json" };
if (serviceToken) headers.authorization = `Bearer ${serviceToken}`;

const started = performance.now();
const response = await fetch(`${base}/api/performance/warm`, { method: "POST", headers });
const text = await response.text();
let payload;
try {
  payload = JSON.parse(text);
} catch {
  payload = { raw: text.slice(0, 500) };
}
console.log(JSON.stringify({ base, status: response.status, durationMs: Math.round((performance.now() - started) * 10) / 10, payload }, null, 2));
if (!response.ok || payload?.ok === false) process.exit(1);
