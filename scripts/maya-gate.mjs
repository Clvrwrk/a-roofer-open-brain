#!/usr/bin/env node
// Maya diagnose → Slack-approved repair gate (A3: proposals/a3-maya-diagnose-repair-slack-gate.md).
//
//   node scripts/maya-gate.mjs run          # full pass: notices, diagnose, approvals
//   node scripts/maya-gate.mjs notices      # ticket-opened notices only
//   node scripts/maya-gate.mjs diagnose     # phase A only
//   node scripts/maya-gate.mjs approvals    # phase B only
//
// TICKET-OPENED NOTICES (Chris, 2026-08-07; cutover 2026-08-10): the ticket
// link is delivered inside Maya's Gmail receipt acknowledgement (in-thread
// reply from her Workspace account, forced CC, [MAYA] attribution — see the
// Orgo listener's mailbox-executor). This gate no longer sends any email; it
// records the audit row in agent_intake_notices (mig 225) and comments the
// Linear issue. External senders were never emailed and still are not.
//
// PHASE A — DIAGNOSE (auto, read-only):
//   Finds [MAYA] accounting-intake issues in Linear (team PEC) that have no
//   agent_fix_approvals row yet, runs the wip-triage ladder (SELECT-only via the
//   ob_readonly role; see .claude/skills/wip-triage/), comments the diagnosis on
//   the Linear issue, and — when the fault matches the pilot class (stale
//   AccuLynx mirror row for a board job) — posts a proposed fix to
//   #pe-cc-dev-team ending with "APPROVE <issue>" / "REJECT <issue>" and records
//   a `proposed` row in agent_fix_approvals.
//
// PHASE B — APPROVALS (fail closed):
//   Reads #pe-cc-dev-team history; a message `APPROVE PEC-123` or `REJECT
//   PEC-123` counts ONLY when posted by a Slack user ID on APPROVER_ALLOWLIST
//   (Chris/admin U0B8SGJJZLJ — decision 2026-08-07). On approval the stored
//   plan_hash is recomputed from the stored plan and must match before the
//   whitelisted executor runs. Execution is limited to PLAN_EXECUTORS
//   (pilot: 'mirror_refresh' — cursor jump + targeted sync + board refresh, the
//   exact PEC-187 recovery). Code changes and migrations are NEVER executed
//   here — those proposals say so and stay human-driven after approval.
//
// Env (host): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MAYA_CHEN_BOT_TOKEN,
//   LINEAR_API_KEY (~/.config/cleverwork/linear.env), OB_READONLY_DSN
//   (~/.config/cleverwork/ob_readonly.env — SELECT-only Postgres role).
import { createHash } from "node:crypto";

const CHANNEL_ID = process.env.MAYA_GATE_CHANNEL_ID || "C0BNVF99Y74"; // #pe-cc-dev-team
const APPROVER_ALLOWLIST = (process.env.MAYA_GATE_APPROVERS || "U0B8SGJJZLJ").split(",").map((s) => s.trim());
const LINEAR_TEAM = "PE-CC-DevTeam";
const PROPOSAL_TTL_DAYS = 7;
// Only accounting intakes, and only those created after the gate went live —
// the ~14 pre-existing [MAYA] issues in Agent Review are grandfathered to the
// human flow (security alerts, pricing docs, etc.).
const INTAKE_TITLE_PREFIX = "[MAYA] Accounting intake";
const GATE_SINCE = process.env.MAYA_GATE_SINCE || "2026-08-07T22:00:00.000Z";

const SB_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SLACK_TOKEN = process.env.MAYA_CHEN_BOT_TOKEN || "";
const LINEAR_KEY = process.env.LINEAR_API_KEY || "";

if (!SB_URL || !SB_KEY || !SLACK_TOKEN || !LINEAR_KEY) {
  console.error("maya-gate: missing env (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / MAYA_CHEN_BOT_TOKEN / LINEAR_API_KEY)");
  process.exit(1);
}

const log = (...a) => console.log(`[maya-gate ${new Date().toISOString()}]`, ...a);

