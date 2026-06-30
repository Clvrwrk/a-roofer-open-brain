import { describe, expect, it } from "vitest";
import { buildHermesPrompt } from "../../runtime/roofing-ops-agent-router.mjs";

describe("roofing-ops Slack file handoff", () => {
  it("passes downloaded Slack file paths and multimodal instructions into the Hermes prompt", () => {
    const prompt = buildHermesPrompt({
      agent: "alex",
      decision: { kind: "single_agent", agent: "alex", reason: "single_sop_match" },
      message: {
        channel: "C0BCUF29G1H",
        text: "Lucinda says this PDF has the invoices to pay today.",
        files: [
          {
            id: "F123",
            name: "today-payables.pdf",
            mimetype: "application/pdf",
            filetype: "pdf",
            size: 12345,
            localPath: "/tmp/openbrain-slack-files/abc123-today-payables.pdf",
            accessStatus: "downloaded",
          },
        ],
      },
    });

    expect(prompt).toContain("/tmp/openbrain-slack-files/abc123-today-payables.pdf");
    expect(prompt).toContain("PDFs, spreadsheets, images, audio/voice memos, and videos");
    expect(prompt).toContain("use the processed attachment packets, not just filenames");
    expect(prompt).toContain("Supabase Storage");
  });

  it("tells agents to route failed downloads instead of asking humans to paste files", () => {
    const prompt = buildHermesPrompt({
      agent: "alex",
      decision: { kind: "single_agent", agent: "alex", reason: "single_sop_match" },
      message: {
        channel: "C0BCUF29G1H",
        text: "Please verify this invoice list.",
        files: [
          {
            id: "F124",
            name: "voice-note.m4a",
            mimetype: "audio/mp4",
            filetype: "m4a",
            accessStatus: "download_failed",
            error: "slack_file_http_403",
          },
        ],
      },
    });

    expect(prompt).toContain("download_failed");
    expect(prompt).toContain("route to Ops Conductor instead of asking the human to paste the file");
  });
});
