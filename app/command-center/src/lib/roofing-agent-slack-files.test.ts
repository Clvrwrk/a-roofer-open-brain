import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { bundledRegistry, runAgentTurn } from "../../runtime/agent-runtime.mjs";

async function promptSentToModel({ message, decision }: { message: Record<string, unknown> & { files: unknown[] }; decision: Record<string, string> }) {
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: "ok" }],
      finishReason: { unified: "stop", raw: undefined },
      usage: { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } },
      warnings: [],
    }),
  });
  const registry = structuredClone(bundledRegistry);
  registry.principals.find((p: { persona_id: string }) => p.persona_id === "alex-rivers").lifecycle.state = "authorized";
  await runAgentTurn({ personaId: "alex-rivers", displayName: "Alex Rivers", message, decision, files: message.files, env: {}, registry, model });
  return JSON.stringify(model.doGenerateCalls[0].prompt);
}

describe("roofing-ops Slack file handoff", () => {
  it("passes downloaded Slack file paths and multimodal instructions into the agent prompt", async () => {
    const prompt = await promptSentToModel({
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

  it("tells agents to route failed downloads instead of asking humans to paste files", async () => {
    const prompt = await promptSentToModel({
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
