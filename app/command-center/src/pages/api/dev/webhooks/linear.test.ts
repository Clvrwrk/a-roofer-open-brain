import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const enqueueAgentDispatch = vi.fn(async () => ({ workKey: "k" }));
const fetchIssueLabelNames = vi.fn(async () => ["lane:cw-codex"]);
vi.mock("@lib/linear-agent-queue.server", () => ({ enqueueAgentDispatch }));
vi.mock("@lib/linear-client.server", () => ({ fetchIssueLabelNames, getAppUserId: async () => "app-user" }));

const { POST } = await import("./linear");
const SECRET = "synthetic-linear-secret";

function call(body: Record<string, unknown>, secret = SECRET) {
  const raw = JSON.stringify({ webhookTimestamp: Date.now(), ...body });
  const request = new Request("https://cc.example.test/api/dev/webhooks/linear", {
    method: "POST",
    body: raw,
    headers: { "linear-signature": createHmac("sha256", secret).update(raw).digest("hex"), "linear-delivery": "d1" },
  });
  return POST({ request } as never);
}

describe("POST /api/dev/webhooks/linear", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is 503 until LINEAR_WEBHOOK_SECRET is configured", async () => {
    vi.stubEnv("LINEAR_WEBHOOK_SECRET", "");
    expect((await call({})).status).toBe(503);
  });

  it("rejects a bad signature with 401 and enqueues nothing", async () => {
    vi.stubEnv("LINEAR_WEBHOOK_SECRET", SECRET);
    const res = await call({ type: "Comment", action: "create", data: { body: "@PE Dev Agents", issueId: "i1" } }, "wrong");
    expect(res.status).toBe(401);
    expect(enqueueAgentDispatch).not.toHaveBeenCalled();
  });

  it("enqueues a cw-codex mention as queue-only (no paid session)", async () => {
    vi.stubEnv("LINEAR_WEBHOOK_SECRET", SECRET);
    const res = await call({ type: "Comment", action: "create", data: { id: "c1", body: "@PE Dev Agents redo", userId: "chris", issueId: "i1" } });
    expect(res.status).toBe(202);
    expect(fetchIssueLabelNames).toHaveBeenCalledWith("i1");
    expect(enqueueAgentDispatch).toHaveBeenCalledWith(expect.objectContaining({ lane: "cw-codex", paidSession: false, issueId: "i1" }), "d1");
    expect(await res.json()).toMatchObject({ status: "queued", lane: "cw-codex", paidSession: false });
  });

  it("acknowledges irrelevant events with 200 and no enqueue", async () => {
    vi.stubEnv("LINEAR_WEBHOOK_SECRET", SECRET);
    const res = await call({ type: "Comment", action: "create", data: { body: "thanks", userId: "chris", issueId: "i1" } });
    expect(res.status).toBe(200);
    expect(enqueueAgentDispatch).not.toHaveBeenCalled();
  });
});
