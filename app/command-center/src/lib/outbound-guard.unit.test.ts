import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertAgentSendAllowed,
  classifyRecipients,
  emailDomain,
  isInternalRecipient,
} from "./outbound-guard";

describe("emailDomain", () => {
  it("extracts the lowercased domain after the last @", () => {
    expect(emailDomain("Justin@ABCSupply.com")).toBe("abcsupply.com");
  });

  it("uses the last @ for addresses with multiple @ signs", () => {
    expect(emailDomain("weird@name@example.com")).toBe("example.com");
  });

  it("trims surrounding whitespace", () => {
    expect(emailDomain("  a@b.com  ")).toBe("b.com");
  });

  it("returns empty string when there is no @", () => {
    expect(emailDomain("not-an-email")).toBe("");
    expect(emailDomain("")).toBe("");
  });
});

describe("isInternalRecipient", () => {
  it("treats the default company domains as internal", () => {
    expect(isInternalRecipient("chris@proexteriorsus.com")).toBe(true);
    expect(isInternalRecipient("ops@proexteriorsus.net")).toBe(true);
    expect(isInternalRecipient("dev@cleverwork.io")).toBe(true);
  });

  it("treats subdomains of internal domains as internal", () => {
    expect(isInternalRecipient("agent@cc.proexteriorsus.net")).toBe(true);
    expect(isInternalRecipient("bot@agentmail.proexteriorsus.net")).toBe(true);
  });

  it("treats other domains as external", () => {
    expect(isInternalRecipient("justin@abcsupply.com")).toBe(false);
  });

  it("does not match a domain that merely contains an internal domain as a substring", () => {
    expect(isInternalRecipient("x@notproexteriorsus.com")).toBe(false);
    expect(isInternalRecipient("x@proexteriorsus.com.evil.com")).toBe(false);
  });

  it("returns false for a malformed address", () => {
    expect(isInternalRecipient("no-domain")).toBe(false);
  });
});

describe("classifyRecipients", () => {
  it("splits internal and external recipients and marks ok only when all are internal", () => {
    const result = classifyRecipients([
      "chris@proexteriorsus.com",
      "justin@abcsupply.com",
      "ops@cleverwork.io",
    ]);
    expect(result.internal).toEqual(["chris@proexteriorsus.com", "ops@cleverwork.io"]);
    expect(result.external).toEqual(["justin@abcsupply.com"]);
    expect(result.ok).toBe(false);
  });

  it("is ok when every recipient is internal", () => {
    const result = classifyRecipients(["a@proexteriorsus.net", "b@cleverwork.io"]);
    expect(result.external).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("ignores blank / null / undefined entries", () => {
    const result = classifyRecipients(["", null, undefined, "  ", "a@proexteriorsus.com"]);
    expect(result.internal).toEqual(["a@proexteriorsus.com"]);
    expect(result.external).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("is ok for an empty recipient list", () => {
    expect(classifyRecipients([])).toEqual({ ok: true, internal: [], external: [] });
  });
});

describe("assertAgentSendAllowed", () => {
  it("does not throw when all recipients are internal", () => {
    expect(() => assertAgentSendAllowed(["a@proexteriorsus.com"])).not.toThrow();
  });

  it("throws listing the external recipients when any are external", () => {
    expect(() => assertAgentSendAllowed(["a@proexteriorsus.com", "x@abcsupply.com"])).toThrow(
      /Outbound blocked: 1 external recipient\(s\) \[x@abcsupply\.com\]/,
    );
  });
});

describe("INTERNAL_EMAIL_DOMAINS override", () => {
  const original = process.env.INTERNAL_EMAIL_DOMAINS;

  beforeEach(() => {
    process.env.INTERNAL_EMAIL_DOMAINS = "partner.example, second.example";
  });

  afterEach(() => {
    if (original === undefined) delete process.env.INTERNAL_EMAIL_DOMAINS;
    else process.env.INTERNAL_EMAIL_DOMAINS = original;
  });

  it("treats extra configured domains (and their subdomains) as internal", () => {
    expect(isInternalRecipient("a@partner.example")).toBe(true);
    expect(isInternalRecipient("a@mail.second.example")).toBe(true);
  });

  it("still keeps the default domains internal alongside the overrides", () => {
    expect(isInternalRecipient("a@proexteriorsus.com")).toBe(true);
  });
});
