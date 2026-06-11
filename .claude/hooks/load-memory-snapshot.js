#!/usr/bin/env node
// SessionStart hook — loads the curated memory snapshot (Hermes frozen-snapshot
// pattern, ported from Scrapes-OS). Reads context/SOUL.md, context/USER.md,
// context/MEMORY.md, and today's daily log (or yesterday's as fallback) and
// injects them as additionalContext so the CLAUDE.md "Session Startup (silent)"
// steps are enforced by runtime, not agent discipline.
//
// Fire-and-forget — never blocks session start. Silent on missing files.

const fs = require('fs');
const path = require('path');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  let data = {};
  try {
    data = JSON.parse(input);
  } catch {
    // No JSON input — fall back to env / cwd
  }

  const cwd = data.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();

  // Walk up to find the repo root (CLAUDE.md or AGENTS.md + .claude/ present)
  // so the hook works from worktrees or app/ subdirectories.
  function findRoot(start) {
    let dir = start;
    for (let i = 0; i < 8; i++) {
      const hasAgents = fs.existsSync(path.join(dir, 'AGENTS.md'));
      const hasClaude = fs.existsSync(path.join(dir, 'CLAUDE.md'));
      const hasClaudeDir = fs.existsSync(path.join(dir, '.claude'));
      if ((hasAgents || hasClaude) && hasClaudeDir) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  }

  function resolveContext(relFile) {
    const local = path.join(cwd, relFile);
    if (fs.existsSync(local)) return { abs: local, source: 'local' };
    const root = findRoot(cwd);
    if (root && root !== cwd) {
      const rooted = path.join(root, relFile);
      if (fs.existsSync(rooted)) return { abs: rooted, source: 'root' };
    }
    return null;
  }

  function dateStr(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  const now = new Date();
  const today = dateStr(now);
  const yesterday = dateStr(new Date(now.getTime() - 86400000));

  const targets = [
    { rel: 'context/SOUL.md', label: 'SOUL — agent identity' },
    { rel: 'context/USER.md', label: 'USER — profile and preferences (1,375 char cap)' },
    {
      rel: 'context/MEMORY.md',
      label:
        'MEMORY — curated working memory (2,500 char cap; frozen snapshot; mid-session writes take effect next session)',
    },
  ];

  // Daily log: today first, yesterday as fallback if today has no session yet
  const todayLog = resolveContext(`context/memory/${today}.md`);
  if (todayLog) {
    targets.push({ rel: `context/memory/${today}.md`, label: `Today's daily log (${today})` });
  } else {
    const yLog = resolveContext(`context/memory/${yesterday}.md`);
    if (yLog) {
      targets.push({
        rel: `context/memory/${yesterday}.md`,
        label: `Yesterday's daily log (${yesterday}) — today has no session yet`,
      });
    }
  }

  const sections = [];
  for (const t of targets) {
    const resolved = resolveContext(t.rel);
    if (!resolved) continue;
    try {
      const content = fs.readFileSync(resolved.abs, 'utf8').trim();
      if (content.length === 0) continue;
      sections.push(`### ${t.label}\n\nFile: \`${t.rel}\`\n\n${content}`);
    } catch {
      // Silent — fire and forget
    }
  }

  if (sections.length === 0) {
    process.exit(0);
  }

  const message =
    `# Silent startup — memory snapshot loaded (per CLAUDE.md Session Startup)\n\n` +
    `These files are auto-loaded so the silent startup is genuinely silent — ` +
    `you already have the frozen snapshot for this session. Do not greet, do not ` +
    `recap, do not announce memory reads. Mid-session writes to \`context/MEMORY.md\` ` +
    `persist to disk but only take effect on the next session.\n\n` +
    `---\n\n` +
    sections.join('\n\n---\n\n');

  const output = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: message,
    },
  };

  process.stdout.write(JSON.stringify(output));
});

// Safety net — if stdin never delivers, exit silently after a few seconds
setTimeout(() => process.exit(0), 4000);
