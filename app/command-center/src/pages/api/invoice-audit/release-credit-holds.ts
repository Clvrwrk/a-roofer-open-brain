// POST /api/invoice-audit/release-credit-holds
// docs/63 Change 3 — when the credit memo for a held (do-not-pay) invoice has arrived, release
// the hold so the original becomes payable again. Matches an ingested CM to a held original by
// normalized invoice base (raw->originalInvoiceReference), then appends a 'credit-resolved'/passed
// decision on the held line(s) — clearing `held` so the invoice re-enters the payment set.
// HITL-initiated (the "Release credit-memo holds" button). Append-only, internal write only.

import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, hasPermission } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { invalidateInvoiceAuditSummaryCache, normalizeInvoiceRef } from "@lib/invoice-audit";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

export const POST: APIRoute = async ({ locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot release credit-memo holds." }, { status: 403 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  // 1. Held lines = current decision 'credit-flag' (do-not-pay).
  const { data: heldRows, error: heldErr } = await client
    .from("v_invoice_line_audit_current")
    .select("invoice_line_id,invoice_number,decision")
    .eq("decision", "credit-flag");
  if (heldErr) return jsonApiResponse({ error: "v_invoice_line_audit_current", error_description: heldErr.message }, { status: 409 });
  const held = (heldRows ?? []) as Array<{ invoice_line_id: string; invoice_number: string }>;
  if (!held.length) return jsonApiResponse({ released: [], count: 0 });

  // 2. Arrived credit memos → set of normalized original-invoice bases they credit.
  const { data: cmRows, error: cmErr } = await client
    .from("abc_invoices")
    .select("invoice_number,raw")
    .eq("is_credit_memo", true);
  if (cmErr) return jsonApiResponse({ error: "abc_invoices", error_description: cmErr.message }, { status: 409 });
  const creditedBases = new Set<string>();
  for (const cm of (cmRows ?? []) as Array<{ raw: { originalInvoiceReference?: unknown } | null }>) {
    const ref = cm.raw?.originalInvoiceReference;
    if (ref) creditedBases.add(normalizeInvoiceRef(String(ref)));
  }

  // 3. Release held lines whose original has an arrived CM: append a 'credit-resolved'/passed decision.
  const toRelease = held.filter((h) => creditedBases.has(normalizeInvoiceRef(h.invoice_number)));
  if (!toRelease.length) return jsonApiResponse({ released: [], count: 0 });

  const who = (actor as { displayName?: string; id?: string }).displayName ?? (actor as { id?: string }).id ?? "operator";
  const inserts = toRelease.map((h) => ({
    invoice_line_id: h.invoice_line_id,
    invoice_number: h.invoice_number,
    audit_status: "passed",
    decision: "credit-resolved",
    approved_by: who,
    approval_note: "Credit memo received — hold released for payment (docs/63 Change 3).",
    source: "credit-memo-reconcile",
    decided_by: who,
  }));
  const { error: insErr } = await client.from("invoice_line_audit").insert(inserts);
  if (insErr) return jsonApiResponse({ error: "write_failed", error_description: insErr.message }, { status: 500 });

  const releasedInvoices = [...new Set(toRelease.map((h) => h.invoice_number))];
  await client.from("dashboard_action_log").insert({
    action_type: "credit_hold_release",
    actor_display_name: actor.displayName,
    actor_id: actor.id,
    actor_type: actor.type,
    decision: "release",
    department: "accounting",
    note: `Released ${releasedInvoices.length} credit-memo hold(s) after matching arrived credit memos.`,
    payload: { invoiceNumbers: releasedInvoices, lineCount: toRelease.length, source: "invoice-audit" },
    source_table: "invoice_line_audit",
    workflow: "credit-memo-release",
  });

  invalidateInvoiceAuditSummaryCache();
  return jsonApiResponse({ released: releasedInvoices, count: releasedInvoices.length });
};
