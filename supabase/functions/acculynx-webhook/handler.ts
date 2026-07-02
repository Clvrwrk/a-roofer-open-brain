// acculynx-webhook — handler.ts (Phase 7, plan 07-08, D-17)
//
// Pure/injectable receiver logic for the acculynx-webhook Edge Function. Split out of
// index.ts (mirrors the acculynx-write-action / action.ts convention) so the auth-verify,
// event-log, and topic-routing behavior can be unit-tested without a live Deno.serve HTTP
// round-trip or a live DB.
//
// Threat model (07-08-PLAN.md):
//   T-07-08-01 (Spoofing) — verify authenticity BEFORE trusting the body. Task 0 decision:
//     shared-secret-path (no HMAC signature confirmed live) — URL token + subscriptionId,
//     both compared constant-time. An unverified request is logged signature_verified=false
//     and rejected 401 with NO pull enqueued.
//   T-07-08-02 (Tampering) — the verified body is treated strictly as DATA (REQ-09/D-10):
//     fields are read positionally below; nothing is eval'd/exec'd/interpreted as code.
//   T-07-08-03 (DoS) — 200 fast + enqueue only (no inline pull); event_id replay is
//     ack'd 200 with no re-enqueue (insert-conflict on the mig 187 partial unique index).
//   T-07-08-04 (Info disclosure) — payload lands in a deny-by-default RLS table (mig 187).
//
// hard rule 2: secrets are read from Deno.env only by the caller (index.ts) and passed in
// as explicit params — never a literal in this file, never logged.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal shape of the Supabase client surface this module needs (injectable for tests). */
export interface SbLike {
  from(table: string): {
    insert(row: Record<string, unknown>): {
      select(cols: string): {
        maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: { code?: string; message: string } | null }>;
      };
    };
  };
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/** The webhook payload is UNTRUSTED external input (D-10/REQ-09 boundary). Fields below are
 * read positionally by name only — never eval'd, never interpreted as instructions. This
 * interface documents the expected shape; it does not grant the payload any trust. */
export interface WebhookPayload {
  topic?: string;
  eventId?: string;
  jobId?: string;
  accountKey?: string;
  subscriptionId?: string;
  [key: string]: unknown;
}

export interface AuthConfig {
  /** The URL-path token segment expected (from Deno.env — ACCULYNX_WEBHOOK_TOKEN). */
  expectedToken: string;
  /** The token segment actually presented in the request URL path. */
  presentedToken: string | null;
  /** The subscriptionId AccuLynx confirmed for this consumer URL (Deno.env —
   * ACCULYNX_WEBHOOK_SUBSCRIPTION_ID). Empty/undefined = pending-subscription log-only mode:
   * the subscriptionId check is skipped (not yet known) but the token check still applies. */
  expectedSubscriptionId?: string;
}

export type EnqueuedAction =
  | "first_sight_full_pull"
  | "targeted_repull:financials"
  | "targeted_repull:representatives"
  | null;

export interface RouteResult {
  enqueuedAction: EnqueuedAction;
  /** account_key to scope the re-fetch to, via trigger_acculynx_sync accountFilter. */
  accountKey: string | null;
}

// ---------------------------------------------------------------------------
// Constant-time compare (T-07-08-01) — no HMAC signature confirmed live (Task 0), so the
// shared-secret-path mechanism relies on this for BOTH the URL token and the subscriptionId.
// Manual XOR-accumulate over UTF-8 bytes — avoids leaking timing via early-exit string ===.
// ---------------------------------------------------------------------------

export function constantTimeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const aBytes = new TextEncoder().encode(a ?? "");
  const bBytes = new TextEncoder().encode(b ?? "");
  // Length itself is not secret-dependent enough to matter here (token length is fixed/public
  // by convention), but we still compare over the longer length to avoid a trivial short-circuit.
  const len = Math.max(aBytes.length, bBytes.length, 1);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < len; i++) {
    const av = i < aBytes.length ? aBytes[i] : 0;
    const bv = i < bBytes.length ? bBytes[i] : 0;
    diff |= av ^ bv;
  }
  return diff === 0 && aBytes.length > 0 && bBytes.length > 0;
}

// ---------------------------------------------------------------------------
// Auth verification (T-07-08-01)
// ---------------------------------------------------------------------------

/**
 * Verifies the shared-secret-path mechanism (Task 0 decision):
 *   1. The URL token segment must constant-time-match ACCULYNX_WEBHOOK_TOKEN.
 *   2. If expectedSubscriptionId is configured (non-empty), the payload's subscriptionId
 *      must also constant-time-match it. When expectedSubscriptionId is NOT yet configured
 *      (pending-subscription log-only mode — the prod subscription doesn't exist until the
 *      human-gated Task 4), this check is skipped so sandbox proof can complete before the
 *      subscriptionId is known.
 * Returns true only if every configured check passes.
 */
