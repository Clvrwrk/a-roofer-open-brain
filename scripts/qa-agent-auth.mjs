#!/usr/bin/env node
/**
 * qa-agent-auth.mjs — provision and authenticate the PE Site QA agent (docs/95).
 *
 * Gives the QA site-walker a real WorkOS identity whose one-time sign-in codes
 * land in an API-readable mailbox, so the agent can complete a Magic Auth login
 * with NO password anywhere and no human in the loop after setup.
 *
 *   node scripts/qa-agent-auth.mjs status      # what exists today
 *   node scripts/qa-agent-auth.mjs provision   # create inbox + WorkOS user
 *   node scripts/qa-agent-auth.mjs login       # magic-auth: send code, read it, exchange
 *
 * PROVEN FLOW (validated 2026-08-19 end to end):
 *   POST /user_management/magic_auth/send        -> WorkOS emails a 6-digit code
 *   GET  agentmail /inboxes/{addr}/messages      -> code is readable via API
 *   POST /user_management/authenticate           -> grant_type magic_auth -> session
 *
 * DOMAIN CONSTRAINT — read before changing QA_EMAIL:
 *   AgentMail serves jennaholt.com, gsc-reports.aia4.io,
 *   agentmail.proexteriorsus.net and mail.mycleverwork.com. It does NOT serve
 *   cc.proexteriorsus.net, and pointing that domain's MX at AgentMail would
 *   disturb the existing @cc.proexteriorsus.net Google Workspace mailboxes
 *   (maya.chen, alex.rivers, …). So the QA agent uses the agentmail subdomain —
 *   the same convention the ob-* agents already use. WorkOS does not care about
 *   the domain; only deliverability matters, and this domain is deliverable.
 *
 * SECRETS: read from 1Password at runtime, never written to disk or logged.
 *   op://PE_CC_DEV_Team/WorkOS - PE_CC_DEV_TEAM/credential   (WorkOS API key)
 *   op://CW_Master/AGENTMAIL_API_KEY/credential              (AgentMail key)
 */
import { execFileSync } from "node:child_process";

const QA_EMAIL = process.env.QA_EMAIL || "site-qa@agentmail.proexteriorsus.net";
const QA_FIRST = "PE Site";
const QA_LAST = "QA";
const WORKOS = "https://api.workos.com";
const AGENTMAIL = "https://api.agentmail.to/v0";

const op = (ref) => {
  try { return execFileSync("op", ["read", ref], { encoding: "utf8" }).trim(); }
  catch { return ""; }
};
// Env first, 1Password second: the Hetzner agent host has no `op` binary, and the
// nightly QA orchestrator runs there. Locally, `op` still fills the gap.
const wkKey = () => process.env.WORKOS_API_KEY || op("op://PE_CC_DEV_Team/WorkOS - PE_CC_DEV_TEAM/credential");
const amKey = () => process.env.AGENTMAIL_API_KEY || op("op://CW_Master/AGENTMAIL_API_KEY/credential");

const api = async (url, key, opts = {}) => {
  const res = await fetch(url, {
    ...opts,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...(opts.headers || {}) },
  });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, ok: res.ok, body };
};

const findUser = async (key, email) => {
  const r = await api(`${WORKOS}/user_management/users?email=${encodeURIComponent(email)}&limit=1`, key);
  return r.body?.data?.[0] ?? null;
};
const findInbox = async (key, addr) => {
  const r = await api(`${AGENTMAIL}/inboxes`, key);
  const list = Array.isArray(r.body) ? r.body : (r.body?.inboxes ?? r.body?.data ?? []);
  return list.find((i) => (i.inbox_id || i.address || i.email) === addr) ?? null;
};

async function status() {
  const wk = wkKey(), am = amKey();
  if (!wk || !am) { console.error("FAIL: could not read credentials from 1Password (is `op` signed in?)"); process.exit(1); }
  const inbox = await findInbox(am, QA_EMAIL);
  const user = await findUser(wk, QA_EMAIL);
  console.log(`QA agent: ${QA_EMAIL}`);
  console.log(`  AgentMail inbox : ${inbox ? "EXISTS" : "missing"}`);
  console.log(`  WorkOS user     : ${user ? `EXISTS (${user.id}, verified=${user.email_verified})` : "missing"}`);
  return { inbox, user };
}

