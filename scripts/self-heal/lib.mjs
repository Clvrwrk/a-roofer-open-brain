// Shared helpers for the error -> Linear bug log -> autofix pipeline.
// Node 22, no dependencies. Every network call goes through createHttp so a dry run
// can prove it made zero writes. Governance: docs/proposals/A3-error-autofix-pipeline.md.
import { createHash } from 'node:crypto';

export const LINEAR_API = 'https://api.linear.app/graphql';
// Egress allow-list: the Sentry token is only ever sent to these hosts.
export const SENTRY_HOSTS = Object.freeze(['sentry.io', 'us.sentry.io', 'de.sentry.io']);

export const LABELS = Object.freeze({
  bug: { name: 'bug', env: 'LINEAR_LABEL_BUG' },
  sourceSentry: { name: 'source:sentry', env: 'LINEAR_LABEL_SOURCE_SENTRY' },
  queued: { name: 'autofix:queued', env: 'LINEAR_LABEL_AUTOFIX_QUEUED' },
  running: { name: 'autofix:running', env: 'LINEAR_LABEL_AUTOFIX_RUNNING' },
  prOpen: { name: 'autofix:pr-open', env: 'LINEAR_LABEL_AUTOFIX_PR_OPEN' },
  needsHuman: { name: 'needs-human', env: 'LINEAR_LABEL_NEEDS_HUMAN' },
  // Staff "Report a bug" submissions (docs/delivery/BUG-LOG.md, "User reports"). Optional for --apply: while it
  // is unset, user reports are skipped (never filed under source:sentry) and every other issue is triaged.
  sourceUser: { name: 'source:user', env: 'LINEAR_LABEL_SOURCE_USER', optional: true },
});

