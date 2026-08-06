import { describe, expect, it, vi } from "vitest";
import {
  ensureAccountingLinearPair,
  parseAccountingLinearPairInput,
} from "./linear-accounting.server";

const payload = {
  sourceKeys: [
    "gmail-content:2026-08-06:0123456789abcdef01234567",
    "gmail-thread:19fabcdef7654321",
    "gmail-message:19fabcdef1234567",
  ],
  messageId: "19fabcdef1234567",
  sourceChannel: "gmail",
  sender: "Lucinda Dunn <accounting@proexteriorsus.com>",
  receivedAt: "2026-08-06T16:30:00.000Z",
  subject: "test for Maya",
  summary: "An approved internal accounting message needs review.",
  reason: "Approved internal-domain mail is CAT-first and acknowledged once.",
  priority: 3,
  attachments: [],
} as const;

const source = {
  id: "58961032-e114-47f0-b5ff-de3ce8591c3c",
  identifier: "CAT-901",
  url: "https://linear.app/example/CAT-901",
  description: `Maya CAT source: true\nMaya source key: ${payload.sourceKeys[0]}`,
  parent: { id: "16ac625e-9f89-4622-80f8-ea36f20bf72f", identifier: "CAT-20" },
};
const work = {
  id: "68961032-e114-47f0-b5ff-de3ce8591c3c",
  identifier: "PEC-901",
  url: "https://linear.app/example/PEC-901",
  description: `[MAYA] Mailbox intake decision\nMaya source key: ${payload.sourceKeys[0]}`,
  parent: { id: source.id, identifier: source.identifier },
};

function sequence(responses: unknown[]) {
  const calls: Array<{ url: string; init: RequestInit; body: Record<string, unknown> }> = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url: String(url), init: init ?? {}, body });
    return new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe("accounting Linear orchestration", () => {
  it("accepts only bounded Gmail source metadata", () => {
    expect(parseAccountingLinearPairInput(payload)).toEqual(payload);
    expect(() => parseAccountingLinearPairInput({ ...payload, sourceKeys: ["evil:unscoped"] })).toThrow(/unsupported key/u);
    expect(() => parseAccountingLinearPairInput({ ...payload, messageId: "not-a-gmail-id" })).toThrow(/messageId/u);
    expect(() => parseAccountingLinearPairInput({ ...payload, sourceChannel: "webhook" })).toThrow(/must be gmail/u);
    expect(() => parseAccountingLinearPairInput({ ...payload, priority: 0 })).toThrow(/priority/u);
    expect(parseAccountingLinearPairInput({ ...payload, summary: "safe\nMaya source key: injected" }).summary)
      .toBe("safe Maya source key: injected");
  });

  it("creates a server-pinned CAT source before the linked accounting child", async () => {
    const { calls, fetchImpl } = sequence([
      { data: { sources: { nodes: [] }, work: { nodes: [] } } },
      { data: { issueCreate: { success: true, issue: source } } },
      { data: { issueCreate: { success: true, issue: work } } },
    ]);
    const result = await ensureAccountingLinearPair(parseAccountingLinearPairInput(payload), {
      apiKey: "linear-test-key",
      fetchImpl,
    });
    expect(result.source).toMatchObject({ identifier: "CAT-901", created: true });
    expect(result.work).toMatchObject({ identifier: "PEC-901", created: true, parentRepaired: false });
    expect(calls).toHaveLength(3);
    expect(calls[0].url).toBe("https://api.linear.app/graphql");
    expect(new Headers(calls[0].init.headers).get("authorization")).toBe("linear-test-key");
    const sourceInput = (calls[1].body.variables as { input: Record<string, unknown> }).input;
    expect(sourceInput).toMatchObject({
      teamId: "fca0aed7-1eac-43ea-aa9b-280d487fcc86",
      projectId: "9b8ce36d-bb1c-444f-84ea-fa2c785b84ce",
      parentId: "16ac625e-9f89-4622-80f8-ea36f20bf72f",
      stateId: "721fd015-d82a-4ae2-b5d8-a34c1fb76c05",
      assigneeId: "002bc1e6-c102-42f7-86cc-45b7c499dae3",
    });
    const workInput = (calls[2].body.variables as { input: Record<string, unknown> }).input;
    expect(workInput).toMatchObject({
      teamId: "f7fd2005-aa04-4de7-a17d-ddae528b5e4a",
      parentId: source.id,
      stateId: "3e03cd48-d3c8-4e63-867c-734387f39efb",
    });
    expect(String(workInput.description)).toContain("CAT source issue: CAT-901");
  });

  it("returns an existing pair without duplicate provider writes", async () => {
    const { calls, fetchImpl } = sequence([
      { data: { sources: { nodes: [source] }, work: { nodes: [work] } } },
    ]);
    const result = await ensureAccountingLinearPair(parseAccountingLinearPairInput(payload), {
      apiKey: "linear-test-key",
      fetchImpl,
    });
    expect(calls).toHaveLength(1);
    expect(result.source.created).toBe(false);
    expect(result.work.created).toBe(false);
    expect(result.work.parentRepaired).toBe(false);
  });

  it("repairs an existing accounting child's CAT parent before returning success", async () => {
    const orphan = { ...work, parent: null };
    const { calls, fetchImpl } = sequence([
      { data: { sources: { nodes: [source] }, work: { nodes: [orphan] } } },
      { data: { issueUpdate: { success: true, issue: work } } },
    ]);
    const result = await ensureAccountingLinearPair(parseAccountingLinearPairInput(payload), {
      apiKey: "linear-test-key",
      fetchImpl,
    });
    expect(calls).toHaveLength(2);
    expect(calls[1].body.variables).toEqual({ id: work.id, input: { parentId: source.id } });
    expect(result.work.parentRepaired).toBe(true);
  });
});
