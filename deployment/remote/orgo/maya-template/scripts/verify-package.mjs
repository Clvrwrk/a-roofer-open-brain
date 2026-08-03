import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const required = [
  "manifest.yaml", "AGENTS.md", "SOUL.md", "autonomy-budget.md", "queue-policy.yaml",
  "permissions.yaml", "schedules.yaml", "memory-policy.md", "tool-router.yaml", "skills.lock",
  "runtime/service.mjs", "runtime/maya-runtime-v1.conf", "runtime/NODE-RUNTIME.md",
  "runbooks/pause.md", "runbooks/rollback.md",
];

for (const relative of required) await stat(path.join(root, relative));
const manifest = JSON.parse(await readFile(path.join(root, "manifest.yaml"), "utf8"));
const permissions = JSON.parse(await readFile(path.join(root, "permissions.yaml"), "utf8"));
if (manifest.identity.destination !== "INJECT_AT_LAUNCH") throw new Error("destination_identity_embedded");
if (manifest.activation.enabled_by_default !== false) throw new Error("template_not_disabled");
if (Object.values(manifest.communications).some((mode) => mode !== "off")) throw new Error("communication_enabled");
if (permissions.provider_adapters.length !== 0 || permissions.claims || permissions.schedules) throw new Error("capability_enabled");
if (manifest.runtime.node_path !== "/usr/local/bin/node" || manifest.runtime.node_version !== "22.22.3") throw new Error("node_runtime_unpinned");
const supervisor = await readFile(path.join(root, "runtime/maya-runtime-v1.conf"), "utf8");
if (!supervisor.includes("command=/usr/local/bin/node ")) throw new Error("supervisor_node_path_unpinned");

const prohibited = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\b(?:sk|xoxb|xapp)-[A-Za-z0-9_-]{12,}\b/u,
  /\bca_[A-Za-z0-9]{8,}\b/u,
  /\bti_[A-Za-z0-9_-]{8,}\b/u,
  /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password)\s*[:=]\s*["'][^"']{12,}["']/iu,
];
const ignored = new Set(["node_modules", ".git"]);
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(target);
    else if (entry.isFile()) files.push(target);
    else throw new Error("non_regular_package_entry");
  }
}
await walk(root);
for (const target of files) {
  const content = await readFile(target, "utf8");
  if (prohibited.some((pattern) => pattern.test(content))) throw new Error(`secret_scan_failed:${path.relative(root, target)}`);
}
const digest = createHash("sha256");
for (const target of files.sort()) {
  const relative = path.relative(root, target);
  if (relative === "RELEASE.md") continue;
  digest.update(relative).update("\0").update(await readFile(target)).update("\0");
}
process.stdout.write(`${JSON.stringify({ ok: true, files: files.length, package_digest: digest.digest("hex") })}\n`);
