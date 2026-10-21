#!/usr/bin/env node
// Vendored from Clvrwrk/CRM_PWA scripts/triage/verify-and-close.mjs @ 731cf4a (canonical copy and tests live there).
// Self-healing loop kit: docs/127-self-healing-loop.md. Do not fork behaviour here; change CRM_PWA first, then re-vendor.
// Self-healing loop, stage 6: verify a shipped fix in production, then close or reopen.
//
//   node scripts/triage/verify-and-close.mjs            # dry run (default): reads only, prints the plan
//   node scripts/triage/verify-and-close.mjs --apply    # writes Linear labels/state/comments, resolves Sentry
//
// Candidates are Linear bug logs labelled source:sentry that are either completed (a human moved them to
// Done) or carry autofix:pr-open. For each one:
//   1. Find when the fix shipped: the merged autofix/<ID> pull request, else the Linear completion time.
//   2. Confirm the deploy: when SELF_HEAL_HEALTH_URL is set, the merged commit must be contained in the
//      buildCommit that /healthz reports (GitHub compare). Otherwise a fixed grace period is assumed.
//   3. Soak: wait SELF_HEAL_SOAK_HOURS after the deploy is first observed (recorded in the bug log).
//   4. Check every linked Sentry issue: seen again after the deploy => regressed; quiet => verified.
//      Verified: Sentry issue resolved, Linear moved to Done with label `verified`, evidence commented.
//      Regressed: Linear reopened with label `regressed`, evidence commented, Sentry commented.
//   5. Verified issues stay watched for SELF_HEAL_WATCH_DAYS; a recurrence reopens them the same way.
//
// Env (names only): SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT, LINEAR_API_KEY, LINEAR_TEAM_ID,
// LINEAR_LABEL_SOURCE_SENTRY, LINEAR_LABEL_AUTOFIX_PR_OPEN, LINEAR_LABEL_VERIFY_PENDING, LINEAR_LABEL_VERIFIED,
// LINEAR_LABEL_REGRESSED, LINEAR_DONE_STATE_ID, LINEAR_REOPEN_STATE_ID, GITHUB_TOKEN, GITHUB_REPOSITORY,
// SELF_HEAL_HEALTH_URL, SELF_HEAL_SOAK_HOURS, SELF_HEAL_DEPLOY_GRACE_MINUTES, SELF_HEAL_WATCH_DAYS,
// AUTOFIX_KILL_SWITCH. Governance: docs/proposals/A3-error-autofix-pipeline.md (section 13).
import { pathToFileURL } from 'node:url';
import {
  DryRunWriteRefused, IDENTIFIER_RE, createHttp, labelIds, labelNames, linearClient, readConfig, setBugLogField,
  stripPii, truncate,
} from './lib.mjs';

const HOUR = 3600_000;
const positive = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const VERIFY_LABELS = Object.freeze({
  verifyPending: 'LINEAR_LABEL_VERIFY_PENDING',
  verified: 'LINEAR_LABEL_VERIFIED',
  regressed: 'LINEAR_LABEL_REGRESSED',
});

export function readVerifyConfig(env, { apply = false } = {}) {
  const base = readConfig(env, { apply });
  const repo = env.GITHUB_REPOSITORY || '';
  let healthUrl = '';
  if (env.SELF_HEAL_HEALTH_URL) {
    const url = new URL(env.SELF_HEAL_HEALTH_URL);
    if (url.protocol !== 'https:') throw new Error('SELF_HEAL_HEALTH_URL must be https');
    healthUrl = url.toString();
  }
  return {
    ...base,
    verify: {
      labels: Object.fromEntries(Object.entries(VERIFY_LABELS).map(([key, name]) => [key, env[name] || ''])),
      doneStateId: env.LINEAR_DONE_STATE_ID || '',
      reopenStateId: env.LINEAR_REOPEN_STATE_ID || env.LINEAR_TRIAGE_STATE_ID || '',
      soakMs: positive(env.SELF_HEAL_SOAK_HOURS, 72) * HOUR,
      graceMs: positive(env.SELF_HEAL_DEPLOY_GRACE_MINUTES, 30) * 60_000,
      watchMs: positive(env.SELF_HEAL_WATCH_DAYS, 14) * 24 * HOUR,
      healthUrl,
      maxCandidates: positive(env.SELF_HEAL_MAX_CANDIDATES, 50),
    },
    github: {
      token: env.GITHUB_TOKEN || '',
      repo: /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) ? repo : '',
    },
  };
}

