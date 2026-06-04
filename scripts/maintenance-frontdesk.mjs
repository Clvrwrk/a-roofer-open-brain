#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFAULT_IGNORES = new Set([
  ".git",
  ".obsidian",
  ".worktrees",
  "node_modules",
  "dist",
  ".astro",
  ".next",
  ".turbo",
  ".cache",
  "__pycache__",
]);

const CANONICAL_ROUTES = new Map([
  ["agents", ["agent-workforce", "agents/"]],
  ["config", ["client-config", "config/"]],
  ["deployment", ["runtime-deployment", "deployment/"]],
  ["docs", ["product-docs", "docs/"]],
  ["integrations", ["integration-bridges", "integrations/"]],
  ["onboarding", ["onboarding", "onboarding/"]],
  ["proposals", ["governance-a3", "proposals/"]],
  ["recipes", ["operating-recipes", "recipes/"]],
  ["schemas", ["brain-schema", "schemas/"]],
  ["scripts", ["automation", "scripts/"]],
  ["server", ["mcp-server", "server/"]],
  ["skills", ["agent-skills", "skills/"]],
  ["standards", ["quality-standards", "standards/"]],
  ["supabase", ["supabase-local-state", "supabase/"]],
]);

const IMPORT_HINTS = [
  ["Pro Exteriors Website", "product-app-source", "imports/pro-exteriors-website/"],
  ["ProExteriors - Pricing", "raw-client-data", "private/pro-exteriors-pricing/"],
  ["Property Enrichment", "property-product-research", "imports/property-enrichment/"],
  ["Google Design MD", "third-party-reference", "imports/google-design-md/"],
  ["Global Skills | Plug-ins", "plugin-intake", "imports/global-skills-plugins/"],
];

function parseArgs(argv) {
  const opts = {
    root: process.cwd(),
    format: "markdown",
    maxDepth: 2,
    showFiles: false,
    manifest: null,
    apply: false,
    ackReviewed: false,
    allowNestedGit: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") {
      opts.root = argv[++i];
    } else if (arg === "--format") {
      opts.format = argv[++i];
    } else if (arg === "--max-depth") {
      opts.maxDepth = Number.parseInt(argv[++i], 10);
    } else if (arg === "--show-files") {
      opts.showFiles = true;
    } else if (arg === "--manifest") {
      opts.manifest = argv[++i];
    } else if (arg === "--apply") {
      opts.apply = true;
    } else if (arg === "--ack-reviewed") {
      opts.ackReviewed = true;
    } else if (arg === "--allow-nested-git") {
      opts.allowNestedGit = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(opts.maxDepth) || opts.maxDepth < 1) {
    throw new Error("--max-depth must be a positive integer");
  }
  if (!["markdown", "json"].includes(opts.format)) {
    throw new Error("--format must be markdown or json");
  }
  if (opts.apply && !opts.manifest) {
    throw new Error("--apply requires --manifest FILE");
  }
  if (opts.apply && !opts.ackReviewed) {
    throw new Error("--apply requires --ack-reviewed");
  }

  opts.root = path.resolve(opts.root);
  if (opts.manifest) opts.manifest = path.resolve(opts.manifest);
  return opts;
}

function printHelp() {
  console.log(`Usage: node scripts/maintenance-frontdesk.mjs [options]

Options:
  --root PATH          Repository/workspace root to scan (default: cwd)
  --format FORMAT     markdown or json (default: markdown)
  --max-depth N       Directory depth for signal scan (default: 2)
  --show-files        Include files as inventory entries, not only directories
  --manifest FILE     Validate a reviewed TSV move manifest
  --apply             Apply approved manifest rows (requires --ack-reviewed)
  --ack-reviewed      Required acknowledgement for --apply
  --allow-nested-git  Permit approved moves of nested Git repos
  --help              Show this help

This tool inventories and classifies workspace contents. It never moves or
deletes files unless --apply is used with a reviewed manifest. Use inventory
output to prepare a move manifest first.`);
}

function isKebabCase(name) {
  return /^[a-z0-9][a-z0-9.-]*(?:-[a-z0-9][a-z0-9.-]*)*$/.test(name);
}