async function provision() {
  const wk = wkKey(), am = amKey();
  let { inbox, user } = await status();

  if (!inbox) {
    const [username, domain] = QA_EMAIL.split("@");
    const r = await api(`${AGENTMAIL}/inboxes`, am, { method: "POST", body: JSON.stringify({ username, domain }) });
    if (!r.ok) { console.error("FAIL creating inbox:", r.status, JSON.stringify(r.body).slice(0, 300)); process.exit(1); }
    console.log(`  created AgentMail inbox ${QA_EMAIL}`);
  }
  if (!user) {
    const r = await api(`${WORKOS}/user_management/users`, wk, {
      method: "POST",
      body: JSON.stringify({ email: QA_EMAIL, first_name: QA_FIRST, last_name: QA_LAST, email_verified: true }),
    });
    if (!r.ok) { console.error("FAIL creating WorkOS user:", r.status, JSON.stringify(r.body).slice(0, 300)); process.exit(1); }
    console.log(`  created WorkOS user ${r.body.id}`);
  }
  console.log("provisioned. run `login` to verify the magic-auth loop.");
}

/** Poll the inbox for a fresh WorkOS code. Only accepts mail newer than `since`. */
async function readCode(am, since, tries = 20, delayMs = 3000) {
  for (let i = 0; i < tries; i++) {
    const r = await api(`${AGENTMAIL}/inboxes/${encodeURIComponent(QA_EMAIL)}/messages?limit=5`, am);
    const list = Array.isArray(r.body) ? r.body : (r.body?.messages ?? r.body?.data ?? []);
    for (const m of list) {
      const from = String(m.from || "");
      const ts = Date.parse(m.timestamp || m.created_at || 0);
      if (!/workos|access@/i.test(from)) continue;
      if (!(ts >= since - 60_000)) continue;                 // ignore stale codes
      const code = String(m.text || m.preview || m.html || "").match(/\b(\d{6})\b`?/);
      if (code) return code[1];
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

async function login() {
  const wk = wkKey(), am = amKey();
  const sent = Date.now();
  const s = await api(`${WORKOS}/user_management/magic_auth/send`, wk, {
    method: "POST", body: JSON.stringify({ email: QA_EMAIL }),
  });
  if (!s.ok) { console.error("FAIL sending magic auth:", s.status, JSON.stringify(s.body).slice(0, 300)); process.exit(1); }
  console.log("  magic-auth code sent; polling the inbox…");

  const code = await readCode(am, sent);
  if (!code) { console.error("FAIL: no code arrived within the polling window"); process.exit(1); }
  console.log(`  code retrieved from inbox (${code.slice(0, 2)}****)`);

  // The client_id MUST be the one cc.proexteriorsus.net actually redirects with.
  // None of the three stored in 1Password match it (checked 2026-08-19):
  //   PROEXTERIORS_WORKOS_PRODUCTION_CLIENT_ID = client_01KY4JGZHVPB133A3N3X4FXYG9
  //   PROEXTERIORS_WORKOS_CLIENT_ID            = client_01KY4JGZ4C28JJT7HATPDHJ3KB
  //   WORKOS_CLIENT_ID                         = client_01KWQ4C0JW76PS952KGTNAH17W
  // The live value below was read off the AuthKit redirect the app issues.
  const clientId = process.env.WORKOS_CLIENT_ID || "client_01KTF450QBY957ASEZ8JXZKMV4";

  // /user_management/authenticate is a token endpoint: it authenticates the
  // CLIENT via client_id + client_secret in the BODY, not via a Bearer header.
  // Sending only the Bearer header yields 400 invalid_client "Invalid client secret."
  const res = await fetch(`${WORKOS}/user_management/authenticate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: wk,
      grant_type: "urn:workos:oauth:grant-type:magic-auth:code",
      code,
      email: QA_EMAIL,
    }),
  });
  const txt = await res.text();
  let parsed; try { parsed = JSON.parse(txt); } catch { parsed = txt; }
  const a = { ok: res.ok, status: res.status, body: parsed };
  if (!a.ok) { console.error("FAIL exchanging code:", a.status, JSON.stringify(a.body).slice(0, 400)); process.exit(1); }
  console.log(`  authenticated as ${a.body?.user?.email} (user ${a.body?.user?.id})`);
  console.log(`  access_token: ${a.body?.access_token ? "issued" : "absent"} · refresh_token: ${a.body?.refresh_token ? "issued" : "absent"}`);
  console.log("SUCCESS — full passwordless loop verified.");
}

