import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";

export const AGENT_AUTH_REVOCATION_EVENT_SCHEMA =
  "https://schemas.workos.com/events/agent/auth/identity/assertion/revoked";

export const AGENT_AUTH_SOURCE = {
  repo: "https://github.com/workos/auth.md",
  docs: "https://workos.com/auth-md",
  dated: "2026-06-06",
};

export const agentAuthScopes = [
  "open-brain.read",
  "open-brain.tasks.request",
  "open-brain.tasks.write",
  "open-brain.memory.read",
];

function normalizeOrigin(value?: string) {
  const origin = value?.trim().replace(/\/+$/, "");
  return origin || "https://cc.proexteriorsus.net";
}

export function getAgentAuthRuntimeConfig(env: RuntimeEnv = getRuntimeEnv()) {
  const origin = normalizeOrigin(env.AGENT_AUTH_ISSUER ?? env.COMMAND_CENTER_PUBLIC_URL);

  return {
    origin,
    resource: `${origin}/`,
    issuer: origin,
  };
}

export function buildProtectedResourceMetadata(env: RuntimeEnv = getRuntimeEnv()) {
  const config = getAgentAuthRuntimeConfig(env);

  return {
    resource: config.resource,
    resource_name: "Pro Exteriors Open Brain Command Center",
    resource_logo_uri: `${config.origin}/brand-mark.svg`,
    authorization_servers: [config.issuer],
    scopes_supported: agentAuthScopes,
    bearer_methods_supported: ["header"],
  };
}

export function buildAuthorizationServerMetadata(env: RuntimeEnv = getRuntimeEnv()) {
  const config = getAgentAuthRuntimeConfig(env);

  return {
    ...buildProtectedResourceMetadata(env),
    issuer: config.issuer,
    token_endpoint: `${config.origin}/oauth2/token`,
    revocation_endpoint: `${config.origin}/oauth2/revoke`,
    grant_types_supported: ["urn:ietf:params:oauth:grant-type:jwt-bearer"],
    agent_auth: {
      skill: "https://workos.com/auth-md",
      register_uri: `${config.origin}/agent/auth`,
      claim_uri: `${config.origin}/agent/auth/claim`,
      revocation_uri: `${config.origin}/agent/auth/revoke`,
      identity_types_supported: ["anonymous", "identity_assertion"],
      anonymous: {
        credential_types_supported: ["api_key"],
      },
      identity_assertion: {
        assertion_types_supported: [
          "urn:ietf:params:oauth:token-type:id-jag",
          "verified_email",
        ],
        credential_types_supported: ["access_token", "api_key"],
      },
      events_supported: [AGENT_AUTH_REVOCATION_EVENT_SCHEMA],
    },
  };
}

export function buildAuthMdDocument(env: RuntimeEnv = getRuntimeEnv()) {
  const config = getAgentAuthRuntimeConfig(env);

  return `# Open Brain agent auth

This Command Center publishes agent-auth discovery for Pro Exteriors' Open Brain. Human operators continue through WorkOS while agent registration is built behind the discovery surface.

## Discovery

- Protected resource metadata: ${config.origin}/.well-known/oauth-protected-resource
- Authorization server metadata: ${config.origin}/.well-known/oauth-authorization-server
- Token endpoint: ${config.origin}/oauth2/token
- Token revocation endpoint: ${config.origin}/oauth2/revoke
- Agent registration endpoint: ${config.origin}/agent/auth
- Claim endpoint: ${config.origin}/agent/auth/claim
- Claim completion endpoint: ${config.origin}/agent/auth/claim/complete
- Revocation endpoint: ${config.origin}/agent/auth/revoke

## Supported agent registration methods

- anonymous
- identity_assertion with urn:ietf:params:oauth:token-type:id-jag
- identity_assertion with verified_email

## Supported scopes

${agentAuthScopes.map((scope) => `- ${scope}`).join("\n")}

## Event receiver

Provider-driven identity invalidation uses logout-token delivery at /agent/auth/revoke. The current supported event schema is ${AGENT_AUTH_REVOCATION_EVENT_SCHEMA}.

## Implementation state

Discovery routes are wired. Registration, token minting, token revocation, and SET verification return explicit not_implemented responses until the signing key, token store, trusted issuer list, replay protection, and WorkOS human session bridge are installed.

Reference process: WorkOS auth.md, dated ${AGENT_AUTH_SOURCE.dated}: ${AGENT_AUTH_SOURCE.docs}.
`;
}

export function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...init.headers,
    },
  });
}

export function notImplementedAgentAuthResponse(operation: string, env: RuntimeEnv = getRuntimeEnv()) {
  const metadata = buildAuthorizationServerMetadata(env);

  return jsonResponse(
    {
      error: "not_implemented",
      error_description: `${operation} is reserved for the agent-auth runtime phase.`,
      auth_md: metadata.agent_auth.skill,
      issuer: metadata.issuer,
      next_phase:
        "Install service signing keys, trusted agent-provider issuers, token persistence, replay protection, and WorkOS-backed human ownership.",
    },
    { status: 501 },
  );
}
