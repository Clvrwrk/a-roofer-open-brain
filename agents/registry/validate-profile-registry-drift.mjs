import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRegistry } from "./validate-named-agent-principals.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const registry = validateRegistry(JSON.parse(fs.readFileSync(path.join(here, "named-agent-principals.json"), "utf8")));
const named = registry.principals.filter((p) => p.activation_scope === "named-agent");

function section(text, name) {
  const match = text.match(new RegExp(`^${name}:\\n([\\s\\S]*?)(?=^[a-z_]+:|\\Z)`, "m"));
  if (!match) throw new Error(`profile_missing_section:${name}`);
  return match[1];
}

function scalar(block, key) {
  const match = block.match(new RegExp(`^  ${key}:\\s*(?:"([^"]*)"|'([^']*)'|([^#\\n]*))`, "m"));
  if (!match) throw new Error(`profile_missing_field:${key}`);
  const raw = (match[1] ?? match[2] ?? match[3]).trim();
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  return raw;
}

for (const principal of named) {
  const filename = path.join(root, "agents", "profiles", `${principal.persona_id}.yaml`);
  const text = fs.readFileSync(filename, "utf8");
  const identity = section(text, "identity");
  const google = section(text, "google_workspace");
  const kasm = section(text, "kasm");
  const slack = section(text, "slack");
  const commandCenter = section(text, "command_center");
  const expected = [
    [scalar(identity, "id"), principal.persona_id, "identity.id"],
    [scalar(identity, "display_name"), principal.display_name, "identity.display_name"],
    [scalar(identity, "role"), principal.role, "identity.role"],
    [scalar(google, "email"), principal.google.primary_email, "google_workspace.email"],
    [scalar(slack, "app_id"), principal.slack.app_id, "slack.app_id"],
    [scalar(slack, "team_id"), principal.slack.team_id, "slack.team_id"],
    [scalar(commandCenter, "service_agent_id"), principal.command_center.service_role, "command_center.service_agent_id"],
    [scalar(kasm, "desktop_enabled"), true, "kasm.desktop_enabled"],
    [scalar(kasm, "desktop_name"), `pe-${principal.persona_id}`, "kasm.desktop_name"]
  ];
  for (const [actual, wanted, field] of expected) if (actual !== wanted) throw new Error(`profile_registry_drift:${principal.persona_id}:${field}`);
  if (principal.persona_id === "rowan-vale") {
    if (scalar(kasm, "network_policy") !== "external-only" || !/no_internal_brain_access:\s*true/m.test(text) || /supabase_env_key:/im.test(text)) throw new Error("rowan_external_only_drift");
  }
  if (principal.persona_id === "sam-torres" && (/trust_tier\.write|trust_tier_write/i.test(text) || /^  approval_decide:\s*true/m.test(text))) throw new Error("sam_trust_tier_drift");
}

console.log(`profile/registry drift check valid (${named.length} named agents)`);
