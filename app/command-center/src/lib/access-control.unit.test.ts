import { describe, expect, it } from "vitest";
import {
  actorCanAccessDepartment,
  hasPermission,
  resolveActorFromSessionUser,
} from "@lib/access-control";

const lucinda = { email: "lucinda@proexteriorsus.net", firstName: "Lucinda", lastName: "Dunn" };

describe("resolveActorFromSessionUser — open access (default ON)", () => {
  it("grants any authenticated human full access when COMMAND_CENTER_OPEN_ACCESS is unset (default open)", () => {
    const actor = resolveActorFromSessionUser(lucinda, {});
    expect(actor).not.toBeNull();
    expect(actor!.type).toBe("human");
    expect(actor!.departmentAccess).toBe("all");
    // The permission that gated the export-batches workflow.
    expect(hasPermission(actor!, "approval.decide")).toBe(true);
    expect(actorCanAccessDepartment(actor!, "accounting")).toBe(true);
  });

  it("grants full access when explicitly enabled", () => {
    const actor = resolveActorFromSessionUser(lucinda, { COMMAND_CENTER_OPEN_ACCESS: "true" });
    expect(hasPermission(actor!, "approval.decide")).toBe(true);
  });

  it("falls back to allowlist gating when open access is disabled", () => {
    // No allowlists set + open access off => unauthorized (null → /auth/denied).
    const denied = resolveActorFromSessionUser(lucinda, { COMMAND_CENTER_OPEN_ACCESS: "false" });
    expect(denied).toBeNull();

    // On the accounting allowlist + open access off => accounting actor with approval.decide.
    const accounting = resolveActorFromSessionUser(lucinda, {
      COMMAND_CENTER_OPEN_ACCESS: "false",
      COMMAND_CENTER_ROLE_ACCOUNTING_EMAILS: "lucinda@proexteriorsus.net",
    });
    expect(accounting).not.toBeNull();
    expect(hasPermission(accounting!, "approval.decide")).toBe(true);
    expect(actorCanAccessDepartment(accounting!, "accounting")).toBe(true);
  });

  it("does not override named-agent identities (they keep scoped permissions)", () => {
    const agent = resolveActorFromSessionUser({ email: "alex.rivers@cc.proexteriorsus.net" }, {});
    expect(agent!.type).toBe("named_agent");
    // Named agents intentionally cannot decide approvals even under open access.
    expect(hasPermission(agent!, "approval.decide")).toBe(false);
  });
});
