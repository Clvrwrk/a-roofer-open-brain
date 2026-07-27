import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateTree, verifyHermesIntegrityBeforeSelector } from "../verify-trust-chain.mjs";
import { hashTree } from "../tree-integrity.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "maya-trust-chain-"));
  await chmod(root, 0o755);
  await writeFile(path.join(root, "listener.mjs"), "export {};\n", { mode: 0o644 });
  return root;
}

function localPolicy(root) {
  return {
    uid: process.getuid(),
    gid: process.getgid(),
    executableFiles: [],
  };
}

test("accepts an exact owner/mode release fixture", async () => {
  const root = await fixture();
  await validateTree(root, localPolicy(root));
});

test("rejects a symlink before execution", async () => {
  const root = await fixture();
  await symlink(path.join(root, "listener.mjs"), path.join(root, "listener-link.mjs"));
  await assert.rejects(validateTree(root, localPolicy(root)), /symbolic link is forbidden/);
});

test("rejects a writable release file before execution", async () => {
  const root = await fixture();
  await chmod(path.join(root, "listener.mjs"), 0o666);
  await assert.rejects(validateTree(root, localPolicy(root)), /file mode changed/);
});

test("rejects an unexpected release owner before execution", async () => {
  const root = await fixture();
  await assert.rejects(
    validateTree(root, { ...localPolicy(root), uid: process.getuid() + 1 }),
    /owner changed/,
  );
});

test("tree integrity changes when executable content changes", async () => {
  const root = await fixture();
  const before = await hashTree(root);
  await writeFile(path.join(root, "listener.mjs"), "export const changed = true;\n", { mode: 0o644 });
  const after = await hashTree(root);
  assert.notEqual(after, before);
});

test("runtime trust verifier excludes Supervisor-owned logs", async () => {
  const verifier = await readFile(new URL("../verify-trust-chain.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(verifier, /\/var\/log\/pe-cc-agents/);
  const config = await readFile(new URL("../maya-slack-listener.conf", import.meta.url), "utf8");
  assert.match(config, /^stdout_logfile=\/var\/log\/pe-cc-agents\/maya-slack-listener\.log$/m);
  assert.match(config, /^redirect_stderr=true$/m);
});

for (const failedHashCall of [1, 2]) {
  test(`Hermes selector never spawns when integrity hash ${failedHashCall} fails`, async () => {
    let hashCalls = 0;
    let selectorCalls = 0;
    await assert.rejects(
      verifyHermesIntegrityBeforeSelector({
        assertTreeHashImpl: async () => {
          hashCalls += 1;
          if (hashCalls === failedHashCall) throw new Error("integrity failed");
        },
        validateTreeImpl: async () => {},
        selectorImpl: async () => { selectorCalls += 1; },
      }),
      /integrity failed/,
    );
    assert.equal(selectorCalls, 0);
  });
}
