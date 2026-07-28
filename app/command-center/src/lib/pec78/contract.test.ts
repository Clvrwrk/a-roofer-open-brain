import { describe, expect, it } from "vitest";
import { isPec78RuntimePath, pec78Mode, shouldStopPec78Request } from "./contract";

describe("PEC-78 route fuse", () => {
  it.each([undefined, "", "garbage"])("defaults %s to disabled", (value) => expect(pec78Mode(value)).toBe("disabled"));
  it("stops operational routes while disabled", () => expect(shouldStopPec78Request("/api/agent/runtime/v1/intake", "disabled")).toBe(true));
  it("permits private readiness through the disabled fuse", () => expect(shouldStopPec78Request("/api/agent/runtime/v1/readiness", "disabled")).toBe(false));
  it("keeps authenticated rollback available through the disabled fuse", () => expect(shouldStopPec78Request("/api/agent/runtime/v1/operator/rollback", "disabled")).toBe(false));
  it("does not open rollback lookalikes", () => expect(shouldStopPec78Request("/api/agent/runtime/v1/operator/rollback/extra", "disabled")).toBe(true));
  it("does not match legacy intake", () => expect(isPec78RuntimePath("/api/agent/intake")).toBe(false));
  it("keeps the Composio webhook outside the DPoP runtime prefix", () => expect(isPec78RuntimePath("/api/integrations/composio/v1/webhook")).toBe(false));
});
