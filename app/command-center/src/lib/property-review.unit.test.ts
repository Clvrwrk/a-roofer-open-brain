import { describe, expect, it } from "vitest";
import { decisionErrorMessage, ilikeTerm, parseDecisionBody, scopeFor } from "./property-review";

const JOB = "87fa903b-d51b-450e-960d-b1e0c9106ac6";
const PROP = "8a6b08fc-c705-4fc6-a329-d8bceeae0744";

describe("parseDecisionBody", () => {
  it("accepts a link with a property id and trims the note", () => {
    const r = parseDecisionBody({ jobId: JOB, decision: "link", propertyId: PROP, note: "  checked the map  " });
    expect(r).toEqual({ ok: true, value: { jobId: JOB, decision: "link", propertyId: PROP, correctedAddress: null, note: "checked the map" } });
  });

  it("refuses a link without a property", () => {
    const r = parseDecisionBody({ jobId: JOB, decision: "link" });
    expect(r.ok).toBe(false);
  });

  it("refuses a malformed job id or an unknown decision", () => {
    expect(parseDecisionBody({ jobId: "123", decision: "dismiss" }).ok).toBe(false);
    expect(parseDecisionBody({ jobId: JOB, decision: "delete" }).ok).toBe(false);
    expect(parseDecisionBody(null).ok).toBe(false);
  });

  it("needs a corrected address or a note for a source fix", () => {
    expect(parseDecisionBody({ jobId: JOB, decision: "source_fix", correctedAddress: "   " }).ok).toBe(false);
    expect(parseDecisionBody({ jobId: JOB, decision: "source_fix", note: "street is blank in AccuLynx" }).ok).toBe(true);
    const r = parseDecisionBody({ jobId: JOB, decision: "source_fix", correctedAddress: "1 Main St, Wichita, KS 67202" });
    expect(r.ok && r.value.correctedAddress).toBe("1 Main St, Wichita, KS 67202");
  });

  it("drops a property id on anything but link, and caps long text", () => {
    const r = parseDecisionBody({ jobId: JOB, decision: "dismiss", propertyId: PROP, note: "x".repeat(900) });
    expect(r.ok && r.value.propertyId).toBe(null);
    expect(r.ok && r.value.note?.length).toBe(500);
  });
});

describe("scopeFor", () => {
  it("buckets rows the way the board's pills do", () => {
    expect(scopeFor({ status: "open", recommended_action: "fix_address_in_acculynx", decision: null })).toBe("fix_address");
    expect(scopeFor({ status: "open", recommended_action: "confirm_suggested_match", decision: null })).toBe("confirm_match");
    expect(scopeFor({ status: "open", recommended_action: "choose_property", decision: null })).toBe("choose_property");
    expect(scopeFor({ status: "open", recommended_action: "resubmit_for_enrichment", decision: null })).toBe("vendor");
    expect(scopeFor({ status: "awaiting_source_fix", recommended_action: "fix_address_in_acculynx", decision: "source_fix" })).toBe("awaiting_fix");
    expect(scopeFor({ status: "resolved", recommended_action: "confirm_suggested_match", decision: "link" })).toBe("decided");
    expect(scopeFor({ status: "dismissed", recommended_action: "fix_address_in_acculynx", decision: "dismiss" })).toBe("decided");
  });
});

describe("decisionErrorMessage", () => {
  it("names the problem and the way out for every server code", () => {
    for (const code of ["actor_required", "not_open", "job_already_linked", "property_not_found", "resolved_by_automation"]) {
      expect(decisionErrorMessage(code)).not.toMatch(/^The decision was not saved/);
    }
    expect(decisionErrorMessage("something_new")).toMatch(/not saved/);
  });
});

describe("ilikeTerm", () => {
  it("escapes wildcards and strips PostgREST list punctuation", () => {
    expect(ilikeTerm("100% Main_St")).toBe("100\\% Main\\_St");
    expect(ilikeTerm("a,b(c)")).toBe("a b c");
  });
});
