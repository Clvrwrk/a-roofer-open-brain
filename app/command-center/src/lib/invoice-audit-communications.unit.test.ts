import { describe, expect, it } from "vitest";
import {
  buildMessageBodies,
  buildSubject,
  parseThreadMetadata,
  sanitizeRichHtml,
  type InvoiceAuditCommunicationInput,
} from "./invoice-audit-communications";

const baseInput: InvoiceAuditCommunicationInput = {
  invoiceLineId: "11111111-1111-4111-8111-111111111111",
  invoiceNumber: "2009572164-001",
  itemNumber: "91152",
  itemDescription: '91152 ML Elevate Batten 1"x2"x8\' W/3" Pad',
  triggerAction: "credit-flag",
  note: "Generate credit memo and hold payment",
  unitPrice: 62.99,
  negotiatedPrice: 70.99,
  variancePct: -11.2,
  varianceExt: -208.0,
};

describe("invoice-audit communications helpers", () => {
  it("builds deterministic subject lines", () => {
    const subject = buildSubject(baseInput);
    expect(subject).toContain("Invoice Audit");
    expect(subject).toContain(baseInput.invoiceNumber);
    expect(subject).toContain(baseInput.itemNumber);
  });

  it("builds html and text message bodies with attachments", () => {
    const subject = buildSubject(baseInput);
    const attachments = [{ kind: "invoice_pdf" as const, label: "Invoice PDF", href: "/api/invoice-audit/pdf/2009572164-001" }];
    const bodies = buildMessageBodies(baseInput, subject, attachments);
    expect(bodies.bodyHtml).toContain("Attachments");
    expect(bodies.bodyHtml).toContain("Invoice PDF");
    expect(bodies.bodyText).toContain("Generate credit memo and hold payment");
    expect(bodies.bodyText).toContain("/api/invoice-audit/pdf/2009572164-001");
  });

  it("parses communication metadata safely", () => {
    const parsed = parseThreadMetadata({
      audit_status: "disputed",
      note: "test note",
      invoice_number: "inv-1",
      item_number: "itm-2",
    });
    expect(parsed.auditStatus).toBe("disputed");
    expect(parsed.note).toBe("test note");
    expect(parsed.invoiceNumber).toBe("inv-1");
    expect(parsed.itemNumber).toBe("itm-2");
  });

  it("defaults metadata safely when malformed", () => {
    const parsed = parseThreadMetadata(null);
    expect(parsed.auditStatus).toBe("passed");
    expect(parsed.note).toBe("");
  });

  it("sanitizes disallowed html and javascript links", () => {
    const unsafe = `<p>Hello<script>alert(1)</script><a href="javascript:alert(1)" onclick="x()">click</a></p>`;
    const safe = sanitizeRichHtml(unsafe);
    expect(safe).not.toContain("<script");
    expect(safe).not.toContain("onclick=");
    expect(safe).not.toContain("javascript:");
  });
});
