import type { APIRoute } from "astro";
import {
  actorCanAccessDepartment,
  buildUnauthorizedResponse,
  hasPermission,
  serializeActor,
} from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv } from "@lib/runtime-env";
import {
  parseThreadMetadata,
  sanitizeRichHtml,
  setCommunicationThreadStatus,
  updateCommunicationMessageDraft,
  validateCommunicationThread,
} from "@lib/invoice-audit-communications";

export const prerender = false;

const isUuid = (v: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v ?? ""));

type CommunicationAction = "approve" | "edit" | "reject" | "delete" | "validate";

const ALLOWED_ACTIONS = new Set<CommunicationAction>(["approve", "edit", "reject", "delete", "validate"]);

async function upsertCreditMemoFromDecision(client: any, invoiceNumber: string, decision: string, who: string) {
  if (decision !== "credit-flag" && decision !== "credit-noflag") return;
  const flagged = await client
    .from("v_invoice_line_audit_current")
    .select("invoice_line_id")
    .eq("invoice_number", invoiceNumber)
    .in("decision", ["credit-flag", "credit-noflag"]);
  const ids = (flagged.data as Array<{ invoice_line_id: string }> | null)?.map((r) => r.invoice_line_id) ?? [];
  let credit = 0;
  let lineCount = 0;
  if (ids.length) {
    const lines = await client.from("v_invoice_audit_line").select("variance_ext").in("line_id", ids);
    for (const line of (lines.data as Array<{ variance_ext: number | null }> | null) ?? []) {
      const variance = Number(line.variance_ext) || 0;
      if (variance > 0) credit += variance;
      lineCount += 1;
    }
  }
  const existing = await client.from("credit_memo_requests").select("id").eq("invoice_number", invoiceNumber).maybeSingle();
  const packet = { source: "invoice-audit-communication", decision, requested_by: who, requested_at: new Date().toISOString() };
  if (existing.data) {
    await client
      .from("credit_memo_requests")
      .update({
        request_kind: "requested",
        expected_credit: Math.round(credit * 100) / 100,
        line_count: lineCount,
        packet,
        updated_at: new Date().toISOString(),
      })
      .eq("invoice_number", invoiceNumber);
    return;
  }
  await client.from("credit_memo_requests").insert({
    invoice_number: invoiceNumber,
    request_kind: "requested",
    status: "draft",
    expected_credit: Math.round(credit * 100) / 100,
    line_count: lineCount,
    assigned_to: who,
    packet,
  });
}

