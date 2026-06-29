import type { SupabaseClient } from "@supabase/supabase-js";
import sanitizeHtml from "sanitize-html";
import type { CommandCenterActor } from "@lib/access-control";
import { dashboardLink, manageDeepLink } from "@lib/invoice-audit-links";

export type CommunicationChannel = "slack" | "email";
export type CommunicationThreadStatus =
  | "draft"
  | "awaiting_internal_approval"
  | "approved"
  | "queued_for_release"
  | "rejected"
  | "deleted";

export interface CommunicationAttachment {
  kind: "invoice_pdf" | "price_list" | "command_center";
  label: string;
  href: string;
}

export interface CommunicationRouteRow {
  id: string;
  department: string;
  workflow: string;
  trigger_action: string;
  channel_type: CommunicationChannel;
  target_agent: string | null;
  target_channel_id: string | null;
  target_email: string | null;
  priority: number;
}

export interface InvoiceAuditCommunicationInput {
  invoiceLineId: string;
  invoiceNumber: string;
  itemNumber: string;
  itemDescription: string;
  triggerAction: string;
  note: string;
  unitPrice: number;
  negotiatedPrice: number | null;
  variancePct: number | null;
  varianceExt: number | null;
}

interface CommunicationThreadRow {
  id: string;
  trigger_action: string;
  status: CommunicationThreadStatus;
  subject: string;
  metadata: Record<string, unknown>;
}

interface CommunicationMessageRow {
  id: string;
  channel_type: CommunicationChannel;
  subject: string;
  body_html: string;
  body_text: string;
  recipients: unknown;
  attachments: unknown;
  validation_state: "pending" | "ready" | "failed";
  validation_errors: unknown;
  route_id: string | null;
}

const EDITABLE_STATUSES: ReadonlySet<CommunicationThreadStatus> = new Set(["draft", "awaiting_internal_approval"]);
const TRANSITIONS: Record<CommunicationThreadStatus, ReadonlySet<CommunicationThreadStatus>> = {
  draft: new Set(["awaiting_internal_approval", "deleted"]),
  awaiting_internal_approval: new Set(["queued_for_release", "rejected", "deleted"]),
  approved: new Set(["queued_for_release"]),
  queued_for_release: new Set(),
  rejected: new Set(),
  deleted: new Set(),
};

const ACTION_LABELS = new Map<string, string>([
  ["accept-neg", "Accept - Single Negotiated Terms"],
  ["accept-tbn", 'Accept - Add to "To Be Negotiated"'],
  ["accept-30d", "Accept - 30-Day Weekly Review"],
  ["accept-nochallenge", 'Accept - "No Challenge" (always)'],
  ["credit-flag", "Credit Memo + Flag Non-Payment"],
  ["credit-noflag", "Credit Memo - Do Not Flag"],
]);

function escapeHtml(value: string) {
  return value.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] ?? c));
}

