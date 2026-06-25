#!/usr/bin/env node
const base = (process.env.COMMAND_CENTER_BASE_URL || "http://127.0.0.1:4321").replace(/\/$/, "");
const budgetMs = Number(process.env.COMMAND_CENTER_PERF_BUDGET_MS || 500);
const failOnBudget = process.env.PERF_SMOKE_FAIL === "1";
const serviceToken = process.env.COMMAND_CENTER_SERVICE_TOKEN || "";

const paths = [
  "/",
  "/accounting/invoice-audit",
  "/accounting/price-list/review",
  "/operations/order-audit",
  "/operations/estimate-audit",
  "/weekly-snapshot",
  "/accounting/vendor-regions",
  "/api/vendor-territories",
];

function byteLength(text) {
  return new TextEncoder().encode(text).length;
}

async function timeFetch(path) {
  const url = `${base}${path}`;
  const headers = { accept: path.startsWith("/api/") ? "application/json" : "text/html" };
  if (serviceToken) headers.authorization = `Bearer ${serviceToken}`;
  const started = performance.now();
  try {
    const response = await fetch(url, { headers, redirect: "manual" });
    const text = await response.text();
    return {
      path,
      status: response.status,
      durationMs: Math.round((performance.now() - started) * 10) / 10,
      bytes: byteLength(text),
      serverTiming: response.headers.get("server-timing") || "",
      overBudget: false,
    };
  } catch (error) {
    return {
      path,
      status: 0,
      durationMs: Math.round((performance.now() - started) * 10) / 10,
      bytes: 0,
      serverTiming: "",
      error: error instanceof Error ? error.message : String(error),
      overBudget: true,
    };
  }
}

const rows = [];
for (const path of paths) rows.push(await timeFetch(path));
for (const row of rows) row.overBudget = row.status > 0 && row.status < 500 && row.durationMs > budgetMs;

console.table(rows.map((row) => ({ path: row.path, status: row.status, ms: row.durationMs, bytes: row.bytes, over: row.overBudget, serverTiming: row.serverTiming })));
console.log(JSON.stringify({ base, budgetMs, rows }, null, 2));

if (failOnBudget && rows.some((row) => row.overBudget || row.status >= 500 || row.status === 0)) process.exit(1);
