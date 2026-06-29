import type { APIRoute } from "astro";
import * as Sentry from "@sentry/astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse, serializeActor } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { loadInvoiceAuditInvoiceDetail } from "@lib/invoice-audit";
import { logPerfMetrics, payloadBytes, serverTiming, timeAsync, type PerfMetric } from "@lib/perf";

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting")) {
    return jsonApiResponse(
      {
        actor: serializeActor(actor),
        error: "forbidden",
        error_description: "This actor cannot access invoice audit data.",
      },
      { status: 403 },
    );
  }

  const invoiceNumber = url.searchParams.get("invoiceNumber") ?? "";
  const metrics: PerfMetric[] = [];
  // Explicitly report to Sentry + return JSON (not an HTML 500) so a DB timeout/error
  // surfaces in monitoring instead of being swallowed by the client as a "network error".
  try {
    const invoice = await timeAsync("invoice_audit.api.detail", () => loadInvoiceAuditInvoiceDetail(invoiceNumber), metrics);
    if (!invoice) {
      return jsonApiResponse(
        { ok: false, error: "not_found", error_description: "Invoice not found." },
        { status: 404, headers: { "server-timing": serverTiming(metrics) } },
      );
    }
    const payload = { ok: true, invoice };
    metrics.push({ name: "invoice_audit.api.payload", durationMs: 0, description: `${payloadBytes(payload)} bytes` });
    logPerfMetrics("invoice-audit-api", metrics);
    return jsonApiResponse(payload, { headers: { "server-timing": serverTiming(metrics) } });
  } catch (error) {
    Sentry.captureException(error, { tags: { route: "invoice-audit.detail" }, extra: { invoiceNumber } });
    return jsonApiResponse(
      { ok: false, error: "detail_failed", error_description: error instanceof Error ? error.message : "Invoice detail failed to load." },
      { status: 500, headers: { "server-timing": serverTiming(metrics) } },
    );
  }
};
