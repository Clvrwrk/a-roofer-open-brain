import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { collectPackageFiles, isProhibitedPlatformMetadata } from "../scripts/package-files.mjs";

test("platform metadata names are prohibited", () => {
  for (const name of ["._manifest.yaml", ".DS_Store", "__MACOSX"]) {
    assert.equal(isProhibitedPlatformMetadata(name), true);
  }
  assert.equal(isProhibitedPlatformMetadata("manifest.yaml"), false);
});

test("package collection fails closed on nested AppleDouble metadata", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "maya-package-files-"));
  try {
    await mkdir(path.join(root, "nested"));
    await writeFile(path.join(root, "nested", "manifest.yaml"), "{}\n");
    await writeFile(path.join(root, "nested", "._manifest.yaml"), "metadata\n");
    await assert.rejects(collectPackageFiles(root), /platform_metadata_prohibited/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