export function missingForVerify(cfg) {
  const missing = [];
  if (!cfg.sentry.token) missing.push('SENTRY_AUTH_TOKEN');
  if (!cfg.linear.key) missing.push('LINEAR_API_KEY');
  if (!cfg.linear.teamId) missing.push('LINEAR_TEAM_ID');
  if (!cfg.linear.labels.sourceSentry) missing.push('LINEAR_LABEL_SOURCE_SENTRY');
  for (const [key, name] of Object.entries(VERIFY_LABELS)) if (!cfg.verify.labels[key]) missing.push(name);
  if (!cfg.verify.doneStateId) missing.push('LINEAR_DONE_STATE_ID');
  if (!cfg.verify.reopenStateId) missing.push('LINEAR_REOPEN_STATE_ID');
  if (!cfg.github.repo) missing.push('GITHUB_REPOSITORY');
  return missing;
}

// ---------------------------------------------------------------------------
// Pure helpers (tested directly)
// ---------------------------------------------------------------------------
export const sentryIdsOf = description => [...new Set([...String(description ?? '').matchAll(/sentry-issue-id:(\d{1,20});/g)].map(m => m[1]))];

const DEPLOY_MARK_RE = /self-heal deploy observed (\d{4}-\d{2}-\d{2}T[\d:.]+Z)(?: on build ([0-9a-f]{7,40}))?/;

/** When the deploy carrying the fix was first observed, as recorded in the bug log's Verification line. */
export function deployObservedAt(description) {
  const match = String(description ?? '').match(DEPLOY_MARK_RE);
  return match ? { at: new Date(match[1]), build: match[2] ?? null } : null;
}

export function deployMark(at, build) {
  return `self-heal deploy observed ${at.toISOString()}${build ? ` on build ${build}` : ''}; soaking before verification.`;
}

/**
 * Decide one candidate. `sentryIssues` are the linked Sentry issues (status, lastSeen, count, shortId, permalink).
 * Returns { action: 'wait' | 'mark-deployed' | 'verified' | 'regressed' | 'skip', reason, ... }.
 */
export function judge({ now, fix, deploy, observed, sentryIssues, soakMs }) {
  if (!fix) return { action: 'skip', reason: 'no merged fix found yet' };
  if (!deploy.confirmed) return { action: 'wait', reason: deploy.reason };
  const deployedAt = observed?.at ?? deploy.at;
  if (!observed) return { action: 'mark-deployed', reason: deploy.reason, deployedAt, build: deploy.build };
  const recurred = sentryIssues.filter(i => i.lastSeen && new Date(i.lastSeen) > deployedAt);
  if (recurred.length) return { action: 'regressed', reason: `seen again after the deploy on ${deployedAt.toISOString()}`, deployedAt, recurred };
  const soakEnds = new Date(deployedAt.getTime() + soakMs);
  if (now < soakEnds) return { action: 'wait', reason: `soaking until ${soakEnds.toISOString()}`, deployedAt };
  return { action: 'verified', reason: `no events for ${Math.round(soakMs / HOUR)}h after the deploy on ${deployedAt.toISOString()}`, deployedAt };
}

/** A previously verified issue that Sentry has seen again since it was verified. */
export function recurrence({ completedAt, sentryIssues, graceMs }) {
  const since = new Date(new Date(completedAt).getTime() + graceMs);
  return sentryIssues.filter(i => i.lastSeen && new Date(i.lastSeen) > since);
}

export function evidenceLines(sentryIssues) {
  return sentryIssues.map(i => `- [${i.shortId}](${i.permalink}): status ${i.status}, ${i.count} events total, last seen ${i.lastSeen ?? 'never'}`);
}

// ---------------------------------------------------------------------------
// Clients (extensions of the shared ones; every write goes through the same dry-run choke point)
// ---------------------------------------------------------------------------
function sentryVerifyClient(cfg, http) {
  const { token, baseUrl } = cfg.sentry;
  const org = encodeURIComponent(cfg.sentry.org);
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const issueUrl = id => {
    if (!/^\d{1,20}$/.test(String(id))) throw new Error('Unexpected Sentry issue id shape');
    return `${baseUrl}/organizations/${org}/issues/${id}/`;
  };
  return {
    async issue(id) {
      const { json } = await http.request(issueUrl(id), { headers });
      return {
        id: String(id),
        shortId: truncate(String(json?.shortId ?? id), 40),
        status: String(json?.status ?? 'unknown'),
        lastSeen: json?.lastSeen ?? null,
        count: Number(json?.count ?? 0),
        permalink: `https://${cfg.sentry.org}.sentry.io/issues/${id}/`,
      };
    },
    async resolve(id) {
      return http.request(issueUrl(id), { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'resolved' }) });
    },
    async comment(id, text) {
      return http.request(`${issueUrl(id)}comments/`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    },
  };
}

