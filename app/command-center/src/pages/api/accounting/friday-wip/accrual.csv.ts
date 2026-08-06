import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

// CPA accrual snapshot CSV — wip_accrual_snapshot(p_cutoff) from mig 215.
// Billed-to-date and costs-incurred-to-date at a date cutoff, per job, so the
// CPA can run percentage-of-completion earned revenue for any period end.
// ?cutoff=YYYY-MM-DD (defaults to today). The cutoff is validated to a strict
// date literal before it reaches the RPC (T-07-04).
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const CSV_COLUMNS = [
  "job_number", "client", "location", "bucket",
  "contract_amount", "change_order_total", "est_total_costs",
  "billed_to_cutoff", "billed_ar_current", "costs_incurred_to_cutoff",
  "cutoff", "acculynx_job_id",
] as const;

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export const GET: APIRoute = async ({ url, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting")) {
    return jsonApiResponse({ error: "forbidden" }, { status: 403 });
  }

  const raw = url.searchParams.get("cutoff");
  const cutoff = raw && DATE_PATTERN.test(raw) ? raw : new Date().toISOString().slice(0, 10);

  const { client, config } = createServerSupabaseClient();
  if (!client) {
    return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });
  }

  const { data, error } = await client.rpc("wip_accrual_snapshot", { p_cutoff: cutoff });
  if (error) {
    return jsonApiResponse({ error: "query_failed", error_description: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(r[c])).join(","));

  return new Response(lines.join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="wip-accrual-${cutoff}.csv"`,
      "cache-control": "no-store",
    },
  });
};
