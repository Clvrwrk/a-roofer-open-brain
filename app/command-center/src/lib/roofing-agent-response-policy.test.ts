import { describe, expect, it } from "vitest";
import { decideRoofingOpsResponse } from "./roofing-agent-response-policy";

describe("decideRoofingOpsResponse", () => {
  it("routes a clear SOP match to one named agent in the public thread", () => {
    const decision = decideRoofingOpsResponse({
      channelId: "C0BCUF29G1H",
      channelType: "channel",
      userId: "U123",
      text: "Can someone intake this invoice PDF?",
    });

    expect(decision.kind).toBe("single_agent");
    expect(decision.agent).toBe("maya");
    expect(decision.replyMode).toBe("thread");
  });

  it("routes overlapping SOP matches to Ops Conductor", () => {
    const decision = decideRoofingOpsResponse({
      channelId: "C0BCUF29G1H",
      channelType: "channel",
      userId: "U123",
      text: "This invoice price agreement dispute needs a vendor draft.",
    });

    expect(decision.kind).toBe("ops_overlap");
    expect(decision.candidates).toEqual(expect.arrayContaining(["maya", "alex", "casey"]));
  });

  it("does not answer out-of-domain ambient messages", () => {
    const decision = decideRoofingOpsResponse({
      channelId: "C0BCUF29G1H",
      channelType: "channel",
      userId: "U123",
      text: "How do I bake a cake?",
    });

    expect(decision.kind).toBe("ignore");
    expect(decision.reason).toBe("out_of_domain");
  });

  it("redirects named-agent DMs back to public channels", () => {
    const decision = decideRoofingOpsResponse({
      channelId: "D123",
      channelType: "im",
      userId: "U123",
      text: "Alex can you check this SKU?",
      targetAgent: "alex",
    });

    expect(decision.kind).toBe("dm_redirect");
  });

  it("allows Ops Conductor DM path for Chris/admin", () => {
    const decision = decideRoofingOpsResponse({
      channelId: "D123",
      channelType: "im",
      userId: "U_CHRIS",
      text: "What needs my attention?",
      targetAgent: "ops",
      adminUserIds: new Set(["U_CHRIS"]),
    });

    expect(decision.kind).toBe("single_agent");
    expect(decision.agent).toBe("ops");
  });

  it("gates Rowan research behind Chris approval", () => {
    const decision = decideRoofingOpsResponse({
      channelId: "C0BCYNW98RL",
      channelType: "channel",
      userId: "U123",
      text: "Research new Owens Corning warranty rules in Texas.",
    });

    expect(decision.kind).toBe("research_approval_required");
    expect(decision.agent).toBe("rowan");
  });

  it("routes unclear files to Ops escalation", () => {
    const decision = decideRoofingOpsResponse({
      channelId: "C0BCUF29G1H",
      channelType: "channel",
      userId: "U123",
      text: "What is this?",
      files: [{ id: "F1", name: "mystery.bin", mimetype: "application/octet-stream" }],
    });

    expect(decision.kind).toBe("ops_escalation");
    expect(decision.reason).toContain("unclear_file_request");
  });
});