function githubClient(cfg, http) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(cfg.github.token ? { Authorization: `Bearer ${cfg.github.token}` } : {}) };
  const api = path => `https://api.github.com/repos/${cfg.github.repo}${path}`;
  return {
    async mergedAutofixPr(identifier) {
      const owner = cfg.github.repo.split('/')[0];
      const url = new URL(api('/pulls'));
      url.searchParams.set('head', `${owner}:autofix/${identifier}`);
      url.searchParams.set('state', 'all');
      const { json } = await http.request(url, { headers });
      const pr = (Array.isArray(json) ? json : []).find(p => p.merged_at);
      return pr ? { at: new Date(pr.merged_at), sha: pr.merge_commit_sha, url: pr.html_url } : null;
    },
    /** True when `sha` is contained in `build` (build is the same commit or ahead of it). */
    async contains(build, sha) {
      const { json } = await http.request(api(`/compare/${sha}...${build}`), { headers });
      return ['identical', 'ahead'].includes(json?.status);
    },
  };
}

async function readHealth(cfg, http) {
  if (!cfg.verify.healthUrl) return null;
  const { json } = await http.request(cfg.verify.healthUrl, { headers: { Accept: 'application/json' } });
  const build = String(json?.buildCommit ?? '').toLowerCase();
  return /^[0-9a-f]{7,40}$/.test(build) ? build : null;
}

const CANDIDATE_FIELDS = 'id identifier title url description completedAt state { id type } labels { nodes { id name } }';

