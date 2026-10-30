// Synthetic acceptance fixture ONLY. Never imported by the application or a live sync.
// The live Sentry drill tests whether the agent can reproduce a missing timestamp being treated as fresh.
export function isStale(lastSeenMs, nowMs, maxAgeMs) {
  if (!Number.isFinite(lastSeenMs)) return true;
  return nowMs - lastSeenMs > maxAgeMs;
}
