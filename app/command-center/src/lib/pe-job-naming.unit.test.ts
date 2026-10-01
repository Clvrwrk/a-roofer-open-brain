// CRM job numbers ("-PECRM", mig 316 / docs/118) keep their suffix in every key and never
// resolve to the AccuLynx job that shares the numeric part.
import { describe, expect, it } from "vitest";
import {
  deriveNamingStatus,
  isCrmJobNumber,
  normalizePeKey,
  parsePeJobLabel,
  parsePePoWithSequence,
} from "./pe-job-naming";

describe("parsePeJobLabel", () => {
  it("keeps the -PECRM suffix in the prefix and key", () => {
    const crm = parsePeJobLabel("TX-460-PECRM: Jane Smith");
    expect(crm).toMatchObject({ office: "TX", jobNum: "460-PECRM", isCrm: true, rawPrefix: "TX-460-PECRM", norm: "TX460PECRM" });
  });

  it("never gives a CRM number the AccuLynx key", () => {
    const alx = parsePeJobLabel("TX-460: Jane Smith");
    expect(alx).toMatchObject({ rawPrefix: "TX-460", norm: "TX460", isCrm: false });
    expect(parsePeJobLabel("TX-460-PECRM: Jane Smith")?.norm).not.toBe(alx?.norm);
  });

  it("canonicalises sloppy suffixes", () => {
    expect(parsePeJobLabel("tx-460 pecrm: Jane")?.rawPrefix).toBe("TX-460-PECRM");
  });

  it("accepts FL, GA and INS offices", () => {
    expect(parsePeJobLabel("FL-12: A")?.rawPrefix).toBe("FL-12");
    expect(parsePeJobLabel("GA-41: B")?.rawPrefix).toBe("GA-41");
    expect(parsePeJobLabel("INS-6: C")?.rawPrefix).toBe("INS-6");
  });

  it("leaves AccuLynx TEMP jobs alone", () => {
    expect(parsePeJobLabel("KS-TEMP-ab12: D")).toMatchObject({ isTemp: true, isCrm: false, rawPrefix: "KS-TEMP-ab12" });
  });
});

describe("parsePePoWithSequence", () => {
  it("supports the AccuLynx and CRM material-PO forms", () => {
    expect(parsePePoWithSequence("KS-160-1")).toEqual({ office: "KS", jobNum: "160", seq: 1, raw: "KS-160-1" });
    expect(parsePePoWithSequence("TX-460-PECRM-1")).toEqual({ office: "TX", jobNum: "460-PECRM", seq: 1, raw: "TX-460-PECRM-1" });
  });
});

describe("normalizePeKey / isCrmJobNumber", () => {
  it("keeps PECRM in the normalised key", () => {
    expect(normalizePeKey("TX-460-PECRM-1")).toBe("TX460PECRM1");
    expect(isCrmJobNumber("tx460pecrm")).toBe(true);
    expect(isCrmJobNumber("TX-460-1")).toBe(false);
  });
});

describe("deriveNamingStatus", () => {
  it("reports an unlinked CRM job as crm_job, not needs_link", () => {
    expect(deriveNamingStatus({ orderName: "TX-460-PECRM: Jane", purchaseOrder: "TX-460-PECRM-1" })).toBe("crm_job");
    expect(deriveNamingStatus({ orderName: null, purchaseOrder: "TX-460-PECRM-1" })).toBe("crm_job");
  });

  it("keeps AccuLynx behaviour unchanged", () => {
    expect(deriveNamingStatus({ orderName: "KS-160: Joe", purchaseOrder: "KS-160-1", acculynxJobId: "x" })).toBe("aligned");
    expect(deriveNamingStatus({ orderName: "KS-160: Joe", purchaseOrder: "KS-160-2", acculynxJobId: "x", expectedPo: "KS-160-1" })).toBe("po_mismatch");
    expect(deriveNamingStatus({ orderName: null, purchaseOrder: "KS-160-1" })).toBe("needs_link");
  });
});