async function listCandidates(cfg, linear) {
  const { teamId, labels } = cfg.linear;
  const gql = linear.gql;
  const since = new Date(Date.now() - 45 * 24 * HOUR).toISOString();
  const data = await gql(`query($team: ID!, $sentry: ID!, $prOpen: ID!, $since: DateTimeOrDuration!, $first: Int!) {
    completed: issues(first: $first, filter: { team: { id: { eq: $team } }, labels: { id: { eq: $sentry } }, state: { type: { eq: "completed" } }, completedAt: { gt: $since } }) { nodes { ${CANDIDATE_FIELDS} } }
    prOpen: issues(first: $first, filter: { team: { id: { eq: $team } }, labels: { id: { eq: $prOpen } } }) { nodes { ${CANDIDATE_FIELDS} } }
  }`, { team: teamId, sentry: labels.sourceSentry, prOpen: labels.prOpen || labels.sourceSentry, since, first: cfg.verify.maxCandidates });
  const byId = new Map();
  for (const issue of [...(data.completed?.nodes ?? []), ...(data.prOpen?.nodes ?? [])]) if (IDENTIFIER_RE.test(issue.identifier)) byId.set(issue.id, issue);
  return [...byId.values()];
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
export async function runVerify({ cfg, http, now = new Date(), log = () => {} }) {
  const linear = linearClient(cfg, http);
  linear.gql = async (query, variables, opts) => {
    // Reuse the shared client's transport for the multi-alias candidate query.
    const { json } = await http.request('https://api.linear.app/graphql', {
      method: 'POST', write: Boolean(opts?.mutation),
      headers: { Authorization: cfg.linear.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (json?.errors?.length) throw new Error('Linear GraphQL error: ' + truncate(stripPii(json.errors.map(e => e.message).join('; ')), 300));
    return json?.data ?? {};
  };
  const sentry = sentryVerifyClient(cfg, http);
  const github = githubClient(cfg, http);
  const { labels: vl, doneStateId, reopenStateId, soakMs, graceMs, watchMs } = cfg.verify;
  const build = await readHealth(cfg, http);
  const actions = [];

  const withLabels = (issue, add = [], remove = []) => {
    const ids = labelIds(issue);
    for (const id of remove) ids.delete(id);
    for (const id of add) if (id) ids.add(id);
    return [...ids];
  };

  for (const issue of await listCandidates(cfg, linear)) {
    const names = labelNames(issue);
    const sentryIds = sentryIdsOf(issue.description);
    if (!sentryIds.length) { actions.push({ linear: issue.identifier, action: 'skip', reason: 'no linked Sentry issue' }); continue; }
    const sentryIssues = [];
    for (const id of sentryIds) sentryIssues.push(await sentry.issue(id));

    // Already verified: watch for a recurrence within the watch window, otherwise leave it alone.
    if (names.has('verified')) {
      if (!issue.completedAt || now - new Date(issue.completedAt) > watchMs) continue;
      const recurred = recurrence({ completedAt: issue.completedAt, sentryIssues, graceMs });
      if (!recurred.length) continue;
      const decision = { action: 'regressed', reason: 'seen again after it was verified', recurred };
      actions.push({ linear: issue.identifier, action: decision.action, reason: decision.reason });
      log(actions.at(-1));
      if (cfg.apply) await reopen(issue, decision);
      continue;
    }

    let fix = null;
    if (names.has('autofix:pr-open')) {
      const pr = await github.mergedAutofixPr(issue.identifier);
      if (pr) fix = { at: pr.at, sha: pr.sha, source: `merged ${pr.url}` };
    }
    if (!fix && issue.state?.type === 'completed' && issue.completedAt) fix = { at: new Date(issue.completedAt), sha: null, source: 'Linear issue completed' };

    let deploy = { confirmed: false, reason: 'waiting for the merged fix to deploy' };
    if (fix) {
      if (build && fix.sha) {
        const included = await github.contains(build, fix.sha);
        deploy = included
          ? { confirmed: true, at: now, build, reason: `build ${build} on ${cfg.verify.healthUrl} contains ${fix.sha.slice(0, 12)}` }
          : { confirmed: false, reason: `live build ${build} does not contain ${fix.sha.slice(0, 12)} yet` };
      } else {
        const at = new Date(fix.at.getTime() + graceMs);
        deploy = now >= at
          ? { confirmed: true, at, build: null, reason: `assumed deployed ${Math.round(graceMs / 60000)} minutes after: ${fix.source}` }
          : { confirmed: false, reason: `deploy grace period runs until ${at.toISOString()}` };
      }
    }

    const decision = judge({ now, fix, deploy, observed: deployObservedAt(issue.description), sentryIssues, soakMs });
    actions.push({ linear: issue.identifier, action: decision.action, reason: decision.reason });
    log(actions.at(-1));
    if (!cfg.apply) continue;

    if (decision.action === 'mark-deployed') {
      const description = setBugLogField(issue.description ?? '', 'Verification', deployMark(decision.deployedAt, decision.build));
      await linear.updateIssue(issue.id, { description, labelIds: withLabels(issue, [vl.verifyPending]) });
    } else if (decision.action === 'verified') {
      const evidence = evidenceLines(sentryIssues);
      const description = setBugLogField(issue.description ?? '', 'Verification', `Verified in production ${now.toISOString()}: ${decision.reason}.`);
      await linear.updateIssue(issue.id, {
        description, stateId: doneStateId,
        labelIds: withLabels(issue, [vl.verified], [vl.verifyPending, vl.regressed, cfg.linear.labels.prOpen]),
      });
      await linear.comment(issue.id, ['**Self-heal: verified in production.**', '', decision.reason + '.', '', ...evidence].join('\n'));
      for (const s of sentryIssues) {
        await sentry.resolve(s.id);
        await sentry.comment(s.id, `Verified fixed in production and resolved by the self-healing loop (Linear ${issue.identifier}: ${issue.url}).`);
      }
    } else if (decision.action === 'regressed') {
      await reopen(issue, decision);
    }
  }
  return { actions, build };

  async function reopen(issue, decision) {
    const evidence = evidenceLines(decision.recurred);
    const description = setBugLogField(issue.description ?? '', 'Verification', `Regressed ${now.toISOString()}: ${decision.reason}.`);
    await linear.updateIssue(issue.id, {
      description, stateId: reopenStateId,
      labelIds: withLabels(issue, [vl.regressed], [vl.verifyPending, vl.verified, cfg.linear.labels.prOpen]),
    });
    await linear.comment(issue.id, ['**Self-heal: the fix did not hold.** Reopened with new evidence.', '', decision.reason + '.', '', ...evidence].join('\n'));
    for (const s of decision.recurred) await sentry.comment(s.id, `Seen again after the fix shipped; Linear ${issue.identifier} reopened by the self-healing loop.`);
  }
}

export async function main(argv = process.argv.slice(2), env = process.env, fetchImpl = globalThis.fetch, out = console) {
  const apply = argv.includes('--apply');
  const cfg = readVerifyConfig(env, { apply });
  if (cfg.killSwitch) { out.log(JSON.stringify({ stopped: 'AUTOFIX_KILL_SWITCH is true' })); return 0; }
  const missing = missingForVerify(cfg);
  if (apply && missing.length) { out.error(`verify-and-close --apply is missing: ${missing.join(', ')}`); return 2; }
  if (!cfg.sentry.token || !cfg.linear.key) { out.log(JSON.stringify({ skipped: 'credentials not set', missing })); return 0; }
  const http = createHttp({ fetchImpl, apply });
  try {
    const result = await runVerify({ cfg, http, log: entry => out.log(JSON.stringify(entry)) });
    out.log(JSON.stringify({ summary: Object.groupBy(result.actions, a => a.action), build: result.build, writes: http.writes.length }));
    return 0;
  } catch (error) {
    if (error instanceof DryRunWriteRefused) { out.error(error.message); return 3; }
    throw error;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main();
}