export function verifyAuth(cfg: AuthConfig, payload: WebhookPayload): boolean {
  if (!cfg.expectedToken) return false; // never verify against an unset/empty expected token
  if (!constantTimeEqual(cfg.presentedToken, cfg.expectedToken)) return false;
  if (cfg.expectedSubscriptionId) {
    if (!constantTimeEqual(payload.subscriptionId, cfg.expectedSubscriptionId)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Topic → pull routing (D-15/D-16)
// ---------------------------------------------------------------------------

const JOB_CREATED_TOPICS = new Set(["job-created", "job.created"]);
const FINANCIALS_TOPICS = new Set([
  "financials-approved-value-changed",
  "job.financials.approved-value_changed",
]);
const REPRESENTATIVES_TOPICS = new Set([
  "representatives-company-assigned",
  "job.representatives.company_assigned",
]);

/** Maps a verified event's topic to the pull action it should enqueue. Body fields are read
 * positionally (topic, jobId, accountKey) — never interpreted as instructions (T-07-08-02). */
export function routeTopic(payload: WebhookPayload): RouteResult {
  const topic = payload.topic ?? "";
  const accountKey = payload.accountKey ?? null;
  if (JOB_CREATED_TOPICS.has(topic)) {
    return { enqueuedAction: "first_sight_full_pull", accountKey };
  }
  if (FINANCIALS_TOPICS.has(topic)) {
    return { enqueuedAction: "targeted_repull:financials", accountKey };
  }
  if (REPRESENTATIVES_TOPICS.has(topic)) {
    return { enqueuedAction: "targeted_repull:representatives", accountKey };
  }
  return { enqueuedAction: null, accountKey };
}

// ---------------------------------------------------------------------------
// Event log insert (audit — every request, verified or not) + replay defense
// ---------------------------------------------------------------------------

/** Postgres unique_violation SQLSTATE — used to detect a replayed event_id against the
 * mig 187 partial unique index (uq_acculynx_webhook_events_event_id_verified). */
const PG_UNIQUE_VIOLATION = "23505";

export interface LogResult {
  inserted: boolean;
  /** true when the insert failed specifically because event_id already exists among
   * verified rows — i.e. this is a REPLAY of an already-processed event, not a new one. */
  isReplay: boolean;
  row: Record<string, unknown> | null;
}

/** Inserts one acculynx_webhook_events row for every request (verified or not), per the
 * behavior contract. A verified request whose event_id collides with a prior VERIFIED row
 * (mig 187's partial unique index) is a replay: treated as 200-ack, no re-enqueue/re-process. */
export async function logEvent(
  sb: SbLike,
  payload: WebhookPayload,
  verified: boolean,
  enqueuedAction: EnqueuedAction,
): Promise<LogResult> {
  const row = {
    event_id: payload.eventId ?? null,
    topic: payload.topic ?? "unknown",
    job_id: payload.jobId ?? null,
    account_key: payload.accountKey ?? null,
    signature_verified: verified,
    payload: payload as Record<string, unknown>,
    enqueued_action: verified ? enqueuedAction : null,
    processed_at: verified && enqueuedAction ? new Date().toISOString() : null,
  };
  const { data, error } = await sb.from("acculynx_webhook_events").insert(row).select("id").maybeSingle();
  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      return { inserted: false, isReplay: true, row: null };
    }
    throw new Error(`acculynx_webhook_events insert: ${error.message}`);
  }
  return { inserted: true, isReplay: false, row: data };
}

// ---------------------------------------------------------------------------
// Pull enqueue (D-15/D-16) — never runs the full pull inline (T-07-08-03)
// ---------------------------------------------------------------------------

/** Enqueues the routed pull via the existing trigger_acculynx_sync RPC (mig 172), scoped to
 * the affected account via accountFilter so a forged/duplicated event cannot fan out beyond
 * one account (T-07-08-03). Fires-and-returns immediately — the RPC itself dispatches the
 * acculynx-sync edge function asynchronously via pg_net; this call does NOT wait for the
 * pull to complete. Returns false (no enqueue) when there is no accountKey to scope to. */
export async function enqueuePull(sb: SbLike, route: RouteResult): Promise<boolean> {
  if (!route.enqueuedAction || !route.accountKey) return false;
  const { error } = await sb.rpc("trigger_acculynx_sync", {
    p_resources: { multiAccount: true, accountFilter: [route.accountKey] },
  });
  if (error) throw new Error(`trigger_acculynx_sync rpc: ${error.message}`);
  return true;
}
