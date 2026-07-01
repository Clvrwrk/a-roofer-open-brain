// acculynx-write-action — pure core (Phase 5, plan 05-01 Task 1)
//
// The SOLE request-builder for AccuLynx writes (D-02). Pure, unit-tested logic shared
// by the Edge Function entrypoint (index.ts) — this module performs no outbound
// network calls of its own and does not register any request-serving handler; it only
// builds and validates the request shape that index.ts later sends.
//
// Ported/reused from acculynx-write-sweep/sweep.ts (do not re-derive):
//   - redactSample: homeowner-PII redaction before any response/request shape is stored
//   - buildContactAddress / buildJobAddress: the address-shape asymmetry builders
//     (contact mailingAddress wants state/country as OBJECTS; job locationAddress wants
//     them as STRINGS — never share one builder between them, Pitfall 3)
//   - SANDBOX_SECRET_NAME: the sandbox secret name constant
//   - intId: moved out of the sweep entrypoint into this exported pure core (Pitfall 2)
//
// New for this function (D-03 / D-09 / D-06):
//   - assertTarget: the edge-side barrier requiring an explicit, non-ambiguous target
//     before any resolution or network call
//   - buildWriteRequest: ONE builder shared by both the dry-run preview and the real
//     execute path — there is no second "preview" constructor (D-03 anti-drift)
//   - computeIdempotencyKey: deterministic hash used to prevent a duplicate execute
//   - LANES / WriteLane / WRITE_ONLY_LANES: the 17 proven-safe lanes (D-06), and the
//     5 of those with no independent read-back path (Pitfall 4)
//
// NO secret value ever appears here — only the sandbox secret NAME constant.
import { createHash } from "node:crypto";

/** The sandbox AccuLynx secret name — reused verbatim from acculynx-write-sweep. */
export const SANDBOX_SECRET_NAME = "PE_CC_SANDBOX_ACCULYNX_API_KEY";

const BASE = "https://api.acculynx.com/api/v2";

/**
 * D-09 barrier #1: throw before any key resolution or network call unless the
 * requested target is unambiguous. Accepts exactly two concepts: the sandbox default
 * (no named account required), or an explicit non-default target paired with a named
 * account (never implicit). Any other value — unset, blank, or an unrecognized
 * environment name — throws.
 */
export function assertTarget(targetEnv: string, accountKey: string): void {
  if (targetEnv === "sandbox") return;
  if (targetEnv === "prod") {
    if (!accountKey) {
      throw new Error(
        "acculynx-write-action: a prod target requires a non-empty accountKey — prod is never implicit.",
      );
    }
    return;
  }
  throw new Error(
    `acculynx-write-action: unrecognized targetEnv "${targetEnv}" — only "sandbox" (default) or "prod" (with an explicit accountKey) are permitted.`,
  );
}

/** Object keys whose VALUES carry homeowner PII and must be masked before storage. */
const PII_KEY = /^(jobName|contactName|firstName|lastName|fullName|name|street1|street2|address|addressLine\d*|line1|line2|email|emailAddress|phone|phoneNumber|mobilePhone|from|to|adjusterName)$/i;

const MAX_STR = 200; // truncate long non-PII strings; we store shapes, not full payloads

/**
 * Recursively replace homeowner-PII values with a shape token (`[redacted:<type>]`),
 * preserving key names and overall structure. Non-PII strings are truncated to MAX_STR.
 * Stores SHAPES, not values (hard rule 2). Reused verbatim from sweep.ts.
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

/**
 * jobCategory.id is Int32 in AccuLynx (unlike the GUID-string ids elsewhere). Coerces a
 * string (or already-numeric value) back to a number. Returns undefined for null/NaN so
 * the field is omitted rather than sent as an invalid value (Pitfall 2).
 */
