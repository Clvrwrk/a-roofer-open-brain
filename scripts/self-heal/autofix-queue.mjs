#!/usr/bin/env node
// Autofix queue steps used by .github/workflows/autofix.yml. Each subcommand is one job's
// responsibility, so no job holds more credentials than its step needs:
//
//   select   (Linear key)           pick autofix:queued issues, claim them, write agent context files
//   package  (no secrets)           turn the agent's working tree into patch.diff + outcome.json
//   record-verification (none)      summarise the independent verify job into verification.json
//   decide   (no secrets)           re-check policy + verification; emit publish=true|false and the PR body
//   report   (Linear key)           write root cause / fix / verification into the Linear bug log
//
// Every write is dry-run by default; pass --apply. Governance: docs/proposals/A3-error-autofix-pipeline.md.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  IDENTIFIER_RE, UUID_RE, createHttp, labelNames, linearClient, missingForApply, readConfig,
  setBugLogField, stripPii, truncate, ownsIssue,
} from './lib.mjs';
import { evaluatePatch } from './patch-policy.mjs';

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command, apply: false };
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === '--apply') args.apply = true;
    else if (token.startsWith('--')) { args[token.slice(2)] = rest[i + 1]; i += 1; }
  }
  return args;
}

const readJson = path => (path && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);

function writeOutputs(env, outputs) {
  const lines = Object.entries(outputs).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, lines.join('\n') + '\n');
  return lines;
}

export const severityRank = title => Number((String(title).match(/^\[S(\d)\]/) ?? [])[1] ?? 9);

// ---------------------------------------------------------------------------
// select
// ---------------------------------------------------------------------------
export function buildContext(issue, runUrl) {
  return [
    `# Autofix context for ${issue.identifier}`,
    '',
    `Linear issue: ${issue.url}`,
    runUrl ? `Workflow run: ${runUrl}` : null,
    '',
    `## Title`,
    stripPii(issue.title),
    '',
    stripPii(issue.description ?? '(no description)'),
    '',
    '---',
    'This context is technical telemetry only. It was scrubbed at capture and again before it reached you.',
    'Follow .github/autofix/PROMPT.md. Write your result to .autofix/result.json.',
  ].filter(v => v !== null).join('\n') + '\n';
}

export async function select({ cfg, linear, outDir, runUrl, env }) {
  if (cfg.killSwitch) return { chosen: [], reason: 'AUTOFIX_KILL_SWITCH is true' };
  const { labels } = cfg.linear;
  const queued = (await linear.listByLabel(labels.queued)).filter(issue => ownsIssue(cfg, issue));
  const running = (await linear.listByLabel(labels.running)).filter(issue => ownsIssue(cfg, issue));
  // source:user issues carry a staff member's free text: never handed to the agent, even if a human queues one.
  const blocked = new Set(['autofix:running', 'autofix:pr-open', 'needs-human', 'source:user']);
  const eligible = queued
    .filter(issue => IDENTIFIER_RE.test(issue.identifier) && UUID_RE.test(issue.id))
    .filter(issue => ![...labelNames(issue)].some(name => blocked.has(name)))
    .sort((a, b) => severityRank(a.title) - severityRank(b.title));
  const slots = Math.max(0, cfg.maxPerRun - running.length);
  const chosen = eligible.slice(0, slots);
  for (const issue of chosen) {
    const dir = join(outDir, issue.identifier);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'context.md'), buildContext(issue, runUrl));
    if (cfg.apply) {
      await linear.updateIssue(issue.id, { addedLabelIds: [labels.running], removedLabelIds: [labels.queued] });
      await linear.comment(issue.id, `Autofix claimed this issue.${runUrl ? ` Run: ${runUrl}` : ''} A pull request, if any, still needs human review and merge.`);
    }
  }
  const matrix = chosen.map(issue => ({ id: issue.id, identifier: issue.identifier }));
  // Dry runs never start fix jobs: the matrix is only emitted when issues were really claimed.
  writeOutputs(env, { issues: cfg.apply ? matrix : [], count: String(cfg.apply ? matrix.length : 0) });
  return { chosen: matrix, running: running.length, queued: queued.length, slots };
}

// ---------------------------------------------------------------------------
// package
// ---------------------------------------------------------------------------
const RESULT_FIELDS = ['root_cause', 'fix', 'verification', 'findings', 'title', 'reproduction_test'];

