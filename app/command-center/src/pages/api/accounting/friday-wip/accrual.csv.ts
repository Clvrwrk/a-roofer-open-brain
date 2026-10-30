import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

// CPA accrual snapshot CSV — wip_accrual_snapshot(p_cutoff, p_period_start).
// Billed and costs are summed over a PERIOD, defaulting to year-to-date
// (mig 259; before that it summed lifetime, which mislabelled the figure the
// CPA received). Per job, so the CPA can run percentage-of-completion earned
// revenue for the period.
//   ?cutoff=YYYY-MM-DD        period end, defaults to today
//   ?period_start=YYYY-MM-DD  period start, defaults to Jan 1 of the cutoff year
// Both are validated to strict date literals before reaching the RPC (T-07-04).
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const CSV_COLUMNS = [
  "job_number", "client", "location", "bucket",
  "contract_amount", "change_order_total", "est_total_costs",
  "billed_to_cutoff", "billed_ar_current", "costs_incurred_to_cutoff",
  "period_start", "cutoff", "acculynx_job_id",
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
  const rawStart = url.searchParams.get("period_start");
  // null lets the RPC apply its own default (Jan 1 of the cutoff year).
  const periodStart = rawStart && DATE_PATTERN.test(rawStart) ? rawStart : null;

  const { client, config } = createServerSupabaseClient();
  if (!client) {
    return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });
  }

  const { data, error } = await client.rpc("wip_accrual_snapshot", {
    p_cutoff: cutoff,
    p_period_start: periodStart,
  });
  if (error) {
    return jsonApiResponse({ error: "query_failed", error_description: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(r[c])).join(","));

  return new Response(lines.join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="wip-accrual-${periodStart ?? cutoff.slice(0, 4) + "-01-01"}-to-${cutoff}.csv"`,
      "cache-control": "no-store",
    },
  });
};
