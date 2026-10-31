import { describe, expect, it, vi } from "vitest";
import {
  CHRIS_LINEAR_USER_ID,
  NEEDS_CHRIS_LABEL_ID,
  AssignmentGuardError,
  assertAssignmentAllowed,
  createLinearAuth,
} from "./linear-client.server";

function tokenFetch(tokens: string[], expiresIn = 2_592_000) {
  let i = 0;
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify({ access_token: tokens[i++], token_type: "Bearer", expires_in: expiresIn, scope: "read write" }), { status: 200 }),
  );
}

const APP_ENV = { LINEAR_AGENT_CLIENT_ID: "cid", LINEAR_AGENT_CLIENT_SECRET: "csecret", LINEAR_API_KEY: "lin_personal" };

describe("Linear auth: which token the agents act with", () => {
  it("uses the PE Dev Agents app token when client credentials are set", async () => {
    const fetchImpl = tokenFetch(["app-1"]);
    const auth = createLinearAuth({ env: () => APP_ENV, fetchImpl, now: () => 0 });
    expect(await auth.authorization()).toBe("Bearer app-1");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://api.linear.app/oauth/token");
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(body.get("client_id")).toBe("cid");
    expect(body.get("client_secret")).toBe("csecret");
    expect(body.get("scope")).toBe("read,write");
  });

  it("falls back to LINEAR_API_KEY when the app credentials are unset", async () => {
    const fetchImpl = tokenFetch(["never"]);
    const auth = createLinearAuth({ env: () => ({ LINEAR_API_KEY: "lin_personal" }), fetchImpl, now: () => 0 });
    expect(await auth.authorization()).toBe("lin_personal");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null when nothing is configured", async () => {
    const auth = createLinearAuth({ env: () => ({}), fetchImpl: tokenFetch([]), now: () => 0 });
    expect(await auth.authorization()).toBeNull();
  });

  it("caches the app token instead of minting one per call", async () => {
    const fetchImpl = tokenFetch(["app-1", "app-2"]);
    const auth = createLinearAuth({ env: () => APP_ENV, fetchImpl, now: () => 1_000 });
    await auth.authorization();
    await Promise.all([auth.authorization(), auth.authorization()]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("refreshes the token a day before it expires", async () => {
    let clock = 0;
    const fetchImpl = tokenFetch(["app-1", "app-2"]);
    const auth = createLinearAuth({ env: () => APP_ENV, fetchImpl, now: () => clock });
    expect(await auth.authorization()).toBe("Bearer app-1");
    clock = (2_592_000 - 86_400 - 60) * 1000; // still outside the refresh window
    expect(await auth.authorization()).toBe("Bearer app-1");
    clock = (2_592_000 - 86_400 + 1) * 1000; // inside the window
    expect(await auth.authorization()).toBe("Bearer app-2");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("falls back to LINEAR_API_KEY and never leaks the secret when the token mint fails", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => new Response("bad", { status: 401 }));
    const auth = createLinearAuth({ env: () => APP_ENV, fetchImpl, now: () => 0 });
    expect(await auth.authorization()).toBe("lin_personal");
    expect(JSON.stringify(errors.mock.calls)).not.toContain("csecret");
  });
});

describe("assignment guard: agents never assign Chris unless the issue needs him", () => {
  it("blocks assigning Chris on a create without needs-chris", () => {
    expect(() => assertAssignmentAllowed({ input: { assigneeId: CHRIS_LINEAR_USER_ID, labelIds: [] } })).toThrow(AssignmentGuardError);
  });

  it("blocks assigning Chris on an update when the issue lacks needs-chris", () => {
    expect(() => assertAssignmentAllowed({ id: "x", input: { assigneeId: CHRIS_LINEAR_USER_ID } }, { issueLabelNames: ["lane:cw-grok"] })).toThrow(AssignmentGuardError);
  });

  it("allows Chris when the mutation carries the needs-chris label id", () => {
    expect(() => assertAssignmentAllowed({ input: { assigneeId: CHRIS_LINEAR_USER_ID, labelIds: [NEEDS_CHRIS_LABEL_ID] } })).not.toThrow();
  });

  it("allows Chris when the existing issue is labeled needs-chris", () => {
    expect(() => assertAssignmentAllowed({ input: { assigneeId: CHRIS_LINEAR_USER_ID } }, { issueLabelNames: ["Needs-Chris"] })).not.toThrow();
  });

  it("ignores other assignees and unassignment", () => {
    expect(() => assertAssignmentAllowed({ input: { assigneeId: "someone-else" } })).not.toThrow();
    expect(() => assertAssignmentAllowed({ input: { assigneeId: null } })).not.toThrow();
  });

  it("finds Chris nested in batch inputs", () => {
    expect(() => assertAssignmentAllowed({ issues: [{ title: "a" }, { assigneeId: CHRIS_LINEAR_USER_ID }] })).toThrow(AssignmentGuardError);
  });
});
