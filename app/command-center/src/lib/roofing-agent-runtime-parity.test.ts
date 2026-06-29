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

  it("keeps Slack file_share messages eligible for routing", async () => {
    const { handleRoofingOpsMessage } = await import("../../runtime/roofing-ops-agent-router.mjs");
    const posts: Array<{ text: string }> = [];
    const client = {
      files: {
        info: async () => ({ file: { id: "F1", name: "mystery.bin", mimetype: "application/octet-stream", filetype: "binary" } }),
      },
      chat: {
        postMessage: async (payload: { text: string }) => {
          posts.push(payload);
          return { ok: true, ts: "1.2" };
        },
      },
    };

    const result = await handleRoofingOpsMessage({
      client,
      env: { ROOFING_OPS_RUNTIME_AGENT: "ops", SLACK_BOT_TOKEN: "xoxb-test" },
      logger: console,
      message: {
        channel: "C0BCUF29G1H",
        channel_type: "channel",
        files: [{ id: "F1" }],
        subtype: "file_share",
        text: "What is this?",
        ts: "123.456",
        user: "U1",
      },
    });

    expect(result?.kind).toBe("ops_escalation");
    expect(posts[0]?.text).toContain("DevTeam review item");
  });
});
