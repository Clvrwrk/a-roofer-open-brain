import { describe, expect, it, vi } from "vitest";

let mockSupabaseClient: any;

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => mockSupabaseClient,
}));

import { processSlackAttachment, persistAgentAttachmentReport } from "../../runtime/slack-attachment-processor.mjs";

function makeStorage() {
  const uploads: Array<{ bucket: string; path: string; bytes: number; contentType?: string }> = [];
  const bucketApi = (bucket: string) => ({
    upload: async (path: string, body: Buffer | string, opts: { contentType?: string } = {}) => {
      const bytes = typeof body === "string" ? Buffer.byteLength(body) : body.length;
      uploads.push({ bucket, path, bytes, contentType: opts.contentType });
      return { data: { path }, error: null };
    },
    createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://example.test/${bucket}/${path}` }, error: null }),
  });
  return {
    uploads,
    client: {
      storage: {
        getBucket: async () => ({ data: {}, error: null }),
        from: bucketApi,
      },
    },
  };
}

describe("slack attachment processor", () => {
  it("stores raw Slack bytes and a packet in Supabase", async () => {
    const storage = makeStorage();
    mockSupabaseClient = storage.client;
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "content-type": "application/octet-stream" } }) as any;
    try {
      const result = await processSlackAttachment({
        client: { files: { info: async () => ({ file: { id: "F1", name: "unknown.bin", mimetype: "application/octet-stream", filetype: "bin", url_private_download: "https://slack.test/file" } }) } },
        env: { SUPABASE_URL: "https://supabase.test", SUPABASE_SERVICE_ROLE_KEY: "service", SLACK_ATTACHMENT_BUCKET: "slack-attachments" },
        fileId: "F1",
        file: undefined,
        token: "xoxb-test",
        context: { channel: "C1", team: "T1", messageTs: "123.456", user: "U1" },
      } as any);

      expect(result.accessStatus).toBe("downloaded");
      expect(result.storageStatus).toBe("uploaded");
      expect(result.processorStatus).toBe("completed");
      expect(result.storagePath).toContain("T1/C1/");
      expect(result.packetPath).toContain("packet.json");
      expect(storage.uploads.some((u) => u.path.endsWith("/raw/unknown.bin"))).toBe(true);
      expect(storage.uploads.some((u) => u.path.endsWith("/packet.json"))).toBe(true);
    } finally {
      globalThis.fetch = oldFetch;
    }
  });

  it("persists agent reports as first-class artifacts", async () => {
    const storage = makeStorage();
    mockSupabaseClient = storage.client;
    const result = await persistAgentAttachmentReport({
      env: { SUPABASE_URL: "https://supabase.test", SUPABASE_SERVICE_ROLE_KEY: "service", SLACK_ATTACHMENT_BUCKET: "slack-attachments" },
      agent: "alex",
      message: { channel: "C1", ts: "123.456" },
      decision: { kind: "single_agent", agent: "alex" },
      files: [{ id: "F1", name: "invoice.pdf", storageBucket: "slack-attachments", storagePath: "raw/invoice.pdf", packetPath: "packet.json", processorStatus: "completed", sha256: "abc" }],
      text: "Alex report",
    } as any);

    expect(result.ok).toBe(true);
    expect(result.path).toContain("agent-reports/alex/C1/");
    expect(storage.uploads.some((u) => u.path.endsWith(".md"))).toBe(true);
    expect(storage.uploads.some((u) => u.path.endsWith(".md.json"))).toBe(true);
  });
});
