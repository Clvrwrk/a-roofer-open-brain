import { describe, expect, it, vi } from "vitest";
import { hasPermission, resolveActorFromSessionUser, type CommandCenterActor } from "@lib/access-control";
import {
  buildPendingWriteRows,
  departmentForLane,
  loadPendingAccuLynxWriteSurface,
  mapPendingWriteToLiveWorkItem,
  type AcculynxPendingWriteRow,
} from "@lib/acculynx-pending-write";

const approver = { email: "chris@proexteriorsus.net", firstName: "Chris", lastName: "H" };
const ordinaryHuman = { email: "lucinda@proexteriorsus.net", firstName: "Lucinda", lastName: "Dunn" };

function makeActor(): CommandCenterActor {
  return {
    id: "ob-ops",
    type: "service_agent",
    displayName: "Operations",
    email: null,
    source: "service_token",
    roles: ["vertical", "operations"],
    permissions: ["command_center.read", "work_queue.read", "evidence.attach"],
    departmentAccess: ["operations"],
    desktopEnabled: false,
  };
}

function makeRow(overrides: Partial<AcculynxPendingWriteRow> = {}): AcculynxPendingWriteRow {
  return {
    id: 1,
    work_key: "abc123",
    lane: "postJobMessage",
    target_env: "sandbox",
    account_key: "sandbox",
    endpoint: "/jobs/{jobId}/messages",
    payload: { message: "hello" },
    dry_run_render: { method: "POST", path: "/jobs/1/messages" },
    idempotency_key: "hash-1",
    status: "pending_review",
    approver: null,
    exec_result: null,
    department: "operations",
    created_by: "ob-ops",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("approval.decide_prod_write permission (D-09)", () => {
  it("is granted to a named approver on PROD_WRITE_APPROVER_EMAILS", () => {
    const actor = resolveActorFromSessionUser(approver, {
      PROD_WRITE_APPROVER_EMAILS: "chris@proexteriorsus.net",
    });
    expect(actor).not.toBeNull();
    expect(hasPermission(actor!, "approval.decide_prod_write")).toBe(true);
  });

  it("is NOT granted to an ordinary human not on the roster", () => {
    const actor = resolveActorFromSessionUser(ordinaryHuman, {
      PROD_WRITE_APPROVER_EMAILS: "chris@proexteriorsus.net",
    });
    expect(actor).not.toBeNull();
    expect(hasPermission(actor!, "approval.decide_prod_write")).toBe(false);
  });

  it("is NOT granted to any human by default when the roster is unset (not part of the blanket grant)", () => {
    const actor = resolveActorFromSessionUser(ordinaryHuman, {});
    expect(actor).not.toBeNull();
    expect(hasPermission(actor!, "approval.decide_prod_write")).toBe(false);
  });
});

describe("mapPendingWriteToLiveWorkItem", () => {
  it("maps a pending_review row into a LiveWorkItem with the acculynx-write-action workKey/workflow/approval/sourceTable", () => {
    const item = mapPendingWriteToLiveWorkItem(makeRow());
    expect(item.workKey).toBe("acculynx-write-action:abc123");
    expect(item.workflow).toBe("acculynx-write-action");
    expect(item.approval).toBe("before_write");
    expect(item.sourceTable).toBe("acculynx_pending_write");
    expect(item.auditTrail.length).toBeGreaterThan(0);
  });

  it("renders an unmistakable PROD marker in the title/summary for a prod-target row", () => {
    const item = mapPendingWriteToLiveWorkItem(makeRow({ target_env: "prod", account_key: "acct-1" }));
    expect(item.title).toMatch(/PROD/);
    expect(item.detail).toMatch(/PROD/);
    expect(item.auditTrail.some((line) => line.includes("PROD"))).toBe(true);
  });

  it("does not render a PROD marker for a sandbox-target row", () => {
    const item = mapPendingWriteToLiveWorkItem(makeRow({ target_env: "sandbox" }));
    expect(item.title).not.toMatch(/PROD/);
  });
});

describe("departmentForLane", () => {
  it("maps a payment lane to accounting and a job-message lane to operations", () => {
    expect(departmentForLane("postJobPaymentReceived")).toBe("accounting");
    expect(departmentForLane("postJobMessage")).toBe("operations");
  });
});

describe("buildPendingWriteRows", () => {
  it("produces a pending-write row with the required fields and a mirror dashboard_action_log row", () => {
    const { pendingWrite, actionLog } = buildPendingWriteRows({
      lane: "postJobExternalReference",
      accountKey: "sandbox",
      targetEnv: "sandbox",
      payload: { jobId: "1", source: "test", projectId: "p-1" },
      endpoint: "/jobs/external-references",
      idempotencyKey: "hash-2",
      workKey: "wk-2",
      actor: makeActor(),
    });

    expect(pendingWrite.work_key).toBe("wk-2");
    expect(pendingWrite.lane).toBe("postJobExternalReference");
    expect(pendingWrite.status).toBe("pending_review");
    expect(pendingWrite.department).toBe("operations");

    expect(actionLog.work_key).toBe("wk-2");
    expect(actionLog.workflow).toBe("acculynx-write-action");
    expect(actionLog.action_type).toBe("agent_enqueue");
    expect(actionLog.actor_id).toBe("ob-ops");
  });

  it("marks the mirror action-log note with a PROD indicator for a prod target", () => {
    const { actionLog } = buildPendingWriteRows({
      lane: "postJobPaymentReceived",
      accountKey: "acct-1",
      targetEnv: "prod",
      payload: { amount: 100 },
      endpoint: "/jobs/{jobId}/payments/received",
      idempotencyKey: "hash-3",
      workKey: "wk-3",
      actor: makeActor(),
    });
    expect(String(actionLog.note)).toMatch(/PROD/);
  });
});

describe("loadPendingAccuLynxWriteSurface", () => {
  it("returns only pending_review rows mapped to LiveWorkItem[]", async () => {
    const row = makeRow();
    const eqMock = vi.fn().mockReturnThis();
    const orderMock = vi.fn().mockReturnThis();
    const limitMock = vi.fn().mockResolvedValue({ data: [row], error: null });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock, order: orderMock, limit: limitMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    eqMock.mockReturnValue({ order: orderMock, limit: limitMock });
    orderMock.mockReturnValue({ limit: limitMock });

    const client = { from: fromMock } as any;
    const result = await loadPendingAccuLynxWriteSurface(client);

    expect(fromMock).toHaveBeenCalledWith("acculynx_pending_write");
    expect(eqMock).toHaveBeenCalledWith("status", "pending_review");
    expect(result.errors).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].workKey).toBe("acculynx-write-action:abc123");
  });

  it("surfaces a query error via errors[] and returns no items", async () => {
    const limitMock = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
    const eqMock = vi.fn().mockReturnValue({ order: orderMock, limit: limitMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock, order: orderMock, limit: limitMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });

    const client = { from: fromMock } as any;
    const result = await loadPendingAccuLynxWriteSurface(client);

    expect(result.items).toEqual([]);
    expect(result.errors[0]).toMatch(/acculynx_pending_write/);
  });
});
