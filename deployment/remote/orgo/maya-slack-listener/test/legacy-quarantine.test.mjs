import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { atomicQuarantine } from "../legacy-quarantine-transaction.mjs";
import { hashTree } from "../tree-integrity.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "maya-legacy-quarantine-"));
  const sourceDir = path.join(root, "source");
  const rollbackParent = path.join(root, "rollback");
  const quarantineDir = path.join(rollbackParent, "legacy");
  const evidenceFile = `${quarantineDir}.sha256`;
  await mkdir(path.join(sourceDir, "node_modules", "pkg"), { recursive: true });
  await mkdir(rollbackParent);
  await writeFile(path.join(sourceDir, "package.json"), "{}\n");
  await writeFile(path.join(sourceDir, "package-lock.json"), "{}\n");
  await writeFile(path.join(sourceDir, "node_modules", "pkg", "index.js"), "export {};\n");
  return { sourceDir, rollbackParent, quarantineDir, evidenceFile };
}

const renameNoReplace = async (source, destination) => rename(source, destination);
const silentReport = async () => {};

test("atomic quarantine preserves the full tree and writes evidence", async () => {
  const paths = await fixture();
  const before = await hashTree(paths.sourceDir);
  const result = await atomicQuarantine({ ...paths, renameNoReplace, report: silentReport });
  assert.equal(result.beforeHash, before);
  assert.equal(result.afterHash, before);
  assert.equal(await hashTree(paths.quarantineDir), before);
  assert.match(await readFile(paths.evidenceFile, "utf8"), new RegExp(`^${before}  `));
  await assert.rejects(readFile(path.join(paths.sourceDir, "package.json")), /ENOENT/);
});

test("atomic quarantine rejects cross-device and destination-collision states without mutation", async () => {
  const crossDevice = await fixture();
  await assert.rejects(
    atomicQuarantine({
      ...crossDevice,
      renameNoReplace,
      report: silentReport,
      deviceOf: async (target) => target === crossDevice.sourceDir ? 1 : 2,
    }),
    /same-filesystem/,
  );
  assert.equal(await readFile(path.join(crossDevice.sourceDir, "package.json"), "utf8"), "{}\n");

  const collision = await fixture();
  await mkdir(collision.quarantineDir);
  await writeFile(path.join(collision.quarantineDir, "sentinel"), "preserve\n");
  await assert.rejects(
    atomicQuarantine({ ...collision, renameNoReplace, report: silentReport }),
    /destination already exists/,
  );
  assert.equal(await readFile(path.join(collision.sourceDir, "package.json"), "utf8"), "{}\n");
  assert.equal(await readFile(path.join(collision.quarantineDir, "sentinel"), "utf8"), "preserve\n");
});

for (const failure of ["after-hash", "evidence", "report"]) {
  test(`atomic quarantine restores the exact source after ${failure} failure`, async () => {
    const paths = await fixture();
    const before = await hashTree(paths.sourceDir);
    let hashCalls = 0;
    const options = {
      ...paths,
      renameNoReplace,
      report: failure === "report" ? async () => { throw new Error("report failed"); } : silentReport,
      hashTree: async (target) => {
        hashCalls += 1;
        if (failure === "after-hash" && hashCalls === 2) throw new Error("after hash failed");
        return hashTree(target);
      },
    };
    if (failure === "evidence") options.writeEvidence = async () => { throw new Error("evidence failed"); };
    await assert.rejects(atomicQuarantine(options));
    assert.equal(await hashTree(paths.sourceDir), before);
    await assert.rejects(readFile(path.join(paths.quarantineDir, "package.json")), /ENOENT/);
    await assert.rejects(readFile(paths.evidenceFile), /ENOENT/);
  });
}

test("atomic quarantine reports a terminal error when restoration itself fails", async () => {
  const paths = await fixture();
  let renames = 0;
  await assert.rejects(
    atomicQuarantine({
      ...paths,
      renameNoReplace: async (source, destination) => {
        renames += 1;
        if (renames === 2) throw new Error("restore failed");
        await rename(source, destination);
      },
      report: async () => { throw new Error("report failed"); },
    }),
    (error) => error instanceof AggregateError && /automatic restoration failed/.test(error.message),
  );
});
