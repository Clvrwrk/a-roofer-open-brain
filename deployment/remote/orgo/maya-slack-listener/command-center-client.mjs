const ACCOUNTING_ALIASES = Object.freeze({
  invoices: "invoice",
  ap: "ap_order_or_bill",
  creditmemos: "credit_memo",
  priceagreement: "price_agreement",
  ar: "ar_remittance",
  hr: "hr_sensitive_escalate",
  payroll: "payroll_sensitive_escalate",
});
const LINEAR_IDENTIFIER = /^(?:CAT|PEC)-[0-9]+$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function classifyAccountingAlias(recipients = "", fallback = "unknown") {
  const normalized = String(recipients).toLowerCase();
  for (const [alias, classification] of Object.entries(ACCOUNTING_ALIASES)) {
    if (new RegExp(`(?:^|[,;\\s<])${alias}@cc\\.proexteriorsus\\.net\\b`, "u").test(normalized)) {
      return Object.freeze({ alias: `${alias}@cc.proexteriorsus.net`, classification });
    }
  }
  return Object.freeze({ alias: "maya.chen@cc.proexteriorsus.net", classification: fallback });
}

export async function recordCommandCenterIntake({
  payload,
  signal,
  expected,
  fetchImpl = fetch,
  token = process.env.MAYA_COMMAND_CENTER_TOKEN,
}) {
  if (!token) throw new Error("Maya Command Center token is not configured");
  const base = new URL(expected.commandCenterUrl);
  const target = new URL("/api/agent/intake", base);
  if (target.origin !== base.origin || target.protocol !== "https:") {
    throw new Error("Command Center destination is not pinned");
  }
  const response = await fetchImpl(target, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(payload),
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Command Center intake failed with HTTP ${response.status}`);
  let data;
  try { data = JSON.parse(body); } catch { throw new Error("Command Center intake returned invalid JSON"); }
  if (data?.status !== "accepted" || !data?.workItem?.work_key) {
    throw new Error("Command Center intake omitted provider confirmation");
  }
  return Object.freeze({
    workKey: String(data.workItem.work_key),
    providerReference: String(data.workItem.id ?? data.workItem.work_key).slice(0, 500),
  });
}

/**
 * Use Command Center's server-side Linear credential for the fixed CAT source →
 * PE-CC accounting child pair. The named-agent token never receives arbitrary
 * Linear mutation authority; all routing fields are pinned by the server.
 */
export async function ensureCommandCenterLinearPair({
  payload,
  signal,
  expected,
  fetchImpl = fetch,
  token = process.env.MAYA_COMMAND_CENTER_TOKEN,
}) {
  if (!token) throw new Error("Maya Command Center token is not configured");
  const base = new URL(expected.commandCenterUrl);
  const target = new URL("/api/agent/linear-orchestration", base);
  if (target.origin !== base.origin || target.protocol !== "https:") {
    throw new Error("Command Center destination is not pinned");
  }
  const response = await fetchImpl(target, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(payload),
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Command Center Linear orchestration failed with HTTP ${response.status}`);
  let data;
  try { data = JSON.parse(body); } catch { throw new Error("Command Center Linear orchestration returned invalid JSON"); }
  const sourceId = String(data?.source?.id ?? "");
  const sourceReference = String(data?.source?.identifier ?? "");
  const workId = String(data?.work?.id ?? "");
  const workReference = String(data?.work?.identifier ?? "");
  if (
    data?.status !== "accepted"
    || !UUID.test(sourceId)
    || !UUID.test(workId)
    || !LINEAR_IDENTIFIER.test(sourceReference)
    || !LINEAR_IDENTIFIER.test(workReference)
    || !sourceReference.startsWith("CAT-")
    || !workReference.startsWith("PEC-")
  ) {
    throw new Error("Command Center Linear orchestration omitted provider confirmation");
  }
  return Object.freeze({
    source: Object.freeze({ id: sourceId, reference: sourceReference, created: Boolean(data.source.created) }),
    work: Object.freeze({
      id: workId,
      reference: workReference,
      created: Boolean(data.work.created),
      parentRepaired: Boolean(data.work.parentRepaired),
    }),
  });
}
