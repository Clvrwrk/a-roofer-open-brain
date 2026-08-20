#!/usr/bin/env node
/**
 * maya-qa-orchestrate.mjs — nightly QA of cc.proexteriorsus.net, conducted by Maya.
 *
 * Split by what each machine actually has, which is the only reason this is two boxes:
 *   PE-US-AGENTS (here)  has the repo -> discovers routes, assigns the day's victim,
 *                        collects results, alerts Slack.
 *   Maya's Orgo desktop  has Chrome + the signed-in WorkOS profile -> does the walking.
 *                        It has no repo clone (private, would need a deploy key), so it
 *                        is told what to walk rather than working it out itself.
 *
 *   node scripts/maya-qa-orchestrate.mjs           # wide walk + the day's deep pass
 *   node scripts/maya-qa-orchestrate.mjs --deep-only
 *
 * ENV: ORGO_API_KEY, SLACK_BOT_TOKEN, SLACK_DEV_CHANNEL_ID, MAYA_QA_COMPUTER_ID.
 */
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";

// Both passes read WALK_SESSION_COOKIE and delete the file once loaded, so the sealed
// value never outlives the run it was minted for.

const HERE = dirname(new URL(import.meta.url).pathname);
const CID = process.env.MAYA_QA_COMPUTER_ID || "37b262e0-a915-47e6-8c3b-f180a32ab6fe";
const KEY = process.env.ORGO_API_KEY;
const QA_HOME = process.env.MAYA_QA_HOME || "/opt/pe-cc-agents/maya-qa";
const CHANNEL = process.env.SLACK_DEV_CHANNEL_ID || "C0BNVF99Y74";
const DEEP_ONLY = process.argv.includes("--deep-only");
if (!KEY) { console.error("ORGO_API_KEY required"); process.exit(1); }

