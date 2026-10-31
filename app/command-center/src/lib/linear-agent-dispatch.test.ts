import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decideDispatch, mentionsAgentsApp, verifyLinearSignature, PAID_SESSION_LANES } from "./linear-agent-dispatch";

const SECRET = "synthetic-linear-secret";
const sign = (raw: string, secret = SECRET) => createHmac("sha256", secret).update(raw).digest("hex");

describe("Linear webhook signature", () => {
  const raw = JSON.stringify({ webhookTimestamp: 1_000_000 });
  it("accepts a correct signature within the replay window", () => {
    expect(verifyLinearSignature(raw, sign(raw), SECRET, 1_000_000 + 30_000)).toBe(true);
  });
  it("rejects a wrong signature", () => {
    expect(verifyLinearSignature(raw, sign(raw, "other"), SECRET, 1_000_000)).toBe(false);
  });
  it("rejects a missing signature", () => {
    expect(verifyLinearSignature(raw, null, SECRET, 1_000_000)).toBe(false);
  });
  it("rejects a tampered body", () => {
    expect(verifyLinearSignature(raw.replace("1000000", "1000001"), sign(raw), SECRET, 1_000_000)).toBe(false);
  });
  it("rejects a replay older than 60 seconds", () => {
    expect(verifyLinearSignature(raw, sign(raw), SECRET, 1_000_000 + 61_000)).toBe(false);
  });
});

describe("mention detection", () => {
  it.each(["@PE Dev Agents please redo", "hey @pe-dev-agents", "[@PE Dev Agents](https://linear.app/cleverwork/profiles/pe-dev-agents) go"])("detects %s", (body) => {
    expect(mentionsAgentsApp(body)).toBe(true);
  });
  it("ignores plain mentions of the words", () => {
    expect(mentionsAgentsApp("the dev agents broke this")).toBe(false);
  });
});

const APP_USER = "app-user";
describe("dispatch routing", () => {
  const comment = (body: string, userId = "chris") => ({ type: "Comment", action: "create", data: { id: "c1", body, userId, issueId: "i1" } });

  it("routes an @mention comment to the issue's lane agent", () => {
    const d = decideDispatch(comment("@PE Dev Agents take another pass"), { issueLabelNames: ["lane:cw-grok", "bug"], appUserId: APP_USER });
    expect(d).toMatchObject({ kind: "dispatch", lane: "cw-grok", trigger: "mention", issueId: "i1", paidSession: true });
  });

  it("enqueues lane:cw-cursor and lane:cw-codex without a paid session", () => {
    for (const lane of ["cw-cursor", "cw-codex"]) {
      const d = decideDispatch(comment("@PE Dev Agents go"), { issueLabelNames: [`lane:${lane}`], appUserId: APP_USER });
      expect(d).toMatchObject({ kind: "dispatch", lane, paidSession: false });
    }
    expect([...PAID_SESSION_LANES]).not.toContain("cw-cursor");
  });

  it("ignores comments without the mention", () => {
    expect(decideDispatch(comment("looks good"), { issueLabelNames: ["lane:cw-grok"], appUserId: APP_USER })).toMatchObject({ kind: "ignore", reason: "no_trigger" });
  });

  it("ignores the app's own comments so it can't loop", () => {
    expect(decideDispatch(comment("@PE Dev Agents done", APP_USER), { issueLabelNames: ["lane:cw-grok"], appUserId: APP_USER })).toMatchObject({ kind: "ignore", reason: "self_authored" });
  });

  it("routes when agent-go is newly added to an issue", () => {
    const event = {
      type: "Issue",
      action: "update",
      data: { id: "i2", labels: [{ id: "l1", name: "lane:sentinel" }, { id: "go", name: "agent-go" }], labelIds: ["l1", "go"] },
      updatedFrom: { labelIds: ["l1"] },
    };
    expect(decideDispatch(event, { appUserId: APP_USER })).toMatchObject({ kind: "dispatch", lane: "sentinel", trigger: "agent-go", issueId: "i2" });
  });

  it("does not re-fire when agent-go was already present", () => {
    const event = {
      type: "Issue",
      action: "update",
      data: { id: "i2", labels: [{ id: "l1", name: "lane:sentinel" }, { id: "go", name: "agent-go" }], labelIds: ["l1", "go"] },
      updatedFrom: { title: "old" },
    };
    expect(decideDispatch(event, { appUserId: APP_USER })).toMatchObject({ kind: "ignore" });
  });

  it("flags a trigger on an issue with no lane label as unrouted", () => {
    expect(decideDispatch(comment("@PE Dev Agents go"), { issueLabelNames: ["bug"], appUserId: APP_USER })).toMatchObject({ kind: "unrouted", issueId: "i1" });
  });

  it("flags an issue with two lane labels as unrouted rather than guessing", () => {
    expect(decideDispatch(comment("@PE Dev Agents go"), { issueLabelNames: ["lane:cw-grok", "lane:cw-claude"], appUserId: APP_USER })).toMatchObject({ kind: "unrouted" });
  });
});
