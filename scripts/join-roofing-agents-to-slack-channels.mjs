#!/usr/bin/env node

const AGENTS = {
  maya: { name: "Maya Chen", tokenEnv: "MAYA_CHEN_BOT_TOKEN" },
  alex: { name: "Alex Rivers", tokenEnv: "ALEX_RIVERS_BOT_TOKEN" },
  casey: { name: "Casey Morgan", tokenEnv: "CASEY_MORGAN_BOT_TOKEN" },
  jordan: { name: "Jordan Price", tokenEnv: "JORDAN_PRICE_BOT_TOKEN" },
  sam: { name: "Sam Torres", tokenEnv: "SAM_TORRES_BOT_TOKEN" },
  rowan: { name: "Rowan Vale", tokenEnv: "ROWAN_VALE_BOT_TOKEN" },
  lena: { name: "Lena Brooks", tokenEnv: "LENA_BROOKS_BOT_TOKEN" },
  ops: { name: "Ops Conductor", tokenEnv: "OPS_CONDUCTOR_BOT_TOKEN" },
};

const HUMAN_CHANNELS = [
  { name: "accounting-vendor-intake", id: "C0BCUF29G1H" },
  { name: "accounting-credit-memos", id: "C0BD4EW4RU4" },
  { name: "accounting-product-catalog-review", id: "C0BCYNW98RL" },
];

async function slack(method, token, body) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  return res.json();
}

const dryRun = process.argv.includes("--dry-run");
let failures = 0;
console.log(`Joining Roofing-Ops agents to human operational channels (${dryRun ? "dry-run" : "live"})`);

for (const [agent, config] of Object.entries(AGENTS)) {
  const token = process.env[config.tokenEnv];
  console.log(`\n## ${config.name}`);
  if (!token) {
    console.log(`❌ Missing ${config.tokenEnv}`);
    failures += 1;
    continue;
  }
  for (const channel of HUMAN_CHANNELS) {
    if (dryRun) {
      console.log(`DRY: would join ${config.name} to #${channel.name} (${channel.id})`);
      continue;
    }
    const result = await slack("conversations.join", token, { channel: channel.id });
    if (result.ok || result.error === "already_in_channel") {
      console.log(`✅ #${channel.name}: ${result.error ?? "joined"}`);
    } else if (["method_not_supported_for_channel_type", "not_in_channel", "channel_not_found", "missing_scope"].includes(result.error)) {
      console.log(`⚠️ #${channel.name}: manual invite/admin action required (${result.error})`);
    } else {
      console.log(`❌ #${channel.name}: ${result.error}`);
      failures += 1;
    }
  }
}

process.exitCode = failures ? 1 : 0;
