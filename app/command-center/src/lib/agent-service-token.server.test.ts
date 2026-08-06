import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { resolveRegistryServiceActorFromBearer } from "./agent-service-token.server";

describe("Supabase named-agent service token registry", () => {
  it("resolves an active Maya digest without passing the raw token to storage", async () => {
    const lookup = vi.fn(async () => ({
      agent_id: "maya-chen",
      state: "active" as const,
      not_before: "2026-08-01T00:00:00.000Z",
      expires_at: "2027-08-01T00:00:00.000Z",
    }));
    const rawToken = "test-only-maya-registry-token";
    const request = new Request("https://cc.example/api/agent/intake", {
      headers: { authorization: `Bearer ${rawToken}` },
    });

    const actor = await resolveRegistryServiceActorFromBearer(request, {}, lookup);

    expect(lookup).toHaveBeenCalledWith(createHash("sha256").update(rawToken).digest("hex"));
    expect(lookup).not.toHaveBeenCalledWith(rawToken);
    expect(actor).toMatchObject({ id: "maya-chen", type: "named_agent", source: "service_token" });
    expect(actor?.permissions).not.toContain("approval.decide_prod_write");
  });

  it("fails closed for expired, revoked, and unknown agent records", async () => {
    const request = new Request("https://cc.example/api/agent/intake", {
      headers: { authorization: "Bearer test-token" },
    });
    const expired = async () => ({
      agent_id: "maya-chen",
      state: "active" as const,
      not_before: null,
      expires_at: "2020-01-01T00:00:00.000Z",
    });
    const revoked = async () => ({
      agent_id: "maya-chen",
      state: "revoked" as const,
      not_before: null,
      expires_at: null,
    });
    const unknown = async () => ({
      agent_id: "not-a-rostered-agent",
      state: "active" as const,
      not_before: null,
      expires_at: null,
    });

    expect(await resolveRegistryServiceActorFromBearer(request, {}, expired)).toBeNull();
    expect(await resolveRegistryServiceActorFromBearer(request, {}, revoked)).toBeNull();
    expect(await resolveRegistryServiceActorFromBearer(request, {}, unknown)).toBeNull();
  });
});
