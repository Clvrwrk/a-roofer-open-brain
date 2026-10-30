import { describe, expect, it, vi } from "vitest";
import { ROLE_TOOLS, toolsForRole } from "../../runtime/agent-tools.mjs";

const env = { LINEAR_API_KEY: "lin", GITHUB_READ_TOKEN: "gh", SENTRY_READ_TOKEN: "se", SENTRY_ORG: "pe" };
const ok = (body: unknown) => vi.fn(async () => ({ json: async () => body }));
const run = (t: any, input: unknown) => t.execute(input, { toolCallId: "1", messages: [] });

describe("agent tools", () => {
  it("gives each role only its allowlisted tools", () => {
    expect(Object.keys(toolsForRole("document-intake", env))).toEqual(["linear_search_issues"]);
    expect(Object.keys(toolsForRole("qa-compliance", env)).sort()).toEqual(["github_list_issues", "linear_search_issues", "sentry_list_issues"]);
    expect(toolsForRole("unknown-role", env)).toEqual({});
  });

  it("omits a tool when its credential is missing", () => {
    expect(Object.keys(toolsForRole("ops-team-coordinator", { LINEAR_API_KEY: "lin" }))).toEqual(["linear_search_issues"]);
  });

  it("every role tool is read-only (no mutation names)", () => {
    for (const names of Object.values(ROLE_TOOLS)) for (const n of names) expect(n).toMatch(/_(search|list)_/);
  });

  it("linear search posts a query, never a mutation, and maps results", async () => {
    const f = ok({ data: { searchIssues: { nodes: [{ identifier: "PEC-1", title: "t", url: "u", state: { name: "Todo" } }] } } });
    const out = await run(toolsForRole("document-intake", env, f).linear_search_issues, { query: "slack", limit: 99 });
    expect(out).toEqual([{ id: "PEC-1", title: "t", state: "Todo", url: "u" }]);
    const body = JSON.parse((f.mock.calls[0] as any)[1].body);
    expect(body.query).not.toMatch(/mutation/i);
    expect(body.variables.n).toBe(10);
  });

  it("github refuses repos outside the allowlist and only GETs", async () => {
    const f = ok([{ number: 5, title: "x", html_url: "h" }]);
    const t = toolsForRole("qa-compliance", env, f).github_list_issues;
    expect(await run(t, { repo: "evil/repo" })).toMatchObject({ error: "repo_not_allowlisted" });
    expect(f).not.toHaveBeenCalled();
    expect(await run(t, { repo: "Clvrwrk/CRM_PWA" })).toEqual([{ number: 5, title: "x", pr: false, url: "h" }]);
    expect((f.mock.calls[0] as any)[1].method).toBeUndefined();
  });

  it("sentry lists unresolved issues and reports fetch failures as data", async () => {
    const f = ok([{ shortId: "CC-1", title: "boom", count: "3", permalink: "p" }]);
    expect(await run(toolsForRole("qa-compliance", env, f).sentry_list_issues, {})).toEqual([{ id: "CC-1", title: "boom", count: "3", url: "p" }]);
    const bad = vi.fn(async () => { throw new Error("down"); });
    expect(await run(toolsForRole("qa-compliance", env, bad).sentry_list_issues, {})).toEqual({ error: "down" });
  });
});
