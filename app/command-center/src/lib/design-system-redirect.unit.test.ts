import { describe, expect, it } from "vitest";
import { DS_ORIGIN, designSystemRedirect } from "./design-system-redirect";

describe("designSystemRedirect", () => {
  it("sends the site root to the ds home page", () => {
    expect(designSystemRedirect("/design-system")).toBe(`${DS_ORIGIN}/`);
    expect(designSystemRedirect("/design-system/")).toBe(`${DS_ORIGIN}/`);
  });

  it("maps chapters with an obvious ds page", () => {
    expect(designSystemRedirect("/design-system/decisions")).toBe(`${DS_ORIGIN}/rules.html`);
    expect(designSystemRedirect("/design-system/accessibility")).toBe(`${DS_ORIGIN}/a11y.html`);
    expect(designSystemRedirect("/design-system/typography/")).toBe(`${DS_ORIGIN}/type.html`);
    expect(designSystemRedirect("/design-system/tokens.json")).toBe(`${DS_ORIGIN}/assets/tokens.json`);
  });

  it("sends every other design-system path to the ds home page", () => {
    expect(designSystemRedirect("/design-system/swag")).toBe(`${DS_ORIGIN}/`);
    expect(designSystemRedirect("/design-system/swag/pen.jpg")).toBe(`${DS_ORIGIN}/`);
    expect(designSystemRedirect("/design-system/no-such-chapter")).toBe(`${DS_ORIGIN}/`);
  });

  it("leaves every other path alone", () => {
    expect(designSystemRedirect("/")).toBeNull();
    expect(designSystemRedirect("/design-systems")).toBeNull();
    expect(designSystemRedirect("/accounting/invoice-audit")).toBeNull();
  });
});