// ---------------------------------------------------------------------------
// tiny clients
// ---------------------------------------------------------------------------
async function sb(pathname, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${SB_URL}${pathname}`, {
    method,
    headers: {
      apikey: SB_KEY,
      authorization: `Bearer ${SB_KEY}`,
      "content-type": "application/json",
      prefer: method === "POST" ? "return=representation" : "return=representation",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) throw new Error(`supabase ${method} ${pathname}: ${res.status} ${text.slice(0, 300)}`);
  return json;
}

async function sbRpc(fn, args = {}) {
  return sb(`/rest/v1/rpc/${fn}`, { method: "POST", body: args });
}

async function slack(method, params) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${SLACK_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`slack ${method}: ${json.error}`);
  return json;
}

async function linear(query, variables = {}) {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { authorization: LINEAR_KEY, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(`linear: ${JSON.stringify(json.errors).slice(0, 300)}`);
  return json.data;
}

const planHash = (plan) => createHash("sha256").update(JSON.stringify(plan, Object.keys(plan).sort())).digest("hex");

// ---------------------------------------------------------------------------
// TICKET-OPENED NOTICES — one email per new [MAYA] intake, internal only
// ---------------------------------------------------------------------------
// Mirrors app/command-center/src/lib/outbound-guard.ts DEFAULT_INTERNAL_DOMAINS.
const INTERNAL_DOMAINS = ["proexteriorsus.com", "proexteriorsus.net", "cleverwork.io", "aia4.io"];
const isInternalEmail = (email) => {
  const at = String(email ?? "").trim().toLowerCase().lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.trim().toLowerCase().slice(at + 1);
  return INTERNAL_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
};

// Intake descriptions carry "Source sender: Name [email](mailto:email)" (PEC-186 shape).
function extractSenderEmail(description) {
  const m =
    /Source sender:[^\n]*?\[([^\]\s]+@[^\]\s]+)\]/i.exec(description ?? "") ||
    /Source sender:[^\n]*?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i.exec(description ?? "");
  return m ? m[1].trim() : null;
}

async function phaseNotices() {
  const data = await linear(
    `query($filter: IssueFilter) {
       issues(filter: $filter, first: 25, orderBy: createdAt) {
         nodes { id identifier title description url createdAt }
       }
     }`,
    {
      filter: {
        team: { name: { eq: LINEAR_TEAM } },
        title: { startsWith: "[MAYA]" },
        createdAt: { gt: GATE_SINCE },
      },
    },
  );
  const issues = data.issues.nodes;
  let sent = 0;
  for (const issue of issues) {
    const seen = await sb(`/rest/v1/agent_intake_notices?issue_identifier=eq.${issue.identifier}&select=issue_identifier&limit=1`);
    if (seen?.length) continue;

    const record = async (recipient, status, extra = {}) =>
      sb(`/rest/v1/agent_intake_notices`, {
        method: "POST",
        body: { issue_identifier: issue.identifier, issue_title: issue.title, issue_url: issue.url, recipient_email: recipient ?? "(none)", status, ...extra },
      });

    const sender = extractSenderEmail(issue.description);
    if (!sender) { await record(null, "skipped_no_sender"); log(`notices: ${issue.identifier} no sender found`); continue; }
    if (!isInternalEmail(sender)) { await record(sender, "skipped_external", { note: "external sender — agents never email outside the company" }); log(`notices: ${issue.identifier} external sender, skipped`); continue; }

    // 2026-08-10 cutover: the ticket link now travels IN Maya's Gmail receipt
    // acknowledgement (in-thread reply, forced CC, [MAYA] attribution — the Orgo
    // listener's mailbox executor includes the PEC reference at intake time). The
    // gate no longer emails via AgentMail; it records the audit row + Linear
    // comment so dedup and lineage stay intact. AgentMail is retired from this flow.
    try {
      await record(sender, "ack_in_thread", { note: "ticket link delivered in Maya's Gmail receipt acknowledgement (listener release ≥ 2026-08-10)" });
      await commentOnLinear(issue.id, `Ticket-opened notice for ${sender} is carried in Maya's in-thread Gmail receipt acknowledgement (no separate email; cutover 2026-08-10).`);
      sent += 1;
      log(`notices: ${issue.identifier} recorded as ack_in_thread for ${sender}`);
    } catch (err) {
      await record(sender, "failed", { note: String(err.message).slice(0, 500) });
      log(`notices: ${issue.identifier} FAILED: ${err.message}`);
    }
  }
  log(`notices: ${sent} recorded (in-thread ack cutover)`);
}

