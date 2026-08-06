import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { NAMED_AGENT_IDENTITIES, SERVICE_AGENT_IDENTITIES, actorCanAccessDepartment, resolveServiceActorFromToken } from "@lib/access-control";

describe("SERVICE_AGENT_IDENTITIES — ob-acculynx roster entry (REQ-09 / SC2)", () => {
  it("contains exactly one entry with id 'ob-acculynx'", () => {
    const matches = SERVICE_AGENT_IDENTITIES.filter((agent) => agent.id === "ob-acculynx");
    expect(matches).toHaveLength(1);
  });

  it("has departmentAccess === 'all' (the string, not an array) — LANE_DEPARTMENT spans sales/accounting/operations", () => {
    const agent = SERVICE_AGENT_IDENTITIES.find((candidate) => candidate.id === "ob-acculynx");
    expect(agent).toBeDefined();
    expect(agent!.departmentAccess).toBe("all");
  });

  it("resolves to an actor whose 'all' grant covers sales, accounting, and operations departments", () => {
    const env = { AGENT_SERVICE_TOKEN_SHA256_OB_ACCULYNX: undefined };
    // Resolve via the same shape resolveServiceActorFromToken produces for any agent
    // in the roster, without depending on a live token — build the actor the same way
    // serviceAgentToActor does internally by round-tripping through the public resolver
    // using a temporary hashed-token env var.
    const token = "test-ob-acculynx-token";
    const hash = createHash("sha256").update(token).digest("hex");
    const actor = resolveServiceActorFromToken(token, {
      ...env,
      AGENT_SERVICE_TOKEN_SHA256_OB_ACCULYNX: hash,
    } as never);

    expect(actor).not.toBeNull();
    expect(actor!.id).toBe("ob-acculynx");
    expect(actorCanAccessDepartment(actor!, "sales")).toBe(true);
    expect(actorCanAccessDepartment(actor!, "accounting")).toBe(true);
    expect(actorCanAccessDepartment(actor!, "operations")).toBe(true);
  });
});

describe("named-agent runtime bearer identities", () => {
  it("resolves Maya's hashed runtime token as Maya with scoped non-approval permissions", () => {
    expect(NAMED_AGENT_IDENTITIES.some((agent) => agent.id === "maya-chen")).toBe(true);
    const token = "test-maya-runtime-token";
    const hash = createHash("sha256").update(token).digest("hex");
    const actor = resolveServiceActorFromToken(token, {
      AGENT_SERVICE_TOKEN_SHA256_MAYA_CHEN: hash,
    } as never);

    expect(actor).toMatchObject({
      id: "maya-chen",
      type: "named_agent",
      source: "service_token",
      departmentAccess: ["accounting", "system"],
    });
    expect(actor!.permissions).toContain("evidence.attach");
    expect(actor!.permissions).not.toContain("approval.decide");
    expect(actor!.permissions).not.toContain("approval.decide_prod_write");
  });
});