// The Orgo bash API caps around 590s, so anything long is detached and polled.
async function rexec(command, { timeoutMs = 580000 } = {}) {
  const res = await fetch(`https://www.orgo.ai/api/computers/${CID}/bash`, {
    method: "POST",
    headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ command }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`orgo ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = await res.json();
  if (d.error) throw new Error(`orgo remote: ${d.error}`);
  return String(d.output ?? d.stdout ?? "");
}

const findings = [];
const add = (sev, area, message) => findings.push({ severity: sev, area, message });

// ── 1 · is the desktop even able to do this? Ask before spending 20 minutes. ──
const probe = await rexec(
  `cd ${QA_HOME} 2>/dev/null && node -e 'require.resolve("playwright-core")' >/dev/null 2>&1 && echo PW_OK; ` +
  `[ -s ${QA_HOME}/chrome-profile/Default/Cookies ] && echo SESSION_PRESENT || echo SESSION_MISSING`,
).catch((e) => `PROBE_FAILED ${e.message}`);

if (!probe.includes("PW_OK")) {
  add("error", "desktop", `Maya's QA home is not provisioned (${probe.trim().slice(0, 120)}) — run the build-out first`);
}

// ── mint a session instead of depending on a human-bootstrapped one ──
// The interactive sign-in page sits behind WorkOS's own Cloudflare, which shows a
// human-verification interstitial we cannot disable (it is their zone, not ours) and
// which a headless browser should not be trying to satisfy anyway. So we skip the page:
// magic-auth to the QA identity, whose inbox is API-readable by design, sealed by the
// SDK into the same cookie /auth/callback sets.
//
// Minted per run, deliberately. A long-lived cookie in a profile expires silently and
// the first anyone hears of it is a nightly report claiming the whole site is down.
const COOKIE_PATH = `${QA_HOME}/.session.json`;
let sessionOk = false;
if (!findings.some((f) => f.severity === "error")) {
  try {
    const minted = execFileSync("node", [join(HERE, "qa-agent-auth.mjs"), "mint", "--json"], {
      encoding: "utf8",
      env: { ...process.env, NODE_PATH: process.env.QA_NODE_PATH || "/opt/openbrain/a-roofers-open-brain/app/command-center/node_modules" },
    });
    const { cookie, user } = JSON.parse(minted);
    // 0600 and removed by the walker the moment it is loaded.
    await rexec(`umask 077 && cat > ${COOKIE_PATH} <<'EOF'\n${JSON.stringify({ cookie })}\nEOF\nchmod 600 ${COOKIE_PATH} && echo staged`);
    console.log(`session minted for ${user} and staged on the desktop`);
    sessionOk = true;
  } catch (e) {
    add("error", "auth", `could not mint a QA session: ${String(e).slice(0, 200)}. Not walking — a session-less walk reports every page as a sign-in wall and drowns the real findings.`);
  }
}

if (!sessionOk || findings.some((f) => f.severity === "error")) { await report(); process.exit(1); }

// ── 2 · the day's deep target, chosen here because the route tree lives here ──
const assign = JSON.parse(execFileSync("node", [join(HERE, "chaos-forensic-assign.mjs"), "--json"], { encoding: "utf8" }));
console.log(`chaos target: ${assign.route} (cycle ${assign.cycle}, ${assign.progress})`);

// ── 3 · run on the desktop, detached + polled (both passes exceed the API cap) ──
const stamp = new Date().toISOString().slice(0, 10);
const jobs = DEEP_ONLY ? [] : [{ name: "walk", cmd: `node ${QA_HOME}/orgo-site-walker.mjs`, log: `${QA_HOME}/reports/walk-${stamp}.log` }];
jobs.push({ name: "forensic", cmd: `node ${QA_HOME}/orgo-forensic-page.mjs --route ${assign.route}`, log: `${QA_HOME}/reports/forensic-${stamp}.log` });

for (const j of jobs) {
  await rexec(`cd ${QA_HOME} && rm -f ${j.log} ${j.log}.done && WALK_SESSION_COOKIE=${COOKIE_PATH} nohup sh -c 'WALK_SESSION_COOKIE=${COOKIE_PATH} ${j.cmd} > ${j.log} 2>&1; echo $? > ${j.log}.done' >/dev/null 2>&1 & echo started`);
  let code = null;
  for (let i = 0; i < 60; i++) {                       // up to ~30 min per pass
    await new Promise((r) => setTimeout(r, 30000));
    const s = (await rexec(`cat ${j.log}.done 2>/dev/null || echo RUNNING`)).trim();
    if (s !== "RUNNING" && s !== "") { code = Number(s); break; }
  }
  const tail = (await rexec(`tail -40 ${j.log} 2>/dev/null || echo "(no output)"`)).trim();
  if (code === null) add("error", j.name, `${j.name} pass did not finish within 30 minutes — killed by the orchestrator budget`);
  else if (code !== 0) add("error", j.name, `${j.name} pass exited ${code}`);
  for (const line of tail.split("\n")) {
    const m = line.match(/^\s*\[(error|warn)\]\s+(\S+):\s*(.*)$/);
    if (m) add(m[1], `${j.name}/${m[2]}`, m[3].slice(0, 300));
  }
  console.log(`${j.name}: exit=${code}\n${tail.split("\n").slice(-8).join("\n")}`);
}

// Session material does not outlive the run that minted it. Both passes have read it
// by now; the walkers deliberately leave it in place so the second pass still has one.
await rexec(`shred -u ${COOKIE_PATH} 2>/dev/null || rm -f ${COOKIE_PATH}; echo cleared`).catch(() => {});

await report();

async function report() {
  const errors = findings.filter((f) => f.severity === "error");
  const warns = findings.filter((f) => f.severity === "warn");
  console.log(`maya-qa ${new Date().toISOString()} errors=${errors.length} warnings=${warns.length}`);
  for (const f of findings) console.log(`  [${f.severity}] ${f.area}: ${f.message}`);
  const slack = (process.env.SLACK_BOT_TOKEN || "").replace(/[^\x20-\x7E]/g, "").trim();
  if (!slack || (!errors.length && !warns.length)) return;
  const lines = findings.slice(0, 20).map((f) => `• *${f.severity}* \`${f.area}\` ${f.message}`).join("\n");
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { authorization: `Bearer ${slack}`, "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel: CHANNEL, text: `*Maya nightly QA* — ${errors.length} error(s), ${warns.length} warning(s)\n${lines}` + (findings.length > 20 ? `\n_…and ${findings.length - 20} more_` : "") }),
  }).catch((e) => console.error("slack post failed:", String(e)));
}
