import { describe, expect, it } from "vitest";

/**
 * Prompt-injection canary patterns — Red Team Cycle 1/2 regression suite.
 * External content must stay data, never instructions (framework-application-plan).
 */

const INJECTION_PATTERNS = [
  "ignore previous instructions",
  "system: you are now",
  "SUPABASE_SERVICE_ROLE_KEY=",
  "delete from public.thoughts",
  "override trust_tier to instruction",
];

function wrapExternalContent(raw: string) {
  return `<external_content trust="untrusted">\n${raw.replace(/<\/external_content>/gi, "")}\n</external_content>`;
}

function containsInstructionEscalation(wrapped: string) {
  const inner = wrapped.replace(/<\/?external_content[^>]*>/gi, "");
  return INJECTION_PATTERNS.some((p) => inner.toLowerCase().includes(p.toLowerCase()));
}

describe("prompt-injection canary", () => {
  it("wraps external content in trust boundary tags", () => {
    const wrapped = wrapExternalContent("hello");
    expect(wrapped).toContain('trust="untrusted"');
    expect(wrapped).toContain("hello");
  });

  it("detects common injection phrases in external payloads", () => {
    for (const phrase of INJECTION_PATTERNS) {
      expect(containsInstructionEscalation(wrapExternalContent(phrase))).toBe(true);
    }
  });

  it("does not flag benign external text", () => {
    expect(containsInstructionEscalation(wrapExternalContent("Invoice #12345 total $500"))).toBe(false);
  });
});
