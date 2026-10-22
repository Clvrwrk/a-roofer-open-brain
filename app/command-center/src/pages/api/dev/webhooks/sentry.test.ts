import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const createDevLinearIssue = vi.fn(async () => ({ identifier: "PEC-1" }));
vi.mock("@lib/linear-dev", () => ({ createDevLinearIssue }));

const { POST } = await import("./sentry");

const SECRET = "synthetic-webhook-secret";
function call(body: unknown) {
  const raw = JSON.stringify(body);
  const sig = createHmac("sha256", SECRET).update(raw).digest("hex");
  const request = new Request("https://cc.example.test/api/dev/webhooks/sentry", {
    method: "POST",
    body: raw,
    headers: { "sentry-hook-signature": sig },
  });
  return POST({ request } as never);
}

describe("Sentry webhook and the self-healing loop", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    createDevLinearIssue.mockClear();
  });

  it("files a Linear issue while scheduled triage does not own the bug log", async () => {
    vi.stubEnv("SENTRY_WEBHOOK_SECRET", SECRET);
    const res = await call({ action: "created", data: { issue: { title: "Boom" } } });
    expect(res.status).toBe(200);
    expect(createDevLinearIssue).toHaveBeenCalledOnce();
  });

  it("defers to self-heal triage and files nothing once SELF_HEAL_TRIAGE_OWNS_LINEAR is true", async () => {
    vi.stubEnv("SENTRY_WEBHOOK_SECRET", SECRET);
    vi.stubEnv("SELF_HEAL_TRIAGE_OWNS_LINEAR", "true");
    const res = await call({ action: "created", data: { issue: { title: "Boom" } } });
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ status: "deferred_to_self_heal_triage" });
    expect(createDevLinearIssue).not.toHaveBeenCalled();
  });

  it("still rejects an unsigned call before deferring", async () => {
    vi.stubEnv("SENTRY_WEBHOOK_SECRET", SECRET);
    vi.stubEnv("SELF_HEAL_TRIAGE_OWNS_LINEAR", "true");
    const request = new Request("https://cc.example.test/api/dev/webhooks/sentry", { method: "POST", body: "{}" });
    const res = await POST({ request } as never);
    expect(res.status).toBe(401);
  });
});
