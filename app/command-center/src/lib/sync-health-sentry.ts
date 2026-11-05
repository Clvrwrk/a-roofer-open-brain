/** Non-PII allowlist for Sentry error_code tags on integration sync-health delivery. */
export function syncHealthErrorCode(failureCode: string): string {
  if (failureCode === "auth_denied") return "unauthorized";
  const literal = new Set([
    "stale_financials",
    "stale_heartbeat",
    "stale_schedule",
    "scheduler_disabled_or_missing",
    "delivery_backlog",
    "watchdog_stale",
    "probe_failed",
    "probe_unverified",
    "partial_or_invalid",
    "scheduler_error",
    "duplicate_identity",
    "schema_error",
    "worker_failed",
    "worker_timeout",
    "runtime_failed",
    "rate_limited",
    "transport_error",
    "upstream_error",
  ]);
  if (literal.has(failureCode)) return failureCode;
  return "provider_unavailable";
}

/** Direct HTTPS probes can flap once per minute; do not page on a lone probe_failed blip. */
export function shouldEmitSyncHealthToSentry(event: {
  failure_code?: string | null;
  failures?: number | null;
}): boolean {
  if (event.failure_code !== "probe_failed") return true;
  return (event.failures ?? 0) >= 3;
}
