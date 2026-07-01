// acculynx-write-action — Edge Function entrypoint (Phase 5, plan 05-01 Task 3)
//
// The SOLE code path that writes to AccuLynx, prod or sandbox (D-02). Thin HTTP
// boundary: parses the request, enforces the D-09 edge-side target barrier BEFORE any
// key resolution or network call, resolves the AccuLynx key per-request from the
// acculynx_accounts registry (never a module-level cached key — RESEARCH Pattern 3),
// builds the request via action.ts's single buildWriteRequest (D-03 anti-drift: dryRun
// and execute share this one builder), and — on execute only — guards on an idempotency
// key before firing the rate-limited AccuLynx call.
//
// acculynx_pending_write / acculynx_write_action_log land in Wave 1 Plan 02; this plan's
// persistence calls degrade gracefully (log + continue) if those tables don't exist yet,
// so this function can be unit/type-checked and deployed ahead of that migration without
// blocking on it, while still being the sole future write path once they exist.
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  assertTarget,
  buildWriteRequest,
  computeIdempotencyKey,
  redactSample,
  type WriteLane,
} from "./action.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PACE_MS = 130; // conservative single-write pacing, mirrors write-sweep
const MAX_RETRIES = 3;
const BASE = "https://api.acculynx.com/api/v2";

const sb = createClient(SB_URL, SB_SRK, { auth: { persistSession: false } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface AccountRow {
  account_key: string;
  env_secret_name: string;
}

/** Resolve the single requested account row — NOT the full production fan-out (RESEARCH Pattern 3). */
async function loadAccount(accountKey: string): Promise<AccountRow | null> {
  const { data, error } = await sb
    .from("acculynx_accounts")
    .select("account_key, env_secret_name")
    .eq("account_key", accountKey)
    .maybeSingle();
  if (error) throw new Error(`accounts load: ${error.message}`);
  return data ?? null;
}

/** Resolve the API key fresh, per-request, from Deno.env — never a cached module-level key. */
function resolveKey(acct: AccountRow): string | undefined {
  return Deno.env.get(acct.env_secret_name);
}

/**
 * Rate-limited HTTP call — same 429/backoff/retry-after logic as acculynx-write-sweep's
 * acculynxCall, VERBATIM (Don't-Hand-Roll). Only material change: the API key is passed
 * in per-call (resolved per-request above) rather than read from a module constant.
 */
async function acculynxCall(
  apiKey: string,
  method: string,
  url: string,
  body?: unknown,
  formData?: FormData,
): Promise<{ status: number; ms: number; body: unknown; isJson: boolean }> {
  let attempt = 0;
  while (true) {
    const t0 = Date.now();
    let res: Response;
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      };
      if (!formData) headers["Content-Type"] = "application/json";
      res = await fetch(url, {
        method,
        headers,
        body: formData ?? (body ? JSON.stringify(body) : undefined),
      });
    } catch (e) {
      return { status: 0, ms: Date.now() - t0, body: { fetchError: String(e) }, isJson: false };
    }
    const ms = Date.now() - t0;
    const ct = res.headers.get("content-type") ?? "";
    const isJson = ct.includes("json");
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const ra = Number(res.headers.get("retry-after"));
      await sleep((Number.isFinite(ra) && ra > 0 ? ra : Math.pow(2, attempt)) * 1000 + Math.random() * 250);
      attempt++;
      continue;
    }
    const body_ = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");
    return { status: res.status, ms, body: body_, isJson };
  }
}

interface WriteActionInput {
  lane: WriteLane;
  accountKey: string;
  targetEnv: string;
  payload: Record<string, unknown>;
  dryRun: boolean;
  idempotencyKey?: string;
  workKey?: string;
}

/** True if an `acculynx_write_action_log` row with this idempotency key already recorded a
 * success — checked before every execute to prevent a double-fire (D-05). Returns null if the
 * table doesn't exist yet (Wave 1 Plan 02) or the lookup otherwise fails — callers must treat
 * null as "no prior success found" and proceed, since the table not existing yet cannot itself
 * block Task 3 from type-checking/deploying ahead of that migration. */
async function findPriorSuccess(idempotencyKey: string): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await sb
      .from("acculynx_write_action_log")
      .select("id, idempotency_key, status, response_body, http_status")
      .eq("idempotency_key", idempotencyKey)
      .eq("status", "success")
      .maybeSingle();
    if (error) {
      console.warn(`[acculynx-write-action] idempotency lookup skipped: ${error.message}`);
      return null;
    }
    return data ?? null;
  } catch (e) {
    console.warn(`[acculynx-write-action] idempotency lookup skipped: ${String(e)}`);
    return null;
  }
}