export function intId(v: string | number | null | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
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

/** Minimal Kansas fixture — the default when no state is supplied. */
const KS_STATE: StateObject = { id: 0, name: "Kansas", abbreviation: "KS" };
const US_COUNTRY: CountryObject = { id: 1, name: "United States", abbreviation: "US" };

/**
 * Contact mailingAddress builder: state/country as OBJECTS ({id, name, abbreviation}).
 * Used for the contact-facing lane only. NEVER share with buildJobAddress — sending the
 * wrong shape produces a .NET type-conversion 4xx (Pitfall 3).
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
 * Job locationAddress / PUT /jobs/{jobId}/address builder: state/country as STRINGS
 * (abbreviation only) — the opposite convention from buildContactAddress. NEVER share
 * with buildContactAddress (Pitfall 3).
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

/** The 17 proven-safe lanes (D-06 — 12 writable + 5 write-only). Authoritative name set. */
export type WriteLane =
  | "postContact"
  | "postJob"
  | "postJobPaymentReceived"
  | "postJobPaymentExpense"
  | "putJobAddress"
  | "putJobInitialAppointment"
  | "putJobInsurance"
  | "putJobInsuranceCompany"
  | "putJobLeadSource"
  | "putJobPriority"
  | "deleteJobArOwner"
  | "deleteJobSalesOwner"
  | "postWorksheetItem"
  | "postJobMessage"
  | "postJobPhotosVideos"
  | "postJobRepresentativeCompany"
  | "postJobExternalReference";

interface LaneDef {
  method: "POST" | "PUT" | "DELETE";
  /** Path template with {param} placeholders resolved from the payload. */
  pathTemplate: string;
  /** Payload fields required to resolve {param}s and to construct a valid body. */
  requiredFields: string[];
}

/** Method + path template per lane (path params substituted from the payload at build time). */
export const LANES: Record<WriteLane, LaneDef> = {
  postContact: { method: "POST", pathTemplate: "/contacts", requiredFields: ["contactTypeIds"] },
  postJob: { method: "POST", pathTemplate: "/jobs", requiredFields: ["contact"] },
  postJobPaymentReceived: {
    method: "POST",
    pathTemplate: "/jobs/{jobId}/payments/received",
    requiredFields: ["jobId"],
  },
  postJobPaymentExpense: {
    method: "POST",
    pathTemplate: "/jobs/{jobId}/payments/expense",
    requiredFields: ["jobId"],
  },
  putJobAddress: { method: "PUT", pathTemplate: "/jobs/{jobId}/address", requiredFields: ["jobId"] },
  putJobInitialAppointment: {
    method: "PUT",
    pathTemplate: "/jobs/{jobId}/initial-appointment",
    requiredFields: ["jobId"],
  },
  putJobInsurance: { method: "PUT", pathTemplate: "/jobs/{jobId}/insurance", requiredFields: ["jobId"] },
  putJobInsuranceCompany: {
    method: "PUT",
    pathTemplate: "/jobs/{jobId}/insurance/insurance-company",
    requiredFields: ["jobId"],
  },
  putJobLeadSource: { method: "PUT", pathTemplate: "/jobs/{jobId}/lead-source", requiredFields: ["jobId", "id"] },
  putJobPriority: { method: "PUT", pathTemplate: "/jobs/{jobId}/priority", requiredFields: ["jobId", "priority"] },
  deleteJobArOwner: {
    method: "DELETE",
    pathTemplate: "/jobs/{jobId}/representatives/ar-owner",
    requiredFields: ["jobId"],
  },
  deleteJobSalesOwner: {
    method: "DELETE",
    pathTemplate: "/jobs/{jobId}/representatives/sales-owner",
    requiredFields: ["jobId"],
  },
  postWorksheetItem: {
    method: "POST",
    pathTemplate: "/financials/{financialsId}/worksheet/items",
    requiredFields: ["financialsId", "price", "itemName"],
  },
  postJobMessage: { method: "POST", pathTemplate: "/jobs/{jobId}/messages", requiredFields: ["jobId", "message"] },
  postJobPhotosVideos: {
    method: "POST",
    pathTemplate: "/jobs/{jobId}/photos-videos",
    requiredFields: ["jobId"],
  },
  postJobRepresentativeCompany: {
    method: "POST",
    pathTemplate: "/jobs/{jobId}/representatives/company",
    requiredFields: ["jobId", "id"],
  },
  postJobExternalReference: {
    method: "POST",
    pathTemplate: "/jobs/external-references",
    requiredFields: ["jobId", "source", "projectId"],
  },
};

/** The 5 write-only lanes (Pitfall 4) — must never attempt a follow-up GET. */
export const WRITE_ONLY_LANES: ReadonlySet<WriteLane> = new Set<WriteLane>([
  "postWorksheetItem",
  "postJobMessage",
  "postJobPhotosVideos",
  "postJobRepresentativeCompany",
  "postJobExternalReference",
]);

/** The built request tuple shared by both the dry-run preview and the real execute path (D-03). */
export interface BuiltRequest {
  method: "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  formData?: FormData;
}

/** Optional reference-data hints a caller may supply (e.g. pre-resolved ids). Currently unused
 * by any lane builder below but kept as an extension point for future lanes. */
export type RefData = Record<string, unknown> | undefined;

function resolvePathTemplate(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (_match, param: string) => {
    const value = payload[param];
    if (value == null || value === "") {
      throw new Error(`buildWriteRequest: missing required path parameter "${param}"`);
    }
    return encodeURIComponent(String(value));
  });
}