// ── mint ────────────────────────────────────────────────────────────────────
// Produce the SAME sealed session cookie /auth/callback sets, with no browser —
// and therefore without the Cloudflare human-verification interstitial that sits
// in front of api.workos.com and *.authkit.app. That Cloudflare is WorkOS's, not
// ours; there is no setting on our side that disables it.
//
// Why this works: the SDK's authenticateWithMagicAuth accepts the same
// `session: { sealSession, cookiePassword }` option as authenticateWithCode and
// runs it through the same prepareAuthenticationResponse, so it returns a
// `sealedSession` of the same kind. The raw REST /user_management/authenticate
// CANNOT — sealing is SDK-side only, which is why `login` yields tokens and never
// a cookie.
//
// WORKOS_COOKIE_PASSWORD must be byte-identical to the app's. A different value
// seals a cookie the app cannot decrypt, and every page 302s to /auth/login while
// looking exactly like an auth outage.
async function mint() {
  const wk = wkKey(), am = amKey();
  const clientId = process.env.WORKOS_CLIENT_ID || "client_01KTF450QBY957ASEZ8JXZKMV4";
  const cookiePassword = process.env.WORKOS_COOKIE_PASSWORD || "";
  if (!wk) { console.error("FAIL: WORKOS_API_KEY unavailable (env or 1Password)"); process.exit(1); }
  if (!am) { console.error("FAIL: AGENTMAIL_API_KEY unavailable (env or 1Password)"); process.exit(1); }
  if (cookiePassword.length < 32) {
    console.error("FAIL: WORKOS_COOKIE_PASSWORD missing or <32 chars. It must be the SAME value the app uses.");
    process.exit(1);
  }

  const mod = await import("@workos-inc/node").catch(() => null);
  if (!mod?.WorkOS) {
    console.error("FAIL: @workos-inc/node not resolvable — run from app/command-center or set NODE_PATH to its node_modules");
    process.exit(1);
  }

  const sent = Date.now();
  const s = await api(`${WORKOS}/user_management/magic_auth/send`, wk, {
    method: "POST", body: JSON.stringify({ email: QA_EMAIL }),
  });
  if (!s.ok) { console.error("FAIL sending magic auth:", s.status, JSON.stringify(s.body).slice(0, 200)); process.exit(1); }

  const code = await readCode(am, sent);
  if (!code) { console.error("FAIL: no magic-auth code arrived within the polling window"); process.exit(1); }

  let resp;
  try {
    const workos = new mod.WorkOS(wk, { clientId });
    resp = await workos.userManagement.authenticateWithMagicAuth({
      clientId, code, email: QA_EMAIL,
      session: { sealSession: true, cookiePassword },
    });
  } catch (e) {
    console.error("FAIL authenticateWithMagicAuth:", String(e).slice(0, 300));
    process.exit(1);
  }
  if (!resp?.sealedSession) { console.error("FAIL: no sealedSession returned — check sealSession/cookiePassword"); process.exit(1); }

  // The sealed value is session material. It goes to stdout only under --json, for
  // the caller to inject straight into a browser context; it is never logged.
  const cookie = {
    name: "wos-session", value: resp.sealedSession,
    domain: process.env.QA_COOKIE_DOMAIN || "cc.proexteriorsus.net",
    path: "/", httpOnly: true, secure: true, sameSite: "Lax",
  };
  if (process.argv.includes("--json")) { console.log(JSON.stringify({ cookie, user: resp.user?.email ?? null })); return; }
  console.log(`minted wos-session for ${resp.user?.email ?? "unknown"} (${resp.sealedSession.length} bytes sealed)`);
  console.log("  pass --json to emit it for injection; the value is not printed here.");
}

const cmd = process.argv[2] || "status";
if (cmd === "status") await status();
else if (cmd === "provision") await provision();
else if (cmd === "login") await login();
else if (cmd === "mint") await mint();
else { console.error(`unknown command ${cmd}; use status|provision|login|mint`); process.exit(1); }
