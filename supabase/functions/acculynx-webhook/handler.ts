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
 * interface documents the expected shape; it does not grant the payload any trust.
 *
 * REAL live envelope (confirmed 2026-07-02 via the wichita canary subscription, DB rows 5-7 —
 * see webhooks.md "Live envelope correction"): AccuLynx delivers a FLAT envelope
 * {event, eventId, topicName, eventDateTime, subscriptionId} — there is no top-level `topic`,
 * `jobId`, or `accountKey` field. The real topic string lives in `topicName`; the affected
 * job's GUID lives nested under `event.job.id` (present on every topic observed); there is NO
 * account identifier anywhere in the payload — the account is derived from `subscriptionId`
 * via ACCULYNX_WEBHOOK_ACCOUNT_MAP (see accountKeyForSubscription below).
 *
 * The `topic`/`jobId`/`accountKey` fields are kept as optional legacy/test-fixture aliases —
 * harmless if absent — so the sandbox-proof direct-HTTP test scenarios (Task 3, which predate
 * this real-envelope discovery) keep passing unchanged. */
export interface WebhookPayload {
  /** Legacy/test-fixture alias for the topic — the real envelope uses `topicName` instead. */
  topic?: string;
  eventId?: string;
  /** Legacy/test-fixture alias for the job id — the real envelope nests it at `event.job.id`. */
  jobId?: string;
  /** Legacy/test-fixture alias for the account — the real envelope carries no account field;
   * derive it from `subscriptionId` via accountKeyForSubscription(). */
  accountKey?: string;
  subscriptionId?: string;
  /** REAL field name AccuLynx uses for the topic string (e.g. "job_created",
   * "job.financials.approved-value_changed"). */
  topicName?: string;
  /** REAL nested envelope body — `event.job.id` carries the affected job's GUID on every
   * topic observed live. Read positionally only (T-07-08-02) — never eval'd/exec'd. */
  event?: { job?: { id?: string; [key: string]: unknown }; [key: string]: unknown };
  [key: string]: unknown;
}

export interface AuthConfig {
  /** The URL-path token segment expected (from Deno.env — ACCULYNX_WEBHOOK_TOKEN). */
  expectedToken: string;
  /** The token segment actually presented in the request URL path. */
  presentedToken: string | null;
  /** The subscriptionId AccuLynx confirmed for this consumer URL (Deno.env —
   * ACCULYNX_WEBHOOK_SUBSCRIPTION_ID). Empty/undefined = pending-subscription log-only mode:
   * the subscriptionId check is skipped (not yet known) but the token check still applies.
   * Retained as a back-compat single-subscription check (vestigial once the account map covers
   * every live subscription — see multi-subscription note below). */
  expectedSubscriptionId?: string;
  /**
   * Multi-subscription fix (2026-07-02 post-plan, 8-account rollout): the single
   * expectedSubscriptionId design assumed exactly one prod subscription (the wichita canary).
   * Once the remaining 7 accounts were subscribed, every one of their deliveries carries a
   * DIFFERENT subscriptionId that legitimately does not match expectedSubscriptionId, so
   * verifyAuth() must also accept a subscriptionId that matches ANY key of the (already-parsed)
   * ACCULYNX_WEBHOOK_ACCOUNT_MAP. Optional — an empty/undefined map degrades to the
   * single-subscription (or pending-subscription log-only) behavior unchanged.
   */
  accountMap?: Record<string, string>;
}

/**
 * subscriptionId -> account_key mapping (Task 0/live-fix decision, 2026-07-02): the real
 * envelope carries NO account identifier, so the only way to scope the enqueued pull to the
 * correct AccuLynx account is via the subscription that delivered the event. Each AccuLynx
 * subscription is created against exactly one production account (write-capability.md — the
 * subscription endpoint is per-account-keyed by Bearer key), so subscriptionId -> account_key
 * is a stable 1:1 mapping for the lifetime of that subscription.
 *
 * Chosen design: a single env var ACCULYNX_WEBHOOK_ACCOUNT_MAP holding a JSON object
 * {"<subscriptionId>": "<account_key>", ...} — simplest durable option that scales past the
 * canary's one subscription to the eventual 8-account rollout (one map entry per subscription)
 * without a schema migration or a DB round-trip on every request. Parsed once at module load
 * (index.ts) and passed in here — never re-parsed per-request.
 */
export function accountKeyForSubscription(
  subscriptionId: string | undefined,
  accountMap: Record<string, string>,
): string | null {
  if (!subscriptionId) return null;
  return accountMap[subscriptionId] ?? null;
}

/** Extracts the affected job's GUID from the REAL nested envelope (event.job.id), falling back
 * to the legacy/test-fixture flat `jobId` field. Read positionally only (T-07-08-02). */
export function extractJobId(payload: WebhookPayload): string | null {
  return payload.event?.job?.id ?? payload.jobId ?? null;
}

/** Extracts the topic string, preferring the REAL envelope's `topicName` field and falling
 * back to the legacy/test-fixture `topic` field. Read positionally only (T-07-08-02). */
