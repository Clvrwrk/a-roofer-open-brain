import { lstat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { assertExactPath, validateTree } from "./verify-trust-chain.mjs";

function modeOf(stat) {
  return stat.mode & 0o777;
}

export async function assertAbsentOrExact(target, policy) {
  try {
    await assertExactPath(target, policy);
    return "present";
  } catch (error) {
    if (error?.code === "ENOENT") return "absent";
    throw error;
  }
}

export async function assertAbsent(target) {
  try {
    await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Untrusted path ${target}: expected it to be absent`);
}

export async function assertExactWithModes(target, { kind, uid, gid, modes }) {
  const stat = await lstat(target);
  if (stat.isSymbolicLink()) throw new Error(`Untrusted path ${target}: symbolic link is forbidden`);
  if (kind === "directory" && !stat.isDirectory()) throw new Error(`Untrusted path ${target}: not a directory`);
  if (kind === "file" && !stat.isFile()) throw new Error(`Untrusted path ${target}: not a regular file`);
  if (stat.uid !== uid || stat.gid !== gid) throw new Error(`Untrusted path ${target}: owner changed`);
  if (!modes.includes(modeOf(stat))) throw new Error(`Untrusted path ${target}: mode changed`);
}

function mayaIdentity() {
  try {
    return {
      uid: Number(execFileSync("/usr/bin/id", ["-u", "maya-agent"], { encoding: "utf8" }).trim()),
      gid: Number(execFileSync("/usr/bin/id", ["-g", "maya-agent"], { encoding: "utf8" }).trim()),
    };
  } catch {
    return null;
  }
}

export async function verifyMayaManagedPaths({
  agentHome = "/home/orgo/maya-agent",
  incoming = "/opt/pe-cc-agents/.maya-slack-listener.incoming",
  identity = mayaIdentity(),
} = {}) {
  const directories = [
    agentHome,
    `${agentHome}/secrets`,
    `${agentHome}/runtime`,
    `${agentHome}/state`,
    `${agentHome}/state/receipts`,
  ];
  const extensionDirectories = [
    `${agentHome}/state/mailbox`,
    `${agentHome}/state/mailbox/receipts`,
  ];
  let homePresent = false;
  try {
    await lstat(agentHome);
    homePresent = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (homePresent && !identity) throw new Error(`Untrusted path ${agentHome}: maya-agent identity is absent`);
  if (homePresent) {
    for (const target of directories) {
      await assertExactPath(target, { kind: "directory", uid: identity.uid, gid: identity.gid, mode: 0o700 });
    }
    for (const target of extensionDirectories) {
      await assertAbsentOrExact(target, {
        kind: "directory", uid: identity.uid, gid: identity.gid, mode: 0o700,
      });
    }
    await assertAbsentOrExact(`${agentHome}/secrets/listener.env`, {
      kind: "file", uid: identity.uid, gid: identity.gid, mode: 0o600,
    });
  } else {
    for (const target of [...directories, ...extensionDirectories]) await assertAbsent(target);
  }
  await assertAbsent(incoming);
}

export async function verifyInstallerPreflight() {
  for (const target of ["/", "/home", "/opt", "/etc", "/etc/supervisor", "/etc/supervisor/conf.d", "/var", "/var/log"]) {
    await assertExactPath(target, { kind: "directory", uid: 0, gid: 0, mode: 0o755 });
  }
  await assertExactPath("/home/orgo", { kind: "directory", uid: 1001, gid: 1001, mode: 0o750 });
  await assertExactPath("/usr/local/lib", { kind: "directory", uid: 0, gid: 0, mode: 0o755 });
  await assertExactPath("/usr/local/lib/hermes-agent", { kind: "directory", uid: 0, gid: 0, mode: 0o755 });
  await assertExactPath("/usr/local/lib/hermes-agent/venv", { kind: "directory", uid: 0, gid: 0, mode: 0o755 });
  await assertExactWithModes("/usr/local/lib/hermes-agent/venv/.lock", {
    kind: "file",
    uid: 0,
    gid: 0,
    modes: [0o644, 0o666],
  });
  await verifyMayaManagedPaths();

  const releaseParent = await assertAbsentOrExact("/opt/pe-cc-agents", {
    kind: "directory", uid: 0, gid: 0, mode: 0o755,
  });
  if (releaseParent === "present") {
    const release = await assertAbsentOrExact("/opt/pe-cc-agents/maya-slack-listener", {
      kind: "directory", uid: 0, gid: 0, mode: 0o755,
    });
    if (release === "present") {
      await validateTree("/opt/pe-cc-agents/maya-slack-listener", {
        uid: 0,
        gid: 0,
        executableFiles: [
          "/opt/pe-cc-agents/maya-slack-listener/start-listener.sh",
          "/opt/pe-cc-agents/maya-slack-listener/hermes-no-file-logging.py",
        ],
      });
    }
    await assertAbsentOrExact("/opt/pe-cc-agents/maya-hermes-home", {
      kind: "directory", uid: 0, gid: 0, mode: 0o755,
    });
    await assertAbsentOrExact("/opt/pe-cc-agents/rollback", {
      kind: "directory", uid: 0, gid: 0, mode: 0o700,
    });
  }
  await assertAbsentOrExact("/etc/supervisor/conf.d/maya-slack-listener.conf", {
    kind: "file", uid: 0, gid: 0, mode: 0o644,
  });
  await assertAbsentOrExact("/var/log/pe-cc-agents", {
    kind: "directory", uid: 0, gid: 0, mode: 0o750,
  });
  await assertAbsentOrExact("/var/log/pe-cc-agents/maya-slack-listener.log", {
    kind: "file", uid: 0, gid: 0, mode: 0o640,
  });
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) await verifyInstallerPreflight();
