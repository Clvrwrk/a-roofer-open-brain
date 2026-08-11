// Shared handling for Supabase writes whose failure must not fail the request
// (audit-log rows, cache touches, status side effects). They stay non-fatal, but
// they never disappear: every failure is logged with the route/table context so a
// broken write shows up in logs instead of behind an `ok: true` response.

type WriteError = { message: string } | null | undefined;

export function reportWriteFailure(context: string, error: WriteError): boolean {
  if (!error) return false;
  console.error(`[${context}] supabase write failed:`, error.message);
  return true;
}

export function reportReadFailure(context: string, error: WriteError): boolean {
  if (!error) return false;
  console.error(`[${context}] supabase read failed:`, error.message);
  return true;
}
