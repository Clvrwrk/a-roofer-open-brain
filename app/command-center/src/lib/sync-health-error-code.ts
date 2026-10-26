/** Map durable monitor failure codes to Sentry error_code tags (non-PII allowlist). */
export function syncHealthErrorCode(failureCode: string): string {
  if (failureCode === "auth_denied") return "unauthorized";
  const internal = new Set([
    "stale_financials",
    "stale_heartbeat",
    "stale_schedule",
    "scheduler_disabled_or_missing",
    "delivery_backlog",
    "watchdog_stale",
    "probe_failed",
    "partial_or_invalid",
    "scheduler_error",
    "duplicate_identity",
    "schema_error",
    "worker_failed",
    "worker_timeout",
    "runtime_failed",
    "rate_limited",
    "transport_error",
  ]);
  if (internal.has(failureCode)) return failureCode;
  return "provider_unavailable";
}
