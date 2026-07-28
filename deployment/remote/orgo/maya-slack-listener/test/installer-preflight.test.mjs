import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertAbsentOrExact,
  assertExactWithModes,
  verifyMayaManagedPaths,
} from "../installer-preflight.mjs";

test("installer preflight rejects a symbolic-link privileged file", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-preflight-symlink-"));
  const target = path.join(directory, "target");
  const link = path.join(directory, "listener.log");
  await writeFile(target, "fixture");
  await symlink(target, link);
  await assert.rejects(
    assertAbsentOrExact(link, { kind: "file", uid: process.getuid(), gid: process.getgid(), mode: 0o600 }),
    /symbolic link is forbidden/,
  );
});

test("installer preflight rejects an unexpected mode", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "maya-preflight-mode-"));
  const target = path.join(directory, "lock");
  await writeFile(target, "fixture");
  await chmod(target, 0o622);
  await assert.rejects(
    assertExactWithModes(target, {
      kind: "file",
      uid: process.getuid(),
      gid: process.getgid(),
      modes: [0o600, 0o644],
    }),
    /mode changed/,
  );
});

test("managed-path preflight rejects a hostile incoming symlink before mutation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "maya-preflight-managed-"));
  const agentHome = path.join(root, "maya-agent");
  for (const target of [
    agentHome,
    path.join(agentHome, "secrets"),
    path.join(agentHome, "runtime"),
    path.join(agentHome, "state"),
    path.join(agentHome, "state", "receipts"),
  ]) await mkdir(target, { recursive: true, mode: 0o700 });
  const incoming = path.join(root, ".incoming");
  const identity = { uid: process.getuid(), gid: process.getgid() };
  await verifyMayaManagedPaths({ agentHome, incoming, identity });
  await symlink(agentHome, incoming);
  await assert.rejects(
    verifyMayaManagedPaths({ agentHome, incoming, identity }),
    /expected it to be absent/,
  );
});

test("managed-path preflight permits an absent mailbox extension but rejects a mailbox symlink", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "maya-preflight-mailbox-"));
  const agentHome = path.join(root, "maya-agent");
  for (const target of [
    agentHome,
    path.join(agentHome, "secrets"),
    path.join(agentHome, "runtime"),
    path.join(agentHome, "state"),
    path.join(agentHome, "state", "receipts"),
  ]) await mkdir(target, { recursive: true, mode: 0o700 });
  const incoming = path.join(root, ".incoming");
  const identity = { uid: process.getuid(), gid: process.getgid() };
  await verifyMayaManagedPaths({ agentHome, incoming, identity });
  await symlink(agentHome, path.join(agentHome, "state", "mailbox"));
  await assert.rejects(
    verifyMayaManagedPaths({ agentHome, incoming, identity }),
    /symbolic link is forbidden/,
  );
});
