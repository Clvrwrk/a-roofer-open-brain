// ⚠ STUB — Phase-1 scaffold. Only the job.closed → debrief path is fully wired.
// Other webhook topics and property/job resolution are marked TODO and must be
// completed before production use. See integrations/bridges/acculynx/README.md.

/**
 * AccuLynx Bridge — Deno MCP container (STUB)
 *
 * Receives AccuLynx webhook events, verifies signature, normalizes payloads
 * into brain atoms + job/property upserts via Supabase PostgREST.
 *
 * Auth: Bearer token stored in ACCULYNX_API_KEY (env)
 * Signature: HMAC-SHA-256 of request body using ACCULYNX_WEBHOOK_SECRET (env)
 * AccuLynx API docs: https://apidocs.acculynx.com/reference/
 *
 * Endpoint reference: acculynx-api skill (reference/full-endpoint-reference.md,
 *   reference/webhooks.md, reference/quick-reference.md)
 *
 * DEPLOYMENT: This is an MCP container on Hetzner.
 *   Trigger the acculynx-bridge Coolify deploy hook or redeploy from Coolify.
 *
 * NO secrets appear in this file. All secrets come from environment variables.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Top-level envelope every AccuLynx webhook delivers. */
interface AccuLynxEnvelope {
  topicName: string;
  eventDateTime: string; // ISO 8601 UTC
  eventId: string;       // UUID — use for idempotency
  subscriptionId: string;
  Event: Record<string, unknown>;
}

/** The normalized job-phase change event we emit internally after processing. */
interface JobPhaseChangedEvent {
  jobId: string;
  externalRef: string;
  newPhase: JobPhase;
  previousMilestone: string;
  newMilestone: string;
  changedAt: string;
}

type JobPhase =
  | "lead"
  | "estimate"
  | "won"
  | "in_progress"
  | "punch"
  | "closed"
  | "warranty"
  | "lost";

/** Minimal shape of an atom ready for insert into public.thoughts. */
interface AtomInsert {
  content: string;
  metadata: Record<string, unknown>;
  model_card: ModelCard;
  trust_tier: "instruction" | "evidence" | "inference";
  source_type: "captured";
  cold_archive_status: "live";
  content_fingerprint: string;
  property_id?: string | null;
  job_id?: string | null;
  client_id: string;
  consent_flags: ConsentFlags;
  soft_or_hard?: "hard" | "soft" | null;
  original_capture_date?: string | null;
  eeat_signal?: EeatSignal | null;
}

interface ModelCard {
  provider: "bridge";
  model_name: string;
  model_version: string;
  captured_at: string;
}

interface ConsentFlags {
  cross_client_shareable: boolean;
  trade_restriction: string[];
  publishable_external: boolean;
}

