import { describe, expect, it } from "vitest";
import { classifyRoofingOpsRequest, requiresChrisApproval } from "./roofing-agent-scope";

describe("classifyRoofingOpsRequest", () => {
  it("routes invoice uploads to Maya", () => {
    const result = classifyRoofingOpsRequest({ text: "Uploaded an invoice PDF from ABC — can someone intake this?" });
    expect(result.candidates.map((candidate) => candidate.agent)).toContain("maya");
  });

  it("routes ABC SKU and UOM variance questions to Alex", () => {
    const result = classifyRoofingOpsRequest({ text: "Can someone check this ABC SKU UOM variance against our price agreement?" });
    expect(result.primary?.agent).toBe("alex");
  });

  it("routes open vendor invoice audit questions to Alex", () => {
    const result = classifyRoofingOpsRequest({ text: "How many open invoices do you see in the invoice audit queue?" });
    expect(result.primary?.agent).toBe("alex");
  });

  it("routes vendor dispute draft requests to Casey", () => {
    const result = classifyRoofingOpsRequest({ text: "Please draft the vendor dispute email for this credit request." });
    expect(result.primary?.agent).toBe("casey");
  });

  it("routes AR aging and finance packet requests to Jordan", () => {
    const result = classifyRoofingOpsRequest({ text: "Can we get an AR aging and finance packet for month end?" });
    expect(result.primary?.agent).toBe("jordan");
  });

  it("routes accuracy and compliance checks to Sam", () => {
    const result = classifyRoofingOpsRequest({ text: "Can someone QA this answer for compliance with our standard?" });
    expect(result.primary?.agent).toBe("sam");
  });

  it("routes review and EEAT content requests to Lena", () => {
    const result = classifyRoofingOpsRequest({ text: "Can we write a Google review response and turn these photos into EEAT content?" });
    expect(result.primary?.agent).toBe("lena");
  });

  it("routes research requests to Rowan with Chris approval required", () => {
    const result = classifyRoofingOpsRequest({ text: "Research whether GAF changed any warranty rules for Texas roofers." });
    expect(result.primary?.agent).toBe("rowan");
    expect(requiresChrisApproval(result.primary)).toBe(true);
  });

  it("routes bug and feature requests to Ops Conductor", () => {
    const result = classifyRoofingOpsRequest({ text: "This upload flow is broken; can we create a feature request for the DevTeam?" });
    expect(result.primary?.agent).toBe("ops");
  });

  it("requires Ops Conductor when multiple agents overlap", () => {
    const result = classifyRoofingOpsRequest({ text: "This invoice price agreement dispute needs a vendor draft." });
    expect(result.requiresOpsResolution).toBe(true);
    expect(result.candidates.map((candidate) => candidate.agent)).toEqual(expect.arrayContaining(["maya", "alex", "casey"]));
  });

  it("does not route generic out-of-domain requests", () => {
    const result = classifyRoofingOpsRequest({ text: "How do I bake a cake?" });
    expect(result.candidates).toHaveLength(0);
    expect(result.outOfDomain).toBe(true);
  });

  it("routes unclear file requests to Ops", () => {
    const result = classifyRoofingOpsRequest({ text: "What is this?", files: [{ id: "F1", name: "mystery.bin", mimetype: "application/octet-stream" }] });
    expect(result.primary?.agent).toBe("ops");
    expect(result.reason).toContain("unclear_file_request");
  });
});
