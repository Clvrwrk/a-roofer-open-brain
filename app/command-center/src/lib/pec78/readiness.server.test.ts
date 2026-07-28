import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { getPec78ComposioServerReadiness, getPec78Readiness } from "./readiness.server";

describe("PEC-78 readiness", () => {
  it("is stopped by default", () => expect(getPec78Readiness({}).status).toBe("stopped"));
  it("cannot turn ready from the mode flag alone", () => expect(getPec78Readiness({ PEC78_ADAPTER_MODE: "enabled" }).status).toBe("degraded"));
  it("never turns ready from configuration strings", () => expect(getPec78Readiness({ PEC78_ADAPTER_MODE: "enabled", PEC78_PRODUCTION_GATE_DIGEST: "sha256:x", PEC78_MAYA_PUBLIC_JWK: "{}", PEC78_MAYA_JWK_THUMBPRINT: "sha256:x", PEC78_REGISTRY_VERSION: "sha256:x" }).status).toBe("degraded"));
  it("requires every fresh database observation", () => {
    const maya = generateKeyPairSync("ed25519"); const issuer = generateKeyPairSync("ed25519");
    const mayaPublic = maya.publicKey.export({ format: "jwk" });
    const env = { PEC78_ADAPTER_MODE: "shadow", PEC78_PRODUCTION_GATE_DIGEST: "sha256:x", PEC78_MAYA_PUBLIC_JWK: JSON.stringify(mayaPublic), PEC78_MAYA_JWK_THUMBPRINT: "configured-separately", PEC78_ISSUER_PUBLIC_JWK: JSON.stringify(issuer.publicKey.export({ format: "jwk" })), PEC78_ISSUER_PRIVATE_JWK: JSON.stringify(issuer.privateKey.export({ format: "jwk" })), PEC78_REGISTRY_VERSION: "sha256:x" };
    const store = Object.fromEntries(["principal_active", "credential_active", "capabilities_active", "destinations_active", "schedule_disabled", "gate_active", "budget_active", "no_kill_switch", "no_active_lease", "no_unreconciled_effect"].map((key) => [key, true]));
    expect(getPec78Readiness(env, store).status).toBe("ready");
    expect(getPec78Readiness(env, { ...store, schedule_disabled: false }).status).toBe("degraded");
  });
});

describe("PEC-78 Composio server readiness", () => {
  it("cannot become ready from configuration alone", () => {
    expect(getPec78ComposioServerReadiness({ PEC78_ADAPTER_MODE: "shadow", PEC78_COMPOSIO_INGRESS_MODE: "validation" }).status).toBe("degraded");
  });
  it("names external worker/trigger evidence as a separate gate", () => {
    expect(getPec78ComposioServerReadiness({}).note).toMatch(/separate live operator evidence/);
  });
  it("requires the exact database authority tuple and every zero-state invariant", () => {
    const maya = generateKeyPairSync("ed25519"); const issuer = generateKeyPairSync("ed25519");
    const env = {
      PEC78_ADAPTER_MODE: "shadow", PEC78_COMPOSIO_INGRESS_MODE: "validation",
      PEC78_COMPOSIO_WEBHOOK_SECRET: "configured", PEC78_EVENT_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
      PEC78_EVENT_ENCRYPTION_KEY_VERSION: "maya-v1", PEC78_COMPOSIO_TRIGGER_ID: "ti_new_maya_fixture",
      PEC78_COMPOSIO_CONNECTED_ACCOUNT_ID: "ca_X9dQyRDSS0sa", PEC78_COMPOSIO_USER_ID: "maya-chen",
      PEC78_REGISTRY_VERSION: "sha256:fixture", PEC78_RUNTIME_INSTANCE_ID: "78000000-0000-4000-8000-000000000102",
      PEC78_MAYA_PUBLIC_JWK: JSON.stringify(maya.publicKey.export({ format: "jwk" })),
      PEC78_ISSUER_PUBLIC_JWK: JSON.stringify(issuer.publicKey.export({ format: "jwk" })),
      PEC78_ISSUER_PRIVATE_JWK: JSON.stringify(issuer.privateKey.export({ format: "jwk" })),
    };
    const store = Object.fromEntries([
      "ok", "authority_tuple_ready", "principal_active", "source_bound", "source_active",
      "receive_capability_active", "send_capability_active", "validation_authorization_active",
      "credential_active", "destination_active", "gate_active", "budget_active",
      "activation_binding_exact", "migration_current", "no_kill_switch", "receipt_chain_healthy",
    ].map((key) => [key, true]));
    const cleanStore = { ...store, active_event_leases: 0, unknown_effects: 0, pending_events: 0 };
    expect(getPec78ComposioServerReadiness(env, cleanStore).status).toBe("server_ready");
    expect(getPec78ComposioServerReadiness(env, { ...cleanStore, activation_binding_exact: false }).status).toBe("degraded");
    expect(getPec78ComposioServerReadiness(env, { ...cleanStore, unknown_effects: 1 }).status).toBe("degraded");
  });
});