export function validateResult(raw, identifier) {
  if (!raw || typeof raw !== 'object') return { status: 'needs_human', findings: 'The agent produced no .autofix/result.json.' };
  const status = raw.status === 'fixed' ? 'fixed' : 'needs_human';
  const clean = { status };
  for (const field of RESULT_FIELDS) {
    if (typeof raw[field] === 'string' && raw[field].trim()) clean[field] = truncate(stripPii(raw[field].trim()), field === 'title' ? 90 : 4000);
  }
  if (raw.linear_identifier && raw.linear_identifier !== identifier) {
    return { ...clean, status: 'needs_human', findings: `Result names ${truncate(String(raw.linear_identifier), 20)}, expected ${identifier}.` };
  }
  if (status === 'fixed' && (!clean.root_cause || !clean.fix || !clean.verification)) {
    return { ...clean, status: 'needs_human', findings: 'Result claimed fixed without root_cause, fix and verification.' };
  }
  return clean;
}

export function packageOutcome({ identifier, base, result, patch }) {
  const policy = evaluatePatch(patch);
  const reasons = [];
  if (result.status !== 'fixed') reasons.push(result.findings || 'The agent could not reproduce or fix the issue.');
  if (result.status === 'fixed' && !policy.ok) reasons.push(...policy.violations.map(v => `policy: ${v}`));
  return {
    identifier, base,
    status: result.status === 'fixed' && policy.ok ? 'fixed' : 'needs_human',
    reasons, result,
    policy: { ok: policy.ok, violations: policy.violations, files: policy.files, changedLines: policy.changedLines },
  };
}

function gitPatch(base) {
  const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  git(['add', '-A']); // .autofix/ is ignored (.gitignore and .git/info/exclude), so it is never staged
  return git(['diff', '--cached', '--binary', base, '--', '.', ':(exclude).autofix']);
}

// ---------------------------------------------------------------------------
// record-verification (independent verify job; no secrets, patch applied on a clean runner)
// ---------------------------------------------------------------------------
export const VERIFY_STEPS = ['apply', 'typecheck_build_unit'];

export function recordVerification(env) {
  const steps = Object.fromEntries(VERIFY_STEPS.map(step => [step, env[`STEP_${step.toUpperCase()}`] || 'skipped']));
  const status = VERIFY_STEPS.every(step => steps[step] === 'success') ? 'passed' : 'failed';
  return { status, steps, runUrl: env.RUN_URL || undefined };
}