function isDuplicateError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("duplicate") || normalized.includes("unique") || normalized.includes("violates unique constraint");
}

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!actorCanAccessDepartment(actor, "accounting") || !hasPermission(actor, "approval.decide")) {
    return jsonApiResponse(
      {
        actor: serializeActor(actor),
        error: "forbidden",
        error_description: "This actor cannot execute accounting communication actions.",
      },
      { status: 403 },
    );
  }
  const body = await request.json().catch(() => ({}));
  const threadId = String(body.threadId ?? "").trim();
  const action = String(body.action ?? "").trim() as CommunicationAction;
  if (!isUuid(threadId) || !ALLOWED_ACTIONS.has(action)) {
    return jsonApiResponse({ error: "invalid_request", error_description: "Valid threadId and action are required." }, { status: 400 });
  }
  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  try {
    if (action === "validate") {
      const result = await validateCommunicationThread(client, actor, threadId);
      return jsonApiResponse({ ok: true, result });
    }

    if (action === "edit") {
      const channelType = body.channelType === "slack" ? "slack" : body.channelType === "email" ? "email" : null;
      const bodyHtml = String(body.bodyHtml ?? "").trim();
      const bodyText = String(body.bodyText ?? "").trim();
      if (!channelType || !bodyHtml) {
        return jsonApiResponse(
          { error: "invalid_request", error_description: "channelType and bodyHtml are required for edit." },
          { status: 400 },
        );
      }
      const result = await updateCommunicationMessageDraft(client, actor, threadId, channelType, bodyHtml, bodyText);
      return jsonApiResponse({ ok: true, result });
    }

    if (action === "reject") {
      const reasonHtml = String(body.reasonHtml ?? "").trim();
      const reasonText = String(body.reasonText ?? "").trim();
      if (!reasonHtml) {
        return jsonApiResponse({ error: "invalid_request", error_description: "Reject requires reasonHtml." }, { status: 400 });
      }
      const safeReasonHtml = sanitizeRichHtml(reasonHtml);
      const result = await setCommunicationThreadStatus(client, actor, threadId, "rejected", "reject", {
        reason_html: safeReasonHtml,
        reason_text: reasonText.trim(),
      });
      return jsonApiResponse({ ok: true, result });
    }

    if (action === "delete") {
      const result = await setCommunicationThreadStatus(client, actor, threadId, "deleted", "delete", {
        deleted_by: actor.id,
      });
      return jsonApiResponse({ ok: true, result });
    }

    const validation = await validateCommunicationThread(client, actor, threadId);
    if (validation.validationState !== "ready") {
      return jsonApiResponse(
        {
          error: "validation_failed",
          error_description: "Resolve communication validation errors before approval.",
          validation,
        },
        { status: 409 },
      );
    }

    const { data: thread, error: threadError } = await client
      .from("communication_threads")
      .select("id,trigger_action,invoice_line_id,invoice_number,item_number,metadata,subject,status")
      .eq("id", threadId)
      .single();
    if (threadError) {
      return jsonApiResponse({ error: "thread_lookup_failed", error_description: threadError.message }, { status: 500 });
    }
    if (thread.status !== "awaiting_internal_approval") {
      return jsonApiResponse(
        {
          error: "already_processed",
          error_description: `Thread status ${thread.status} cannot be approved.`,
        },
        { status: 409 },
      );
    }
    const meta = parseThreadMetadata(thread.metadata);
    const actorName = actor.displayName || actor.id || "operator";
    const { data: auditRecord, error: auditError } = await client
      .from("invoice_line_audit")
      .insert({
        communication_thread_id: threadId,
        invoice_line_id: thread.invoice_line_id,
        invoice_number: thread.invoice_number,
        item_number: thread.item_number,
        audit_status: meta.auditStatus,
        decision: thread.trigger_action,
        approved_by: actorName,
        approval_note: meta.note || "Approved from communication preview",
        source: "manual",
        decided_by: actorName,
      })
      .select("id,decided_at,audit_status,decision")
      .single();
    if (auditError) {
      if (isDuplicateError(auditError.message || "")) {
        return jsonApiResponse(
          {
            error: "already_processed",
            error_description: "This communication thread was already approved.",
          },
          { status: 409 },
        );
      }
      return jsonApiResponse({ error: "audit_write_failed", error_description: auditError.message }, { status: 500 });
    }
    try {
      await upsertCreditMemoFromDecision(client, meta.invoiceNumber, String(thread.trigger_action ?? ""), actorName);
    } catch (error) {
      return jsonApiResponse(
        {
          error: "credit_memo_sync_failed",
          error_description: error instanceof Error ? error.message : "credit memo sync failed",
        },
        { status: 500 },
      );
    }

    const statusResult = await setCommunicationThreadStatus(client, actor, threadId, "queued_for_release", "approve", {
      audit_record_id: auditRecord.id,
      validation,
    });

    const { data: messages, error: messageError } = await client
      .from("communication_messages")
      .select("id,channel_type,subject,body_html,recipients,route_id")
      .eq("thread_id", threadId);
    if (messageError) {
      return jsonApiResponse({ error: "message_lookup_failed", error_description: messageError.message }, { status: 500 });
    }

    const env = getRuntimeEnv();
    for (const message of messages ?? []) {
      const recipients = Array.isArray(message.recipients) ? message.recipients : [];
      const { data: route } = await client
        .from("communication_routes")
        .select("id,target_channel_id,target_email,target_agent")
        .eq("id", message.route_id)
        .maybeSingle();
      const routeSnapshot = {
        route_id: message.route_id,
        target_channel_id: route?.target_channel_id ?? null,
        target_email: route?.target_email ?? null,
        target_agent: route?.target_agent ?? null,
      };
      const { data: deliveryRow, error: deliveryError } = await client
        .from("communication_delivery_attempts")
        .insert({
          thread_id: threadId,
          message_id: message.id,
          channel_type: message.channel_type,
          delivery_mode: "manual_release_required",
          status: "ready_to_send",
          recipient_snapshot: recipients,
          route_snapshot: routeSnapshot,
          created_by: actorName,
        })
        .select("id")
        .single();
      if (deliveryError) {
        if (isDuplicateError(deliveryError.message || "")) {
          return jsonApiResponse({ error: "already_processed", error_description: "Delivery already queued." }, { status: 409 });
        }
        return jsonApiResponse({ error: "delivery_write_failed", error_description: deliveryError.message }, { status: 500 });
      }

      if (message.channel_type === "slack") {
        const channelId =
          route?.target_channel_id ??
          env.SLACK_ACCOUNTING_CREDIT_MEMOS_CHANNEL_ID ??
          env.SLACK_OB_CONDUCTOR_DIGEST_CHANNEL_ID ??
          null;
        await client.from("slack_mirror_events").insert({
          action_log_id: null,
          work_key: `comm:${threadId}`,
          channel_id: channelId,
          status: "queued",
          payload: {
            communication_thread_id: threadId,
            communication_delivery_id: deliveryRow.id,
            source: "invoice-audit-communication-preview",
            subject: message.subject,
            body_html: message.body_html,
            href: `/accounting/invoice-audit?thread=${threadId}`,
          },
        });
      }
    }

    await client.from("dashboard_action_log").insert({
      work_item_id: null,
      work_key: `comm:${threadId}`,
      department: "accounting",
      workflow: "invoice-audit-communication",
      action_type: "communication_approved",
      decision: "approve",
      actor_id: actor.id,
      actor_type: actor.type,
      actor_display_name: actorName,
      note: `Communication approved for invoice ${meta.invoiceNumber}`,
      payload: {
        communication_thread_id: threadId,
        audit_record_id: auditRecord.id,
        status: statusResult.status,
      },
      source_table: "communication_threads",
      source_pk: threadId,
      slack_channel_id: null,
      slack_thread_ts: null,
    });

    return jsonApiResponse({
      ok: true,
      result: {
        threadId,
        status: statusResult.status,
        validation,
        auditRecord,
      },
    });
  } catch (error) {
    return jsonApiResponse(
      {
        error: "action_failed",
        error_description: error instanceof Error ? error.message : "Communication action failed.",
      },
      { status: 500 },
    );
  }
};
