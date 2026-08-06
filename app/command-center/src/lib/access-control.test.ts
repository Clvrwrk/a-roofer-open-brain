import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  NAMED_AGENT_IDENTITIES,
  SERVICE_AGENT_IDENTITIES,
  actorCanAccessDepartment,
  actorCanWrite,
  isLocalOperatorFallbackAllowed,
  localActor,
  resolveActorFromSessionUser,
  resolveServiceActorFromToken,
} from "@lib/access-control";

describe("isLocalOperatorFallbackAllowed — the unauthenticated dev path fails closed (PEC-135)", () => {
  it("is denied when COMMAND_CENTER_AUTH_MODE is unset or misspelled", () => {
    expect(isLocalOperatorFallbackAllowed({})).toBe(false);
    expect(isLocalOperatorFallbackAllowed({ COMMAND_CENTER_AUTH_MODE: "" })).toBe(false);
    expect(isLocalOperatorFallbackAllowed({ COMMAND_CENTER_AUTH_MODE: "workis" })).toBe(false);
    expect(isLocalOperatorFallbackAllowed({ COMMAND_CENTER_AUTH_MODE: "workos" })).toBe(false);
  });

  it("is denied in a production runtime even with an explicit opt-in mode", () => {
    expect(isLocalOperatorFallbackAllowed({ COMMAND_CENTER_AUTH_MODE: "disabled", NODE_ENV: "production" })).toBe(false);
    expect(isLocalOperatorFallbackAllowed({ COMMAND_CENTER_AUTH_MODE: "local", NODE_ENV: "production" })).toBe(false);
  });

  it("is allowed for explicit local/disabled modes off production", () => {
    expect(isLocalOperatorFallbackAllowed({ COMMAND_CENTER_AUTH_MODE: "local" })).toBe(true);
    expect(isLocalOperatorFallbackAllowed({ COMMAND_CENTER_AUTH_MODE: "Disabled", NODE_ENV: "development" })).toBe(true);
  });

  it("honors the explicit production escape hatch", () => {
    expect(
      isLocalOperatorFallbackAllowed({
        COMMAND_CENTER_AUTH_MODE: "local",
        NODE_ENV: "production",
        COMMAND_CENTER_ALLOW_LOCAL_OPERATOR: "true",
      }),
    ).toBe(true);
  });
});

describe("actorCanWrite — department access alone must not admit read-only viewers", () => {
  // Viewers only exist when open access is off; otherwise every authenticated human is a member.
  const viewer = resolveActorFromSessionUser(
    { email: "outsider@proexteriorsus.com", firstName: "Read", lastName: "Only" },
    { COMMAND_CENTER_OPEN_ACCESS: "false", COMMAND_CENTER_VIEWER_DOMAINS: "proexteriorsus.com" },
  );

  it("gives a viewer access to every department but no write capability", () => {
    expect(viewer).not.toBeNull();
    expect(viewer!.roles).toContain("viewer");
    expect(actorCanAccessDepartment(viewer!, "accounting")).toBe(true);
    expect(actorCanWrite(viewer!)).toBe(false);
  });

  it("admits the identities that legitimately write", () => {
    expect(actorCanWrite(localActor())).toBe(true);
    const admin = resolveActorFromSessionUser(
      { email: "chussey@cleverwork.io" },
      { COMMAND_CENTER_OPEN_ACCESS: "false", COMMAND_CENTER_HUMAN_ADMIN_EMAILS: "chussey@cleverwork.io" },
    );
    expect(actorCanWrite(admin!)).toBe(true);

    const token = "test-service-agent-token";
    const hash = createHash("sha256").update(token).digest("hex");
    const serviceActor = resolveServiceActorFromToken(token, {
      AGENT_SERVICE_TOKEN_SHA256_OB_ACCOUNTING: hash,
    } as never);
    expect(serviceActor).not.toBeNull();
    expect(actorCanWrite(serviceActor!)).toBe(true);
  });
});

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
