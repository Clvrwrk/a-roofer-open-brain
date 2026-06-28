#!/usr/bin/env node
/**
 * open-engine-preflight.mjs — verify dev-engine runtime SKILL files and plane boundaries.
 * Exit 0 = pass; exit 1 = failures printed to stderr.
 *
 * Usage: node scripts/open-engine-preflight.mjs
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEV_ENGINE = join(ROOT, "agents/dev-engine");
const EXPECTED_VERSION = "1.0.1";
const failures = [];

function read(path) {
  return readFileSync(path, "utf8");
}

function checkSkillVersions() {
  const dirs = readdirSync(DEV_ENGINE, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("pe-cc-"))
    .map((d) => d.name);

  for (const dir of dirs) {
    const path = join(DEV_ENGINE, dir, "SKILL.md");
    if (!existsSync(path)) {
      failures.push(`${dir}: missing SKILL.md`);
      continue;
    }
    const text = read(path);
    const fm = text.match(/^engine_version:\s*(\S+)/m);
    const body = text.match(/\*\*Engine version:\*\*\s*(\S+)/);
    const status = text.match(/Local context:\s*([^;\n]+)/);
    const fmVer = fm?.[1];
    const bodyVer = body?.[1];
    const statusVer = status?.[1]?.trim();
    if (fmVer !== EXPECTED_VERSION) failures.push(`${dir}: frontmatter engine_version=${fmVer} expected ${EXPECTED_VERSION}`);
    if (bodyVer !== EXPECTED_VERSION) failures.push(`${dir}: body Engine version=${bodyVer} expected ${EXPECTED_VERSION}`);
    if (statusVer !== EXPECTED_VERSION) failures.push(`${dir}: AGENT STATUS template Local context=${statusVer} expected ${EXPECTED_VERSION}`);
    if (!text.includes("no_supabase_service_role: true")) {
      failures.push(`${dir}: missing no_supabase_service_role: true`);
    }
  }
}

function checkDevTeamProfiles() {
  const path = join(ROOT, "agents/profiles/dev-team-profiles.yaml");
  if (!existsSync(path)) {
    failures.push("dev-team-profiles.yaml missing");
    return;
  }
  const text = read(path);
  if (!text.includes("no_supabase_service_role: true")) {
    failures.push("dev-team-profiles.yaml: missing no_supabase_service_role guardrails");
  }
  for (const id of ["seo-engineer", "session-analyst", "feature-planner"]) {
    if (!text.includes(id.replace("-", "_")) && !text.includes(id)) {
      failures.push(`dev-team-profiles.yaml: missing ${id} profile`);
    }
  }
}

function checkRoofingProfilesNoLinear() {
  const profilesDir = join(ROOT, "agents/profiles");
  const roofing = ["alex-rivers", "maya-chen", "casey-morgan", "jordan-price", "sam-torres", "rowan-vale", "lena-brooks"];
  for (const p of roofing) {
    const path = join(profilesDir, `${p}.yaml`);
    if (!existsSync(path)) continue;
    const text = read(path);
    if (/linear_team|PE-CC-DevTeam|agent-instructions/i.test(text)) {
      failures.push(`${p}.yaml: roofing profile must not reference Linear`);
    }
  }
}

function checkAgentsMd() {
  const path = join(DEV_ENGINE, "AGENTS.md");
  if (!existsSync(path)) failures.push("agents/dev-engine/AGENTS.md missing");
  else if (!read(path).includes("engine_version") && !read(path).includes("v1.0.1")) {
    failures.push("AGENTS.md: should reference Open Engine v1.0.1");
  }
}

checkSkillVersions();
checkDevTeamProfiles();
checkRoofingProfilesNoLinear();
checkAgentsMd();

if (failures.length) {
  console.error("open-engine-preflight FAILED:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log(`open-engine-preflight OK (${EXPECTED_VERSION}, ${readdirSync(DEV_ENGINE).filter((n) => n.startsWith("pe-cc-")).length} runtimes checked)`);
