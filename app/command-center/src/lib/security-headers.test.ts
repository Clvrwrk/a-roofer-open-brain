import { describe, expect, it } from "vitest";
import { SECURITY_HEADERS, withSecurityHeaders } from "./security-headers";

describe("withSecurityHeaders", () => {
  it("adds every baseline header to a plain response", () => {
    const res = withSecurityHeaders(new Response("ok"));
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) expect(res.headers.get(name)).toBe(value);
    expect(res.headers.get("strict-transport-security")).toContain("max-age=31536000");
  });

  it("keeps a header a route already set", () => {
    const res = withSecurityHeaders(new Response("ok", { headers: { "x-frame-options": "DENY" } }));
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  it("handles responses with immutable headers", () => {
    const res = withSecurityHeaders(Response.redirect("https://cc.example.test/auth/login", 302));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://cc.example.test/auth/login");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