/** Persist the pending-write status update + the immutable audit-log row. Both tables land
 * in Wave 1 Plan 02 — persistence failures here are logged, never thrown, so this function
 * remains the sole write path today without depending on those tables existing yet. */
async function persistExecutionResult(
  input: WriteActionInput,
  idempotencyKey: string,
  built: { method: string; path: string; body?: unknown },
  result: { status: number; body: unknown },
): Promise<void> {
  const success = result.status >= 200 && result.status < 300;
  try {
    if (input.workKey) {
      const { error } = await sb
        .from("acculynx_pending_write")
        .update({
          status: success ? "executed" : "failed",
          exec_result: redactSample(result.body),
          updated_at: new Date().toISOString(),
        })
        .eq("work_key", input.workKey);
      if (error) console.warn(`[acculynx-write-action] pending-write update skipped: ${error.message}`);
    }
  } catch (e) {
    console.warn(`[acculynx-write-action] pending-write update skipped: ${String(e)}`);
  }

  try {
    const { error } = await sb.from("acculynx_write_action_log").insert({
      lane: input.lane,
      account_key: input.accountKey,
      target_env: input.targetEnv,
      idempotency_key: idempotencyKey,
      request_method: built.method,
      request_path: built.path,
      request_body_sample: built.body ? redactSample(built.body) : null,
      response_body: redactSample(result.body),
      http_status: result.status,
      status: success ? "success" : "failed",
      created_at: new Date().toISOString(),
    });
    if (error) console.warn(`[acculynx-write-action] audit-log insert skipped: ${error.message}`);
  } catch (e) {
    console.warn(`[acculynx-write-action] audit-log insert skipped: ${String(e)}`);
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let input: WriteActionInput;
  try {
    input = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const { lane, accountKey, targetEnv, payload, dryRun, workKey } = input;

  // D-09 barrier #1: enforce the target barrier FIRST, before any resolution or network call.
  try {
    assertTarget(targetEnv, accountKey);
  } catch (e) {
    return json({ error: (e as Error).message }, 403);
  }

  // Resolve the AccuLynx key per-request from the registry — never a module-level cached key.
  let account: AccountRow | null;
  try {
    account = await loadAccount(accountKey);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
  if (!account) return json({ error: `unknown accountKey "${accountKey}"` }, 400);

  const apiKey = resolveKey(account);
  if (!apiKey) return json({ error: `${account.env_secret_name} not set in Edge secrets` }, 500);

  // Build the request — the SAME builder for both dryRun and execute (D-03).
  let built: { method: "POST" | "PUT" | "DELETE"; path: string; body?: unknown; formData?: FormData };
  try {
    built = buildWriteRequest(lane, payload);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }

  if (dryRun) {
    return json({
      status: "preview",
      request: {
        method: built.method,
        path: built.path,
        body: built.body ? redactSample(built.body) : undefined,
        multipart: !!built.formData,
      },
    });
  }

  const idempotencyKey = input.idempotencyKey ?? computeIdempotencyKey({ lane, accountKey, targetEnv, payload });

  // Double-fire prevention (D-05): if a prior success already exists for this exact
  // idempotency key, return it WITHOUT re-firing against AccuLynx.
  const prior = await findPriorSuccess(idempotencyKey);
  if (prior) {
    return json({
      status: "already_executed",
      idempotencyKey,
      request: { method: built.method, path: built.path },
      result: prior,
    });
  }

  const url = `${BASE}${built.path}`;
  const result = await acculynxCall(apiKey, built.method, url, built.body, built.formData);

  // Write-only lanes (Pitfall 4, WRITE_ONLY_LANES): this handler never issues a follow-up
  // GET for ANY lane, write-only or not — the 2xx + echoed body persisted below is the
  // only evidence recorded for every lane, satisfying the write-only guardrail by construction.

  await persistExecutionResult(
    { lane, accountKey, targetEnv, payload, dryRun, idempotencyKey, workKey },
    idempotencyKey,
    built,
    result,
  );

  return json({
    status: result.status >= 200 && result.status < 300 ? "executed" : "failed",
    idempotencyKey,
    request: { method: built.method, path: built.path },
    result: { status: result.status, body: redactSample(result.body) },
  });
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
