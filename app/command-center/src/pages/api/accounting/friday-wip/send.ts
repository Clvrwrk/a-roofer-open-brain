import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { loadFridayWipBoard } from "@lib/friday-wip";
import { assertAgentSendAllowed, classifyRecipients } from "@lib/outbound-guard";
import { getRuntimeEnv } from "@lib/runtime-env";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { WIP_PACK_BUCKET } from "./pack";

export const prerender = false;

// One-button "Maya emails the Friday WIP/AR pack" (docs/85).
//
// Sends FROM Maya Chen's AgentMail service inbox TO the configured INTERNAL
// recipients (Lucinda / Chandler / Tabitha / Chris), who forward externally
// as needed. Recipients come from FRIDAY_WIP_RECIPIENTS (comma-separated) and
// every address must pass the outbound guard — an agent send to an external
// domain is refused in code (outbound-guard.ts, first-deployment rule).
//
// The email carries the board summary as HTML plus a 7-day signed link to the
// latest Thursday pack xlsx. Nothing is attached inline — the link keeps the
// send light and the artifact single-sourced.

const AGENTMAIL_API_BASE = "https://api.agentmail.to/v0";
const DEFAULT_SENDER_INBOX = "ob-accounting@agentmail.proexteriorsus.net";

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export const POST: APIRoute = async ({ locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting")) {
    return jsonApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const env = getRuntimeEnv();
  const apiKey = env.AGENTMAIL_API_KEY?.trim();
  if (!apiKey) {
    return jsonApiResponse(
      { error: "agentmail_unconfigured", error_description: "AGENTMAIL_API_KEY is not set on this deployment." },
      { status: 503 },
    );
  }

  const recipients = String(env.FRIDAY_WIP_RECIPIENTS ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  if (recipients.length === 0) {
    return jsonApiResponse(
      {
        error: "no_recipients",
        error_description:
          "FRIDAY_WIP_RECIPIENTS is empty. Set it to the comma-separated internal addresses for Lucinda, Chandler, Tabitha, and Chris.",
      },
      { status: 400 },
    );
  }
  // Code-enforced: agents never email outside the company. Humans forward.
  try {
    assertAgentSendAllowed(recipients);
  } catch (err) {
    const { external } = classifyRecipients(recipients);
    return jsonApiResponse(
      {
        error: "external_recipients_blocked",
        error_description: err instanceof Error ? err.message : "External recipients blocked.",
        external,
      },
      { status: 400 },
    );
  }

  const board = await loadFridayWipBoard();
  if (board.status !== "live") {
    return jsonApiResponse({ error: "board_unavailable", error_description: board.error ?? "board not live" }, { status: 503 });
  }

  // Signed pack link (7 days) if a pack exists; the email still sends without one.
  let packLink: string | null = null;
  let packName: string | null = null;
  const { client } = createServerSupabaseClient();
  if (client) {
    const { data: files } = await client.storage.from(WIP_PACK_BUCKET).list("", {
      limit: 100,
      sortBy: { column: "name", order: "desc" },
    });
    const latest = (files ?? []).find((f) => f.name.endsWith(".xlsx"));
    if (latest) {
      const { data: signed } = await client.storage
        .from(WIP_PACK_BUCKET)
        .createSignedUrl(latest.name, 7 * 86_400, { download: latest.name });
      if (signed?.signedUrl) {
        packLink = signed.signedUrl;
        packName = latest.name;
      }
    }
  }

  const k = board.kpis;
  const dateLabel = new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date());
  const groupRows = board.groups
    .map(
      (g) =>
        `<tr><td style="padding:4px 12px 4px 0">${g.location}</td>` +
        `<td style="padding:4px 12px 4px 0;text-align:right">${g.jobs.length}</td>` +
        `<td style="padding:4px 12px 4px 0;text-align:right">${money(g.totalBilledAr)}</td>` +
        `<td style="padding:4px 0;text-align:right">${money(g.totalUnbilled)}</td></tr>`,
    )
    .join("");

  const html = `
<p>Team,</p>
<p>Here is the Friday WIP/AR position as of <strong>${dateLabel}</strong>. The live board is at
<a href="https://cc.proexteriorsus.net/accounting/friday-wip">cc.proexteriorsus.net/accounting/friday-wip</a>.</p>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
  <tr><td style="padding:4px 12px 4px 0"><strong>Billed AR (the receivable)</strong></td><td style="text-align:right">${money(k.billedAr)}</td></tr>
  <tr><td style="padding:4px 12px 4px 0">Unbilled contract (backlog, not AR)</td><td style="text-align:right">${money(k.unbilled)}</td></tr>
  <tr><td style="padding:4px 12px 4px 0">Total job balance</td><td style="text-align:right">${money(k.totalBalance)}</td></tr>
  <tr><td style="padding:4px 12px 4px 0">Critical AR — Tier 1 (delivered, invoiced, unpaid)</td><td style="text-align:right">${money(k.criticalArTier1)}</td></tr>
  <tr><td style="padding:4px 12px 4px 0">Tier 2 — delivered, never invoiced</td><td style="text-align:right">${money(k.tier2NeverInvoiced)}</td></tr>
  <tr><td style="padding:4px 12px 4px 0">Expected cash — wk1 / wk2 / wk3</td><td style="text-align:right">${money(k.week1)} / ${money(k.week2)} / ${money(k.week3)}</td></tr>
  <tr><td style="padding:4px 12px 4px 0">Billed AR with no expected date</td><td style="text-align:right">${money(k.billedArNoDate)}</td></tr>
</table>
<p style="font-family:sans-serif;font-size:14px"><strong>By location</strong> (jobs · billed AR · unbilled):</p>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">${groupRows}</table>
${packLink ? `<p><a href="${packLink}">Download the full Excel pack (${packName})</a> — link valid 7 days.</p>` : "<p>(No Thursday Excel pack has been published yet — the live board link above carries the same numbers.)</p>"}
<p>Forward to outside parties as appropriate — this copy went only to the internal distribution.</p>
<p>— Maya Chen · Open Brain Accounting</p>`;

  const inbox = String(env.FRIDAY_WIP_SENDER_INBOX ?? "").trim() || DEFAULT_SENDER_INBOX;
  const subject = `Friday WIP/AR — ${dateLabel} — Billed AR ${money(k.billedAr)}`;

  const resp = await fetch(`${AGENTMAIL_API_BASE}/inboxes/${encodeURIComponent(inbox)}/messages/send`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ to: recipients, subject, html }),
  });
  const result = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return jsonApiResponse(
      { error: "agentmail_send_failed", error_description: `AgentMail ${resp.status}`, detail: result },
      { status: 502 },
    );
  }

  // Audit trail on the board itself.
  if (client) {
    const who = (actor as any).displayName ?? (actor as any).name ?? (actor as any).id ?? "operator";
    await client.from("wip_ar_master_updates").insert({
      acculynx_job_id: "00000000-0000-0000-0000-000000000000",
      field: "email_sent",
      old_value: null,
      new_value: `to=${recipients.join(";")} subject=${subject}`,
      updated_by: who,
    });
  }

  return jsonApiResponse({ ok: true, to: recipients, subject, pack: packName });
};
