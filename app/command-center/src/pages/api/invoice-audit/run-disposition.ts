// POST /api/invoice-audit/run-disposition
// Executes Alex's daily variance-audit pass (docs/57 §1 `morning_abc_sync`) through the
// tested engine of record — lib/invoice-audit-disposition.ts `disposeInvoice`. This is the
// durable home for what previously ran as one-off backfill scripts (source='backfill').
//
// Per the engine contract: auto decisions are WRITTEN to the append-only invoice_line_audit
// history (same shape as the mark endpoint); `gate-negotiated` lines are intentionally NOT
// written — leaving them pending IS the human gate that keeps the invoice out of the
// to-be-paid / register-export set.
//
// Body: { dryRun?: boolean, office?: string, maxInvoices?: number }
//   dryRun       — compute + return the full plan, write nothing (default false)
//   office       — restrict to one PE office (staged-rollout gate)
//   maxInvoices  — hard cap per run (default 500)
//
// Human-gated (approval.decide): the pass applies payment-relevant decisions, so a human
// (or the local operator in dev) triggers it. Agents draft; humans decide (access-control).

import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, hasPermission } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { invalidateInvoiceAuditSummaryCache, loadInvoiceAuditSummary } from "@lib/invoice-audit";
import { type BenchmarkSource, type DispositionLine, disposeInvoice } from "@lib/invoice-audit-disposition";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

const PAGE = 1000; // PostgREST hard cap — every read paginates (docs/42 playbook 3/11)
const IN_CHUNK = 40; // .in() URL-length safety (docs/42 playbook 9)

