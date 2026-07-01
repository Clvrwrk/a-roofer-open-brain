// acculynx-write-sweep — sweep core (Phase 4, plan 04-01 Task 3)
//
// Pure, unit-tested logic shared by the Edge Function entrypoint (index.ts):
//   - assertSandbox: code-level enforcement of the sandbox-only mandate (D-01)
//   - redactSample: homeowner-PII redaction before any response/request shape is stored
//   - pathParams: extract {param} names from an OpenAPI-style path
//   - shouldStopProbing: D-05's red-team stop rule (2 consecutive no-new-signal probes)
//   - buildContactAddress / buildJobAddress: the address-shape asymmetry builders
//     (contact mailingAddress wants state/country as OBJECTS; job locationAddress wants
//     them as STRINGS — see RESEARCH.md Pitfall 1, never share one builder between them)
//
// NO secret value ever appears here — only the sandbox secret NAME constant.
// Writes don't paginate — no paginationParam export (unlike acculynx-read-sweep).

/** The only AccuLynx secret this function is permitted to resolve. */
export const SANDBOX_SECRET_NAME = "PE_CC_SANDBOX_ACCULYNX_API_KEY";

/**
 * Hard gate: throw unless the requested secret name is exactly the sandbox secret.
 * This enforces "no production first-tries" in CODE, before any network call — a
 * misconfiguration cannot accidentally write to a production location account.
 */
export function assertSandbox(secretName: string): void {
  if (secretName !== SANDBOX_SECRET_NAME) {
    throw new Error(
      `acculynx-write-sweep is sandbox-only: refusing to resolve "${secretName}". ` +
        `Only ${SANDBOX_SECRET_NAME} is permitted.`,
    );
  }
}

/** Object keys whose VALUES carry homeowner PII and must be masked before storage. */
const PII_KEY = /^(jobName|contactName|firstName|lastName|fullName|name|street1|street2|address|addressLine\d*|line1|line2|email|emailAddress|phone|phoneNumber|mobilePhone|from|to|adjusterName)$/i;

const MAX_STR = 200; // truncate long non-PII strings; we store shapes, not full payloads

/**
 * Recursively replace homeowner-PII values with a shape token (`[redacted:<type>]`),
 * preserving the key names and overall structure. Non-PII strings are truncated to MAX_STR.
 * Stores SHAPES, not values (hard rule 2). Safe on any JSON value. Applied to both
 * payload_sample (response) and request_body_sample (outbound write body).
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

/** One recorded probe's signal, used to decide whether to keep red-teaming an endpoint. */
export interface ProbeSignal {
  status: number;
  errorShape: string | null;
  guardrail: string | null;
}

/**
 * D-05 stop rule: stop probing an endpoint after 2 CONSECUTIVE probes reveal no new
 * error shape or new guardrail (i.e. the last two signals are identical). Pure function
 * over probe history so the rule is unit-testable without a live sandbox call.
 */
export function shouldStopProbing(history: ProbeSignal[]): boolean {
  if (history.length < 2) return false;
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  return (
    last.status === prev.status &&
    last.errorShape === prev.errorShape &&
    last.guardrail === prev.guardrail
  );
}

/** Loose input shape shared by both address builders — caller supplies whatever it has. */
export interface AddressInput {
  street1?: string;
  street2?: string | null;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

interface StateObject {
  id: number;
  name: string;
  abbreviation: string;
}

interface CountryObject {
  id: number;
  name: string;
  abbreviation: string;
}

/** Minimal Kansas fixture — the sandbox seeder's default when no state is supplied. */
const KS_STATE: StateObject = { id: 0, name: "Kansas", abbreviation: "KS" };
const US_COUNTRY: CountryObject = { id: 1, name: "United States", abbreviation: "US" };

/**
 * Contact mailingAddress/billingAddress builder: state/country as OBJECTS
 * ({id, name, abbreviation}). Used by POST /contacts. NEVER share with buildJobAddress —
 * sending the wrong shape produces a .NET type-conversion 4xx (RESEARCH.md Pitfall 1).
 */
export function buildContactAddress(a: AddressInput): {
  street1: string;
  street2: string | null;
  city: string;
  state: StateObject;
  zipCode: string | null;
  country: CountryObject;
} {
  return {
    street1: a.street1 ?? "1 Test St",
    street2: a.street2 ?? null,
    city: a.city ?? "Wichita",
    state: a.state && a.state.toUpperCase() !== KS_STATE.abbreviation
      ? { id: 0, name: a.state, abbreviation: a.state }
      : KS_STATE,
    zipCode: a.zipCode ?? null,
    country: US_COUNTRY,
  };
}

/**
 * Job locationAddress builder (also PUT /jobs/{jobId}/address): state/country as
 * STRINGS (abbreviation only) — the opposite convention from buildContactAddress.
 * NEVER share with buildContactAddress (RESEARCH.md Pitfall 1).
 */
export function buildJobAddress(a: AddressInput): {
  street1: string;
  street2: string | null;
  city: string;
  state: string;
  zipCode: string | null;
  country: string;
} {
  return {
    street1: a.street1 ?? "1 Test St",
    street2: a.street2 ?? null,
    city: a.city ?? "Wichita",
    state: a.state ?? "KS",
    zipCode: a.zipCode ?? null,
    country: a.country ?? "US",
  };
}
