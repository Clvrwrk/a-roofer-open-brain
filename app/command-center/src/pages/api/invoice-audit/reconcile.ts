// /api/invoice-audit/reconcile
// GET  — read-only reconciliation state from v_invoice_payment_reconciliation.
// POST — auto-confirm exported invoices that ABC AR now reports paid
//        (paid_source='abc_ar_sync'), then return the refreshed state.
//
// drift_flag (from the view):
//   ar_now_paid        exported here, but ABC AR shows paid  -> auto-reconcile
//   exported_uncleared exported > 14d, ABC AR still open     -> exception (human)
//   paid_but_ar_open   marked paid here, ABC AR not paid     -> exception (human)

import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, hasPermission, serializeActor } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { invalidateInvoiceAuditSummaryCache } from "@lib/invoice-audit";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

interface ReconRow {
  invoice_number: string;
  batch_id: string;
  ledger_status: string;
  total_due: number | null;
  processed_at: string | null;
  paid_at: string | null;
  due_date: string | null;
  abc_ar_status: string | null;
  abc_date_paid: string | null;
  drift_flag: "ar_now_paid" | "exported_uncleared" | "paid_but_ar_open" | "ok";
}

function summarize(rows: ReconRow[]) {
  const drift = rows.filter((r) => r.drift_flag !== "ok");
  return {
    counts: {
      arNowPaid: rows.filter((r) => r.drift_flag === "ar_now_paid").length,
      exportedUncleared: rows.filter((r) => r.drift_flag === "exported_uncleared").length,
      paidButArOpen: rows.filter((r) => r.drift_flag === "paid_but_ar_open").length,
    },
    exceptions: drift
      .filter((r) => r.drift_flag === "exported_uncleared" || r.drift_flag === "paid_but_ar_open")
      .map((r) => ({
        abcArStatus: r.abc_ar_status,
        batchId: r.batch_id,
        driftFlag: r.drift_flag,
        dueDate: r.due_date,
        invoiceNumber: r.invoice_number,
        ledgerStatus: r.ledger_status,
        processedAt: r.processed_at,
        totalDue: r.total_due,
      })),
  };
}

async function loadRows(client: NonNullable<ReturnType<typeof createServerSupabaseClient>["client"]>) {
  const { data, error } = await client.from("v_invoice_payment_reconciliation").select("*");
  if (error) throw new Error(error.message);
  return (data ?? []) as ReconRow[];
}

export const GET: APIRoute = async ({ locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot reconcile invoice payments." }, { status: 403 });
  }
  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  try {
    return jsonApiResponse({ ...summarize(await loadRows(client)), reconciled: 0 });
  } catch (error) {
    return jsonApiResponse({ error: "v_invoice_payment_reconciliation", error_description: error instanceof Error ? error.message : String(error) }, { status: 409 });
  }
};

export const POST: APIRoute = async ({ locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot reconcile invoice payments." }, { status: 403 });
  }
  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  let rows: ReconRow[];
  try {
    rows = await loadRows(client);
  } catch (error) {
    return jsonApiResponse({ error: "v_invoice_payment_reconciliation", error_description: error instanceof Error ? error.message : String(error) }, { status: 409 });
  }

  const toPay = rows.filter((r) => r.drift_flag === "ar_now_paid");
  const nowIso = new Date().toISOString();
  let reconciled = 0;

  if (toPay.length) {
    const invoiceNumbers = toPay.map((r) => r.invoice_number);
    // Per-invoice paid_at from ABC date_paid where present (falls back to now).
    for (const row of toPay) {
      const paidAt = row.abc_date_paid ? new Date(row.abc_date_paid).toISOString() : nowIso;
      const { error } = await client
        .from("invoice_payment_processed")
        .update({
          paid_at: paidAt,
          paid_confirmed_actor: serializeActor(actor),
          paid_confirmed_by: actor.displayName,
          paid_source: "abc_ar_sync",
          reconciled_at: nowIso,
          status: "paid",
          updated_at: nowIso,
        })
        .eq("invoice_number", row.invoice_number)
        .eq("status", "exported");
      if (error) return jsonApiResponse({ error: "invoice_payment_processed", error_description: error.message }, { status: 409 });
      reconciled += 1;
    }

    await client.from("dashboard_action_log").insert({
      action_type: "invoice_payment_reconciled",
      actor_display_name: actor.displayName,
      actor_id: actor.id,
      actor_type: actor.type,
      decision: "reconcile",
      department: "accounting",
      note: `Reconciled ${reconciled} exported invoice(s) to paid from ABC AR status.`,
      payload: { invoiceNumbers, paidSource: "abc_ar_sync" },
      source_table: "invoice_payment_processed",
      workflow: "invoice-payment-export",
    });
    invalidateInvoiceAuditSummaryCache();
    rows = await loadRows(client);
  }

  return jsonApiResponse({ ...summarize(rows), reconciled });
};
