import {resolveActorFromSessionUser, type CommandCenterActor} from './access-control';
import type {SessionResult} from './session.server';
import type {RuntimeEnv} from './runtime-env';

type ExistingIdentity = {subject: string; organization_id: string; email: string};
const opaqueId = /^[A-Za-z0-9_-]{1,128}$/;
const emailAddress = /^[a-z0-9.!#$&'+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/;

function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

/** Called only after JSON.parse has established valid JSON. Tokenize strings as
 * units so punctuation in a value cannot affect nesting; decode escaped keys. */
function hasDuplicateKeys(raw: string): boolean {
  const stack: (Set<string> | null)[] = [];
  for (const match of raw.matchAll(/"(?:[^"\\]|\\.)*"|[{}\[\]]/g)) {
    const token = match[0];
    if (token === '{') stack.push(new Set());
    else if (token === '[') stack.push(null);
    else if (token === '}' || token === ']') stack.pop();
    else if (raw.slice(match.index! + token.length).trimStart().startsWith(':')) {
      const keys = stack.at(-1);
      const key = JSON.parse(token) as string;
      if (keys?.has(key)) return true;
      keys?.add(key);
    }
  }
  return false;
}

/** Server-only, explicit existing-user roster. Reject the whole configuration on
 * ambiguity; a partially accepted roster could hide a deployment mistake. */
function parseRoster(raw: string | undefined): ExistingIdentity[] {
  if (!raw || raw.length > 65_536) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (hasDuplicateKeys(raw) || !exactKeys(parsed, ['version', 'identities']) || parsed.version !== 1
      || !Array.isArray(parsed.identities) || parsed.identities.length > 200) return [];
    const subjects = new Set<string>();
    const emails = new Set<string>();
    const identities: ExistingIdentity[] = [];
    for (const entry of parsed.identities) {
      if (!exactKeys(entry, ['subject', 'organization_id', 'email'])
        || typeof entry.subject !== 'string' || !opaqueId.test(entry.subject)
        || typeof entry.organization_id !== 'string' || !opaqueId.test(entry.organization_id)
        || typeof entry.email !== 'string' || entry.email.length > 254 || !emailAddress.test(entry.email)
        || subjects.has(entry.subject) || emails.has(entry.email)) return [];
      subjects.add(entry.subject);
      emails.add(entry.email);
      identities.push({subject: entry.subject, organization_id: entry.organization_id, email: entry.email});
    }
    return identities;
  } catch { return []; }
}

/** This preserves the legacy resolver's effective rights, never creates a CRM
 * membership. SessionResult must come from authenticateSession's verified seal.
 * No route name, token header, domain, or new canonical role is a grant. */
export function resolvePreservedLegacyHuman(result: SessionResult, env: RuntimeEnv): CommandCenterActor | null {
  if (env.CRM_CANONICAL_ENABLED !== 'true' || env.COMMAND_CENTER_AUTH_MODE !== 'workos'
    || result.status !== 'authenticated' || result.user.emailVerified !== true
    || !result.crmIdentity || !result.crmIdentity.sessionId
    || result.crmIdentity.subject !== result.user.id
    || !env.CRM_WORKOS_ORGANIZATION_ID
    || result.crmIdentity.organizationId !== env.CRM_WORKOS_ORGANIZATION_ID) return null;
  const match = parseRoster(env.CRM_LEGACY_BACKOFFICE_IDENTITIES).some(entry =>
    entry.subject === result.user.id
    && entry.organization_id === result.crmIdentity!.organizationId
    && entry.email === result.user.email);
  if (!match) return null;
  // Keep canonical mode enabled: never revive the implicit default-admin alias.
  const actor = resolveActorFromSessionUser(result.user, env);
  return actor?.type === 'human' && actor.source === 'workos' ? actor : null;
}