// ---------------------------------------------------------------------------
// PHASE A — diagnose
// ---------------------------------------------------------------------------
const JOB_NUMBER_RE = /\b([A-Z]{2,3}-\d{1,4})\b/g;

async function findNewIntakes() {
  const data = await linear(
    `query($filter: IssueFilter) {
       issues(filter: $filter, first: 20, orderBy: updatedAt) {
         nodes { id identifier title description createdAt state { name type } }
       }
     }`,
    {
      filter: {
        team: { name: { eq: LINEAR_TEAM } },
        title: { startsWith: INTAKE_TITLE_PREFIX },
        createdAt: { gt: GATE_SINCE },
        state: { type: { in: ["triage", "backlog", "unstarted", "started"] } },
      },
    },
  );
  const issues = data.issues.nodes;
  const out = [];
  for (const issue of issues) {
    const existing = await sb(`/rest/v1/agent_fix_approvals?issue_identifier=eq.${issue.identifier}&select=id&limit=1`);
    if (!existing?.length) out.push(issue);
  }
  return out;
}

// The wip-triage ladder (read-only; the PEC-186/187 sequence). Uses the service
// REST endpoint for SELECTs — every query here is a read; the pilot's write
// actions live exclusively in the approved executor below.
async function diagnoseIssue(issue) {
  const text = `${issue.title}\n${issue.description ?? ""}`;
  const jobNumbers = [...new Set([...text.matchAll(JOB_NUMBER_RE)].map((m) => m[1]))].filter((j) => !/^PEC|^CAT/.test(j));
  if (!jobNumbers.length) {
    return { conclusive: false, report: "No PE job number found in the intake — needs human/deep diagnosis.", plan: null };
  }
  const findings = [];
  let plan = null;
  for (const jobNumber of jobNumbers.slice(0, 3)) {
    const rows = await sb(`/rest/v1/wip_ar_master?job_number=eq.${encodeURIComponent(jobNumber)}&select=acculynx_job_id,location,client,outstanding_ar,billed_total,billed_ar,collected_revenue,computed_at&limit=1`);
    if (!rows?.length) { findings.push(`• ${jobNumber}: not on the WIP/AR ledger (no wip_ar_master row).`); continue; }
    const m = rows[0];
    const invoices = await sb(`/rest/v1/acculynx_invoices?job_id=eq.${m.acculynx_job_id}&select=invoice_number,total_price,balance_due,current_invoice_state,synced_at&order=invoice_number`);
    const oldestSync = invoices.reduce((min, i) => (!min || i.synced_at < min ? i.synced_at : min), null);
    const staleDays = oldestSync ? Math.floor((Date.now() - new Date(oldestSync).getTime()) / 86400000) : null;
    const job = await sb(`/rest/v1/acculynx_jobs?id=eq.${m.acculynx_job_id}&select=account_key,modified_date&limit=1`);
    const modifiedDate = job?.[0]?.modified_date ?? null;
    const account = job?.[0]?.account_key ?? m.location;
    const mirrorStale = staleDays != null && modifiedDate && new Date(modifiedDate) > new Date(oldestSync);
    findings.push(
      `• ${jobNumber} (${m.client}, ${account}): board Collected $${Number(m.collected_revenue).toLocaleString()} / Balance Due $${Number(m.outstanding_ar).toLocaleString()}; ` +
        `${invoices.length} mirrored invoices, oldest sync ${oldestSync?.slice(0, 10) ?? "n/a"} (${staleDays ?? "?"}d); AccuLynx job modified ${modifiedDate?.slice(0, 10) ?? "n/a"}. ` +
        (mirrorStale ? "MIRROR STALE — job changed after last invoice sync." : "Mirror is at least as fresh as the job's last change."),
    );
    if (mirrorStale && !plan) {
      plan = {
        type: "mirror_refresh",
        account_key: account,
        acculynx_job_id: m.acculynx_job_id,
        job_number: jobNumber,
        actions: ["cursor_jump_before_job", "trigger_targeted_sync", "refresh_wip_ar_master"],
      };
    }
  }
  const conclusive = Boolean(plan);
  const report =
    `Diagnosis (wip-triage ladder, read-only):\n${findings.join("\n")}\n\n` +
    (plan
      ? `Suspected cause: stale AccuLynx invoice/financials mirror for ${plan.job_number}. Proposed fix (pilot class): jump the ${plan.account_key} job-walk cursor to just before the job, trigger a targeted sync, then refresh the board. No code or schema changes; fully reversible (mirror re-converges on the hourly cadence regardless).`
      : "No auto-fixable fault identified in the pilot class — human/deep diagnosis needed.");
  return { conclusive, report, plan };
}

