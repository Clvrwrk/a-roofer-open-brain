import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLoadCommandCenterSurface = vi.fn();
const mockRecordLiveWorkDecision = vi.fn();
const mockCreateServerSupabaseClient = vi.fn();
const mockGetRuntimeEnv = vi.fn();

vi.mock("@lib/live-work", async () => {
  const actual = await vi.importActual<typeof import("@lib/live-work")>("@lib/live-work");
  return {
    ...actual,
    loadCommandCenterSurface: (...args: unknown[]) => mockLoadCommandCenterSurface(...args),
    recordLiveWorkDecision: (...args: unknown[]) => mockRecordLiveWorkDecision(...args),
  };
});

vi.mock("@lib/supabase.server", () => ({
  createServerSupabaseClient: (...args: unknown[]) => mockCreateServerSupabaseClient(...args),
}));

vi.mock("@lib/runtime-env", () => ({
  getRuntimeEnv: (...args: unknown[]) => mockGetRuntimeEnv(...args),
}));

const ACCOUNTING_ACTOR = {
  id: "ob-accounting",
  type: "service_agent",
  displayName: "Accounting",
  email: null,
  source: "service_token",
  roles: ["vertical", "accounting"],
  permissions: ["command_center.read", "work_queue.read", "approval.decide", "evidence.attach"],
  departmentAccess: ["accounting"],
  desktopEnabled: false,
};

function prodApproverActor() {
  return { ...ACCOUNTING_ACTOR, permissions: [...ACCOUNTING_ACTOR.permissions, "approval.decide_prod_write"] };
}

function makePendingWriteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    work_key: "wk-1",
    lane: "postJobPaymentReceived",
    target_env: "sandbox",
    account_key: "sandbox",
    endpoint: "/jobs/{jobId}/payments/received",
    payload: { amount: 100, jobId: "1" },
    dry_run_render: null,
    idempotency_key: "hash-1",
    status: "pending_review",
    approver: null,
    exec_result: null,
    department: "accounting",
    created_by: "ob-accounting",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function mockSupabaseSingleRowClient(row: Record<string, unknown> | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const selectEq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq: selectEq });
  // reject-close path: from().update().eq() resolves to { error: null }
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });
  const from = vi.fn().mockReturnValue({ select, update });
  return { client: { from }, config: { missing: [] }, __update: update, __updateEq: updateEq };
}

