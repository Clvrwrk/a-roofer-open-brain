import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyInstallRestoration } from "../install-restoration.mjs";
import { hashTree } from "../tree-integrity.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "maya-install-restore-"));
  const releasePath = path.join(root, "release");
  const configPath = path.join(root, "listener.conf");
  const hermesPath = path.join(root, "hermes-home");
  const lockPath = path.join(root, ".lock");
  await mkdir(releasePath, { mode: 0o755 });
  await mkdir(hermesPath, { mode: 0o755 });
  await writeFile(path.join(releasePath, "listener.mjs"), "export {};\n", { mode: 0o644 });
  await writeFile(configPath, "[program:maya-slack-listener]\n", { mode: 0o644 });
  await writeFile(path.join(hermesPath, "config.yaml"), "{}\n", { mode: 0o644 });
  await writeFile(lockPath, "fixture\n", { mode: 0o644 });
  await chmod(lockPath, 0o644);
  return {
    releasePath,
    configPath,
    hermesPath,
    lockPath,
    expectedReleaseHash: await hashTree(releasePath),
    expectedConfigHash: createHash("sha256").update(await readFile(configPath)).digest("hex"),
    expectedHermesHash: await hashTree(hermesPath),
    expectedLockMode: (await lstat(lockPath)).mode & 0o777,
  };
}

test("restoration verifier proves release, config, and exact stopped state", async () => {
  const paths = await fixture();
  await verifyInstallRestoration({
    ...paths,
    supervisorOutput: "maya-slack-listener STOPPED Not started",
    supervisorExitCode: 3,
    expectedSupervisor: "stopped",
    uid: process.getuid(),
    gid: process.getgid(),
  });
});

test("restoration verifier rejects changed Hermes state after a selector failure", async () => {
  const paths = await fixture();
  await writeFile(path.join(paths.hermesPath, "config.yaml"), "{\"changed\":true}\n", { mode: 0o644 });
  await chmod(paths.lockPath, 0o600);
  await assert.rejects(verifyInstallRestoration({
    ...paths,
    supervisorOutput: "maya-slack-listener STOPPED Not started",
    supervisorExitCode: 3,
    expectedSupervisor: "stopped",
    uid: process.getuid(),
    gid: process.getgid(),
  }), /Hermes home hash changed|Hermes lock identity or mode changed/);
});

test("restoration verifier rejects a changed release after a post-move failure", async () => {
  const paths = await fixture();
  await writeFile(path.join(paths.releasePath, "listener.mjs"), "export const tampered = true;\n", { mode: 0o644 });
  await assert.rejects(verifyInstallRestoration({
    ...paths,
    supervisorOutput: "maya-slack-listener STOPPED Not started",
    supervisorExitCode: 3,
    expectedSupervisor: "stopped",
    uid: process.getuid(),
    gid: process.getgid(),
  }), /release hash changed/);
});