export function extractTopic(payload: WebhookPayload): string {
  return payload.topicName ?? payload.topic ?? "";
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
 * Verifies the shared-secret-path mechanism (Task 0 decision; extended 2026-07-02 for the
 * 8-account rollout):
 *   1. The URL token segment must constant-time-match ACCULYNX_WEBHOOK_TOKEN.
 *   2. The payload's subscriptionId must be a KNOWN subscription — either:
 *      (a) it constant-time-matches expectedSubscriptionId (back-compat, single-subscription
 *          check — still active for the wichita canary), OR
 *      (b) it constant-time-matches ANY key of accountMap (multi-subscription — one entry per
 *          rollout account).
 *      Every key in accountMap is compared unconditionally (no early exit on first match) so
 *      that iterating the map cannot leak, via timing, which position (if any) matched —
 *      preserving the same constant-time discipline as the rest of this module. The two checks
 *      are combined with OR: subscriptionId is accepted if EITHER passes.
 *   3. When BOTH expectedSubscriptionId is empty/unset AND accountMap is empty — pending-
 *      subscription log-only mode (no prod subscription exists yet) — the subscriptionId check
 *      is skipped entirely so sandbox proof can complete before any subscriptionId is known.
 * Returns true only if every configured check passes.
 */
export function verifyAuth(cfg: AuthConfig, payload: WebhookPayload): boolean {
  if (!cfg.expectedToken) return false; // never verify against an unset/empty expected token
  if (!constantTimeEqual(cfg.presentedToken, cfg.expectedToken)) return false;

  const accountMap = cfg.accountMap ?? {};
  const mapKeys = Object.keys(accountMap);
  const hasExpectedSubscriptionId = Boolean(cfg.expectedSubscriptionId);

  if (hasExpectedSubscriptionId || mapKeys.length > 0) {
    // Compare against EVERY configured candidate unconditionally (single expectedSubscriptionId
    // plus every accountMap key) — accumulate with OR, never short-circuit/early-exit on the
    // first match, so timing cannot reveal which candidate (if any) matched.
    let subscriptionMatched = constantTimeEqual(payload.subscriptionId, cfg.expectedSubscriptionId);
    for (const key of mapKeys) {
      const keyMatched = constantTimeEqual(payload.subscriptionId, key);
      subscriptionMatched = subscriptionMatched || keyMatched;
    }
    if (!subscriptionMatched) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Topic → pull routing (D-15/D-16)
// ---------------------------------------------------------------------------

// REAL live topic strings (confirmed 2026-07-02 via the wichita canary subscription, DB rows
// 5-7) are the PRIMARY entries. The original invented dash-form names ("job-created",
// "financials-approved-value-changed", "representatives-company-assigned") are kept as
// harmless aliases — they were never observed live, but cost nothing to keep in case an
// earlier doc/integration assumed them, and the Task 3 sandbox-proof direct-HTTP fixtures use
// them. The dotted-form names below ARE the real ones, not merely an alternate spelling.
const JOB_CREATED_TOPICS = new Set(["job_created", "job-created", "job.created"]);
const FINANCIALS_TOPICS = new Set([
  "job.financials.approved-value_changed", // REAL (live-confirmed)
  "financials-approved-value-changed", // alias (never observed live)
]);
const REPRESENTATIVES_TOPICS = new Set([
  "job.representatives.company_assigned", // REAL (live-confirmed)
  "representatives-company-assigned", // alias (never observed live)
]);

/** Maps a verified event's topic to the pull action it should enqueue, and resolves the
 * affected account via subscriptionId -> accountMap (the real envelope carries no account
 * field of its own). Body fields are read positionally (topicName/topic, event.job.id/jobId,
 * subscriptionId) — never interpreted as instructions (T-07-08-02). */
export function routeTopic(payload: WebhookPayload, accountMap: Record<string, string> = {}): RouteResult {
  const topic = extractTopic(payload);
  // accountKey resolution order: (1) real envelope has none, so subscriptionId->map is
  // authoritative; (2) legacy/test-fixture `accountKey` field as a fallback so the Task 3
  // sandbox-proof direct-HTTP fixtures (fired before this map existed) keep routing correctly.
  const accountKey = accountKeyForSubscription(payload.subscriptionId, accountMap) ?? payload.accountKey ?? null;
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
 * (mig 187's partial unique index) is a replay: treated as 200-ack, no re-enqueue/re-process.
 *
 * `resolvedAccountKey` (optional) is the subscriptionId->account_key mapped value from
 * routeTopic()'s RouteResult — the real envelope carries no account field of its own, so the
 * caller resolves it once via routeTopic() and passes it through here so the logged row's
 * account_key matches the account the pull was actually scoped to. Falls back to the legacy
 * `payload.accountKey` fixture field when not provided (pre-live-fix callers/tests). */
export async function logEvent(
  sb: SbLike,
  payload: WebhookPayload,
  verified: boolean,
  enqueuedAction: EnqueuedAction,
  resolvedAccountKey?: string | null,
): Promise<LogResult> {
  const row = {
    event_id: payload.eventId ?? null,
    topic: extractTopic(payload) || "unknown",
    job_id: extractJobId(payload),
    account_key: resolvedAccountKey ?? payload.accountKey ?? null,
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