function requireFields(lane: WriteLane, payload: Record<string, unknown>, fields: string[]): void {
  for (const field of fields) {
    const value = payload[field];
    const missing = value === undefined || value === null || value === "" ||
      (Array.isArray(value) && value.length === 0);
    if (missing) {
      throw new Error(`buildWriteRequest(${lane}): missing required field "${field}"`);
    }
  }
}

/** Tiny in-memory 1x1 GIF fixture for the multipart photos/videos lane — no real file needed
 * when the caller supplies only metadata (a real caller will typically supply its own file). */
function buildPlaceholderFile(name: string, contentType: string): Blob {
  const bytes = new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00,
    0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00,
    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
  ]);
  return new Blob([bytes], { type: contentType });
}

const STRICT_PRIORITY_VALUES = new Set(["Low", "Normal", "High"]);

/**
 * The single request-builder shared by BOTH the dry-run preview and the real execute
 * path (D-03) — there is no separate preview constructor. Applies each lane's
 * lane-specific guardrail (Int32 coercion, address shape, strict enums, multipart) and
 * validates required payload fields (V5) before returning the built request tuple.
 * Throws for an unknown lane or a payload missing a required field.
 */
export function buildWriteRequest(
  lane: WriteLane,
  payload: Record<string, unknown>,
  _refData?: RefData,
): BuiltRequest {
  const laneDef = LANES[lane];
  if (!laneDef) {
    throw new Error(`buildWriteRequest: unknown lane "${lane}"`);
  }
  requireFields(lane, payload, laneDef.requiredFields);
  const path = resolvePathTemplate(laneDef.pathTemplate, payload);

  switch (lane) {
    case "postContact": {
      const body: Record<string, unknown> = { ...payload };
      if (body.mailingAddress && typeof body.mailingAddress === "object") {
        body.mailingAddress = buildContactAddress(body.mailingAddress as AddressInput);
      }
      return { method: "POST", path, body };
    }

    case "postJob": {
      const body: Record<string, unknown> = { ...payload };
      const jobCategory = body.jobCategory as { id?: unknown } | undefined;
      if (jobCategory && jobCategory.id !== undefined) {
        const coerced = intId(jobCategory.id as string | number | null | undefined);
        body.jobCategory = coerced !== undefined ? { ...jobCategory, id: coerced } : jobCategory;
      }
      if (body.locationAddress && typeof body.locationAddress === "object") {
        body.locationAddress = buildJobAddress(body.locationAddress as AddressInput);
      }
      if (body.priority !== undefined && !STRICT_PRIORITY_VALUES.has(String(body.priority))) {
        throw new Error(
          `buildWriteRequest(postJob): invalid priority "${String(body.priority)}" — must be exactly "Low", "Normal", or "High"`,
        );
      }
      return { method: "POST", path, body };
    }

    case "postJobPaymentReceived":
    case "postJobPaymentExpense": {
      const { jobId: _jobId, ...body } = payload;
      return { method: "POST", path, body };
    }

    case "putJobAddress": {
      const body = buildJobAddress(payload as AddressInput);
      return { method: "PUT", path, body };
    }

    case "putJobInitialAppointment": {
      const { jobId: _jobId, ...body } = payload;
      return { method: "PUT", path, body };
    }

    case "putJobInsurance": {
      const { jobId: _jobId, ...body } = payload;
      return { method: "PUT", path, body };
    }

    case "putJobInsuranceCompany": {
      const { jobId: _jobId, ...body } = payload;
      return { method: "PUT", path, body };
    }

    case "putJobLeadSource": {
      const { jobId: _jobId, ...body } = payload;
      return { method: "PUT", path, body };
    }

    case "putJobPriority": {
      const { jobId: _jobId, ...body } = payload;
      if (!STRICT_PRIORITY_VALUES.has(String(body.priority))) {
        throw new Error(
          `buildWriteRequest(putJobPriority): invalid priority "${String(body.priority)}" — must be exactly "Low", "Normal", or "High"`,
        );
      }
      return { method: "PUT", path, body };
    }

    case "deleteJobArOwner":
    case "deleteJobSalesOwner": {
      return { method: "DELETE", path };
    }

    case "postWorksheetItem": {
      const { financialsId: _financialsId, ...body } = payload;
      return { method: "POST", path, body };
    }

    case "postJobMessage": {
      const { jobId: _jobId, ...body } = payload;
      return { method: "POST", path, body };
    }

    case "postJobPhotosVideos": {
      const formData = new FormData();
      const providedFile = payload.file;
      if (providedFile instanceof Blob) {
        formData.append("file", providedFile, (payload.fileName as string) ?? "upload.gif");
      } else {
        formData.append("file", buildPlaceholderFile("write-action-placeholder.gif", "image/gif"), "write-action-placeholder.gif");
      }
      if (typeof payload.description === "string") {
        formData.append("description", payload.description);
      }
      return { method: "POST", path, formData };
    }

    case "postJobRepresentativeCompany": {
      const { jobId: _jobId, ...body } = payload;
      return { method: "POST", path, body };
    }

    case "postJobExternalReference": {
      const body = { ...payload };
      return { method: "POST", path, body };
    }

    default: {
      // Exhaustiveness guard — every WriteLane above must have a case.
      throw new Error(`buildWriteRequest: unhandled lane "${lane as string}"`);
    }
  }
}

/** Deterministically stringify an object with sorted keys, for stable hashing. */
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Idempotency-key input: the fields that, together, uniquely identify "this exact write
 * attempt" — a second execute with the same (lane, accountKey, targetEnv, payload) must
 * short-circuit rather than double-fire (D-05, first-class for payments).
 */
export interface IdempotencyKeyInput {
  lane: WriteLane;
  accountKey: string;
  targetEnv: string;
  payload: Record<string, unknown>;
}

/**
 * sha256 hash of `lane|accountKey|targetEnv|canonical(payload)` — deterministic: the
 * same input always produces the same key; any field change produces a different key.
 * Uses node:crypto's createHash, same pattern as the Command Center's live-work.ts
 * hashText() helper.
 */
export function computeIdempotencyKey(input: IdempotencyKeyInput): string {
  const canonicalPayload = canonicalize(input.payload);
  const material = `${input.lane}|${input.accountKey}|${input.targetEnv}|${canonicalPayload}`;
  return createHash("sha256").update(material).digest("hex");
}