export const IDENTIFIER_RE = /^[A-Z][A-Z0-9]{0,9}-\d{1,6}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Personal-data stripping. Sentry payloads are already scrubbed at capture
// (apps/crm/src/lib/monitoring/telemetry.ts); this is a second, independent layer.
// ---------------------------------------------------------------------------
const PII_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[redacted-key]'],
  [/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '[redacted-token]'],
  [/\b(?:sk-ant-|lin_api_|sntry[su]_|gh[pousr]_|github_pat_)[A-Za-z0-9_+/=-]{8,}/g, '[redacted-token]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[redacted-token]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted-email]'],
  [/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, '[redacted-phone]'],
  [/\b\d{10}\b/g, '[redacted-phone]'],
  [/\b\d{1,6}\s+(?:[NSEW]\.?\s+)?(?:[A-Za-z0-9.'-]+\s+){0,4}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Cir|Circle|Way|Pl|Place|Pkwy|Parkway|Ter|Terrace|Trl|Trail|Hwy|Highway|Loop|Sq|Square)\b\.?(?:\s*(?:Apt|Unit|Suite|Ste|#)\s*[A-Za-z0-9-]+)?/gi, '[redacted-address]'],
  [/\b\d{5}(?:-\d{4})\b/g, '[redacted-postal]'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[redacted-ip]'],
];

export function stripPii(value) {
  if (value === undefined || value === null) return value;
  let text = String(value);
  for (const [pattern, replacement] of PII_PATTERNS) text = text.replace(pattern, replacement);
  return text;
}

export const truncate = (text, max) => {
  const value = String(text ?? '');
  return value.length > max ? value.slice(0, max - 1) + '…' : value;
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const positiveInt = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function sentryBaseUrl(raw) {
  const url = new URL(raw || 'https://sentry.io/api/0');
  if (url.protocol !== 'https:' || !SENTRY_HOSTS.includes(url.hostname)) {
    throw new Error(`SENTRY_API_URL host is not on the egress allow-list (${SENTRY_HOSTS.join(', ')})`);
  }
  return url.origin + url.pathname.replace(/\/+$/, '');
}

export function readConfig(env, { apply = false } = {}) {
  const labels = Object.fromEntries(Object.entries(LABELS).map(([key, spec]) => [key, env[spec.env] || '']));
  return {
    apply,
    killSwitch: env.AUTOFIX_KILL_SWITCH === 'true',
    sentry: {
      token: env.SENTRY_AUTH_TOKEN || '',
      org: env.SENTRY_ORG || 'cleverwork',
      project: env.SENTRY_PROJECT || 'pwa-crm',
      baseUrl: sentryBaseUrl(env.SENTRY_API_URL),
      lookback: /^\d{1,3}[mhd]$/.test(env.SENTRY_LOOKBACK || '') ? env.SENTRY_LOOKBACK : '24h',
      environment: /^[a-z0-9_-]{1,40}$/.test(env.SENTRY_ENVIRONMENT || '') ? env.SENTRY_ENVIRONMENT : 'production',
    },
    linear: {
      key: env.LINEAR_API_KEY || '',
      teamId: env.LINEAR_TEAM_ID || '',
      triageStateId: env.LINEAR_TRIAGE_STATE_ID || '',
      humanAssigneeId: UUID_RE.test(env.LINEAR_HUMAN_ASSIGNEE_ID || '') ? env.LINEAR_HUMAN_ASSIGNEE_ID : '',
      labels,
    },
    repository: /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY || '') ? env.GITHUB_REPOSITORY : '',
    maxIssues: positiveInt(env.TRIAGE_MAX_ISSUES, 25),
    maxPerRun: positiveInt(env.AUTOFIX_MAX_PER_RUN, 2),
    // Impact gate: new bug logs are filed only at this severity or worse (S1 worst). S4 files everything.
    minSeverity: /^S[1-4]$/.test(env.TRIAGE_MIN_SEVERITY || '') ? env.TRIAGE_MIN_SEVERITY : 'S4',
    extraNeedsHumanCodes: (env.TRIAGE_NEEDS_HUMAN_CODES || '').split(',').map(s => s.trim()).filter(Boolean),
  };
}

export function missingForApply(cfg, { needSentry = true } = {}) {
  const missing = [];
  if (needSentry && !cfg.sentry.token) missing.push('SENTRY_AUTH_TOKEN');
  if (!cfg.linear.key) missing.push('LINEAR_API_KEY');
  if (!cfg.linear.teamId) missing.push('LINEAR_TEAM_ID');
  for (const [key, spec] of Object.entries(LABELS)) if (!spec.optional && !cfg.linear.labels[key]) missing.push(spec.env);
  return missing;
}

// ---------------------------------------------------------------------------
// HTTP: one choke point. Dry runs refuse every write before it leaves the process.
// ---------------------------------------------------------------------------
export class DryRunWriteRefused extends Error {}

export function createHttp({ fetchImpl = globalThis.fetch, apply = false, timeoutMs = 15000 } = {}) {
  const log = [];
  async function request(url, { method = 'GET', headers = {}, body, write = method !== 'GET' } = {}) {
    const target = new URL(url);
    if (write && !apply) {
      log.push({ method, host: target.hostname, write: true, refused: true });
      throw new DryRunWriteRefused(`dry run refused a write to ${target.hostname}`);
    }
    log.push({ method, host: target.hostname, path: target.pathname, write });
    const response = await fetchImpl(target.toString(), { method, headers, body, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    const text = await response.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!response.ok) {
      const error = new Error(`${target.hostname} ${method} ${target.pathname} failed with HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return { json, headers: response.headers };
  }
  return { request, log, get writes() { return log.filter(entry => entry.write && !entry.refused); } };
}

// ---------------------------------------------------------------------------
// Sentry (read issues and events; one write: a comment linking the Linear issue)
// ---------------------------------------------------------------------------
export function parseNextCursor(linkHeader) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    if (/rel="next"/.test(part) && /results="true"/.test(part)) {
      const match = part.match(/cursor="([^"]+)"/);
      if (match) return match[1];
    }
  }
  return null;
}

export function sentryClient(cfg, http) {
  const { token, baseUrl, lookback, environment } = cfg.sentry;
  const org = encodeURIComponent(cfg.sentry.org), project = encodeURIComponent(cfg.sentry.project);
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const issueId = id => {
    if (!/^\d{1,20}$/.test(String(id))) throw new Error('Unexpected Sentry issue id shape');
    return String(id);
  };
  return {
    async listIssues(limit = cfg.maxIssues) {
      const query = `is:unresolved lastSeen:-${lookback} environment:${environment}`;
      const issues = [];
      let cursor = null;
      do {
        const url = new URL(`${baseUrl}/projects/${org}/${project}/issues/`);
        url.searchParams.set('query', query);
        url.searchParams.set('sort', 'date');
        url.searchParams.set('limit', String(Math.min(100, limit)));
        if (cursor) url.searchParams.set('cursor', cursor);
        const { json, headers: responseHeaders } = await http.request(url, { headers });
        if (!Array.isArray(json)) throw new Error('Sentry issue list was not an array');
        issues.push(...json);
        cursor = parseNextCursor(responseHeaders?.get?.('link'));
      } while (cursor && issues.length < limit);
      return issues.slice(0, limit);
    },
    async latestEvent(id) {
      const { json } = await http.request(`${baseUrl}/organizations/${org}/issues/${issueId(id)}/events/latest/`, { headers });
      return json;
    },
    async recentEvents(id) {
      const { json } = await http.request(`${baseUrl}/organizations/${org}/issues/${issueId(id)}/events/?full=false`, { headers });
      return Array.isArray(json) ? json : [];
    },
    async comment(id, text) {
      return http.request(`${baseUrl}/organizations/${org}/issues/${issueId(id)}/comments/`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
      });
    },
    canonicalUrl: id => `https://${cfg.sentry.org}.sentry.io/issues/${issueId(id)}/`,
  };
}

// ---------------------------------------------------------------------------
// Linear GraphQL. Queries are reads; every mutation is flagged as a write.
// ---------------------------------------------------------------------------
const ISSUE_FIELDS = 'id identifier title url description assignee { id } labels { nodes { id name } }';

export function linearClient(cfg, http) {
  const { key, teamId } = cfg.linear;
  async function gql(query, variables, { mutation = false } = {}) {
    if (!key) throw new Error('LINEAR_API_KEY is not set');
    const { json } = await http.request(LINEAR_API, {
      method: 'POST', write: mutation,
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (json?.errors?.length) throw new Error('Linear GraphQL error: ' + truncate(stripPii(json.errors.map(e => e.message).join('; ')), 300));
    return json?.data ?? {};
  }
  return {
    available: Boolean(key && teamId),
    async findBySentry(sentryId, signature) {
      const data = await gql(`query($team: ID!, $a: String!, $b: String!) {
        issues(first: 5, filter: { team: { id: { eq: $team } }, or: [{ description: { contains: $a } }, { description: { contains: $b } }] }) { nodes { ${ISSUE_FIELDS} } }
      }`, { team: teamId, a: `sentry-issue-id:${sentryId};`, b: `sig:${signature};` });
      const nodes = data.issues?.nodes ?? [];
      return nodes.find(n => n.description?.includes(`sentry-issue-id:${sentryId};`)) ?? nodes.find(n => ownsIssue(cfg, n)) ?? null;
    },
    async listByLabel(labelId, first = 50) {
      const data = await gql(`query($team: ID!, $label: ID!, $first: Int!) {
        issues(first: $first, filter: { team: { id: { eq: $team } }, labels: { id: { eq: $label } } }) { nodes { ${ISSUE_FIELDS} } }
      }`, { team: teamId, label: labelId, first });
      return data.issues?.nodes ?? [];
    },
    async getIssue(id) {
      const data = await gql(`query($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`, { id });
      return data.issue ?? null;
    },
    async createIssue({ title, description, priority, labelIds, assigneeId }) {
      const input = { teamId, title, description, priority, labelIds };
      if (assigneeId) input.assigneeId = assigneeId;
      if (cfg.linear.triageStateId) input.stateId = cfg.linear.triageStateId;
      const data = await gql(`mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }`, { input }, { mutation: true });
      if (!data.issueCreate?.success) throw new Error('Linear issueCreate did not succeed');
      return data.issueCreate.issue;
    },
    async updateIssue(id, input) {
      const data = await gql(`mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`, { id, input }, { mutation: true });
      if (!data.issueUpdate?.success) throw new Error('Linear issueUpdate did not succeed');
    },
    async attach(issueId, url, title, subtitle) {
      await gql(`mutation($input: AttachmentCreateInput!) { attachmentCreate(input: $input) { success } }`, { input: { issueId, url, title, subtitle } }, { mutation: true });
    },
    async comment(issueId, body) {
      await gql(`mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success } }`, { input: { issueId, body } }, { mutation: true });
    },
  };
}

export const labelNames = issue => new Set((issue?.labels?.nodes ?? []).map(l => l.name));
export const labelIds = issue => new Set((issue?.labels?.nodes ?? []).map(l => l.id));

// ---------------------------------------------------------------------------
// Bug log section (shared by triage, which creates it, and report, which fills it)
// ---------------------------------------------------------------------------
export const BUG_LOG_FIELDS = ['Symptom', 'Impact', 'Root cause', 'Fix', 'Verification'];

export function setBugLogField(description, field, value) {
  if (!BUG_LOG_FIELDS.includes(field)) throw new Error('Unknown bug log field');
  const clean = truncate(stripPii(value).replace(/\s*\n\s*/g, ' '), 1500);
  const pattern = new RegExp(`^[ \\t]*[-*+]\\s+\\*\\*${field.replace(/ /g, '\\s+')}:\\*\\*.*$`, 'gm');
  const line = `- **${field}:** ${clean}`;
  let found = false;
  const updated = description.replace(pattern, () => {
    if (found) return '';
    found = true;
    return line;
  });
  if (found) return updated;
  const heading = /^## Bug log\s*$/m;
  if (heading.test(description)) return description.replace(heading, match => `${match}\n${line}`);
  return `${description.trimEnd()}\n\n## Bug log\n${line}\n`;
}

export const sha16 = text => createHash('sha256').update(String(text)).digest('hex').slice(0, 16);

// A shared Linear team is not a repository boundary. Unstamped legacy tickets wait for human routing.
export function repositoryMarker(cfg) { return cfg.repository ? `self-heal-repository:${cfg.repository};` : ''; }
export function ownsIssue(cfg, issue) {
  const markers = [...String(issue.description ?? '').matchAll(/self-heal-repository:([^;\s]+);/g)].map(m => m[1]);
  return Boolean(cfg.repository && markers.length === 1 && markers[0] === cfg.repository);
}
