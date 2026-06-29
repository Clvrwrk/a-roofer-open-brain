// Login-safe link helpers for OUTBOUND messages (Slack / email).
//
// Why this exists: raw API routes like /api/invoice-audit/batch/<id>.csv are
// WorkOS-gated. When those URLs are pasted into a Slack/email message and the
// recipient clicks them without an active dashboard session, the API returns a
// JSON 401 ({"error":"unauthorized"}) instead of redirecting to login — the
// "weekly-package links 401" bug. The fix: outbound messages must link to a
// dashboard PAGE deep-link, never the raw gated API. The page triggers the
// WorkOS login redirect when unauthenticated, then lands the user on the Manage
// panel where the same-session download works.
//
// Rule (enforced by convention + code review): never embed a raw /api/* link in
// an outbound message. Use manageDeepLink() / dashboardLink() here instead.
import { getRuntimeEnv } from "@lib/runtime-env";

/** Cleaned absolute origin for the public Command Center, no trailing slash. */
export function commandCenterOrigin(): string {
  const raw = getRuntimeEnv().COMMAND_CENTER_PUBLIC_URL ?? "https://cc.proexteriorsus.net";
  return String(raw).replace(/\/+$/, "");
}

/** Absolute URL for a dashboard path (leading slash optional). */
export function dashboardLink(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${commandCenterOrigin()}${p}`;
}

/**
 * Deep-link to the Invoice Audit → Manage (payments) panel. When `batchId` is
 * given the panel opens scrolled to / highlighting that batch. This is the
 * login-safe target for pay-file / decision-detail / weekly-package CSV links:
 * an unauthenticated click hits the WorkOS-gated page, logs in, then opens
 * Manage where the CSVs download under the user's session.
 */
export function manageDeepLink(batchId?: string): string {
  const hash = batchId ? `#manage-${encodeURIComponent(batchId)}` : "#manage";
  return `${dashboardLink("/accounting/invoice-audit")}${hash}`;
}
