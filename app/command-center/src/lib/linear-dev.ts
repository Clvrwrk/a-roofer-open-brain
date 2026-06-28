/**
 * Linear GraphQL helpers for DevTeam webhooks and queue runner documentation.
 * Server-side only — requires LINEAR_API_KEY.
 */
import { getRuntimeEnv } from "@lib/runtime-env";

const TEAM_ID = "f7fd2005-aa04-4de7-a17d-ddae528b5e4a";
const PROJECT_ID = "ba9edb00-077d-47cc-9f69-d2ac04bfc6c9";
const LABEL_ID = "b4b8107c-66d5-472e-84d2-ffef92d2b1a5";
const STATUS_TODO = "286ecb7c-e682-4c67-884e-88d620036e02";

export interface LinearIssueInput {
  title: string;
  description: string;
  agentCode?: string;
}

async function linearGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  const apiKey = getRuntimeEnv().LINEAR_API_KEY?.trim();
  if (!apiKey) return null;

  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data ?? null;
}

export async function createDevLinearIssue(input: LinearIssueInput) {
  const agentCode = input.agentCode ?? "pe-cc-agents";
  const title = input.title.includes("[agent instructions]")
    ? input.title
    : `[agent instructions][${agentCode}][task] ${input.title}`;

  const data = await linearGraphql<{
    issueCreate: { success: boolean; issue: { identifier: string; url: string } | null };
  }>(
    `mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { identifier url }
      }
    }`,
    {
      input: {
        teamId: TEAM_ID,
        projectId: PROJECT_ID,
        stateId: STATUS_TODO,
        labelIds: [LABEL_ID],
        title,
        description: input.description,
      },
    },
  );

  return data?.issueCreate?.issue ?? null;
}

export function isLinearConfigured() {
  return Boolean(getRuntimeEnv().LINEAR_API_KEY?.trim());
}