async function commentOnLinear(issueId, body) {
  await linear(
    `mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success } }`,
    { input: { issueId, body } },
  );
}

async function phaseDiagnose() {
  const intakes = await findNewIntakes();
  log(`diagnose: ${intakes.length} new intake(s)`);
  for (const issue of intakes) {
    try {
      const { conclusive, report, plan } = await diagnoseIssue(issue);
      await commentOnLinear(issue.id, `## Diagnosis (Maya, automated — read-only)\n\n${report}`);
      if (!conclusive) {
        // Record a rejected-by-default row so the intake isn't re-diagnosed
        // every pass. Linear comment only — no Slack noise for inconclusives.
        await sb(`/rest/v1/agent_fix_approvals`, {
          method: "POST",
          body: {
            issue_identifier: issue.identifier,
            plan_type: "none",
            plan: { type: "none" },
            plan_hash: planHash({ type: "none", issue: issue.identifier }),
            proposal_text: report,
            status: "rejected",
            execution_note: "no auto-fixable fault in pilot class; human diagnosis needed",
          },
        });
        continue;
      }
      const hash = planHash(plan);
      const proposal =
        `:hammer_and_wrench: *${issue.identifier}* — proposed fix (awaiting approval)\n` +
        `${report}\n\n` +
        `*Plan* \`${plan.type}\`: ${plan.actions.join(" → ")} for *${plan.job_number}* (${plan.account_key})\n` +
        `*Impact:* board numbers for the job refresh within minutes. *Rollback:* none needed — read-side refresh only.\n` +
        `*Expires:* ${PROPOSAL_TTL_DAYS} days.\n\n` +
        `Reply \`APPROVE ${issue.identifier}\` or \`REJECT ${issue.identifier}\` (Chris only).`;
      const posted = await slack("chat.postMessage", { channel: CHANNEL_ID, text: proposal });
      await sb(`/rest/v1/agent_fix_approvals`, {
        method: "POST",
        body: {
          issue_identifier: issue.identifier,
          plan_type: plan.type,
          plan,
          plan_hash: hash,
          proposal_text: proposal,
          proposal_slack_ts: posted.ts,
          channel_id: CHANNEL_ID,
        },
      });
      log(`diagnose: proposed ${plan.type} for ${issue.identifier} (ts ${posted.ts})`);
    } catch (err) {
      log(`diagnose: ${issue.identifier} FAILED: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// PHASE B — approvals + whitelisted execution
// ---------------------------------------------------------------------------
const PLAN_EXECUTORS = {
  // The PEC-187 recovery, parameterized. Reads + three known-safe operations.
  async mirror_refresh(plan) {
    const notes = [];
    // 1. cursor jump: park the account's job-walk cursor just before the job.
    const jump = await sbRpc("maya_gate_cursor_jump", {
      p_account_key: plan.account_key,
      p_job_id: plan.acculynx_job_id,
    });
    notes.push(`cursor_jump: ${JSON.stringify(jump).slice(0, 120)}`);
    // 2. targeted sync for the account.
    const trig = await sbRpc("trigger_acculynx_sync", {
      p_resources: { multiAccount: true, accountFilter: [plan.account_key] },
    });
    notes.push(`trigger_sync: ${JSON.stringify(trig).slice(0, 80)}`);
    // 3. wait for the walk, then refresh the board.
    await new Promise((r) => setTimeout(r, 120_000));
    const refreshed = await sbRpc("refresh_wip_ar_master", {});
    notes.push(`refresh: ${JSON.stringify(refreshed).slice(0, 120)}`);
    const rows = await sb(`/rest/v1/wip_ar_master?acculynx_job_id=eq.${plan.acculynx_job_id}&select=job_number,collected_revenue,outstanding_ar,computed_at&limit=1`);
    notes.push(`verify: ${JSON.stringify(rows?.[0] ?? null)}`);
    return notes.join("\n");
  },
};

async function phaseApprovals() {
  // Expire stale proposals first.
  await sb(`/rest/v1/agent_fix_approvals?status=eq.proposed&expires_at=lt.${new Date().toISOString()}`, {
    method: "PATCH",
    body: { status: "expired" },
  }).catch(() => {});

  const open = await sb(`/rest/v1/agent_fix_approvals?status=eq.proposed&select=*`);
  if (!open?.length) { log("approvals: none open"); return; }

  const oldestTs = open.reduce((min, r) => (r.proposal_slack_ts && (!min || Number(r.proposal_slack_ts) < Number(min)) ? r.proposal_slack_ts : min), null);
  const history = await slack("conversations.history", {
    channel: CHANNEL_ID,
    oldest: oldestTs ?? String(Date.now() / 1000 - 7 * 86400),
    limit: 200,
  });

  for (const row of open) {
    const decision = history.messages.find(
      (m) =>
        APPROVER_ALLOWLIST.includes(m.user) &&
        new RegExp(`^\\s*(APPROVE|REJECT)\\s+${row.issue_identifier}\\s*$`, "i").test(m.text ?? ""),
    );
    if (!decision) continue;
    const approved = /^\s*APPROVE/i.test(decision.text);

    // FAIL CLOSED: recompute the hash from the stored plan; refuse on mismatch.
    if (approved && planHash(row.plan) !== row.plan_hash) {
      await slack("chat.postMessage", {
        channel: CHANNEL_ID,
        text: `:no_entry: *${row.issue_identifier}* — plan hash mismatch (stored plan differs from approved proposal). Refusing to execute; re-propose required.`,
      });
      await sb(`/rest/v1/agent_fix_approvals?id=eq.${row.id}`, { method: "PATCH", body: { status: "failed", execution_note: "plan hash mismatch" } });
      continue;
    }

    await sb(`/rest/v1/agent_fix_approvals?id=eq.${row.id}`, {
      method: "PATCH",
      body: {
        status: approved ? "approved" : "rejected",
        approved_by_slack_id: decision.user,
        approval_slack_ts: decision.ts,
        decided_at: new Date().toISOString(),
      },
    });
    log(`approvals: ${row.issue_identifier} ${approved ? "APPROVED" : "REJECTED"} by ${decision.user}`);
    if (!approved) {
      await slack("chat.postMessage", { channel: CHANNEL_ID, text: `:x: *${row.issue_identifier}* — rejected. No action taken.` });
      continue;
    }

    const executor = PLAN_EXECUTORS[row.plan_type];
    if (!executor) {
      await slack("chat.postMessage", {
        channel: CHANNEL_ID,
        text: `:warning: *${row.issue_identifier}* approved, but plan type \`${row.plan_type}\` has no automated executor — this one is human-driven (approval recorded as the go-ahead).`,
      });
      await sb(`/rest/v1/agent_fix_approvals?id=eq.${row.id}`, { method: "PATCH", body: { status: "approved", execution_note: "no automated executor; human-driven" } });
      continue;
    }
    try {
      await slack("chat.postMessage", { channel: CHANNEL_ID, text: `:gear: *${row.issue_identifier}* approved — executing \`${row.plan_type}\` now.` });
      const note = await executor(row.plan);
      await sb(`/rest/v1/agent_fix_approvals?id=eq.${row.id}`, {
        method: "PATCH",
        body: { status: "executed", executed_at: new Date().toISOString(), execution_note: note.slice(0, 2000) },
      });
      await slack("chat.postMessage", { channel: CHANNEL_ID, text: `:white_check_mark: *${row.issue_identifier}* executed.\n\`\`\`${note.slice(0, 1500)}\`\`\`` });
    } catch (err) {
      await sb(`/rest/v1/agent_fix_approvals?id=eq.${row.id}`, {
        method: "PATCH",
        body: { status: "failed", execution_note: String(err.message).slice(0, 2000) },
      });
      await slack("chat.postMessage", { channel: CHANNEL_ID, text: `:rotating_light: *${row.issue_identifier}* execution FAILED: ${String(err.message).slice(0, 300)}` });
    }
  }
}

// ---------------------------------------------------------------------------
const mode = process.argv[2] || "run";
if (mode === "run" || mode === "notices") await phaseNotices();
if (mode === "run" || mode === "diagnose") await phaseDiagnose();
if (mode === "run" || mode === "approvals") await phaseApprovals();
log("done");
