import { describe, expect, it } from "vitest";
import {
  buildExpectedPo,
  canonicalJobLabel,
  deriveNamingStatus,
  normalizePeKey,
  parsePeJobLabel,
  parsePePoWithSequence,
} from "./pe-job-naming";

describe("normalizePeKey", () => {
  it("uppercases, strips a leading PO prefix and all non-alphanumerics", () => {
    expect(normalizePeKey("po ks-123-1")).toBe("KS1231");
    expect(normalizePeKey("KS-123")).toBe("KS123");
  });

  it("returns empty string for null/undefined/blank", () => {
    expect(normalizePeKey(null)).toBe("");
    expect(normalizePeKey(undefined)).toBe("");
    expect(normalizePeKey("   ")).toBe("");
  });
});

describe("parsePeJobLabel", () => {
  it("parses a standard '{OFFICE}-{NUM}: {Client}' label", () => {
    const parsed = parsePeJobLabel("KS-123: Acme Roofing");
    expect(parsed).toMatchObject({
      office: "KS",
      jobNum: "123",
      client: "Acme Roofing",
      isTemp: false,
      rawPrefix: "KS-123",
      norm: "KS123",
    });
  });

  it("uppercases the office prefix and tolerates surrounding whitespace", () => {
    const parsed = parsePeJobLabel("  kc - 456 :  Jane Doe  ");
    expect(parsed).toMatchObject({ office: "KC", jobNum: "456", client: "Jane Doe", isTemp: false });
  });

  it("parses a TEMP label as a temp job", () => {
    const parsed = parsePeJobLabel("TX-TEMP-abc9: Pending Client");
    expect(parsed).toMatchObject({
      office: "TX",
      jobNum: "abc9",
      client: "Pending Client",
      isTemp: true,
      rawPrefix: "TX-TEMP-abc9",
    });
  });

  it("returns null for blank input", () => {
    expect(parsePeJobLabel("")).toBeNull();
    expect(parsePeJobLabel(null)).toBeNull();
  });

  it("returns null for an unknown office prefix", () => {
    expect(parsePeJobLabel("zz-123: Client")).toBeNull();
  });

  it("returns null when the client segment is missing", () => {
    expect(parsePeJobLabel("KS-123")).toBeNull();
  });
});

describe("parsePePoWithSequence", () => {
  it("parses '{OFFICE}-{NUM}-{seq}' into its parts", () => {
    expect(parsePePoWithSequence("ks-123-2")).toEqual({
      office: "KS",
      jobNum: "123",
      seq: 2,
      raw: "KS-123-2",
    });
  });

  it("returns null when there is no sequence segment", () => {
    expect(parsePePoWithSequence("KS-123")).toBeNull();
  });

  it("returns null for blank input", () => {
    expect(parsePePoWithSequence(null)).toBeNull();
  });
});

describe("buildExpectedPo", () => {
  it("appends the material sequence to the job prefix", () => {
    expect(buildExpectedPo("KS-123", 1)).toBe("KS-123-1");
  });

  it("strips internal whitespace from the prefix", () => {
    expect(buildExpectedPo("KS - 123", 3)).toBe("KS-123-3");
  });
});

describe("deriveNamingStatus", () => {
  it("returns temp_job for a TEMP order name", () => {
    expect(deriveNamingStatus({ orderName: "TX-TEMP-abc: Client" })).toBe("temp_job");
  });

  it("returns needs_link when the job is unparseable and there is no AccuLynx link", () => {
    expect(deriveNamingStatus({ orderName: "no job here" })).toBe("needs_link");
  });

  it("returns job_blank when the job is unparseable but an AccuLynx job is linked", () => {
    expect(deriveNamingStatus({ orderName: "", acculynxJobId: "job-1" })).toBe("job_blank");
  });

  it("returns aligned when the PO matches the derived expected PO (seq defaults to 1)", () => {
    expect(deriveNamingStatus({ orderName: "KS-123: Acme", purchaseOrder: "KS-123-1" })).toBe("aligned");
  });

  it("returns aligned when the PO matches a provided expected PO", () => {
    expect(
      deriveNamingStatus({ orderName: "KS-123: Acme", purchaseOrder: "KS-123-4", expectedPo: "KS-123-4" }),
    ).toBe("aligned");
  });

  it("returns aligned via normalized comparison when the PO lacks a sequence but matches otherwise", () => {
    expect(
      deriveNamingStatus({ orderName: "KS-123: Acme", purchaseOrder: "ks123", expectedPo: "KS-123" }),
    ).toBe("aligned");
  });

  it("returns po_mismatch when there is no purchase order", () => {
    expect(deriveNamingStatus({ orderName: "KS-123: Acme" })).toBe("po_mismatch");
  });

  it("returns po_mismatch when the PO does not match the expected PO", () => {
    expect(deriveNamingStatus({ orderName: "KS-123: Acme", purchaseOrder: "KS-999-1" })).toBe("po_mismatch");
  });
});

describe("canonicalJobLabel", () => {
  it("renders '{prefix}: {client}' from a parsed label", () => {
    const parsed = parsePeJobLabel("KS-123: Acme");
    expect(canonicalJobLabel(parsed)).toBe("KS-123: Acme");
  });

  it("falls back to the provided name when parsing failed", () => {
    expect(canonicalJobLabel(null, "  Some Raw Name  ")).toBe("Some Raw Name");
  });

  it("returns empty string when there is no parsed label and no fallback", () => {
    expect(canonicalJobLabel(null)).toBe("");
  });
});
