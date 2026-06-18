// Outbound recipient allowlist — the code-enforced guarantee that an AGENT never
// emails outside the company (first-deployment rule, Chris 2026-06-18).
//
// Agents may draft and notify INTERNAL people (Lucinda/Roberto, operators). Any
// EXTERNAL recipient (e.g. Justin Garza @abcsupply.com) must be sent by a HUMAN
// from Hermes / Google Workspace (agents.proexteriorsus.net) — never by an agent.
//
// This module classifies recipients; every send path must route through it and
// refuse to transmit to anything classify-external. Drafting/persisting an
// external recipient is fine — only an automated SEND is forbidden.

import { getRuntimeEnv } from "@lib/runtime-env";

// Internal company + operator domains. Subdomains count as internal too
// (e.g. cc.proexteriorsus.net, agentmail.proexteriorsus.net).
const DEFAULT_INTERNAL_DOMAINS = ["proexteriorsus.com", "proexteriorsus.net", "cleverwork.io"];

function internalDomains(): string[] {
  const raw = getRuntimeEnv().INTERNAL_EMAIL_DOMAINS ?? "";
  const extra = String(raw).split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  return Array.from(new Set([...DEFAULT_INTERNAL_DOMAINS, ...extra]));
}

export function emailDomain(email: string): string {
  const at = String(email ?? "").trim().toLowerCase().lastIndexOf("@");
  return at >= 0 ? email.trim().toLowerCase().slice(at + 1) : "";
}

export function isInternalRecipient(email: string): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  return internalDomains().some((d) => domain === d || domain.endsWith("." + d));
}

export interface RecipientClassification {
  ok: boolean;            // true only if EVERY recipient is internal (safe to auto-send)
  internal: string[];
  external: string[];     // these must be human-sent, never agent-sent
}

export function classifyRecipients(emails: Array<string | null | undefined>): RecipientClassification {
  const internal: string[] = [];
  const external: string[] = [];
  for (const e of emails) {
    const email = String(e ?? "").trim();
    if (!email) continue;
    (isInternalRecipient(email) ? internal : external).push(email);
  }
  return { ok: external.length === 0, internal, external };
}

// Guard for any automated send path. Throws if any recipient is external.
// (Slice 4 does not auto-send at all — this is the primitive every future send
// must call so "zero external agent sends" stays a code invariant, not a hope.)
export function assertAgentSendAllowed(emails: Array<string | null | undefined>): void {
  const { external } = classifyRecipients(emails);
  if (external.length > 0) {
    throw new Error(`Outbound blocked: ${external.length} external recipient(s) [${external.join(", ")}] must be sent by a human, not an agent.`);
  }
}