interface EeatSignal {
  type: "Experience" | "Expertise" | "Authoritativeness" | "Trustworthiness";
  value: number;
  publishable_with_consent: boolean;
  consent_recorded_at: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADAPTER_SLUG = "acculynx-bridge";
const ADAPTER_VERSION = "1.0.0";
const BRIDGE_TIER = 1;

/** Default consent flags for AccuLynx operational atoms. */
const DEFAULT_CONSENT: ConsentFlags = {
  cross_client_shareable: true,
  trade_restriction: ["roofing"],
  publishable_external: false,
};

// ---------------------------------------------------------------------------
// Signature Verification
// ---------------------------------------------------------------------------

/**
 * Verifies the HMAC-SHA-256 signature AccuLynx sends in the
 * x-acculynx-signature header. Must be called before processing any payload.
 *
 * AccuLynx delivers the signature as a hex-encoded HMAC of the raw request
 * body using the subscription secret.
 *
 * TODO: Confirm exact header name with AccuLynx support or the webhook
 * subscription setup flow — "x-acculynx-signature" is the expected name
 * based on standard AccuLynx webhook documentation.
 */
async function verifySignature(
  req: Request,
  body: string,
  secret: string,
): Promise<boolean> {
  const signature = req.headers.get("x-acculynx-signature") ?? "";
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  const expected = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison to prevent timing attacks
  if (signature.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

// ---------------------------------------------------------------------------
// Content Fingerprint
// ---------------------------------------------------------------------------

/**
 * Produces a stable SHA-256 fingerprint for idempotent atom upserts.
 * Format: SHA-256( "acculynx:{externalId}:{fieldKey}:{canonicalValue}" )
 */
async function contentFingerprint(
  externalId: string,
  fieldKey: string,
  canonicalValue: string,
): Promise<string> {
  const raw = `acculynx:${externalId}:${fieldKey}:${canonicalValue}`;
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Model Card
// ---------------------------------------------------------------------------

function makeModelCard(): ModelCard {
  return {
    provider: "bridge",
    model_name: ADAPTER_SLUG,
    model_version: ADAPTER_VERSION,
    captured_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Milestone → job_phase Mapping
// ---------------------------------------------------------------------------

/**
 * Reads the milestone map from the config. In production this would be loaded
 * from roofer.config.yaml (via a KV or config MCP container).
 *
 * TODO: Replace with a config-service call so the map can be changed without
 * redeploying the container.
 */
const DEFAULT_MILESTONE_MAP: Record<string, JobPhase> = {
  "Lead": "lead",
  "Appointment Set": "lead",
  "Inspection Complete": "estimate",
  "Estimate Sent": "estimate",
  "Approved": "won",
  "Contract Signed": "won",
  "Material Ordered": "in_progress",
  "In Production": "in_progress",
  "Job Complete": "punch",
  "Final Inspection": "punch",
  "Invoice Sent": "closed",
  "Final Payment Received": "closed",
  "Warranty": "warranty",
  "Lost": "lost",
  "Dead": "lost",
};

function milestoneToPhase(milestoneName: string): JobPhase | null {
  // AccuLynx milestone names are case-sensitive — must match exactly.
  return DEFAULT_MILESTONE_MAP[milestoneName] ?? null;
}

// ---------------------------------------------------------------------------
// Property Resolution
// ---------------------------------------------------------------------------

/**
 * Looks up or creates a property row from an AccuLynx service address.
 * Returns the property UUID.
 *
 * TODO: Implement full address normalization (titleCase street, UPPER state,
 * strip unit suffixes) before the lookup.
 */
async function resolveProperty(
  supabase: ReturnType<typeof createClient>,
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
  },
): Promise<string | null> {
  // TODO: Normalize address fields before lookup
  const { data: existing } = await supabase
    .from("property")
    .select("id")
    .ilike("address_line1", address.line1)
    .ilike("city", address.city)
    .eq("postal_code", address.postalCode)
    .maybeSingle();

  if (existing?.id) return existing.id;

  // Property not found — create it
  const { data: created, error } = await supabase
    .from("property")
    .insert({
      address_line1: address.line1,
      address_line2: address.line2 ?? null,
      city: address.city,
      state: address.state.toUpperCase(),
      postal_code: address.postalCode,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[acculynx] property upsert error:", error.message);
    return null;
  }
  return created.id;
}

// ---------------------------------------------------------------------------
// Job Resolution
// ---------------------------------------------------------------------------

/**
 * Looks up or creates a job row. Returns the internal job UUID.
 * Updates job_phase, contract_amount, and closed_at if the job already exists
 * and these values have changed.
 */
async function resolveJob(
  supabase: ReturnType<typeof createClient>,
  params: {
    externalRef: string;
    propertyId: string | null;
    clientId: string;
    title: string;
    jobPhase: JobPhase;
    contractAmount: number | null;
    openedAt: string | null;
    closedAt: string | null;
  },
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("job")
    .select("id, job_phase")
    .eq("source_system", "acculynx")
    .eq("external_ref", params.externalRef)
    .maybeSingle();

  if (existing?.id) {
    // Update mutable fields if changed
    await supabase
      .from("job")
      .update({
        job_phase: params.jobPhase,
        contract_amount: params.contractAmount,
        closed_at: params.closedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("job")
    .insert({
      client_id: params.clientId,
      property_id: params.propertyId,
      external_ref: params.externalRef,
      source_system: "acculynx",
      title: params.title,
      job_phase: params.jobPhase,
      trade: "roofing",
      contract_amount: params.contractAmount,
      opened_at: params.openedAt,
      closed_at: params.closedAt,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[acculynx] job upsert error:", error.message);
    return null;
  }
  return created.id;
}

// ---------------------------------------------------------------------------
// Atom Upsert
// ---------------------------------------------------------------------------

/**
 * Writes an atom to public.thoughts, using content_fingerprint for idempotency.
 * Duplicate fingerprints are silently ignored (upsert on conflict do nothing).
 */
async function upsertAtom(
  supabase: ReturnType<typeof createClient>,
  atom: AtomInsert,
): Promise<void> {
  const { error } = await supabase
    .from("thoughts")
    .upsert(atom, { onConflict: "content_fingerprint", ignoreDuplicates: true });

  if (error) {
    console.error("[acculynx] atom upsert error:", error.message);
    // TODO: Write to an integration_errors queue rather than silently continuing
  }
}

// ---------------------------------------------------------------------------
// Webhook Event Handlers
// ---------------------------------------------------------------------------

/**
 * Handles job.milestone.current_changed — the primary event for job tracking
 * and debrief trigger.
 */
async function handleMilestoneChanged(
  supabase: ReturnType<typeof createClient>,
  envelope: AccuLynxEnvelope,
  clientId: string,
): Promise<void> {
  const evt = envelope.Event as {
    jobId: string;
    newMilestone: { id: string; name: string; milestoneDate?: string };
    previousMilestone?: { id: string; name: string };
    changedDateTime: string;
    changedBy?: { userId: string; firstName: string; lastName: string };
    jobLink?: string;
  };

  const newPhase = milestoneToPhase(evt.newMilestone.name);
  if (newPhase === null) {
    console.warn(
      `[acculynx] unmapped milestone: "${evt.newMilestone.name}" — add to milestone_map config`,
    );
  }

  // TODO: Fetch full job detail from AccuLynx REST to get address + title
  // GET /jobs/{jobId} → extract serviceAddress, name, contract details
  // For now, use a placeholder address resolution
  const propertyId: string | null = null; // TODO: resolve from REST call
  const jobId: string | null = null;       // TODO: resolve from REST call

  // TODO: Fetch job title and address from REST, then call resolveProperty + resolveJob

  const fingerprint = await contentFingerprint(
    evt.jobId,
    "job_phase",
    newPhase ?? evt.newMilestone.name,
  );

  const atom: AtomInsert = {
    content: `AccuLynx job moved to milestone "${evt.newMilestone.name}" on ${evt.changedDateTime}. Previous: "${evt.previousMilestone?.name ?? "unknown"}".`,
    metadata: {
      source_system: "acculynx",
      external_id: evt.jobId,
      event_type: "milestone_changed",
      bridge_tier: BRIDGE_TIER,
      acculynx_event_id: envelope.eventId,
      new_milestone: evt.newMilestone.name,
      previous_milestone: evt.previousMilestone?.name ?? null,
      new_job_phase: newPhase,
      changed_by: evt.changedBy ?? null,
      job_link: evt.jobLink ?? null,
    },
    model_card: makeModelCard(),
    trust_tier: "evidence",
    source_type: "captured",
    cold_archive_status: "live",
    content_fingerprint: fingerprint,
    property_id: propertyId,
    job_id: jobId,
    client_id: clientId,
    consent_flags: DEFAULT_CONSENT,
    soft_or_hard: "hard",
    original_capture_date: evt.changedDateTime.split("T")[0],
  };

  await upsertAtom(supabase, atom);

  // Debrief trigger: emit internal event when job reaches closed or warranty
  if (newPhase === "closed" || newPhase === "warranty") {
    // TODO: Emit job.phase_changed event to Conductor's internal channel
    // In production: write a scheduling atom and POST to Conductor's Slack webhook
    console.log(
      `[acculynx] DEBRIEF TRIGGER: job ${evt.jobId} reached phase "${newPhase}" — notify Conductor`,
    );
    // TODO: Check for existing debrief atom before triggering (idempotency)
    // TODO: POST to Conductor MCP container with { event: "job.phase_changed", jobId, newPhase }
  }
}

/**
 * Handles job_created — normalizes new job into property + job rows + atom.
 */
async function handleJobCreated(
  supabase: ReturnType<typeof createClient>,
  envelope: AccuLynxEnvelope,
  clientId: string,
): Promise<void> {
  const evt = envelope.Event as {
    jobId: string;
    companyId: string;
    createdDateTime: string;
    createdBy: { userId: string; firstName: string; lastName: string };
    jobLink?: string;
  };

  // TODO: Fetch full job detail via GET /jobs/{jobId} to get address, title, milestone
  // This stub writes a minimal atom from the webhook payload alone
  const fingerprint = await contentFingerprint(
    evt.jobId,
    "job_created",
    evt.createdDateTime,
  );

  const atom: AtomInsert = {
    content: `New AccuLynx job created on ${evt.createdDateTime} by ${evt.createdBy.firstName} ${evt.createdBy.lastName}.`,
    metadata: {
      source_system: "acculynx",
      external_id: evt.jobId,
      event_type: "job_created",
      bridge_tier: BRIDGE_TIER,
      acculynx_event_id: envelope.eventId,
      created_by: evt.createdBy,
      job_link: evt.jobLink ?? null,
    },
    model_card: makeModelCard(),
    trust_tier: "evidence",
    source_type: "captured",
    cold_archive_status: "live",
    content_fingerprint: fingerprint,
    property_id: null, // TODO: resolve after REST pull
    job_id: null,      // TODO: resolve after REST pull
    client_id: clientId,
    consent_flags: DEFAULT_CONSENT,
    soft_or_hard: "hard",
    original_capture_date: evt.createdDateTime.split("T")[0],
  };

  await upsertAtom(supabase, atom);
  // TODO: Enqueue a REST pull for this jobId to hydrate property + job rows
}

/**
 * Handles invoice_updated — promotes trust_tier to instruction when paid/approved.
 */
async function handleInvoiceUpdated(
  supabase: ReturnType<typeof createClient>,
  envelope: AccuLynxEnvelope,
  clientId: string,
): Promise<void> {
  const evt = envelope.Event as {
    jobId: string;
    invoiceId: string;
    invoiceNumber: string;
    invoiceTotal: number;
    amountPaid: number;
    balance: number;
    modifiedDateTime: string;
    modifiedBy: { userId: string; firstName: string; lastName: string };
    jobLink?: string;
    invoiceLink?: string;
  };

  // Invoices with zero balance are effectively paid — promote to instruction
  const isPaid = evt.balance === 0 && evt.amountPaid > 0;

  const fingerprint = await contentFingerprint(
    evt.invoiceId,
    "invoice_updated",
    `${evt.invoiceTotal}:${evt.amountPaid}:${evt.balance}`,
  );

  const atom: AtomInsert = {
    content: `Invoice #${evt.invoiceNumber}: total $${evt.invoiceTotal.toFixed(2)}, paid $${evt.amountPaid.toFixed(2)}, balance $${evt.balance.toFixed(2)}.${isPaid ? " Invoice fully paid." : ""}`,
    metadata: {
      source_system: "acculynx",
      external_id: evt.invoiceId,
      event_type: "invoice_updated",
      bridge_tier: BRIDGE_TIER,
      acculynx_event_id: envelope.eventId,
      job_id_external: evt.jobId,
      invoice_total: evt.invoiceTotal,
      amount_paid: evt.amountPaid,
      balance: evt.balance,
      modified_by: evt.modifiedBy,
      invoice_link: evt.invoiceLink ?? null,
    },
    model_card: makeModelCard(),
    trust_tier: isPaid ? "instruction" : "evidence",
    source_type: "captured",
    cold_archive_status: "live",
    content_fingerprint: fingerprint,
    property_id: null, // TODO: resolve from job lookup
    job_id: null,      // TODO: resolve from job lookup
    client_id: clientId,
    consent_flags: DEFAULT_CONSENT,
    soft_or_hard: "hard",
    original_capture_date: evt.modifiedDateTime.split("T")[0],
  };

  await upsertAtom(supabase, atom);
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Read body as text first (needed for signature verification)
  const body = await req.text();

  // Verify signature
  const webhookSecret = Deno.env.get("ACCULYNX_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("[acculynx] ACCULYNX_WEBHOOK_SECRET not set");
    return new Response("Internal Server Error", { status: 500 });
  }

  const signatureValid = await verifySignature(req, body, webhookSecret);
  if (!signatureValid) {
    console.warn("[acculynx] signature verification failed — rejecting request");
    return new Response("Unauthorized", { status: 401 });
  }

  // Parse envelope
  let envelope: AccuLynxEnvelope;
  try {
    envelope = JSON.parse(body) as AccuLynxEnvelope;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // Respond immediately — processing happens after response to stay within 10s timeout
  // In production: push to a Supabase queue / Deno KV task and return 200 here
  // For this stub, processing is inline (acceptable for low-volume deploys)

  // Build Supabase client (service_role key for RLS bypass)
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseKey);

  // TODO: Read clientId from config / KV; hard-coded to 'self' equivalent for now
  const clientId = Deno.env.get("BRAIN_CLIENT_ID") ?? "self";

  // Route to event-specific handler
  try {
    switch (envelope.topicName) {
      case "job.milestone.current_changed":
        await handleMilestoneChanged(supabase, envelope, clientId);
        break;
      case "job_created":
        await handleJobCreated(supabase, envelope, clientId);
        break;
      case "invoice_updated":
        await handleInvoiceUpdated(supabase, envelope, clientId);
        break;
      case "job_updated":
        // TODO: Implement handleJobUpdated — re-pull job detail, update job row + atom
        break;
      case "contact_added":
      case "contact_changed":
        // TODO: Implement handleContactChanged — upsert crew row + relational atom
        break;
      case "job.financials.approved-value_changed":
        // TODO: Implement handleFinancialsChanged — financial atom at evidence tier
        break;
      case "invoice_voided":
        // TODO: Implement handleInvoiceVoided — atom with "voided" annotation
        break;
      case "job.primary-contact_changed":
      case "job.representatives.company_assigned":
      case "job.representatives.company_changed":
        // TODO: Implement representative tracking — crew row updates
        break;
      case "job.appointments.initial_created":
      case "job.appointments.initial_updated":
        // TODO: Implement appointment atoms — scheduling context for debrief prep
        break;
      case "job.trade-type_changed":
      case "job.work-type_changed":
      case "job.category_changed":
        // TODO: Implement classification change atoms — metadata updates on job
        break;
      default:
        console.log(`[acculynx] unhandled topic: ${envelope.topicName}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[acculynx] handler error for ${envelope.topicName}:`, message);
    // TODO: Write integration_error atom to brain and notify Conductor
    // Do not return 5xx — AccuLynx would retry; instead log and return 200
  }

  return new Response(null, { status: 200 });
});

// ---------------------------------------------------------------------------
// Scheduled Pull (separate container deployment — not in this file)
// ---------------------------------------------------------------------------
//
// TODO: Create integrations/bridges/acculynx/pull.ts as a separate MCP container
// that runs on cron schedule. Responsibilities:
//
// 1. GET /jobs with date-windowed query (last 24h) + recordStartIndex pagination
//    Note: use recordStartIndex (not pageStartIndex) for jobs endpoint.
//    Note: issue separate request with assignment=unassigned to catch dead leads.
// 2. For each job: resolveProperty → resolveJob → upsertAtom
// 3. GET /supplements?jobId={id} for any job with insurance data
//    Note: GET /jobs/{id}/supplements returns 404 — use /supplements?jobId= instead.
// 4. For first-run backfill: iterate month-by-month windows from company creation date
//    to avoid hitting the 99,999 index ceiling on large datasets.
// 5. Pull company settings once on startup to validate milestone name → phase map
//    GET /company-settings/job-file-settings/workflow-milestones