function slugify(name) {
  return name
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_\s.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function safeStat(target) {
  try {
    return fs.statSync(target);
  } catch {
    return null;
  }
}

function hasNestedGit(dir) {
  return fs.existsSync(path.join(dir, ".git"));
}

function walkSignals(root, maxDepth) {
  const signals = {
    fileCount: 0,
    dirCount: 0,
    nestedGit: false,
    generated: false,
    hasPackageJson: false,
    hasSql: false,
    hasSpreadsheet: false,
    hasPdf: false,
    hasImages: false,
    hasLogs: false,
  };

  function visit(current, depth) {
    if (depth > maxDepth) return;
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (DEFAULT_IGNORES.has(entry.name)) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        signals.dirCount += 1;
        if (entry.name === ".git") signals.nestedGit = true;
        if (["dist", "build", ".astro", "node_modules"].includes(entry.name)) {
          signals.generated = true;
        }
        visit(fullPath, depth + 1);
      } else if (entry.isFile()) {
        signals.fileCount += 1;
        const lower = entry.name.toLowerCase();
        if (lower === "package.json") signals.hasPackageJson = true;
        if (lower.endsWith(".sql")) signals.hasSql = true;
        if (lower.endsWith(".xlsx") || lower.endsWith(".csv")) signals.hasSpreadsheet = true;
        if (lower.endsWith(".pdf")) signals.hasPdf = true;
        if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".svg")) {
          signals.hasImages = true;
        }
        if (lower.endsWith(".log")) signals.hasLogs = true;
        if (lower.endsWith(".zip") || lower.endsWith(".tgz")) signals.generated = true;
      }
    }
  }

  signals.nestedGit = hasNestedGit(root);
  visit(root, 1);
  return signals;
}

function classify(entryName, absolutePath, isDirectory) {
  const route = CANONICAL_ROUTES.get(entryName);
  if (route) {
    return {
      lane: route[0],
      suggestedPath: route[1],
      reason: "canonical repo folder",
    };
  }

  for (const [hint, lane, suggestedPath] of IMPORT_HINTS) {
    if (entryName === hint) {
      return {
        lane,
        suggestedPath,
        reason: "known raw import from current workspace",
      };
    }
  }

  if (!isDirectory) {
    return {
      lane: "root-file",
      suggestedPath: entryName,
      reason: "root-level file",
    };
  }

  if (hasNestedGit(absolutePath)) {
    return {
      lane: "third-party-or-imported-repo",
      suggestedPath: `imports/${slugify(entryName)}/`,
      reason: "nested git repository",
    };
  }

  return {
    lane: "unclassified-import",
    suggestedPath: `imports/${slugify(entryName)}/`,
    reason: "not part of canonical topology",
  };
}

function flagsFor(entryName, absolutePath, stat, signals) {
  const flags = [];
  if (entryName.includes(" ")) flags.push("spaces");
  if (!isKebabCase(entryName) && !entryName.startsWith(".")) flags.push("non-kebab");
  if (signals.nestedGit) flags.push("nested-git");
  if (signals.generated) flags.push("generated-artifacts");
  if (signals.hasSpreadsheet || signals.hasPdf) flags.push("possible-client-data");
  if (signals.hasLogs) flags.push("logs");
  if (stat.isFile() && stat.size > 5 * 1024 * 1024) flags.push("large-file");
  return flags;
}