// ---------------------------------------------------------------------------
// decide (publish job, before anything is applied or pushed)
// ---------------------------------------------------------------------------
export function decide({ identifier, outcome, patch, verification }) {
  const reasons = [];
  if (!IDENTIFIER_RE.test(identifier ?? '')) reasons.push('invalid Linear identifier');
  if (!outcome) reasons.push('the fix job produced no outcome (it failed or was cancelled)');
  else {
    if (outcome.identifier !== identifier) reasons.push('outcome belongs to a different issue');
    if (outcome.status !== 'fixed') reasons.push(...(outcome.reasons?.length ? outcome.reasons : ['the agent did not produce a fix']));
  }
  if (outcome?.status === 'fixed') {
    const policy = evaluatePatch(patch ?? '');
    if (!policy.ok) reasons.push(...policy.violations.map(v => `policy (re-check): ${v}`));
    if (!verification) reasons.push('independent verification did not run');
    else if (verification.status !== 'passed') {
      const failed = Object.entries(verification.steps ?? {}).filter(([, v]) => v !== 'success').map(([k, v]) => `${k}=${v}`);
      reasons.push(`independent verification failed (${failed.join(', ') || 'unknown'})`);
    }
  }
  const publish = reasons.length === 0;
  const title = String(outcome?.result?.title ?? 'automated fix').replace(/[^A-Za-z0-9 .,:;()_/'-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'automated fix';
  return { publish, identifier, title, branch: IDENTIFIER_RE.test(identifier ?? '') ? `autofix/${identifier}` : null, reasons, result: outcome?.result ?? null, verification: verification ?? null };
}

export function prBody(decision, { linearUrl, runUrl }) {
  const r = decision.result ?? {};
  const steps = Object.entries(decision.verification?.steps ?? {}).map(([k, v]) => `- ${k}: ${v}`).join('\n');
  return [
    `Automated fix proposal for Linear ${decision.identifier}${linearUrl ? ` (${linearUrl})` : ''}.`,
    '',
    '**Human review and merge required.** This pipeline never merges or deploys.',
    '',
    '## Root cause', r.root_cause ?? 'not recorded',
    '', '## Fix', r.fix ?? 'not recorded',
    '', '## Reproduction test', r.reproduction_test ?? 'see diff',
    '', '## Verification reported by the agent', r.verification ?? 'not recorded',
    '', '## Independent verification (clean runner, no secrets)', steps || 'not recorded',
    '', '## Before merging',
    '- Pull requests opened with the workflow token do not trigger `verify.yml`. Close and reopen this pull request (or push a commit) so the required `Verify CRM development build` check runs.',
    '- Confirm the reproduction test fails on `main` and passes here.',
    '- Confirm the change follows AGENTS.md: additive migrations only, no secrets, no provider calls.',
    runUrl ? `\nAutofix run: ${runUrl}` : '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// report (write back to the Linear bug log)
// ---------------------------------------------------------------------------
export async function report({ cfg, linear, issueId, decision: given, prUrl, runUrl }) {
  let decision = given;
  if (!UUID_RE.test(issueId ?? '')) throw new Error('report needs a Linear issue UUID');
  const issue = await linear.getIssue(issueId);
  if (!issue) throw new Error('Linear issue not found');
  if (!ownsIssue(cfg, issue)) throw new Error('Linear issue belongs to another repository');
  const r = decision?.result ?? {};
  const published = Boolean(prUrl && decision?.publish);
  if (decision?.publish && !prUrl) decision = { ...decision, reasons: ['the pull request could not be opened; see the workflow run'] };
  const verificationText = decision?.verification
    ? `Independent verification ${decision.verification.status} (${Object.entries(decision.verification.steps ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ')}).${r.verification ? ` Agent: ${r.verification}` : ''}`
    : 'not run';
  let description = issue.description ?? '';
  description = setBugLogField(description, 'Root cause', r.root_cause ?? `not determined by autofix${r.findings ? `; findings: ${r.findings}` : ''}`);
  description = setBugLogField(description, 'Fix', published ? `${prUrl} (awaiting human review and merge). ${r.fix ?? ''}` : `no fix published: ${(decision?.reasons ?? ['autofix run did not complete']).join('; ')}`);
  description = setBugLogField(description, 'Verification', published ? verificationText : `pending; ${verificationText}`);
  const labels = cfg.linear.labels;
  // Retry budget: a run without a PR is re-queued until maxAutofixAttempts, then escalated to a human.
  const prior = Number(/autofix-attempts:(\d+);/.exec(description)?.[1] ?? 0);
  const attempts = published ? prior : prior + 1;
  const maxAttempts = cfg.maxAutofixAttempts ?? 3;
  const escalate = !published && attempts >= maxAttempts;
  if (!published) description = /autofix-attempts:\d+;/.test(description) ? description.replace(/autofix-attempts:\d+;/, `autofix-attempts:${attempts};`) : `${description}\nautofix-attempts:${attempts};\n`;
  const addLabel = published ? 'autofix:pr-open' : escalate ? 'needs-human' : 'autofix:queued';
  const input = {
    description,
    ...(escalate && cfg.linear.humanAssigneeId ? {assigneeId:cfg.linear.humanAssigneeId} : {}),
    removedLabelIds: [labels.running, labels.queued].filter(id => id && (issue.labels?.nodes ?? []).some(label => label.id === id)),
    addedLabelIds: [published ? labels.prOpen : escalate ? labels.needsHuman : labels.queued],
  };
  const plan = { issue: issue.identifier, published, addLabel, attempts, maxAttempts, reasons: decision?.reasons ?? [] };
  if (!cfg.apply) return { ...plan, mode: 'dry-run' };
  await linear.updateIssue(issue.id, input);
  if (published) await linear.attach(issue.id, prUrl, `Autofix PR for ${issue.identifier}`, 'Needs human review and merge');
  await linear.comment(issue.id, published
    ? `Autofix opened ${prUrl}. A human must review and merge; the bug log above holds the root cause, fix and verification.${runUrl ? ` Run: ${runUrl}` : ''}`
    : !escalate ? `Autofix attempt ${attempts}/${maxAttempts} produced no PR; re-queued: ${stripPii((decision?.reasons ?? ['run did not complete']).join('; '))}.${runUrl ? ` Run: ${runUrl}` : ''}`
    : `Autofix handed this to a human after ${attempts} attempts: ${stripPii((decision?.reasons ?? ['run did not complete']).join('; '))}.${runUrl ? ` Run: ${runUrl}` : ''}`);
  return { ...plan, mode: 'apply' };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
export async function main(argv = process.argv.slice(2), env = process.env, fetchImpl = globalThis.fetch, out = console) {
  const args = parseArgs(argv);
  const cfg = readConfig(env, { apply: args.apply });
  const runUrl = env.GITHUB_RUN_ID && env.GITHUB_REPOSITORY ? `${env.GITHUB_SERVER_URL || 'https://github.com'}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : undefined;
  const needLinear = () => {
    const missing = missingForApply(cfg, { needSentry: false });
    if (missing.length) throw new Error(`missing configuration: ${missing.join(', ')}`);
    return linearClient(cfg, createHttp({ fetchImpl, apply: args.apply }));
  };
  switch (args.command) {
    case 'select': {
      if (cfg.killSwitch) { writeOutputs(env, { issues: [], count: '0' }); out.log(JSON.stringify({ status: 'skipped', reason: 'AUTOFIX_KILL_SWITCH is true' })); return 0; }
      const result = await select({ cfg, linear: needLinear(), outDir: args.out ?? '.autofix-contexts', runUrl, env });
      out.log(JSON.stringify({ status: 'ok', mode: args.apply ? 'apply' : 'dry-run', ...result }, null, 2));
      return 0;
    }
    case 'package': {
      const identifier = args.identifier;
      if (!IDENTIFIER_RE.test(identifier ?? '') || !/^[0-9a-f]{40}$/.test(args.base ?? '')) throw new Error('package needs --identifier and a 40-character --base SHA');
      const dir = args.dir ?? '.autofix';
      const result = validateResult(readJson(join(dir, 'result.json')), identifier);
      const patch = gitPatch(args.base);
      const outcome = packageOutcome({ identifier, base: args.base, result, patch });
      const outDir = args.out ?? join(dir, 'out');
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'patch.diff'), patch);
      writeFileSync(join(outDir, 'outcome.json'), JSON.stringify(outcome, null, 2) + '\n');
      writeOutputs(env, { status: outcome.status });
      out.log(JSON.stringify({ status: outcome.status, reasons: outcome.reasons, files: outcome.policy.files }, null, 2));
      return 0;
    }
    case 'record-verification': {
      const verification = recordVerification({ ...env, RUN_URL: runUrl });
      writeFileSync(args.out ?? 'verification.json', JSON.stringify(verification, null, 2) + '\n');
      out.log(JSON.stringify(verification));
      return 0;
    }
    case 'decide': {
      const outcome = readJson(args.outcome);
      const patch = args.patch && existsSync(args.patch) ? readFileSync(args.patch, 'utf8') : '';
      const decision = decide({ identifier: args.identifier, outcome, patch, verification: readJson(args.verification) });
      writeFileSync(args.out ?? 'decision.json', JSON.stringify(decision, null, 2) + '\n');
      writeFileSync(args['body-out'] ?? 'pr-body.md', prBody(decision, { linearUrl: args['linear-url'], runUrl }));
      writeOutputs(env, { publish: String(decision.publish), branch: decision.branch ?? '', title: decision.title });
      out.log(JSON.stringify({ publish: decision.publish, reasons: decision.reasons }, null, 2));
      return 0;
    }
    case 'report': {
      const decision = readJson(args.decision) ?? { publish: false, reasons: ['the publish job produced no decision'] };
      const prUrl = args['pr-url'] && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(args['pr-url']) ? args['pr-url'] : undefined;
      const result = await report({ cfg, linear: needLinear(), issueId: args['issue-id'], decision, prUrl, runUrl });
      out.log(JSON.stringify(result, null, 2));
      return 0;
    }
    default:
      out.error('usage: autofix-queue.mjs <select|package|record-verification|decide|report> [options] [--apply]');
      return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then(code => process.exit(code), error => { console.error(stripPii(error?.message ?? String(error))); process.exit(1); });
}
