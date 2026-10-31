/**
 * Linear GraphQL helpers for DevTeam webhooks and queue runner documentation.
 * Server-side only — acts as the PE Dev Agents app (LINEAR_AGENT_CLIENT_*) or falls back to LINEAR_API_KEY.
 */
import { getRuntimeEnv } from "@lib/runtime-env";
import { linearAuth, linearGraphql as guardedGraphql } from "@lib/linear-client.server";

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
  const authorization = await linearAuth.authorization();
  if (!authorization) return null;
  return guardedGraphql<T>(query, variables, { authorization });
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
  const env = getRuntimeEnv();
  return Boolean(env.LINEAR_API_KEY?.trim() || (env.LINEAR_AGENT_CLIENT_ID?.trim() && env.LINEAR_AGENT_CLIENT_SECRET?.trim()));
}