function buildInventory(opts) {
  const entries = fs.readdirSync(opts.root, { withFileTypes: true })
    .filter((entry) => !DEFAULT_IGNORES.has(entry.name))
    .filter((entry) => opts.showFiles || entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  return entries.map((entry) => {
    const absolutePath = path.join(opts.root, entry.name);
    const stat = safeStat(absolutePath);
    const isDirectory = entry.isDirectory();
    const signals = isDirectory
      ? walkSignals(absolutePath, opts.maxDepth)
      : {
          fileCount: 1,
          dirCount: 0,
          nestedGit: false,
          generated: false,
          hasPackageJson: false,
          hasSql: entry.name.endsWith(".sql"),
          hasSpreadsheet: entry.name.endsWith(".csv") || entry.name.endsWith(".xlsx"),
          hasPdf: entry.name.endsWith(".pdf"),
          hasImages: /\.(png|jpe?g|svg)$/i.test(entry.name),
          hasLogs: entry.name.endsWith(".log"),
        };
    const classification = classify(entry.name, absolutePath, isDirectory);
    return {
      path: entry.name,
      type: isDirectory ? "dir" : "file",
      lane: classification.lane,
      suggestedPath: classification.suggestedPath,
      reason: classification.reason,
      flags: flagsFor(entry.name, absolutePath, stat, signals),
      signals,
    };
  });
}

function parseManifest(manifestPath) {
  const text = fs.readFileSync(manifestPath, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#"));
  if (lines.length === 0) {
    throw new Error(`Manifest is empty: ${manifestPath}`);
  }

  const headers = lines[0].split("\t").map((header) => header.trim());
  const required = ["from", "to", "lane", "reason", "owner", "status"];
  for (const header of required) {
    if (!headers.includes(header)) {
      throw new Error(`Manifest missing required header: ${header}`);
    }
  }

  return lines.slice(1).map((line, index) => {
    const cells = line.split("\t");
    const row = { line: index + 2 };
    headers.forEach((header, cellIndex) => {
      row[header] = (cells[cellIndex] || "").trim();
    });
    return row;
  });
}

function isSafeRelative(relPath) {
  return Boolean(relPath)
    && !path.isAbsolute(relPath)
    && !relPath.split(/[\\/]+/).includes("..")
    && !relPath.split(/[\\/]+/).includes(".git");
}

function withinRoot(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeManifestPath(relPath) {
  return relPath.replace(/[\\/]+$/g, "");
}

function buildMovePlan(opts) {
  if (!opts.manifest) return null;
  const rows = parseManifest(opts.manifest);

  return rows.map((row) => {
    const problems = [];
    const fromRel = normalizeManifestPath(row.from || "");
    const toRel = normalizeManifestPath(row.to || "");

    if (!isSafeRelative(fromRel)) problems.push("unsafe from path");
    if (!isSafeRelative(toRel)) problems.push("unsafe to path");
    if (row.status !== "approved") problems.push(`status is ${row.status || "empty"}, not approved`);

    const fromAbs = path.resolve(opts.root, fromRel);
    const toAbs = path.resolve(opts.root, toRel);

    if (!withinRoot(opts.root, fromAbs)) problems.push("from path escapes root");
    if (!withinRoot(opts.root, toAbs)) problems.push("to path escapes root");
    if (!fs.existsSync(fromAbs)) problems.push("source missing");
    if (fs.existsSync(toAbs)) problems.push("destination exists");
    if (!opts.allowNestedGit && fs.existsSync(path.join(fromAbs, ".git"))) {
      problems.push("nested git repo requires --allow-nested-git");
    }

    return {
      ...row,
      from: fromRel,
      to: toRel,
      action: problems.length === 0 ? "ready" : "blocked",
      problems,
    };
  });
}

function applyMovePlan(opts, plan) {
  const results = [];
  for (const item of plan) {
    if (item.action !== "ready") {
      results.push({ ...item, action: "skipped" });
      continue;
    }

    const fromAbs = path.resolve(opts.root, item.from);
    const toAbs = path.resolve(opts.root, item.to);
    fs.mkdirSync(path.dirname(toAbs), { recursive: true });
    fs.renameSync(fromAbs, toAbs);
    results.push({ ...item, action: "moved" });
  }
  return results;
}

function renderManifestSection(plan) {
  if (!plan) return [];
  const lines = [
    "## Reviewed Move Manifest",
    "",
    "| Line | From | To | Status | Action | Problems |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  for (const item of plan) {
    lines.push(`| ${item.line} | \`${item.from}\` | \`${item.to}\` | ${item.status || "-"} | ${item.action} | ${item.problems.join(", ") || "-"} |`);
  }
  lines.push("");
  return lines;
}

function renderMarkdown(root, inventory, movePlan) {
  const now = new Date().toISOString();
  const flagged = inventory.filter((item) => item.flags.length > 0).length;
  const proposed = inventory.filter((item) => item.suggestedPath !== item.path && item.suggestedPath !== `${item.path}/`).length;

  const lines = [
    "# Maintenance Front Desk Inventory",
    "",
    `Generated: ${now}`,
    `Root: ${root}`,
    "",
    "## Summary",
    "",
    `- Entries scanned: ${inventory.length}`,
    `- Entries with flags: ${flagged}`,
    `- Entries with suggested routing changes: ${proposed}`,
    "",
    "## Routing Table",
    "",
    "| Path | Type | Lane | Suggested path | Flags | Reason |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  for (const item of inventory) {
    lines.push(`| \`${item.path}\` | ${item.type} | ${item.lane} | \`${item.suggestedPath}\` | ${item.flags.join(", ") || "-"} | ${item.reason} |`);
  }

  lines.push("", ...renderManifestSection(movePlan));

  lines.push(
    "",
    "## Move Manifest Seed",
    "",
    "Review these rows before moving anything:",
    "",
    "```text",
    "from\tto\tlane\treason\towner\tstatus",
  );

  for (const item of inventory) {
    if (item.suggestedPath !== item.path && item.suggestedPath !== `${item.path}/`) {
      lines.push(`${item.path}\t${item.suggestedPath}\t${item.lane}\t${item.reason}\tMaintenance\tproposed`);
    }
  }

  lines.push("```", "");
  return lines.join("\n");
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(opts.root)) {
    throw new Error(`Root does not exist: ${opts.root}`);
  }

  const inventory = buildInventory(opts);
  const movePlan = buildMovePlan(opts);
  const manifestResult = opts.apply && movePlan ? applyMovePlan(opts, movePlan) : movePlan;

  if (opts.format === "json") {
    console.log(JSON.stringify({ root: opts.root, generatedAt: new Date().toISOString(), inventory, movePlan: manifestResult }, null, 2));
    return;
  }
  console.log(renderMarkdown(opts.root, inventory, manifestResult));
}

try {
  main();
} catch (error) {
  console.error(`maintenance-frontdesk: ${error.message}`);
  process.exit(1);
}