async function fetchAllRows(query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as any[];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse({ error: "forbidden", error_description: "This actor cannot run the disposition pass." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const dryRun = Boolean(body.dryRun);
  const officeFilter = String(body.office ?? "").trim();
  const maxInvoices = Math.min(Number(body.maxInvoices) || 500, 2000);

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  // Scope = the processing set the dashboard shows: open, unpaid, non-credit-memo.
  // Transferred (S/W) invoices are excluded — their lines auto-approve via the transfer
  // flow, not this pass. Only invoices with pending auditable lines need work.
  const data = await loadInvoiceAuditSummary(undefined, { force: true });
  const scoped = data.offices
    .filter((o) => !officeFilter || o.office === officeFilter)
    .flatMap((o) => o.branches.flatMap((b) => b.invoices))
    .filter((inv) => !inv.paid && !inv.isCreditMemo && !inv.transferred && inv.pendingLines > 0)
    .slice(0, maxInvoices);

  if (!scoped.length) {
    return jsonApiResponse({ ok: true, dryRun, invoicesConsidered: 0, written: 0, gated: 0, summary: {}, note: "No invoices with pending auditable lines in scope." });
  }

  const invoiceNumbers = scoped.map((inv) => inv.invoiceNumber);

  // Line facts for the scoped invoices: identity/category, cascade benchmark, current decision.
  const lineRows: any[] = [];
  const cascadeRows: any[] = [];
  const currentRows: any[] = [];
  for (const invs of chunk(invoiceNumbers, IN_CHUNK)) {
    lineRows.push(...await fetchAllRows((from, to) => client.from("v_invoice_audit_line").select("invoice_number,line_id,is_auditable,category_key").in("invoice_number", invs).range(from, to)));
    cascadeRows.push(...await fetchAllRows((from, to) => client.from("v_invoice_audit_line_cascade").select("invoice_number,line_id,benchmark_source,variance_pct,variance_ext").in("invoice_number", invs).range(from, to)));
    currentRows.push(...await fetchAllRows((from, to) => client.from("v_invoice_line_audit_current").select("invoice_line_id,audit_status").in("invoice_number", invs).range(from, to)));
  }

  const cascadeByLine = new Map<string, any>(cascadeRows.map((r) => [String(r.line_id), r]));
  const decidedLineIds = new Set<string>(
    currentRows.filter((r) => r.audit_status === "passed" || r.audit_status === "disputed").map((r) => String(r.invoice_line_id)),
  );

  const linesByInvoice = new Map<string, { line: DispositionLine; alreadyDecided: boolean; itemNumber: string | null }[]>();
  for (const row of lineRows) {
    const invoiceNumber = String(row.invoice_number ?? "");
    const lineId = String(row.line_id ?? "");
    if (!invoiceNumber || !lineId) continue;
    const cascade = cascadeByLine.get(lineId);
    const entry = {
      alreadyDecided: decidedLineIds.has(lineId),
      itemNumber: null,
      line: {
        auditable: row.is_auditable !== false,
        benchmarkSource: (cascade?.benchmark_source ?? "none") as BenchmarkSource,
        categoryKey: String(row.category_key ?? "uncategorized"),
        lineId,
        variancePct: cascade?.variance_pct == null ? null : Number(cascade.variance_pct),
        varianceExt: cascade?.variance_ext == null ? null : Number(cascade.variance_ext),
      } satisfies DispositionLine,
    };
    const list = linesByInvoice.get(invoiceNumber) ?? [];
    list.push(entry);
    linesByInvoice.set(invoiceNumber, list);
  }

  const who = "Alex"; // SOP run attribution → agent persona (attributeAuditActor)
  const nowIso = new Date().toISOString();
  const inserts: any[] = [];
  const summary: Record<string, number> = {};
  const gatedInvoices: string[] = [];
  const actionInvoices: string[] = [];
  const creditFlaggedInvoices = new Set<string>();

  for (const inv of scoped) {
    const entries = linesByInvoice.get(inv.invoiceNumber) ?? [];
    if (!entries.length) continue;
    // Engine runs over the FULL auditable line set (per-invoice gross floor semantics);
    // rows are written only for still-pending lines (idempotent — never re-decide).
    const result = disposeInvoice(entries.map((e) => e.line));
    if (result.hasNegotiatedGate) gatedInvoices.push(inv.invoiceNumber);
    if (result.isActionInvoice) actionInvoices.push(inv.invoiceNumber);
    const byLineId = new Map(result.lines.map((l) => [l.lineId, l]));
    for (const entry of entries) {
      const decision = byLineId.get(entry.line.lineId);
      if (!decision || !entry.line.auditable || entry.alreadyDecided) continue;
      summary[decision.disposition] = (summary[decision.disposition] ?? 0) + 1;
      if (decision.humanGate) continue; // gate-negotiated: leave pending — the gate IS the hold
      if (decision.disposition === "credit-flag") creditFlaggedInvoices.add(inv.invoiceNumber);
      inserts.push({
        approval_note: decision.note.slice(0, 500),
        approved_by: who,
        audit_status: decision.disposition === "credit-flag" ? "disputed" : "passed",
        decided_by: who,
        decision: decision.disposition,
        invoice_line_id: entry.line.lineId,
        invoice_number: inv.invoiceNumber,
        source: "sop-run",
      });
    }
  }

  if (!dryRun && inserts.length) {
    for (const batch of chunk(inserts, 500)) {
      const { error } = await client.from("invoice_line_audit").insert(batch);
      if (error) return jsonApiResponse({ error: "write_failed", error_description: error.message, writtenBeforeFailure: inserts.indexOf(batch[0]) }, { status: 500 });
    }

    // Credit-memo tracking parity with the mark endpoint (best-effort, per invoice).
    for (const invoiceNumber of creditFlaggedInvoices) {
      try {
        const flagged = await client.from("v_invoice_line_audit_current").select("invoice_line_id").eq("invoice_number", invoiceNumber).in("decision", ["credit-flag", "credit-noflag"]);
        const ids = (flagged.data as any[] | null)?.map((r) => r.invoice_line_id) ?? [];
        let credit = 0;
        let lineCount = 0;
        if (ids.length) {
          const lines = await client.from("v_invoice_audit_line").select("variance_ext").in("line_id", ids);
          for (const l of (lines.data as any[] | null) ?? []) {
            const v = Number(l.variance_ext) || 0;
            if (v > 0) credit += v;
            lineCount += 1;
          }
        }
        const existing = await client.from("credit_memo_requests").select("id,status").eq("invoice_number", invoiceNumber).maybeSingle();
        const packet = { decision: "credit-flag", requested_at: nowIso, requested_by: who, source: "invoice-audit-sop-run" };
        if (existing.data) {
          await client.from("credit_memo_requests").update({ expected_credit: Math.round(credit * 100) / 100, line_count: lineCount, packet, request_kind: "requested", updated_at: nowIso }).eq("invoice_number", invoiceNumber);
        } else {
          await client.from("credit_memo_requests").insert({ assigned_to: who, expected_credit: Math.round(credit * 100) / 100, invoice_number: invoiceNumber, line_count: lineCount, packet, request_kind: "requested", status: "draft" });
        }
      } catch {
        /* tracking is best-effort; the audit rows are already recorded */
      }
    }

    await client.from("dashboard_action_log").insert({
      action_type: "invoice_disposition_run",
      actor_display_name: actor.displayName,
      actor_id: actor.id,
      actor_type: actor.type,
      decision: "sop-run",
      department: "accounting",
      note: `SOP disposition pass: ${inserts.length} line decision(s) across ${scoped.length} invoice(s); ${gatedInvoices.length} invoice(s) held at the negotiated human gate; ${actionInvoices.length} ACTION invoice(s).`,
      payload: { actionInvoices, dryRun, gatedInvoices: gatedInvoices.slice(0, 100), office: officeFilter || null, summary },
      source_table: "invoice_line_audit",
      workflow: "invoice-audit-sop-run",
    });
    invalidateInvoiceAuditSummaryCache();
  }

  return jsonApiResponse({
    actionInvoices,
    dryRun,
    gatedInvoiceCount: gatedInvoices.length,
    gatedInvoices: gatedInvoices.slice(0, 50),
    invoicesConsidered: scoped.length,
    summary,
    written: dryRun ? 0 : inserts.length,
  });
};