function formatMoney(value: number | null) {
  if (value == null || Number.isNaN(value)) return "No Price";
  return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPct(value: number | null) {
  if (value == null || Number.isNaN(value)) return "n/a";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function actorDisplayName(actor: CommandCenterActor) {
  return actor.displayName || actor.id || "operator";
}

function linksForInvoice(invoiceNumber: string): CommunicationAttachment[] {
  // Outbound messages must link to login-safe dashboard pages, never raw gated
  // /api/* routes (those return a JSON 401 instead of redirecting to WorkOS
  // login — the "links 401 when clicked from Slack" bug). The Manage deep-link
  // is the primary, always-clickable action; the Invoice PDF is an absolute
  // convenience link that resolves once the recipient has a dashboard session.
  return [
    {
      kind: "command_center",
      label: "Review in Command Center",
      href: manageDeepLink(),
    },
    {
      kind: "invoice_pdf",
      label: "Invoice PDF (sign in first)",
      href: dashboardLink(`/api/invoice-audit/pdf/${encodeURIComponent(invoiceNumber)}`),
    },
  ];
}

function defaultRecipientsForRoute(route: CommunicationRouteRow): string[] {
  if (route.channel_type === "email" && route.target_email) return [route.target_email];
  if (route.channel_type === "slack" && route.target_channel_id) return [route.target_channel_id];
  return [];
}

export function deriveAuditStatus(triggerAction: string): "passed" | "disputed" {
  return triggerAction === "credit-flag" || triggerAction === "credit-noflag" ? "disputed" : "passed";
}

export function buildSubject(input: InvoiceAuditCommunicationInput) {
  const label = ACTION_LABELS.get(input.triggerAction) ?? input.triggerAction;
  return `[Invoice Audit] ${label} - Inv ${input.invoiceNumber} - Item ${input.itemNumber}`;
}

export function buildMessageBodies(input: InvoiceAuditCommunicationInput, subject: string, attachments: CommunicationAttachment[]) {
  const actionLabel = ACTION_LABELS.get(input.triggerAction) ?? input.triggerAction;
  const invoicePrice = formatMoney(input.unitPrice);
  const negotiatedPrice = formatMoney(input.negotiatedPrice);
  const variancePct = formatPct(input.variancePct);
  const varianceDollar = formatMoney(input.varianceExt);
  const linkList = attachments
    .map((entry) => `<li><a href="${escapeHtml(entry.href)}">${escapeHtml(entry.label)}</a></li>`)
    .join("");
  const bodyHtml = [
    `<p><strong>${escapeHtml(subject)}</strong></p>`,
    `<p>Action: <strong>${escapeHtml(actionLabel)}</strong></p>`,
    `<p>Invoice <strong>${escapeHtml(input.invoiceNumber)}</strong>, Item <strong>${escapeHtml(input.itemNumber)}</strong></p>`,
    `<p>${escapeHtml(input.itemDescription)}</p>`,
    `<ul>`,
    `<li>Invoice Price: ${escapeHtml(invoicePrice)}</li>`,
    `<li>Negotiated Price: ${escapeHtml(negotiatedPrice)}</li>`,
    `<li>Variance %: ${escapeHtml(variancePct)}</li>`,
    `<li>Variance $: ${escapeHtml(varianceDollar)}</li>`,
    `<li>Requested Disposition: ${escapeHtml(deriveAuditStatus(input.triggerAction))}</li>`,
    `</ul>`,
    `<p>${escapeHtml(input.note)}</p>`,
    `<p>Attachments:</p>`,
    `<ul>${linkList}</ul>`,
  ].join("");
  const bodyText = [
    subject,
    `Action: ${actionLabel}`,
    `Invoice ${input.invoiceNumber} Item ${input.itemNumber}`,
    input.itemDescription,
    `Invoice Price: ${invoicePrice}`,
    `Negotiated Price: ${negotiatedPrice}`,
    `Variance %: ${variancePct}`,
    `Variance $: ${varianceDollar}`,
    `Requested Disposition: ${deriveAuditStatus(input.triggerAction)}`,
    `Note: ${input.note}`,
    "Attachments:",
    ...attachments.map((entry) => `- ${entry.label}: ${entry.href}`),
  ].join("\n");
  return { bodyHtml, bodyText };
}

function asJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function asJsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isSafeHref(value: string) {
  return value.startsWith("/") || /^https:\/\/[^\s]+$/i.test(value);
}

export function sanitizeRichHtml(input: string) {
  const clean = sanitizeHtml(String(input ?? ""), {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "ul",
      "ol",
      "li",
      "a",
      "blockquote",
      "code",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
    },
    allowedSchemes: ["http", "https"],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          href: isSafeHref(String(attribs.href ?? "")) ? String(attribs.href) : "#",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    },
  });
  return clean.trim();
}

function assertEditableStatus(status: CommunicationThreadStatus) {
  if (!EDITABLE_STATUSES.has(status)) {
    throw new Error(`thread_locked:${status}`);
  }
}

async function resolveRoutes(
  client: SupabaseClient,
  triggerAction: string,
): Promise<Record<CommunicationChannel, CommunicationRouteRow | null>> {
  const { data, error } = await client
    .from("communication_routes")
    .select("id,department,workflow,trigger_action,channel_type,target_agent,target_channel_id,target_email,priority")
    .eq("department", "accounting")
    .eq("workflow", "invoice-audit")
    .eq("trigger_action", triggerAction)
    .eq("active", true)
    .or("valid_from.is.null,valid_from.lte.now()")
    .or("valid_to.is.null,valid_to.gte.now()")
    .order("priority", { ascending: true });
  if (error) throw new Error(`resolve_routes_failed:${error.message}`);
  const result: Record<CommunicationChannel, CommunicationRouteRow | null> = { slack: null, email: null };
  for (const row of (data ?? []) as CommunicationRouteRow[]) {
    if (!result[row.channel_type]) result[row.channel_type] = row;
  }
  return result;
}

