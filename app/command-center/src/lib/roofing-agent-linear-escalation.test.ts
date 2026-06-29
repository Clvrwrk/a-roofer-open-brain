import { describe, expect, it } from "vitest";
import { buildRoofingOpsLinearEscalation, buildChrisAdminNotification } from "./roofing-agent-linear-escalation";

describe("buildRoofingOpsLinearEscalation", () => {
  it("builds a DevTeam Linear escalation payload for unclear agent requests", () => {
    const escalation = buildRoofingOpsLinearEscalation({
      kind: "feature",
      summary: "Agents need support for a new supplier file type",
      slackChannelId: "C0BCUF29G1H",
      slackThreadTs: "123.456",
      slackUserId: "U123",
      requestText: "Can the agents process this file?",
      fileSummaries: [{ id: "F1", name: "supplier-export.xyz", mimetype: "application/octet-stream" }],
      reason: "unsupported_file_type",
    });

    expect(escalation.team).toBe("PE-CC-DevTeam");
    expect(escalation.project).toBe("PE-CC-DevEngine");
    expect(escalation.title).toContain("[roofing ops intake][feature]");
    expect(escalation.description).toContain("C0BCUF29G1H");
    expect(escalation.description).toContain("supplier-export.xyz");
    expect(escalation.labels).toContain("agent-instructions");
  });
});

describe("buildChrisAdminNotification", () => {
  it("builds a friendly NEPQ notification for Chris/admin", () => {
    const text = buildChrisAdminNotification({
      title: "[roofing ops intake][bug] Upload failed",
      linearUrl: "https://linear.app/cleverwork/issue/PEC-99/upload-failed",
      reason: "bug",
    });

    expect(text).toContain("SITUATION:");
    expect(text).toContain("IMPACT:");
    expect(text).toContain("TICKET:");
    expect(text).toContain("https://linear.app/cleverwork/issue/PEC-99/upload-failed");
  });
});
