// PE job / ABC PO naming contract (Chris, 2026-06-29).
// Job field (ABC orderName) is authoritative: "{OFFICE}-{NUM}: {Client}" (unpadded).
// Customer PO# should be "{OFFICE}-{NUM}-{seq}" where seq = material-order sequence on that job.
// Pre-approval AccuLynx jobs may use "{OFFICE}-TEMP-{shortId}" until a real number is assigned.

export const PE_OFFICE_PREFIXES = ["ks", "kc", "mc", "tx", "co", "ok", "nc"] as const;
export type PeOfficePrefix = (typeof PE_OFFICE_PREFIXES)[number];

export type PeNamingStatus =
  | "aligned"
  | "po_mismatch"
  | "job_blank"
  | "needs_link"
  | "temp_job";

export interface ParsedPeJobLabel {
  office: string;
  jobNum: string;
  client: string;
  isTemp: boolean;
  rawPrefix: string;
  norm: string;
}

const JOB_LABEL_RE = new RegExp(
  `^\\s*(${PE_OFFICE_PREFIXES.join("|")})\\s*-\\s*(TEMP\\s*-\\s*[\\w]+|\\d+)\\s*:\\s*(.+)$`,
  "i",
);

const PO_WITH_SEQ_RE = new RegExp(
  `^\\s*(${PE_OFFICE_PREFIXES.join("|")})\\s*-\\s*(\\d+)\\s*-\\s*(\\d+)\\s*$`,
  "i",
);

export function normalizePeKey(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/^PO/i, "")
    .replace(/[^A-Z0-9]/g, "");
}

export function parsePeJobLabel(orderName: string | null | undefined): ParsedPeJobLabel | null {
  const text = String(orderName ?? "").trim();
  if (!text) return null;
  const m = text.match(JOB_LABEL_RE);
  if (!m) return null;
  const office = m[1].toUpperCase();
  const token = m[2].replace(/\s+/g, "");
  const client = m[3].trim();
  const isTemp = /^TEMP-/i.test(token);
  const jobNum = isTemp ? token.replace(/^TEMP-/i, "") : token;
  const rawPrefix = `${office}-${isTemp ? `TEMP-${jobNum}` : jobNum}`;
  return {
    office,
    jobNum,
    client,
    isTemp,
    rawPrefix,
    norm: normalizePeKey(rawPrefix),
  };
}

export function parsePePoWithSequence(purchaseOrder: string | null | undefined): {
  office: string;
  jobNum: string;
  seq: number;
  raw: string;
} | null {
  const text = String(purchaseOrder ?? "").trim();
  if (!text) return null;
  const m = text.match(PO_WITH_SEQ_RE);
  if (!m) return null;
  return {
    office: m[1].toUpperCase(),
    jobNum: m[2],
    seq: Number(m[3]),
    raw: `${m[1].toUpperCase()}-${m[2]}-${m[3]}`,
  };
}

export function buildExpectedPo(jobPrefix: string, materialSeq: number): string {
  const clean = jobPrefix.trim().replace(/\s+/g, "");
  return `${clean}-${materialSeq}`;
}

export function deriveNamingStatus(input: {
  orderName?: string | null;
  purchaseOrder?: string | null;
  expectedPo?: string | null;
  acculynxJobId?: string | null;
}): PeNamingStatus {
  const job = parsePeJobLabel(input.orderName);
  if (job?.isTemp) return "temp_job";
  if (!job) {
    return input.acculynxJobId ? "job_blank" : "needs_link";
  }
  const expected = input.expectedPo ?? buildExpectedPo(job.rawPrefix, 1);
  const actual = String(input.purchaseOrder ?? "").trim();
  if (!actual) return "po_mismatch";
  const parsedPo = parsePePoWithSequence(actual);
  if (parsedPo && parsedPo.raw.toUpperCase() === expected.toUpperCase()) return "aligned";
  if (normalizePeKey(actual) === normalizePeKey(expected)) return "aligned";
  return "po_mismatch";
}

export function canonicalJobLabel(parsed: ParsedPeJobLabel | null, fallbackName?: string | null): string {
  if (parsed) return `${parsed.rawPrefix}: ${parsed.client}`;
  return String(fallbackName ?? "").trim();
}
