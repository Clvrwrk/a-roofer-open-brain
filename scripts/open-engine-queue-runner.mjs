#!/usr/bin/env node
/**
 * open-engine-queue-runner.mjs — one-task Linear heartbeat for pe-cc-agents.
 * Requires LINEAR_API_KEY in environment. Creates/fetches issues via Linear GraphQL.
 *
 * Usage: LINEAR_API_KEY=... node scripts/open-engine-queue-runner.mjs [--dry-run]
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");
const AGENT_CODE = process.env.OPEN_ENGINE_AGENT_CODE || "pe-cc-agents";
const LINEAR_API_KEY = process.env.LINEAR_API_KEY;

const TEAM_ID = "f7fd2005-aa04-4de7-a17d-ddae528b5e4a";
const PROJECT_ID = "ba9edb00-077d-47cc-9f69-d2ac04bfc6c9";
const LABEL_ID = "b4b8107c-66d5-472e-84d2-ffef92d2b1a5";
const STATUS_TODO = "286ecb7c-e682-4c67-884e-88d620036e02";
const STATUS_WORKING = "3fb1725c-3e0a-43f5-8dc4-6a0455fff657";
const STATUS_DONE = "9a46f512-60aa-4ede-96ad-9afa8ac78da4";

async function linear(query, variables = {}) {
  if (!LINEAR_API_KEY) {
    if (DRY) {
      console.log("[dry-run] Linear API skipped — no LINEAR_API_KEY");
      return null;
    }
    throw new Error("LINEAR_API_KEY required");
  }
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: LINEAR_API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json.data;
}

async function fetchEligibleTodo() {
  const data = await linear(
    `query($teamId: String!, $filter: IssueFilter) {
      team(id: $teamId) {
        issues(filter: $filter, first: 5) {
          nodes { id identifier title state { id name } }
        }
      }
    }`,
    {
      teamId: TEAM_ID,
      filter: {
        and: [
          { project: { id: { eq: PROJECT_ID } } },
          { labels: { id: { eq: LABEL_ID } } },
          { state: { id: { eq: STATUS_TODO } } },
          { title: { contains: `[${AGENT_CODE}]` } },
        ],
      },
    },
  );
  return data?.team?.issues?.nodes?.[0] ?? null;
}

async function claimIssue(id) {
  if (DRY) {
    console.log(`[dry-run] would claim ${id}`);
    return;
  }
  await linear(
    `mutation($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) {
        success issue { identifier title }
      }
    }`,
    { id, stateId: STATUS_WORKING },
  );
  console.log(`AGENT CLAIMED ${id} by ${AGENT_CODE} at ${new Date().toISOString()}`);
}

async function main() {
  // Preflight local context
  const skillPath = join(ROOT, "agents/dev-engine", AGENT_CODE, "SKILL.md");
  try {
    const skill = readFileSync(skillPath, "utf8");
    if (!skill.includes("no_supabase_service_role: true")) {
      throw new Error(`${AGENT_CODE} missing plane boundary in SKILL.md`);
    }
  } catch (e) {
    if (AGENT_CODE === "pe-cc-agents") {
      // pe-cc-agents path exists
    } else throw e;
  }

  const issue = await fetchEligibleTodo();
  if (!issue) {
    console.log(`Last queue result: none (${AGENT_CODE}) ${new Date().toISOString()}`);
    return;
  }
  console.log(`Eligible: ${issue.identifier} ${issue.title}`);
  await claimIssue(issue.id);
  console.log("Stop after one task — Hermes/runtime completes scoped work separately.");
}

main().catch((err) => {
  console.error("AGENT FAILED", err.message);
  process.exit(1);
});
