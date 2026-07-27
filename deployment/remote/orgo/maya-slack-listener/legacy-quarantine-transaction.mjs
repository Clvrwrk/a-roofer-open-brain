import { execFile as execFileCallback } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, lstat, open, unlink } from "node:fs/promises";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { hashTree as defaultHashTree } from "./tree-integrity.mjs";

const execFile = promisify(execFileCallback);

async function exists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function defaultRenameNoReplace(source, destination) {
  await execFile("/usr/bin/mv", ["-T", "--no-copy", "--no-clobber", source, destination]);
  if (await exists(source)) throw new Error("atomic rename did not remove the source path");
  if (!await exists(destination)) throw new Error("atomic rename did not create the destination path");
}

async function defaultWriteEvidence(target, hash, quarantinedPath) {
  const handle = await open(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    await handle.writeFile(`${hash}  ${quarantinedPath}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(target, 0o600);
}

async function defaultReport(message) {
  await new Promise((resolve, reject) => {
    process.stdout.write(`${message}\n`, (error) => error ? reject(error) : resolve());
  });
}

export async function atomicQuarantine({
  sourceDir,
  quarantineDir,
  evidenceFile,
  rollbackParent,
  hashTree = defaultHashTree,
  renameNoReplace = defaultRenameNoReplace,
  writeEvidence = defaultWriteEvidence,
  report = defaultReport,
  deviceOf = async (target) => (await lstat(target)).dev,
}) {
  if (await exists(quarantineDir)) throw new Error("quarantine destination already exists");
  if (await exists(evidenceFile)) throw new Error("quarantine evidence path already exists");
  const [sourceDevice, destinationDevice] = await Promise.all([
    deviceOf(sourceDir),
    deviceOf(rollbackParent),
  ]);
  if (sourceDevice !== destinationDevice) throw new Error("quarantine requires a same-filesystem atomic rename");

  const beforeHash = await hashTree(sourceDir);
  let moved = false;
  try {
    await renameNoReplace(sourceDir, quarantineDir);
    moved = !await exists(sourceDir) && await exists(quarantineDir);
    if (!moved) throw new Error("atomic quarantine state could not be proven");
    const afterHash = await hashTree(quarantineDir);
    if (afterHash !== beforeHash) throw new Error("legacy tree hash changed during quarantine");
    await writeEvidence(evidenceFile, afterHash, quarantineDir);
    await report(`Legacy Maya prototype quarantined with full-tree hash: ${quarantineDir}`);
    return { beforeHash, afterHash, quarantineDir, evidenceFile };
  } catch (error) {
    if (await exists(evidenceFile)) await unlink(evidenceFile);
    const sourcePresent = await exists(sourceDir);
    const quarantinePresent = await exists(quarantineDir);
    if (moved || (!sourcePresent && quarantinePresent)) {
      try {
        await renameNoReplace(quarantineDir, sourceDir);
        const restoredHash = await hashTree(sourceDir);
        if (restoredHash !== beforeHash) throw new Error("restored legacy tree hash mismatch");
      } catch (restoreError) {
        throw new AggregateError(
          [error, restoreError],
          `legacy quarantine failed and automatic restoration failed: ${quarantineDir}`,
        );
      }
    }
    throw error;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  if (process.getuid?.() !== 0) throw new Error("root required");
  if (process.argv.length !== 6) throw new Error("exactly four quarantine paths are required");
  const [, , sourceDir, quarantineDir, evidenceFile, rollbackParent] = process.argv;
  await access(sourceDir, constants.R_OK);
  await atomicQuarantine({ sourceDir, quarantineDir, evidenceFile, rollbackParent });
}
