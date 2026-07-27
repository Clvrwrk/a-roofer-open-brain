import { describe, expect, it } from "vitest";
import { getPec78Readiness } from "./readiness.server";

describe("PEC-78 readiness", () => {
  it("is stopped by default", () => expect(getPec78Readiness({}).status).toBe("stopped"));
  it("cannot turn ready from the mode flag alone", () => expect(getPec78Readiness({ PEC78_ADAPTER_MODE: "enabled" }).status).toBe("degraded"));
  it("never turns ready from configuration strings", () => expect(getPec78Readiness({ PEC78_ADAPTER_MODE: "enabled", PEC78_PRODUCTION_GATE_DIGEST: "sha256:x", PEC78_MAYA_PUBLIC_JWK: "{}", PEC78_MAYA_JWK_THUMBPRINT: "sha256:x", PEC78_REGISTRY_VERSION: "sha256:x" }).status).toBe("degraded"));
});
