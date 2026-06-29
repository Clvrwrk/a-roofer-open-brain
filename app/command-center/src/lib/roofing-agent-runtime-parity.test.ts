import { describe, expect, it } from "vitest";
import { buildRoutingMessage } from "../../runtime/roofing-ops-agent-router.mjs";

describe("roofing-ops runtime router parity", () => {
  it("can render research approval and escalation messages from runtime module", () => {
    expect(buildRoutingMessage({ kind: "research_approval_required", agent: "rowan", reason: "research_requires_chris_approval" })).toContain("approve research");
    expect(buildRoutingMessage({ kind: "ops_escalation", agent: "ops", reason: "undefined_sop_or_unsupported_request" })).toContain("DevTeam review item");
  });

  it("does not render ignored messages", () => {
    expect(buildRoutingMessage({ kind: "ignore", reason: "out_of_domain" })).toBeNull();
  });
});
