// acculynx-read-sweep — sweep core (Phase 1, plan 01-02)
//
// Pure, unit-tested logic shared by the Edge Function entrypoint (index.ts):
//   - assertSandbox: code-level enforcement of the sandbox-only mandate (Chris, 2026-06-30)
//   - paginationParam: per-endpoint pagination param selection (recordStartIndex vs pageStartIndex)
//   - redactSample: homeowner-PII redaction before any response shape is stored
//
// NO secret value ever appears here — only the sandbox secret NAME constant.

/** The only AccuLynx secret this function is permitted to resolve. */
export const SANDBOX_SECRET_NAME = "PE_CC_SANDBOX_ACCULYNX_API_KEY";

/**
 * Hard gate: throw unless the requested secret name is exactly the sandbox secret.
 * This enforces "no production first-tries" in CODE, before any network call — a
 * misconfiguration cannot accidentally probe a production location account.
 */
export function assertSandbox(secretName: string): void {
  if (secretName !== SANDBOX_SECRET_NAME) {
    throw new Error(
      `acculynx-read-sweep is sandbox-only: refusing to resolve "${secretName}". ` +
        `Only ${SANDBOX_SECRET_NAME} is permitted in Phase 1.`,
    );
  }
}

/**
 * Select the pagination query param for an endpoint from its OpenAPI parameter names.
 * Precedence: recordStartIndex > pageStartIndex > null (unpaginated detail endpoint).
 * Never assume a single global param — AccuLynx splits these per endpoint.
 *
 * Accepts an array of param names, an array of `{name}` objects, or a checklist row
 * carrying `pagination_param` / `path_params`+`parameters`.
 */
export function paginationParam(
  op: string[] | { name: string }[] | { pagination_param?: string | null; parameters?: unknown },
): "recordStartIndex" | "pageStartIndex" | null {
  let names: string[] = [];
  if (Array.isArray(op)) {
    names = op.map((p) => (typeof p === "string" ? p : p?.name)).filter(Boolean) as string[];
  } else if (op && typeof op === "object") {
    if (typeof (op as { pagination_param?: string | null }).pagination_param !== "undefined") {
      const pp = (op as { pagination_param?: string | null }).pagination_param;
      return pp === "recordStartIndex" || pp === "pageStartIndex" ? pp : null;
    }
    const params = (op as { parameters?: unknown }).parameters;
    if (Array.isArray(params)) {
      names = params.map((p) => (typeof p === "string" ? p : p?.name)).filter(Boolean);
    }
  }
  if (names.includes("recordStartIndex")) return "recordStartIndex";
  if (names.includes("pageStartIndex")) return "pageStartIndex";
  return null;
}

/** Object keys whose VALUES carry homeowner PII and must be masked before storage. */
const PII_KEY = /^(jobName|contactName|firstName|lastName|fullName|name|street1|street2|address|addressLine\d*|line1|line2|email|emailAddress|phone|phoneNumber|mobilePhone)$/i;

const MAX_STR = 200; // truncate long non-PII strings; we store shapes, not full payloads

/**
 * Recursively replace homeowner-PII values with a shape token (`[redacted:<type>]`),
 * preserving the key names and overall structure. Non-PII strings are truncated to MAX_STR.
 * Stores SHAPES, not values (hard rule 2). Safe on any JSON value.
 */
export function redactSample(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => redactSample(v));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (PII_KEY.test(k)) {
        out[k] = `[redacted:${Array.isArray(v) ? "array" : v === null ? "null" : typeof v}]`;
      } else {
        out[k] = redactSample(v);
      }
    }
    return out;
  }
  if (typeof value === "string" && value.length > MAX_STR) {
    return value.slice(0, MAX_STR) + `…[+${value.length - MAX_STR}]`;
  }
  return value;
}

/** Extract `{param}` names from an OpenAPI-style path, e.g. /jobs/{jobId}/contacts -> ["jobId"]. */
export function pathParams(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
}
