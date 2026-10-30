import { jsonSchema, tool } from "ai";

// Read-only, least-privilege tools per agent role. Every tool is GET/query only;
// no tool can write to Linear, GitHub or Sentry. A tool is only offered when its
// credential env var is present, so a missing key degrades to "no tool", not an error.

export const ROLE_TOOLS = {
  "ops-team-coordinator": ["linear_search_issues", "github_list_issues", "sentry_list_issues"],
  "qa-compliance": ["linear_search_issues", "github_list_issues", "sentry_list_issues"],
  "document-intake": ["linear_search_issues"],
  "pricing-catalog": ["linear_search_issues"],
  "vendor-draft": ["linear_search_issues"],
  "finance-reporting": ["linear_search_issues"],
  "external-research": ["linear_search_issues"],
  "marketing-proof": ["linear_search_issues"],
};

const DEFAULT_REPOS = ["Clvrwrk/a-roofer-open-brain", "Clvrwrk/CRM_PWA"];
const clamp = (n, max = 10) => Math.max(1, Math.min(Number(n) || 5, max));

const DEFS = {
  linear_search_issues: {
    keyEnv: "LINEAR_API_KEY",
    description: "Search Linear issues by text (read-only). Returns identifier, title, state, url.",
    schema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] },
    run: async ({ query, limit }, { env, fetch }) => {
      const res = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: env.LINEAR_API_KEY },
        body: JSON.stringify({
          query: "query($q:String!,$n:Int){searchIssues(term:$q,first:$n){nodes{identifier title url state{name}}}}",
          variables: { q: String(query), n: clamp(limit) },
        }),
      });
      const json = await res.json();
      return (json?.data?.searchIssues?.nodes ?? []).map((i) => ({ id: i.identifier, title: i.title, state: i.state?.name, url: i.url }));
    },
  },
  github_list_issues: {
    keyEnv: "GITHUB_READ_TOKEN",
    description: "List open GitHub issues/PRs for an allowlisted repo (read-only).",
    schema: { type: "object", properties: { repo: { type: "string" }, limit: { type: "number" } }, required: ["repo"] },
    run: async ({ repo, limit }, { env, fetch }) => {
      const allowed = (env.AGENT_GITHUB_REPOS?.split(",").map((r) => r.trim()).filter(Boolean)) ?? DEFAULT_REPOS;
      if (!allowed.includes(repo)) return { error: "repo_not_allowlisted", allowed };
      const res = await fetch(`https://api.github.com/repos/${repo}/issues?state=open&per_page=${clamp(limit)}`, {
        headers: { accept: "application/vnd.github+json", authorization: `Bearer ${env.GITHUB_READ_TOKEN}` },
      });
      const json = await res.json();
      return (Array.isArray(json) ? json : []).map((i) => ({ number: i.number, title: i.title, pr: Boolean(i.pull_request), url: i.html_url }));
    },
  },
  sentry_list_issues: {
    keyEnv: "SENTRY_READ_TOKEN",
    description: "List unresolved Sentry issues for the configured org (read-only).",
    schema: { type: "object", properties: { limit: { type: "number" } } },
    run: async ({ limit }, { env, fetch }) => {
      if (!env.SENTRY_ORG) return { error: "sentry_org_not_configured" };
      const res = await fetch(`https://sentry.io/api/0/organizations/${encodeURIComponent(env.SENTRY_ORG)}/issues/?query=is:unresolved&limit=${clamp(limit)}`, {
        headers: { authorization: `Bearer ${env.SENTRY_READ_TOKEN}` },
      });
      const json = await res.json();
      return (Array.isArray(json) ? json : []).map((i) => ({ id: i.shortId, title: i.title, count: i.count, url: i.permalink }));
    },
  },
};

export function toolsForRole(role, env, fetchImpl = globalThis.fetch) {
  const tools = {};
  for (const name of ROLE_TOOLS[role] ?? []) {
    const def = DEFS[name];
    if (!env?.[def.keyEnv]) continue;
    tools[name] = tool({
      description: def.description,
      inputSchema: jsonSchema(def.schema),
      execute: async (input) => {
        try {
          return await def.run(input, { env, fetch: fetchImpl });
        } catch (error) {
          return { error: error?.message ?? "tool_failed" };
        }
      },
    });
  }
  return tools;
}
