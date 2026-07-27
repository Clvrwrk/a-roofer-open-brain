import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertSupervisorStatus } from "./supervisor-status.mjs";
import { hashTree } from "./tree-integrity.mjs";

async function requireAbsent(target) {
  try {
    await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Expected restored path to be absent: ${target}`);
}

export async function verifyInstallRestoration({
  releasePath,
  expectedReleaseHash,
  configPath,
  expectedConfigHash,
  hermesPath,
  expectedHermesHash,
  lockPath,
  expectedLockMode,
  supervisorOutput,
  supervisorExitCode,
  expectedSupervisor,
  uid = 0,
  gid = 0,
}) {
  if (expectedReleaseHash) {
    const stat = await lstat(releasePath);
    if (stat.isSymbolicLink() || !stat.isDirectory() || stat.uid !== uid || stat.gid !== gid) {
      throw new Error("Restored release identity changed");
    }
    if (await hashTree(releasePath) !== expectedReleaseHash) throw new Error("Restored release hash changed");
  } else {
    await requireAbsent(releasePath);
  }

  if (expectedConfigHash) {
    const stat = await lstat(configPath);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.uid !== uid || stat.gid !== gid || (stat.mode & 0o777) !== 0o644) {
      throw new Error("Restored Supervisor config identity changed");
    }
    const actual = createHash("sha256").update(await readFile(configPath)).digest("hex");
    if (actual !== expectedConfigHash) throw new Error("Restored Supervisor config hash changed");
  } else {
    await requireAbsent(configPath);
  }

  if (expectedHermesHash) {
    const stat = await lstat(hermesPath);
    if (stat.isSymbolicLink() || !stat.isDirectory() || stat.uid !== uid || stat.gid !== gid) {
      throw new Error("Restored Hermes home identity changed");
    }
    if (await hashTree(hermesPath) !== expectedHermesHash) throw new Error("Restored Hermes home hash changed");
  } else {
    await requireAbsent(hermesPath);
  }

  const lockStat = await lstat(lockPath);
  if (
    lockStat.isSymbolicLink() || !lockStat.isFile() || lockStat.uid !== uid || lockStat.gid !== gid ||
    (lockStat.mode & 0o777) !== expectedLockMode
  ) {
    throw new Error("Restored Hermes lock identity or mode changed");
  }
  assertSupervisorStatus({ output: supervisorOutput, exitCode: supervisorExitCode, expected: expectedSupervisor });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [
    , , releasePath, releaseHash, configPath, configHash, hermesPath, hermesHash,
    lockPath, lockMode,
    expectedSupervisor, supervisorExitCode, supervisorOutput,
  ] = process.argv;
  await verifyInstallRestoration({
    releasePath,
    expectedReleaseHash: releaseHash === "-" ? null : releaseHash,
    configPath,
    expectedConfigHash: configHash === "-" ? null : configHash,
    hermesPath,
    expectedHermesHash: hermesHash === "-" ? null : hermesHash,
    lockPath,
    expectedLockMode: Number.parseInt(lockMode, 8),
    expectedSupervisor,
    supervisorExitCode: Number(supervisorExitCode),
    supervisorOutput,
  });
}
