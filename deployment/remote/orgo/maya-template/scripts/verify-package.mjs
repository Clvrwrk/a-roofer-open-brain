import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectPackageFiles } from "./package-files.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const required = [
  "manifest.yaml", "AGENTS.md", "SOUL.md", "autonomy-budget.md", "queue-policy.yaml",
  "permissions.yaml", "schedules.yaml", "memory-policy.md", "tool-router.yaml", "skills.lock",
  "runtime/service.mjs", "runtime/maya-runtime-v1.conf", "runtime/NODE-RUNTIME.md",
  "runtime/install-paused.sh", "scripts/create-transfer-archive.sh",
  "runbooks/build-transfer.md", "runbooks/pause.md", "runbooks/rollback.md",
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
const cleanCommand = "command=/usr/bin/env -i HOME=\"/var/lib/cleverwork/maya-agent-v1\" MAYA_ENABLED=\"false\" NODE_ENV=\"production\" PATH=\"/usr/local/bin:/usr/bin:/bin\" /usr/local/bin/node ";
if (!supervisor.includes(cleanCommand)) throw new Error("supervisor_environment_not_scrubbed");
if (/^environment=/mu.test(supervisor)) throw new Error("supervisor_environment_inheritance_enabled");

const prohibited = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\b(?:sk|xoxb|xapp)-[A-Za-z0-9_-]{12,}\b/u,
  /\bca_[A-Za-z0-9]{8,}\b/u,
  /\bti_[A-Za-z0-9_-]{8,}\b/u,
  /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password)\s*[:=]\s*["'][^"']{12,}["']/iu,
];
const files = await collectPackageFiles(root);
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
