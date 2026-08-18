import { describe, expect, it } from "vitest";
import { commercialCheckNo } from "./qb-bank-job";

// Cases are real ABC invoices from prod (ship_to_name = 'Commercial'), so a
// regression here means commercial invoices go back to exporting "Commercial".
describe("commercialCheckNo", () => {
  it("uses the Customer PO# for a commercial invoice (CP project code)", () => {
    expect(commercialCheckNo("Commercial", "CP251640")).toBe("CP251640"); // inv 2013275562-001
    expect(commercialCheckNo("Commercial", "CP-25-1408")).toBe("CP-25-1408"); // inv 2011493975-001
  });

  it("uppercases and trims but does NOT reshape job-shaped POs", () => {
    expect(commercialCheckNo("Commercial", "TX454")).toBe("TX454"); // NOT "TX-454"
    expect(commercialCheckNo("Commercial", "v302")).toBe("V302");
    expect(commercialCheckNo("Commercial", "  cp-25-1129 ")).toBe("CP-25-1129");
  });

  it("keeps freeform references verbatim (Chris: keep freeform)", () => {
    expect(commercialCheckNo("Commercial", "SERVICE STOCK")).toBe("SERVICE STOCK");
    expect(commercialCheckNo("Commercial", "truck stock 6/29")).toBe("TRUCK STOCK 6/29");
    expect(commercialCheckNo("Commercial", "ss 728")).toBe("SS 728");
    expect(commercialCheckNo("Commercial", "102")).toBe("102");
  });

  it("returns null for a blank PO so the standard resolution still applies", () => {
    expect(commercialCheckNo("Commercial", "")).toBeNull();
    expect(commercialCheckNo("Commercial", "   ")).toBeNull();
    expect(commercialCheckNo("Commercial", null)).toBeNull();
    expect(commercialCheckNo("Commercial", undefined)).toBeNull();
  });

  it("does not touch non-commercial invoices", () => {
    expect(commercialCheckNo("Storm/wichita", "ks191")).toBeNull();
    expect(commercialCheckNo("DFW Account", "tx450")).toBeNull();
    expect(commercialCheckNo("Texas Motor Speedway", "1607")).toBeNull();
    expect(commercialCheckNo(null, "CP251640")).toBeNull();
    expect(commercialCheckNo(undefined, "CP251640")).toBeNull();
  });

  it("matches the ship-to name case-insensitively and ignores padding", () => {
    expect(commercialCheckNo("  commercial ", "1396")).toBe("1396");
    expect(commercialCheckNo("COMMERCIAL", "1396")).toBe("1396");
  });

  it("does not match a merely commercial-ish ship-to name", () => {
    expect(commercialCheckNo("Commercial Roofing LLC", "1396")).toBeNull();
  });
});
