#!/usr/bin/env node
// One-time CompanyCam webhook registration (docs/120 §5). Approved by Chris 2026-10-01.
//
// The ONLY write this bridge makes to CompanyCam: it creates one webhook pointing at the
// companycam-webhook edge function. Everything else in the bridge is GET-only.
//
//   node integrations/bridges/companycam/register-webhook.mjs --env-file <repo>/.env [--rotate]
//
// 1. Refuses if a webhook already points at our receiver (unless --rotate, which updates its token).
// 2. Generates a 32-byte signing token, stores it and COMPANYCAM_ACCESS_TOKEN in Supabase Vault
//    via companycam_put_secret(). --rotate stages the new token as _next (the receiver accepts
//    both) and promotes it only after CompanyCam confirms, so deliveries never fail mid-rotation.
// 3. Registers the webhook with that token. Prints ids and scopes only — never a secret.

import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const envFile = args[args.indexOf("--env-file") + 1];
const rotate = args.includes("--rotate");
const fileEnv = envFile && existsSync(envFile)
  ? Object.fromEntries(readFileSync(envFile, "utf8").split(/\r?\n/).filter((l) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(l))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }))
  : {};
const env = { ...process.env, ...fileEnv };
const SUPABASE_URL = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const CC_TOKEN = env.COMPANYCAM_ACCESS_TOKEN;
if (!SUPABASE_URL || !SRK || !CC_TOKEN) throw new Error("need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COMPANYCAM_ACCESS_TOKEN");

const RECEIVER = `${SUPABASE_URL}/functions/v1/companycam-webhook`;
const SCOPES = ["photo.*", "project.*", "video.*", "comment.*"];
const CC = "https://app.companycam.com/public_api/v1";
const ccHeaders = { Authorization: `Bearer ${CC_TOKEN}`, Accept: "application/json", "Content-Type": "application/json" };

async function putSecret(name, value) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/companycam_put_secret`, {
    method: "POST",
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_name: name, p_secret: value }),
  });
  if (!res.ok) throw new Error(`vault ${name} → ${res.status} ${(await res.text()).slice(0, 200)}`);
}

console.log(`receiver: ${RECEIVER} (supabase=${new URL(SUPABASE_URL).host.split(".")[0]})`);
// A failed listing must stop us before any Vault write, or we could register a duplicate.
const listRes = await fetch(`${CC}/webhooks`, { headers: ccHeaders });
const listBody = await listRes.json().catch(() => null);
if (!listRes.ok || !Array.isArray(listBody?.data)) {
  throw new Error(`CompanyCam webhook listing failed (${listRes.status}); nothing changed`);
}
const ours = listBody.data.find((w) => w.url === RECEIVER);
if (ours && !rotate) {
  console.log(`already registered: webhook ${ours.id} enabled=${ours.enabled} scopes=${ours.scopes.join(",")} — nothing to do (use --rotate to replace its token)`);
  process.exit(0);
}

const token = randomBytes(32).toString("hex");
await putSecret("companycam_access_token", CC_TOKEN);

if (ours) {
  // Rotation without a gap: the receiver accepts BOTH companycam_webhook_token and
  // companycam_webhook_token_next. Stage the new token as _next, switch CompanyCam, then
  // promote it. If CompanyCam refuses the switch, the current token is untouched.
  await putSecret("companycam_webhook_token_next", token);
  const res = await fetch(`${CC}/webhooks/${ours.id}`, {
    method: "PATCH", headers: ccHeaders,
    body: JSON.stringify({ webhook: { url: RECEIVER, scopes: SCOPES, token } }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`CompanyCam webhook update → ${res.status}; current signing token unchanged (stale _next is harmless)`);
  await putSecret("companycam_webhook_token", token);
  console.log(`rotated: webhook ${body.data.id} enabled=${body.data.enabled} scopes=${body.data.scopes.join(",")}`);
} else {
  // Fresh registration: nothing points at us yet, so storing first cannot break deliveries.
  await putSecret("companycam_webhook_token", token);
  await putSecret("companycam_webhook_token_next", token);
  const res = await fetch(`${CC}/webhooks`, {
    method: "POST", headers: ccHeaders,
    body: JSON.stringify({ webhook: { url: RECEIVER, scopes: SCOPES, token } }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`CompanyCam webhook create → ${res.status} ${JSON.stringify(body?.errors || body).slice(0, 300)}`);
  console.log(`registered: webhook ${body.data.id} enabled=${body.data.enabled} scopes=${body.data.scopes.join(",")}`);
}
