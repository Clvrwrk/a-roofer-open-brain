export type RoofingAgentId = "maya" | "alex" | "casey" | "jordan" | "sam" | "rowan" | "lena" | "ops";

export interface RoofingOpsFileSummary {
  id: string;
  name?: string;
  mimetype?: string;
  filetype?: string;
}

export interface RoofingOpsRequestInput {
  text?: string;
  files?: RoofingOpsFileSummary[];
}

export interface RoofingAgentScope {
  agent: RoofingAgentId;
  displayName: string;
  domains: readonly string[];
  keywords: readonly string[];
  approval?: "chris_required_before_execution";
}

export interface RoofingAgentCandidate {
  agent: RoofingAgentId;
  displayName: string;
  score: number;
  matchedKeywords: string[];
  approval?: "chris_required_before_execution";
}

export interface RoofingOpsClassification {
  candidates: RoofingAgentCandidate[];
  primary: RoofingAgentCandidate | null;
  requiresOpsResolution: boolean;
  outOfDomain: boolean;
  reason: string;
}

export const ROOFING_AGENT_SCOPES: Record<RoofingAgentId, RoofingAgentScope> = {
  maya: {
    agent: "maya",
    displayName: "Maya Chen",
    domains: ["document_intake", "invoice_intake", "ap", "ar", "credit_memo_intake", "price_agreement_intake", "hr_escalation", "payroll_escalation"],
    keywords: ["invoice", "upload", "pdf", "ap", "ar", "credit memo", "creditmemos", "price agreement", "vendor document", "intake", "payroll", "hr"],
  },
  alex: {
    agent: "alex",
    displayName: "Alex Rivers",
    domains: ["pricing", "catalog", "sku", "uom", "abc_supply", "price_agreement", "variance", "invoice_audit", "open_vendor_invoices"],
    keywords: ["sku", "uom", "abc", "price agreement", "catalog", "overcharge", "variance", "bundle", "square", "pricing", "open invoice", "open invoices", "vendor invoice", "vendor invoices", "invoice audit", "abc invoice", "invoice line", "invoice lines", "not-to-be-paid"],
  },
  casey: {
    agent: "casey",
    displayName: "Casey Morgan",
    domains: ["vendor_draft", "dispute_letter", "credit_memo_request", "vendor_followup"],
    keywords: ["draft", "vendor email", "dispute", "follow up", "follow-up", "credit request", "send to vendor", "letter"],
  },
  jordan: {
    agent: "jordan",
    displayName: "Jordan Price",
    domains: ["finance", "ar_aging", "ap_aging", "job_cost", "month_end", "pnl"],
    keywords: ["aging", "cash", "finance", "p&l", "pnl", "job cost", "margin", "month end", "receivable", "ar aging", "ap aging"],
  },
  sam: {
    agent: "sam",
    displayName: "Sam Torres",
    domains: ["qa", "compliance", "audit", "accuracy", "sampling", "standard"],
    keywords: ["qa", "audit", "check accuracy", "standard", "compliance", "sample", "wrong", "mistake", "verify", "quality"],
  },
  rowan: {
    agent: "rowan",
    displayName: "Rowan Vale",
    domains: ["external_research", "storm_monitoring", "manufacturer_research", "carrier_bulletins", "code_updates", "market_research"],
    keywords: ["research", "look up", "storm", "weather", "code update", "carrier bulletin", "manufacturer", "gaf", "owens corning", "public source", "xactimate"],
    approval: "chris_required_before_execution",
  },
  lena: {
    agent: "lena",
    displayName: "Lena Brooks",
    domains: ["marketing", "reviews", "eeat", "reputation", "content", "schema", "photos"],
    keywords: ["review", "google business", "photo", "photos", "content", "eeat", "schema", "marketing", "testimonial", "reputation"],
  },
  ops: {
    agent: "ops",
    displayName: "Ops Conductor",
    domains: ["routing", "overlap", "unknown", "bug", "feature", "enhancement", "dev_escalation"],
    keywords: ["bug", "feature", "enhancement", "not working", "broken", "can you build", "route this", "who owns", "devteam", "dev team"],
  },
};

const UNCLEAR_FILE_PHRASES = ["what is this", "what's this", "what am i looking at", "can the agents process this", "handle this"];
const OUT_OF_DOMAIN_PHRASES = ["bake a cake", "cake recipe", "fantasy football", "movie recommendation"];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[“”]/g, '"').replace(/[’]/g, "'");
}

function keywordMatches(text: string, keyword: string): boolean {
  const normalizedKeyword = normalize(keyword);
  if (normalizedKeyword.length <= 3) {
    return new RegExp(`(^|\\W)${normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\W|$)`).test(text);
  }
  return text.includes(normalizedKeyword);
}

function fileHints(files: RoofingOpsFileSummary[] | undefined): string {
  if (!files?.length) return "";
  return files
    .map((file) => [file.name, file.mimetype, file.filetype].filter(Boolean).join(" "))
    .join(" ");
}

export function requiresChrisApproval(candidate: RoofingAgentCandidate | null | undefined): boolean {
  return candidate?.approval === "chris_required_before_execution";
}

export function classifyRoofingOpsRequest(input: RoofingOpsRequestInput): RoofingOpsClassification {
  const rawText = `${input.text ?? ""} ${fileHints(input.files)}`.trim();
  const text = normalize(rawText);
  const hasFiles = Boolean(input.files?.length);

  if (!text) {
    return { candidates: [], primary: null, requiresOpsResolution: false, outOfDomain: true, reason: "empty_request" };
  }

  if (OUT_OF_DOMAIN_PHRASES.some((phrase) => text.includes(phrase))) {
    return { candidates: [], primary: null, requiresOpsResolution: false, outOfDomain: true, reason: "out_of_domain" };
  }

  const unclearFile = hasFiles && UNCLEAR_FILE_PHRASES.some((phrase) => text.includes(phrase));
  if (unclearFile) {
    const ops = ROOFING_AGENT_SCOPES.ops;
    const candidate: RoofingAgentCandidate = { agent: "ops", displayName: ops.displayName, score: 100, matchedKeywords: ["unclear file"] };
    return { candidates: [candidate], primary: candidate, requiresOpsResolution: false, outOfDomain: false, reason: "unclear_file_request" };
  }

  const candidates = Object.values(ROOFING_AGENT_SCOPES)
    .map((scope) => {
      const matchedKeywords = scope.keywords.filter((keyword) => keywordMatches(text, keyword));
      const score = matchedKeywords.reduce((total, keyword) => total + Math.max(1, keyword.split(/\s+/).length), 0);
      return {
        agent: scope.agent,
        displayName: scope.displayName,
        score,
        matchedKeywords,
        approval: scope.approval,
      } satisfies RoofingAgentCandidate;
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));

  if (candidates.length === 0) {
    return { candidates: [], primary: null, requiresOpsResolution: false, outOfDomain: true, reason: "no_sop_match" };
  }

  const topScore = candidates[0]?.score ?? 0;
  const topCandidates = candidates.filter((candidate) => candidate.score === topScore);
  const requiresOpsResolution = candidates.length > 1 && (topCandidates.length > 1 || candidates[1]!.score >= Math.max(1, topScore - 1));

  return {
    candidates,
    primary: candidates[0] ?? null,
    requiresOpsResolution,
    outOfDomain: false,
    reason: requiresOpsResolution ? "overlapping_sop_match" : "single_sop_match",
  };
}