async function validateLinks(client: SupabaseClient, invoiceNumber: string, attachments: CommunicationAttachment[]) {
  const errors: string[] = [];
  const { data: invoice, error: invoiceError } = await client
    .from("v_invoice_audit_invoice")
    .select("invoice_number")
    .eq("invoice_number", invoiceNumber)
    .limit(1)
    .maybeSingle();
  if (invoiceError || !invoice) errors.push("invoice_not_found");
  for (const attachment of attachments) {
    if (!attachment.href.startsWith("/api/") || !isSafeHref(attachment.href)) {
      errors.push(`invalid_attachment_link:${attachment.label}`);
    }
  }
  return errors;
}

function routeValidationErrors(routes: Record<CommunicationChannel, CommunicationRouteRow | null>) {
  const errors: string[] = [];
  const slack = routes.slack;
  const email = routes.email;
  if (!slack) errors.push("missing_route:slack");
  if (!email) errors.push("missing_route:email");
  if (slack && !slack.target_channel_id) errors.push("invalid_route_target:slack");
  if (email && !email.target_email) errors.push("invalid_route_target:email");
  return errors;
}

async function writeEvent(
  client: SupabaseClient,
  threadId: string,
  actor: CommandCenterActor,
  eventType: string,
  action: string | null,
  beforeState: Record<string, unknown>,
  afterState: Record<string, unknown>,
  payload: Record<string, unknown>,
) {
  const insertPayload = {
    thread_id: threadId,
    actor_id: actor.id,
    actor_type: actor.type,
    actor_display_name: actorDisplayName(actor),
    event_type: eventType,
    action,
    before_state: beforeState,
    after_state: afterState,
    payload,
  };
  const { data, error } = await client
    .from("communication_events")
    .insert(insertPayload)
    .select("id")
    .single();
  if (error) throw new Error(`event_write_failed:${error.message}`);
  return data.id as string;
}