function emptySurface() {
  return { items: [], errors: [], metrics: [], status: "live", generatedAt: new Date().toISOString() };
}

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/agent/work-queue/acculynx-write-action:wk-1/decision", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("decision.ts — acculynx-write-action wiring", () => {
  beforeEach(() => {
    mockLoadCommandCenterSurface.mockReset();
    mockRecordLiveWorkDecision.mockReset();
    mockCreateServerSupabaseClient.mockReset();
    mockGetRuntimeEnv.mockReset();

    mockLoadCommandCenterSurface.mockResolvedValue(emptySurface());
    mockRecordLiveWorkDecision.mockResolvedValue({
      action: "recorded",
      memory: { status: "skipped" },
      workItem: { id: "wi-1" },
    });
    mockGetRuntimeEnv.mockReturnValue({
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ status: "executed" }),
      }),
    );
  });

  it("resolves an acculynx-write-action:* workKey not in the cached surface via the fallback lookup", async () => {
    const row = makePendingWriteRow();
    mockCreateServerSupabaseClient.mockReturnValue(mockSupabaseSingleRowClient(row));

    const { POST } = await import("./decision");
    const response = await POST({
      request: makeRequest({ decision: "reject" }),
      params: { workId: "acculynx-write-action:wk-1" },
      locals: { actor: ACCOUNTING_ACTOR },
    } as any);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.item.workKey).toBe("acculynx-write-action:wk-1");
  });

  it("approving a sandbox-target item invokes the edge function with dryRun:false and the FULL body", async () => {
    const row = makePendingWriteRow({ target_env: "sandbox" });
    mockCreateServerSupabaseClient.mockReturnValue(mockSupabaseSingleRowClient(row));

    const { POST } = await import("./decision");
    const response = await POST({
      request: makeRequest({ decision: "approve" }),
      params: { workId: "acculynx-write-action:wk-1" },
      locals: { actor: ACCOUNTING_ACTOR },
    } as any);

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe("https://project.supabase.co/functions/v1/acculynx-write-action");
    const sentBody = JSON.parse(init.body);

    expect(sentBody.dryRun).toBe(false);
    expect(sentBody.lane).toBe("postJobPaymentReceived");
    expect(sentBody.accountKey).toBe("sandbox");
    expect(sentBody.targetEnv).toBe("sandbox");
    expect(sentBody.payload).toEqual({ amount: 100, jobId: "1" });
    expect(sentBody.workKey).toBe("wk-1");
    expect(sentBody.idempotencyKey).toBe("hash-1");

    const body = await response.json();
    expect(body.edgeInvocation.invoked).toBe(true);
  });

  it("the edge-fetch stub receives a body whose lane is a non-empty string and whose payload is a defined object (never workKey-only)", async () => {
    const row = makePendingWriteRow();
    mockCreateServerSupabaseClient.mockReturnValue(mockSupabaseSingleRowClient(row));

    const { POST } = await import("./decision");
    await POST({
      request: makeRequest({ decision: "approve" }),
      params: { workId: "acculynx-write-action:wk-1" },
      locals: { actor: ACCOUNTING_ACTOR },
    } as any);

    const [, init] = (fetch as any).mock.calls[0];
    const sentBody = JSON.parse(init.body);
    expect(typeof sentBody.lane).toBe("string");
    expect(sentBody.lane.length).toBeGreaterThan(0);
    expect(sentBody.payload).toBeDefined();
    expect(typeof sentBody.payload).toBe("object");
    expect(Object.keys(sentBody).sort()).not.toEqual(["workKey"]);
  });

  it("approve passes the approver identity in the edge body (SC2 / T-05-23)", async () => {
    const row = makePendingWriteRow({ target_env: "sandbox" });
    mockCreateServerSupabaseClient.mockReturnValue(mockSupabaseSingleRowClient(row));

    const namedApprover = { ...ACCOUNTING_ACTOR, email: "lucinda@cc.proexteriorsus.net" };
    const { POST } = await import("./decision");
    await POST({
      request: makeRequest({ decision: "approve" }),
      params: { workId: "acculynx-write-action:wk-1" },
      locals: { actor: namedApprover },
    } as any);

    const [, init] = (fetch as any).mock.calls[0];
    const sentBody = JSON.parse(init.body);
    expect(sentBody.approver).toBe("lucinda@cc.proexteriorsus.net");
  });

  it("reject closes the pending write to status 'rejected' (finding #2)", async () => {
    const row = makePendingWriteRow();
    const mock = mockSupabaseSingleRowClient(row);
    mockCreateServerSupabaseClient.mockReturnValue(mock);

    const { POST } = await import("./decision");
    const response = await POST({
      request: makeRequest({ decision: "reject" }),
      params: { workId: "acculynx-write-action:wk-1" },
      locals: { actor: ACCOUNTING_ACTOR },
    } as any);

    expect(response.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
    expect(mock.__update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "rejected" }),
    );
    expect(mock.__updateEq).toHaveBeenCalledWith("work_key", "wk-1");
  });

  it("a non-approve decision on an acculynx-write-action item never invokes the edge function", async () => {
    const row = makePendingWriteRow();
    mockCreateServerSupabaseClient.mockReturnValue(mockSupabaseSingleRowClient(row));

    const { POST } = await import("./decision");
    const response = await POST({
      request: makeRequest({ decision: "reject" }),
      params: { workId: "acculynx-write-action:wk-1" },
      locals: { actor: ACCOUNTING_ACTOR },
    } as any);

    expect(response.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("approving a prod-target item when the actor LACKS approval.decide_prod_write returns 403 BEFORE any fetch (D-09 barrier #2)", async () => {
    const row = makePendingWriteRow({ target_env: "prod", account_key: "acct-1" });
    mockCreateServerSupabaseClient.mockReturnValue(mockSupabaseSingleRowClient(row));

    const { POST } = await import("./decision");
    const response = await POST({
      request: makeRequest({ decision: "approve" }),
      params: { workId: "acculynx-write-action:wk-1" },
      locals: { actor: ACCOUNTING_ACTOR },
    } as any);

    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
    expect(mockRecordLiveWorkDecision).not.toHaveBeenCalled();
  });

  it("approving a prod-target item when the actor HAS approval.decide_prod_write proceeds to invoke the edge function", async () => {
    const row = makePendingWriteRow({ target_env: "prod", account_key: "acct-1" });
    mockCreateServerSupabaseClient.mockReturnValue(mockSupabaseSingleRowClient(row));

    const { POST } = await import("./decision");
    const response = await POST({
      request: makeRequest({ decision: "approve" }),
      params: { workId: "acculynx-write-action:wk-1" },
      locals: { actor: prodApproverActor() },
    } as any);

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, init] = (fetch as any).mock.calls[0];
    const sentBody = JSON.parse(init.body);
    expect(sentBody.targetEnv).toBe("prod");
    expect(sentBody.dryRun).toBe(false);
  });
});
