import { describe, expect, it } from "vitest";
import { evaluateIntakeGuard, normalizeSender } from "./agent-intake-guard";

// Cases are the real historical messages that flooded the queue, so a
// regression here means the same tickets come back.
describe("evaluateIntakeGuard", () => {
  it("drops Maya's own receipt echo (PEC-167/169/170 self-receipt loop)", () => {
    const verdict = evaluateIntakeGuard({
      from: "Maya Chen <maya.chen@cc.proexteriorsus.net>",
      receivedAt: "2026-08-06T02:00:31.000Z",
    });
    expect(verdict.action).toBe("drop");
    expect(verdict).toMatchObject({ rule: "self_receipt_loop" });
  });

  it("drops any agent workspace sender, not just Maya", () => {
    expect(evaluateIntakeGuard({ from: "alex.rivers@cc.proexteriorsus.net", receivedAt: "2026-08-06T02:00:31.000Z" }).action).toBe("drop");
  });

  it("folds the 6/6 Google security notices onto one monthly key (PEC-149..155)", () => {
    const authenticator = evaluateIntakeGuard({ from: "Google <no-reply@accounts.google.com>", receivedAt: "2026-06-06T22:55:37.000Z" });
    const twoStep = evaluateIntakeGuard({ from: "no-reply@accounts.google.com", receivedAt: "2026-06-06T22:56:16.000Z" });
    const recovery = evaluateIntakeGuard({ from: "Google <no-reply@accounts.google.com>", receivedAt: "2026-06-07T05:14:29.000Z" });

    expect(authenticator).toMatchObject({ action: "fold", orchestrationKey: "security-notice:2026-06" });
    // Three separate notices in the same month converge on one work item.
    expect(twoStep).toMatchObject({ orchestrationKey: "security-notice:2026-06" });
    expect(recovery).toMatchObject({ orchestrationKey: "security-notice:2026-06" });
  });

  it("folds Drive share and WorkOS notices too (PEC-152/153/157)", () => {
    expect(evaluateIntakeGuard({ from: '"Christopher Hussey (via Google Sheets)" <drive-shares-dm-noreply@google.com>', receivedAt: "2026-06-06T23:10:47.000Z" }))
      .toMatchObject({ action: "fold", orchestrationKey: "security-notice:2026-06" });
    expect(evaluateIntakeGuard({ from: "Cleverwork <access@workos-mail.com>", receivedAt: "2026-06-25T01:20:29.000Z" }))
      .toMatchObject({ action: "fold", orchestrationKey: "security-notice:2026-06" });
  });

  it("rotates the fold bucket by month so a stale notice cannot reopen a closed month", () => {
    expect(evaluateIntakeGuard({ from: "no-reply@accounts.google.com", receivedAt: "2026-07-01T00:00:00.000Z" }))
      .toMatchObject({ orchestrationKey: "security-notice:2026-07" });
  });

  it("accepts a real accounting message from Lucinda untouched", () => {
    expect(evaluateIntakeGuard({
      from: "Lucinda Dunn <accounting@proexteriorsus.com>",
      receivedAt: "2026-08-11T23:51:47.000Z",
    })).toEqual({ action: "accept" });
  });

  it("accepts a vendor message untouched", () => {
    expect(evaluateIntakeGuard({ from: "blake.wells@srsdistribution.com", receivedAt: "2026-08-13T14:11:42.000Z" }).action).toBe("accept");
  });

  it("normalizes display-name-wrapped and mixed-case senders", () => {
    expect(normalizeSender('"Google" <No-Reply@Accounts.Google.com>')).toBe("no-reply@accounts.google.com");
    expect(normalizeSender("  plain@example.com  ")).toBe("plain@example.com");
  });

  it("does not crash on an unparseable date", () => {
    expect(evaluateIntakeGuard({ from: "no-reply@accounts.google.com", receivedAt: "not-a-date" }))
      .toMatchObject({ action: "fold", orchestrationKey: "security-notice:undated" });
  });
});
