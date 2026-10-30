// Policy for patches produced by the autofix agent. Run twice: in the agent job
// (package) and again from the base checkout in the publish job before anything is applied.
// A violation never blocks a human; it routes the Linear issue to needs-human.

export const DEFAULT_LIMITS = Object.freeze({ maxChangedLines: 600, maxFiles: 25 });

// Paths the agent may never change. Workflows, the triage pipeline itself, agent
// instructions, dependency manifests, deploy/route/release tooling and env files.
export const FORBIDDEN_PATHS = [
  /^\.github\//,
  /^scripts\/triage\//,
  /(^|\/)\.env(\.|$)/,
  /(^|\/)package(-lock)?\.json$/,
  /(^|\/)Dockerfile$/,
  /^ops\//,
  /^AGENTS\.md$/,
  /^CONTEXT\.md$/,
  /^supabase\/config\.toml$/,
  /^scripts\/(deploy|release|switch|restore|activate|provision|stage|reconcile|repair)-/,
  /^apps\/crm\/sentry\.(client|server)\.config\.ts$/,
  /^apps\/crm\/src\/lib\/monitoring\//,
  // Observability build and security headers (PR #59): source-map upload with the Sentry auth token, and the CSP.
  /^apps\/crm\/(sentry-build|csp)\.mjs$/,
];

const TEST_PATH = /^(tests\/|scripts\/test-[^/]+$|app\/command-center\/src\/.*\.(test|unit\.test)\.ts$)/;
const MIGRATION_PATH = /^supabase\/migrations\/[^/]+\.sql$/;
const DESTRUCTIVE_SQL = /\b(DROP\s+(TABLE|COLUMN|SCHEMA|VIEW|MATERIALIZED\s+VIEW|FUNCTION|POLICY|TRIGGER|INDEX|TYPE|CONSTRAINT|ROLE)|TRUNCATE|DELETE\s+FROM|ALTER\s+TABLE\s+\S+\s+(DROP|RENAME)|RENAME\s+(TO|COLUMN)|REVOKE)\b/i;
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bsk-ant-[A-Za-z0-9_-]{10,}/,
  /\blin_api_[A-Za-z0-9]{10,}/,
  /\bsntry[su]_[A-Za-z0-9+/=_-]{10,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
];

/** Parse a `git diff` unified patch into per-file records. */
export function parseDiff(text) {
  const files = [];
  let current = null;
  for (const line of String(text).split('\n')) {
    const header = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (header) {
      current = { oldPath: header[1], path: header[2], added: [], removed: 0, isNew: false, isDeleted: false, binary: false, renamed: false, inHunk: false };
      files.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith('@@')) { current.inHunk = true; continue; }
    if (current.inHunk) {
      if (line.startsWith('+')) current.added.push(line.slice(1));
      else if (line.startsWith('-')) current.removed += 1;
      continue;
    }
    if (line.startsWith('new file mode')) current.isNew = true;
    else if (line.startsWith('deleted file mode')) current.isDeleted = true;
    else if (line.startsWith('rename from') || line.startsWith('rename to')) current.renamed = true;
    else if (line.startsWith('GIT binary patch') || line.startsWith('Binary files')) current.binary = true;
  }
  return files;
}

export function evaluatePatch(text, limits = DEFAULT_LIMITS) {
  const violations = [];
  if (/^(?:new file mode|old mode|new mode) (?:120000|160000)$/m.test(text)) violations.push('symlinks and submodules are not allowed');
  const files = parseDiff(text);
  if (!files.length) violations.push('empty patch: no change was produced');
  let changed = 0;
  for (const file of files) {
    changed += file.added.length + file.removed;
    if (!/^(app\/command-center\/src\/|scripts\/fixtures\/self-heal\/|scripts\/test-self-heal-)/.test(file.path)) violations.push(`outside application fix scope: ${file.path}`);
    if (/(access-control|middleware|runtime-env|sentry|pec78|sync-health|agent-service-token|oauth|auth\.)/i.test(file.path)) violations.push(`security or monitoring path requires human: ${file.path}`);
    for (const path of new Set([file.path, file.oldPath])) {
      if (FORBIDDEN_PATHS.some(re => re.test(path))) violations.push(`forbidden path: ${path}`);
    }
    if (file.isDeleted) violations.push(`file deletion is not allowed: ${file.path}`);
    if (file.renamed) violations.push(`file rename is not allowed: ${file.oldPath} -> ${file.path}`);
    if (file.binary) violations.push(`binary change is not allowed: ${file.path}`);
    if (MIGRATION_PATH.test(file.path)) {
      if (!file.isNew) violations.push(`existing migration edited (migrations are append-only): ${file.path}`);
      file.added.forEach((line, i) => {
        const sql = line.replace(/--.*$/, '');
        if (DESTRUCTIVE_SQL.test(sql)) violations.push(`destructive SQL in ${file.path} (added line ${i + 1})`);
      });
    }
    file.added.forEach(line => {
      if (SECRET_PATTERNS.some(re => re.test(line))) violations.push(`possible secret added in ${file.path}`);
    });
  }
  if (files.length > limits.maxFiles) violations.push(`too many files changed (${files.length} > ${limits.maxFiles})`);
  if (changed > limits.maxChangedLines) violations.push(`patch too large (${changed} changed lines > ${limits.maxChangedLines}); a minimal fix is expected`);
  if (files.length && !files.some(f => TEST_PATH.test(f.path) && !f.isDeleted)) {
    violations.push('no reproduction test: the patch must add or change a test under tests/ or scripts/test-*');
  }
  return { ok: violations.length === 0, violations: [...new Set(violations)], files: files.map(f => f.path), changedLines: changed };
}
