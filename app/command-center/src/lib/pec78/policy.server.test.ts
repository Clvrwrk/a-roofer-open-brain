import { describe, expect, it } from "vitest";
import { evaluatePec78Policy } from "./policy.server";
import { PEC78_CONTRACT_VERSION } from "./contract";

const valid = { contractVersion: PEC78_CONTRACT_VERSION, subject: "named-agent:maya-chen", personaId: "maya-chen", capability: "slack.receive.christopher", method: "POST", pathname: "/api/agent/runtime/v1/events/slack/claim" };

describe("PEC-78 default-deny policy", () => {
  it("allows only the exact Maya route tuple", () => expect(evaluatePec78Policy(valid).allow).toBe(true));
  it.each([
    ["contractVersion", "v2"], ["subject", "named-agent:alex-rivers"], ["personaId", "alex-rivers"],
    ["capability", "email.send.admin"], ["method", "GET"], ["pathname", "/api/agent/intake"],
  ])("denies a changed %s", (field, value) => expect(evaluatePec78Policy({ ...valid, [field]: value }).allow).toBe(false));
  it("denies unknown routes", () => expect(evaluatePec78Policy({ ...valid, pathname: "/api/agent/runtime/v1/unknown" }).allow).toBe(false));
});
