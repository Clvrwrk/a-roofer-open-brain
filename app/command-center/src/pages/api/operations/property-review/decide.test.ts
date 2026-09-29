import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateServerSupabaseClient = vi.fn();
vi.mock("@lib/supabase.server", () => ({
  createServerSupabaseClient: (...args: unknown[]) => mockCreateServerSupabaseClient(...args),
}));

const JOB = "87fa903b-d51b-450e-960d-b1e0c9106ac6";
const PROP = "8a6b08fc-c705-4fc6-a329-d8bceeae0744";

const HUMAN = {
  id: "reviewer@example.com",
  type: "human",
  displayName: "Pat Reviewer",
  email: "reviewer@example.com",
  source: "workos",
  roles: [],
  permissions: ["command_center.read", "approval.decide"],
  departmentAccess: "all",
  desktopEnabled: true,
};
const SERVICE = { ...HUMAN, id: "ob-accounting", type: "service_agent", permissions: ["command_center.read"], departmentAccess: ["operations"] };

function makeClient(result: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  return { client: { rpc }, config: { missing: [] }, rpc };
}

async function call(body: unknown, actor: unknown = HUMAN) {
  const { POST } = await import("./decide");
  const request = new Request("http://localhost/api/operations/property-review/decide", { method: "POST", body: JSON.stringify(body) });
  return POST({ request, locals: { actor } } as any);
}

describe("POST /api/operations/property-review/decide", () => {
  beforeEach(() => mockCreateServerSupabaseClient.mockReset());

  it("records a link as the signed-in person", async () => {
    const c = makeClient({ data: { ok: true, status: "resolved" } });
    mockCreateServerSupabaseClient.mockReturnValue(c);
    const res = await call({ jobId: JOB, decision: "link", propertyId: PROP, note: "matches the parcel" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: "resolved", decidedBy: "Pat Reviewer" });
    expect(c.rpc).toHaveBeenCalledWith("record_acculynx_job_property_decision", {
      p_job_id: JOB, p_decision: "link", p_property_id: PROP, p_corrected_address: null,
      p_note: "matches the parcel", p_actor_id: "reviewer@example.com", p_actor_name: "Pat Reviewer",
    });
  });

  it("refuses an actor without approval.decide before touching the database", async () => {
    const res = await call({ jobId: JOB, decision: "dismiss" }, SERVICE);
    expect(res.status).toBe(403);
    expect(mockCreateServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid body without calling the RPC", async () => {
    const c = makeClient({ data: { ok: true } });
    mockCreateServerSupabaseClient.mockReturnValue(c);
    const res = await call({ jobId: JOB, decision: "link" });
    expect(res.status).toBe(400);
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it("maps a refused decision to 409 with a plain-language message", async () => {
    mockCreateServerSupabaseClient.mockReturnValue(makeClient({ data: { ok: false, error: "not_open", status: "resolved" } }));
    const res = await call({ jobId: JOB, decision: "dismiss" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("not_open");
    expect(body.error_description).toMatch(/already decided/);
  });

  it("returns 401 with no actor", async () => {
    const res = await call({ jobId: JOB, decision: "dismiss" }, null);
    expect(res.status).toBe(401);
  });
});
