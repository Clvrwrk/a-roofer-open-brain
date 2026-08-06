import { describe, expect, it } from "vitest";
import type { CommandCenterActor } from "@lib/access-control";
import { actorDisplayName, apiError, isUuid, requireActor } from "@lib/api-guards";

function actorOf(overrides: Partial<CommandCenterActor> = {}): CommandCenterActor {
  return {
    id: "human:lucinda@proexteriorsus.net",
    type: "human",
    displayName: "Lucinda Dunn",
    email: "lucinda@proexteriorsus.net",
    source: "workos",
    roles: ["accounting"],
    permissions: ["command_center.read", "approval.decide"],
    departmentAccess: ["accounting"],
    desktopEnabled: false,
    ...overrides,
  } as CommandCenterActor;
}

const localsOf = (actor: CommandCenterActor | null) => ({ actor }) as App.Locals;

describe("requireActor", () => {
  it("401s an unauthenticated request", async () => {
    const { actor, response } = requireActor(localsOf(null));
    expect(actor).toBeNull();
    expect(response!.status).toBe(401);
  });

  it("passes an actor holding the department and permission", () => {
    const { actor, response } = requireActor(localsOf(actorOf()), {
      department: "accounting",
      permission: "approval.decide",
    });
    expect(response).toBeNull();
    expect(actor!.displayName).toBe("Lucinda Dunn");
  });

  it("403s with the caller's message when the department is out of reach", async () => {
    const { actor, response } = requireActor(localsOf(actorOf()), {
      department: "operations",
      forbiddenMessage: "This actor cannot schedule crews.",
    });
    expect(actor).toBeNull();
    expect(response!.status).toBe(403);
    await expect(response!.json()).resolves.toMatchObject({
      error: "forbidden",
      error_description: "This actor cannot schedule crews.",
    });
  });

  it("403s on a missing permission even when the department matches", () => {
    const readOnly = actorOf({ permissions: ["command_center.read"] });
    const { response } = requireActor(localsOf(readOnly), {
      department: "accounting",
      permission: "approval.decide",
    });
    expect(response!.status).toBe(403);
  });

  it("treats a department list as any-of, and merges forbiddenExtra into the 403", async () => {
    const ok = requireActor(localsOf(actorOf()), { department: ["operations", "accounting"] });
    expect(ok.response).toBeNull();

    const denied = requireActor(localsOf(actorOf()), {
      department: ["operations", "sales"],
      forbiddenExtra: (a) => ({ actor: { id: a.id } }),
    });
    await expect(denied.response!.json()).resolves.toMatchObject({ actor: { id: "human:lucinda@proexteriorsus.net" } });
  });
});

describe("apiError / actorDisplayName / isUuid", () => {
  it("shapes an error body as { error, error_description }", async () => {
    const response = apiError("invalid_request", "invoiceNumber is required.", 400, { field: "invoiceNumber" });
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      error: "invalid_request",
      error_description: "invoiceNumber is required.",
      field: "invoiceNumber",
    });
  });

  it("falls back through displayName → id → 'operator'", () => {
    expect(actorDisplayName(actorOf())).toBe("Lucinda Dunn");
    expect(actorDisplayName(actorOf({ displayName: "" }))).toBe("human:lucinda@proexteriorsus.net");
    expect(actorDisplayName(null)).toBe("operator");
  });

  it("accepts only v1–v5 UUIDs", () => {
    expect(isUuid("6f2b9d2e-2f1f-4d1a-8c2e-1a2b3c4d5e6f")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});
