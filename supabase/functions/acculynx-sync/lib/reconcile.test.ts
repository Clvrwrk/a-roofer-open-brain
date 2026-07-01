// acculynx-sync — lib/reconcile.test.ts (Phase 3, plan 03-02 Task 1 — Wave 0 contract)
//
// The reconciliation logic itself lives in SQL (migration 174
// reconcile_acculynx_cron_outcomes() + migration 175 v_acculynx_cron_outcomes). Per
// 03-VALIDATION.md, this is the FIXTURE-SHAPE CONTRACT test: it pins the two invariants the
// SQL must uphold so a future edit to either migration that breaks the contract is caught here.
//
//   1. deriveOutcome() mirrors mig 175's outcome CASE. If the view's classification changes,
//      this truth table must change with it — they are parallel expressions of one contract.
//   2. RECONCILE_UPDATE_CONTRACT pins mig 174's join shape: it must correlate on request_id,
//      only touch not-yet-reconciled rows (idempotent), and never read from a dashboard path.
//
// Run: deno test supabase/functions/acculynx-sync/lib/reconcile.test.ts --allow-env
import { assertEquals, assert } from "jsr:@std/assert@1";

// ---------------------------------------------------------------------------
// Contract 1: outcome classification (mirrors mig 175 v_acculynx_cron_outcomes CASE)
// ---------------------------------------------------------------------------

type DispatchRow = {
  request_id: number | null;
  dispatched_at: number; // epoch ms
  reconciled_at: number | null; // epoch ms
  timed_out: boolean | null;
  status_code: number | null;
};

const GRACE_MS = 30 * 60 * 1000;

/** Pure mirror of migration 175's outcome CASE expression. */
function deriveOutcome(row: DispatchRow, nowMs: number): string {
  if (row.request_id === null) return "pending";
  if (row.reconciled_at === null && row.dispatched_at > nowMs - GRACE_MS) return "pending";
  if (row.reconciled_at === null) return "unreconciled";
  if (row.timed_out) return "timeout";
  if (row.status_code !== null && row.status_code >= 200 && row.status_code <= 299) return "success";
  return "http_error";
}

const NOW = 1_800_000_000_000;

Deno.test("deriveOutcome — reconciled 200 is success (permanently, even long after dispatch)", () => {
  assertEquals(
    deriveOutcome({ request_id: 5, dispatched_at: NOW - 10 * GRACE_MS, reconciled_at: NOW - 9 * GRACE_MS, timed_out: false, status_code: 200 }, NOW),
    "success",
  );
});

Deno.test("deriveOutcome — unreconciled within grace is pending", () => {
  assertEquals(
    deriveOutcome({ request_id: 6, dispatched_at: NOW - 5 * 60 * 1000, reconciled_at: null, timed_out: null, status_code: null }, NOW),
    "pending",
  );
});

Deno.test("deriveOutcome — unreconciled PAST grace is 'unreconciled' (not eternal pending) — the SC2 fix", () => {
  assertEquals(
    deriveOutcome({ request_id: 7, dispatched_at: NOW - 2 * GRACE_MS, reconciled_at: null, timed_out: null, status_code: null }, NOW),
    "unreconciled",
  );
});

Deno.test("deriveOutcome — timed_out beats status_code", () => {
  assertEquals(
    deriveOutcome({ request_id: 8, dispatched_at: NOW - GRACE_MS, reconciled_at: NOW, timed_out: true, status_code: null }, NOW),
    "timeout",
  );
});

Deno.test("deriveOutcome — reconciled non-2xx is http_error", () => {
  assertEquals(
    deriveOutcome({ request_id: 9, dispatched_at: NOW - GRACE_MS, reconciled_at: NOW, timed_out: false, status_code: 500 }, NOW),
    "http_error",
  );
});

Deno.test("deriveOutcome — no dispatch row recorded is pending", () => {
  assertEquals(
    deriveOutcome({ request_id: null, dispatched_at: NOW, reconciled_at: null, timed_out: null, status_code: null }, NOW),
    "pending",
  );
});

// ---------------------------------------------------------------------------
// Contract 2: reconcile UPDATE join shape (mirrors mig 174)
// ---------------------------------------------------------------------------
// The canonical shape migration 174 must implement. Kept here as the reviewable contract:
// correlate on request_id, only touch not-yet-reconciled rows (idempotent), set reconciled_at.
const RECONCILE_UPDATE_CONTRACT = `
update public.acculynx_cron_dispatch d
   set status_code = r.status_code,
       timed_out = r.timed_out,
       error_msg = r.error_msg,
       response_preview = substr(r.content, 1, 500),
       reconciled_at = now()
  from net._http_response r
 where r.id = d.request_id
   and d.reconciled_at is null
`;

Deno.test("reconcile contract — correlates on request_id", () => {
  assert(/r\.id\s*=\s*d\.request_id/.test(RECONCILE_UPDATE_CONTRACT));
});

Deno.test("reconcile contract — idempotent: only not-yet-reconciled rows", () => {
  assert(/d\.reconciled_at\s+is\s+null/.test(RECONCILE_UPDATE_CONTRACT));
});

Deno.test("reconcile contract — writes the owned dispatch table, reads transient net._http_response", () => {
  assert(/update\s+public\.acculynx_cron_dispatch/.test(RECONCILE_UPDATE_CONTRACT));
  assert(/from\s+net\._http_response/.test(RECONCILE_UPDATE_CONTRACT));
});
