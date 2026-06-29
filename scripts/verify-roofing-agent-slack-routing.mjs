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

const INTERNAL_CHANNELS = [
  { name: "ob-agents-internal", id: "C0BD8U44HL3", opsOnly: true },
  { name: "ob-ops-conductor", id: "C0BDF8QRF8A", opsOnly: true },
  { name: "ob-dev-internal", id: "C0BDJTVMRE0", forbidden: true },
  { name: "ob-dev-conductor", id: "C0BDD623DQW", forbidden: true },
];

async function slack(method, token, body) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function slackGet(method, token, params) {
  const url = new URL(`https://slack.com/api/${method}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  return res.json();
}

async function authTest(token) {
  return slack("auth.test", token, {});
}

async function membership(token, channel) {
  // conversations.info is more reliable as GET query params across Slack token types.
  const res = await slackGet("conversations.info", token, { channel });
  if (res.ok) return { ok: true, is_member: Boolean(res.channel?.is_member) };

  return { ok: false, error: res.error };
}

const dryRun = process.argv.includes("--dry-run") || process.argv.includes("--offline");
let failures = 0;

console.log("Roofing-Ops Slack channel validation");
console.log(`Mode: ${dryRun ? "dry-run/offline" : "live Slack API"}`);

for (const [agent, config] of Object.entries(AGENTS)) {
  const token = process.env[config.tokenEnv];
  console.log(`\n## ${config.name} (${agent})`);
  if (!token) {
    console.log(`❌ Missing ${config.tokenEnv}`);
    failures += 1;
    continue;
  }
  console.log(`✅ Token env present: ${config.tokenEnv}`);
  if (dryRun) continue;

  const auth = await authTest(token);
  if (!auth.ok) {
    console.log(`❌ auth.test failed: ${auth.error}`);
    failures += 1;
    continue;
  }
  console.log(`✅ auth.test ok as ${auth.user}`);

  for (const channel of HUMAN_CHANNELS) {
    const m = await membership(token, channel.id);
    if (m.ok && m.is_member) console.log(`✅ in #${channel.name}`);
    else {
      console.log(`❌ not confirmed in #${channel.name}: ${m.error ?? "not_member"}`);
      failures += 1;
    }
  }

  for (const channel of INTERNAL_CHANNELS) {
    const m = await membership(token, channel.id);
    if (channel.opsOnly && agent === "ops") {
      if (m.ok && m.is_member) console.log(`✅ Ops in #${channel.name}`);
      else {
        console.log(`❌ Ops not confirmed in #${channel.name}: ${m.error ?? "not_member"}`);
        failures += 1;
      }
      continue;
    }
    if ((channel.opsOnly || channel.forbidden) && m.ok && m.is_member) {
      console.log(`❌ ${config.name} should not be in #${channel.name}`);
      failures += 1;
    } else if (!m.ok && m.error === "missing_scope") {
      console.log(`⚠️ cannot verify restricted #${channel.name}: missing private-channel read scope`);
      failures += 1;
    } else {
      console.log(`✅ not in restricted #${channel.name}`);
    }
  }
}

console.log(`\nValidation ${failures ? "FAILED" : "PASSED"} (${failures} failure(s))`);
process.exitCode = failures ? 1 : 0;
