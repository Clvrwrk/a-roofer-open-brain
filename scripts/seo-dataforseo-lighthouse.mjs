#!/usr/bin/env node
/**
 * DataForSEO Lighthouse live audit for seo-maintenance.config.json criticalPages.
 * Env: DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD
 * Output: reports/seo-maintenance/dataforseo-lighthouse-latest.json
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const configPath = join(repoRoot, "seo-maintenance.config.json");
const outDir = join(repoRoot, "reports/seo-maintenance");
const outFile = join(outDir, "dataforseo-lighthouse-latest.json");

const login = process.env.DATAFORSEO_LOGIN?.trim();
const password = process.env.DATAFORSEO_PASSWORD?.trim();

if (!login || !password) {
  console.error("Missing DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD");
  process.exit(2);
}

const config = JSON.parse(readFileSync(configPath, "utf8"));
const pages = (config.criticalPages ?? []).filter((u) =>
  u.includes("proexteriorsus.com"),
);
const minScore = config.pageSpeedGate?.minScore ?? 0.95;
const strategies = config.pageSpeedGate?.strategies ?? ["mobile", "desktop"];

const auth = Buffer.from(`${login}:${password}`).toString("base64");

async function runLighthouse(url, forMobile) {
  const res = await fetch("https://api.dataforseo.com/v3/on_page/lighthouse/live", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      {
        url,
        for_mobile: forMobile,
        categories: ["performance", "accessibility", "best-practices", "seo"],
      },
    ]),
  });
  const body = await res.json();
  if (!res.ok) {
    return { url, forMobile, error: body?.status_message ?? res.statusText, raw: body };
  }
  const task = body?.tasks?.[0];
  const result = task?.result?.[0];
  const categories = result?.categories ?? {};
  const scores = Object.fromEntries(
    Object.entries(categories).map(([k, v]) => [k, v?.score ?? null]),
  );
  const pass = Object.values(scores).every((s) => s == null || s >= minScore);
  return { url, forMobile, scores, pass, taskStatus: task?.status_message };
}

const results = [];
for (const url of pages) {
  for (const strategy of strategies) {
    const forMobile = strategy === "mobile";
    console.log(`DataForSEO Lighthouse ${strategy}: ${url}`);
    results.push(await runLighthouse(url, forMobile));
  }
}

mkdirSync(outDir, { recursive: true });
const summary = {
  generatedAt: new Date().toISOString(),
  provider: "dataforseo",
  minScore,
  pages: results,
  allPass: results.every((r) => r.pass !== false && !r.error),
};
writeFileSync(outFile, JSON.stringify(summary, null, 2));
console.log(`Wrote ${outFile}`);
process.exit(summary.allPass ? 0 : 1);
