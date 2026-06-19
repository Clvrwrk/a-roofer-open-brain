import type { APIRoute } from "astro";
import { buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

// Persists Estimate Audit operator edits (margin %, line qty/unit cost, add/delete
// line) into the estimate_audit_edits overlay (schema 112). The loader merges these
// on read and recomputes totals. INTERNAL — auth-gated; nothing is sent anywhere.
//
// The client sends the estimate's FULL current line set; the server diffs against
// the source view to record deletes, then replaces this estimate's overlay rows.
export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  const who = (actor as any).displayName ?? (actor as any).name ?? (actor as any).id ?? "operator";

  const body = await request.json().catch(() => ({}));
  const estimateId = String(body.estimateId ?? "").trim();
  const runId = body.runId ? String(body.runId).slice(0, 120) : null;
  if (!estimateId) return jsonApiResponse({ error: "invalid_request", error_description: "estimateId is required." }, { status: 400 });
  const lines = Array.isArray(body.lines) ? body.lines.slice(0, 500) : [];

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  const clampNum = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 100_000_000) return null;
    return Math.round(n * 100) / 100;
  };

  // Original line_ids from the source view → to record deletions.
  const { data: viewLines } = await client.from("v_estimate_audit_line").select("line_id").eq("option_id", estimateId);
  const originalIds = new Set((viewLines as any[] | null ?? []).map((r) => String(r.line_id)));
  const currentIds = new Set<string>();

  const nowIso = new Date().toISOString();
  const rows: any[] = [];
  const margin = clampNum(body.marginPct);
  if (margin != null) rows.push({ estimate_id: estimateId, run_id: runId, scope: "estimate", line_id: "", margin_pct: Math.min(margin, 99.9), edited_by: who, updated_at: nowIso });

  for (const l of lines) {
    const lineId = String(l.lineId ?? "").slice(0, 120);
    if (!lineId) continue;
    const added = lineId.startsWith("new-");
    if (!added) currentIds.add(lineId);
    rows.push({
      estimate_id: estimateId, run_id: runId, scope: "line", line_id: lineId,
      line_action: added ? "added" : "edit",
      description: added ? String(l.description ?? "").slice(0, 500) : null,
      qty: clampNum(l.qty), uom: l.uom ? String(l.uom).slice(0, 20) : null, unit_cost: clampNum(l.unitCost),
      edited_by: who, updated_at: nowIso,
    });
  }
  // Lines present in the source view but absent now → deleted.
  for (const id of originalIds) {
    if (!currentIds.has(id)) rows.push({ estimate_id: estimateId, run_id: runId, scope: "line", line_id: id, line_action: "deleted", edited_by: who, updated_at: nowIso });
  }

  // Replace this estimate's overlay (the save is the full current edit state).
  const { error: delErr } = await client.from("estimate_audit_edits").delete().eq("estimate_id", estimateId);
  if (delErr) return jsonApiResponse({ error: "write_failed", error_description: delErr.message }, { status: 500 });
  if (rows.length > 0) {
    const { error: insErr } = await client.from("estimate_audit_edits").insert(rows);
    if (insErr) return jsonApiResponse({ error: "write_failed", error_description: insErr.message }, { status: 500 });
  }

  return jsonApiResponse({ ok: true, estimateId, edits: rows.length, savedBy: who });
};
