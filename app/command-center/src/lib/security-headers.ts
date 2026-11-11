/**
 * Baseline browser protection headers for every Command Center response
 * (privacy review 2026-11-11, docs/131). Matches what crm and hr already send,
 * minus a Content-Security-Policy: the Command Center still renders inline
 * scripts, so a strict CSP is a separate, tested change.
 *
 * Existing headers set by a route win: we only fill in what is missing.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(self), geolocation=(self), microphone=(self)",
});

export function withSecurityHeaders(response: Response): Response {
  try {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      if (!response.headers.has(name)) response.headers.set(name, value);
    }
    return response;
  } catch {
    // Some responses (Response.redirect, fetch passthrough) carry immutable headers.
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      if (!headers.has(name)) headers.set(name, value);
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
}