export async function upsertInvoiceAuditCommunicationPreview(
  client: SupabaseClient,
  actor: CommandCenterActor,
  input: InvoiceAuditCommunicationInput,
) {
  const attachments = linksForInvoice(input.invoiceNumber);
  const subject = buildSubject(input);
  const routes = await resolveRoutes(client, input.triggerAction);
  const validationErrors = await validateLinks(client, input.invoiceNumber, attachments);
  validationErrors.push(...routeValidationErrors(routes));
  const validationState = validationErrors.length ? "failed" : "ready";
  const metadata = {
    audit_status: deriveAuditStatus(input.triggerAction),
    note: input.note,
    invoice_line_id: input.invoiceLineId,
    invoice_number: input.invoiceNumber,
    item_number: input.itemNumber,
    variance_pct: input.variancePct,
    variance_ext: input.varianceExt,
  };

  const { data: existing, error: existingError } = await client
    .from("communication_threads")
    .select("id,trigger_action,status,subject,metadata")
    .eq("invoice_line_id", input.invoiceLineId)
    .eq("trigger_action", input.triggerAction)
    .neq("status", "deleted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(`thread_lookup_failed:${existingError.message}`);

  let thread: CommunicationThreadRow;
  if (existing) {
    assertEditableStatus(existing.status);
    const before = { status: existing.status, subject: existing.subject, metadata: existing.metadata };
    const { data: updated, error: updateError } = await client
      .from("communication_threads")
      .update({
        status: "awaiting_internal_approval",
        subject,
        metadata,
        updated_by: actorDisplayName(actor),
      })
      .eq("id", existing.id)
      .select("id,trigger_action,status,subject,metadata")
      .single();
    if (updateError) throw new Error(`thread_update_failed:${updateError.message}`);
    thread = updated as CommunicationThreadRow;
    const eventId = await writeEvent(
      client,
      thread.id,
      actor,
      "communication.preview.updated",
      "preview",
      before,
      { status: thread.status, subject: thread.subject, metadata: thread.metadata },
      { validation_errors: validationErrors, validation_state: validationState },
    );
    await client.from("communication_threads").update({ last_event_id: eventId }).eq("id", thread.id);
  } else {
    const { data: created, error: createError } = await client
      .from("communication_threads")
      .insert({
        department: "accounting",
        workflow: "invoice-audit",
        source_table: "invoice_line_audit",
        source_pk: input.invoiceLineId,
        invoice_number: input.invoiceNumber,
        invoice_line_id: input.invoiceLineId,
        item_number: input.itemNumber,
        trigger_action: input.triggerAction,
        status: "awaiting_internal_approval",
        subject,
        owner_actor_id: actor.id,
        metadata,
        created_by: actorDisplayName(actor),
        updated_by: actorDisplayName(actor),
      })
      .select("id,trigger_action,status,subject,metadata")
      .single();
    if (createError) throw new Error(`thread_create_failed:${createError.message}`);
    thread = created as CommunicationThreadRow;
    const eventId = await writeEvent(
      client,
      thread.id,
      actor,
      "communication.preview.created",
      "preview",
      {},
      { status: thread.status, subject: thread.subject, metadata: thread.metadata },
      { validation_errors: validationErrors, validation_state: validationState },
    );
    await client.from("communication_threads").update({ last_event_id: eventId }).eq("id", thread.id);
  }

  const { bodyHtml, bodyText } = buildMessageBodies(input, subject, attachments);
  for (const channel of ["slack", "email"] as const) {
    const route = routes[channel];
    const recipients = defaultRecipientsForRoute(
      route ?? {
        id: "",
        department: "accounting",
        workflow: "invoice-audit",
        trigger_action: input.triggerAction,
        channel_type: channel,
        target_agent: null,
        target_channel_id: null,
        target_email: null,
        priority: 100,
      },
    );
    if (channel === "slack" && !recipients.length) validationErrors.push("missing_recipient:slack");
    if (channel === "email" && !recipients.length) validationErrors.push("missing_recipient:email");
    const { data: existingMessage, error: lookupError } = await client
      .from("communication_messages")
      .select("id")
      .eq("thread_id", thread.id)
      .eq("channel_type", channel)
      .maybeSingle();
    if (lookupError) throw new Error(`message_lookup_failed:${lookupError.message}`);
    const payload = {
      route_id: route?.id ?? null,
      subject,
      body_html: bodyHtml,
      body_text: bodyText,
      recipients,
      attachments,
      validation_state: validationState,
      validation_errors: validationErrors,
      edited_by: actorDisplayName(actor),
      edited_at: new Date().toISOString(),
    };
    if (existingMessage) {
      const { error: msgUpdateError } = await client.from("communication_messages").update(payload).eq("id", existingMessage.id);
      if (msgUpdateError) throw new Error(`message_update_failed:${msgUpdateError.message}`);
    } else {
      const { error: msgCreateError } = await client.from("communication_messages").insert({ thread_id: thread.id, channel_type: channel, ...payload });
      if (msgCreateError) throw new Error(`message_create_failed:${msgCreateError.message}`);
    }
  }

  const { data: messages, error: msgReadError } = await client
    .from("communication_messages")
    .select(
      "id,channel_type,subject,body_html,body_text,recipients,attachments,validation_state,validation_errors,route_id",
    )
    .eq("thread_id", thread.id)
    .order("channel_type", { ascending: true });
  if (msgReadError) throw new Error(`message_read_failed:${msgReadError.message}`);

  return {
    threadId: thread.id,
    status: thread.status,
    subject: thread.subject,
    validationState,
    validationErrors,
    messages: (messages ?? []) as CommunicationMessageRow[],
  };
}

export async function updateCommunicationMessageDraft(
  client: SupabaseClient,
  actor: CommandCenterActor,
  threadId: string,
  channelType: CommunicationChannel,
  bodyHtml: string,
  bodyText: string,
) {
  const { data: beforeMessage, error: beforeError } = await client
    .from("communication_messages")
    .select("id,subject,body_html,body_text,validation_state")
    .eq("thread_id", threadId)
    .eq("channel_type", channelType)
    .maybeSingle();
  if (beforeError) throw new Error(`message_lookup_failed:${beforeError.message}`);
  if (!beforeMessage) throw new Error("message_not_found");
  const { data: thread, error: threadError } = await client
    .from("communication_threads")
    .select("status")
    .eq("id", threadId)
    .maybeSingle();
  if (threadError) throw new Error(`thread_lookup_failed:${threadError.message}`);
  if (!thread?.status) throw new Error("thread_not_found");
  assertEditableStatus(thread.status as CommunicationThreadStatus);

  const safeHtml = sanitizeRichHtml(bodyHtml);
  const safeText = bodyText.replace(/\s+/g, " ").trim();

  const { data: updated, error: updateError } = await client
    .from("communication_messages")
    .update({
      subject: beforeMessage.subject,
      body_html: safeHtml,
      body_text: safeText || beforeMessage.subject,
      edited_by: actorDisplayName(actor),
      edited_at: new Date().toISOString(),
      validation_state: "pending",
      validation_errors: [],
    })
    .eq("id", beforeMessage.id)
    .select("id,subject,body_html,body_text,validation_state")
    .single();
  if (updateError) throw new Error(`message_update_failed:${updateError.message}`);

  const eventId = await writeEvent(
    client,
    threadId,
    actor,
    "communication.message.edited",
    "edit",
    { message: beforeMessage },
    { message: updated },
    { channel_type: channelType },
  );
  await client.from("communication_threads").update({ last_event_id: eventId, updated_by: actorDisplayName(actor) }).eq("id", threadId);

  return updated;
}

export async function validateCommunicationThread(client: SupabaseClient, actor: CommandCenterActor, threadId: string) {
  const { data: thread, error: threadError } = await client
    .from("communication_threads")
    .select("id,invoice_number,trigger_action,status")
    .eq("id", threadId)
    .maybeSingle();
  if (threadError) throw new Error(`thread_lookup_failed:${threadError.message}`);
  if (!thread) throw new Error("thread_not_found");
  const { data: messages, error: msgError } = await client
    .from("communication_messages")
    .select("id,channel_type,attachments,recipients")
    .eq("thread_id", threadId);
  if (msgError) throw new Error(`messages_lookup_failed:${msgError.message}`);
  const routes = await resolveRoutes(client, thread.trigger_action as string);
  const attachmentCandidates = (messages ?? []).flatMap((entry) => asJsonArray(entry.attachments) as CommunicationAttachment[]);
  const errors = await validateLinks(client, String(thread.invoice_number ?? ""), attachmentCandidates);
  errors.push(...routeValidationErrors(routes));
  for (const msg of messages ?? []) {
    const recipients = asJsonArray((msg as any).recipients).map((item) => String(item));
    if (msg.channel_type === "slack" && recipients.length === 0) errors.push("missing_recipient:slack");
    if (msg.channel_type === "email" && recipients.length === 0) errors.push("missing_recipient:email");
  }
  const validationState = errors.length ? "failed" : "ready";
  const messageIds = (messages ?? []).map((entry) => entry.id);
  if (messageIds.length) {
    const { error: msgUpdateError } = await client
      .from("communication_messages")
      .update({ validation_state: validationState, validation_errors: errors })
      .in("id", messageIds);
    if (msgUpdateError) throw new Error(`validation_update_failed:${msgUpdateError.message}`);
  }
  const eventId = await writeEvent(
    client,
    threadId,
    actor,
    "communication.validation.completed",
    "validate",
    { status: thread.status },
    { status: thread.status, validation_state: validationState },
    { validation_errors: errors },
  );
  await client.from("communication_threads").update({ last_event_id: eventId, updated_by: actorDisplayName(actor) }).eq("id", threadId);
  return { validationState, validationErrors: errors };
}

export async function setCommunicationThreadStatus(
  client: SupabaseClient,
  actor: CommandCenterActor,
  threadId: string,
  nextStatus: CommunicationThreadStatus,
  action: string,
  payload: Record<string, unknown>,
) {
  const { data: before, error: beforeError } = await client
    .from("communication_threads")
    .select("id,status,subject,metadata")
    .eq("id", threadId)
    .single();
  if (beforeError) throw new Error(`thread_lookup_failed:${beforeError.message}`);
  const allowed = TRANSITIONS[before.status as CommunicationThreadStatus] ?? new Set<CommunicationThreadStatus>();
  if (!allowed.has(nextStatus)) {
    throw new Error(`invalid_transition:${before.status}->${nextStatus}`);
  }
  const { data: after, error: updateError } = await client
    .from("communication_threads")
    .update({ status: nextStatus, updated_by: actorDisplayName(actor) })
    .eq("id", threadId)
    .select("id,status,subject,metadata")
    .single();
  if (updateError) throw new Error(`thread_status_failed:${updateError.message}`);
  const eventId = await writeEvent(
    client,
    threadId,
    actor,
    "communication.status.changed",
    action,
    { status: before.status, subject: before.subject, metadata: before.metadata },
    { status: after.status, subject: after.subject, metadata: after.metadata },
    payload,
  );
  await client.from("communication_threads").update({ last_event_id: eventId }).eq("id", threadId);
  return after as CommunicationThreadRow;
}

export function parseThreadMetadata(metadata: unknown) {
  const parsed = asJsonObject(metadata);
  const auditStatus = parsed.audit_status === "disputed" ? "disputed" : "passed";
  return {
    auditStatus,
    note: String(parsed.note ?? ""),
    invoiceNumber: String(parsed.invoice_number ?? ""),
    itemNumber: String(parsed.item_number ?? ""),
  };
}
