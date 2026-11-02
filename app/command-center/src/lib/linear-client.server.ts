/**
 * Shared Linear auth + guard for agent writes.
 *
 * Agents act as the "PE Dev Agents" Linear app (client_credentials grant) when
 * LINEAR_AGENT_CLIENT_ID / LINEAR_AGENT_CLIENT_SECRET are set, so their work stops
 * landing in Chris's inbox. Falls back to LINEAR_API_KEY when they are unset or the
 * mint fails. The secret is never logged.
 */
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

export const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";
export const LINEAR_TOKEN_URL = "https://api.linear.app/oauth/token";
export const CHRIS_LINEAR_USER_ID = "002bc1e6-c102-42f7-86cc-45b7c499dae3";
export const NEEDS_CHRIS_LABEL_ID = "9cf305cd-2042-44b2-bfe5-a0cec377c4d4";
const NEEDS_CHRIS = "needs-chris";
/** Refresh this long before expiry (Linear app tokens live ~30 days). */
const REFRESH_SKEW_MS = 24 * 60 * 60 * 1000;

interface CachedToken { token: string; expiresAt: number }

export function createLinearAuth({
  env = getRuntimeEnv,
  fetchImpl = fetch,
  now = Date.now,
}: { env?: () => RuntimeEnv; fetchImpl?: typeof fetch; now?: () => number } = {}) {
  let cached: CachedToken | null = null;
  let inflight: Promise<CachedToken | null> | null = null;

  async function mint(clientId: string, clientSecret: string): Promise<CachedToken | null> {
    try {
      const res = await fetchImpl(LINEAR_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret, scope: "read,write" }).toString(),
      });
      if (!res.ok) {
        console.error(`[linear-auth] app token mint failed: HTTP ${res.status}`);
        return null;
      }
      const json = (await res.json()) as { access_token?: string; expires_in?: number };
      if (!json.access_token || !json.expires_in) {
        console.error("[linear-auth] app token mint returned no token");
        return null;
      }
      return { token: json.access_token, expiresAt: now() + json.expires_in * 1000 };
    } catch {
      console.error("[linear-auth] app token mint threw");
      return null;
    }
  }

  async function authorization(): Promise<string | null> {
    const e = env();
    const clientId = e.LINEAR_AGENT_CLIENT_ID?.trim();
    const clientSecret = e.LINEAR_AGENT_CLIENT_SECRET?.trim();
    const fallback = e.LINEAR_API_KEY?.trim() || null;
    if (!clientId || !clientSecret) return fallback;

    if (!cached || now() >= cached.expiresAt - REFRESH_SKEW_MS) {
      inflight ??= mint(clientId, clientSecret).finally(() => { inflight = null; });
      const fresh = await inflight;
      if (fresh) cached = fresh;
      else if (!cached || now() >= cached.expiresAt) cached = null;
    }
    return cached ? `Bearer ${cached.token}` : fallback;
  }

  return { authorization, reset: () => { cached = null; } };
}

export const linearAuth = createLinearAuth();

export class AssignmentGuardError extends Error {
  constructor() {
    super("Agents may not assign Christopher unless the issue is labeled needs-chris.");
    this.name = "AssignmentGuardError";
  }
}

function* inputs(value: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(value)) for (const v of value) yield* inputs(v);
  else if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("assigneeId" in obj) yield obj;
    for (const v of Object.values(obj)) if (v && typeof v === "object") yield* inputs(v);
  }
}

/** Throws when a mutation would assign Chris to an issue that isn't labeled needs-chris. */
export function assertAssignmentAllowed(
  variables: Record<string, unknown>,
  { issueLabelNames = [] }: { issueLabelNames?: string[] } = {},
) {
  const existing = issueLabelNames.some((n) => n.toLowerCase() === NEEDS_CHRIS);
  for (const input of inputs(variables)) {
    if (input.assigneeId !== CHRIS_LINEAR_USER_ID) continue;
    const labelIds = Array.isArray(input.labelIds) ? input.labelIds : [];
    const added = Array.isArray(input.addedLabelIds) ? input.addedLabelIds : [];
    if (existing || labelIds.includes(NEEDS_CHRIS_LABEL_ID) || added.includes(NEEDS_CHRIS_LABEL_ID)) continue;
    throw new AssignmentGuardError();
  }
}

/** Guarded GraphQL call using the app token (or fallback key). */
export async function linearGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  { fetchImpl = fetch, authorization, issueLabelNames }: { fetchImpl?: typeof fetch; authorization?: string; issueLabelNames?: string[] } = {},
): Promise<T> {
  assertAssignmentAllowed(variables, { issueLabelNames });
  const auth = authorization ?? (await linearAuth.authorization());
  if (!auth) throw new Error("Linear is not configured");
  const res = await fetchImpl(LINEAR_GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: { message?: string }[] };
  if (json.errors?.length) throw new Error(`Linear GraphQL error: ${json.errors.map((e) => e.message ?? "unknown").join("; ")}`);
  if (!json.data) throw new Error("Linear omitted GraphQL data");
  return json.data;
}

export async function fetchIssueLabelNames(issueId: string): Promise<string[]> {
  const data = await linearGraphql<{ issue: { labels: { nodes: { name: string }[] } } | null }>(
    `query($id: String!) { issue(id: $id) { labels(first: 50) { nodes { name } } } }`,
    { id: issueId },
  );
  return data.issue?.labels.nodes.map((l) => l.name) ?? [];
}

let appUserId: string | null = null;
/** The Linear user id the agents act as (used to ignore their own comments). */
export async function getAppUserId(): Promise<string | null> {
  if (appUserId) return appUserId;
  try {
    const data = await linearGraphql<{ viewer: { id: string } }>(`{ viewer { id } }`, {});
    appUserId = data.viewer.id;
  } catch {
    return null;
  }
  return appUserId;
}
