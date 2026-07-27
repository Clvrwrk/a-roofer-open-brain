import { lstat, readdir, realpath } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { hashTree } from "./tree-integrity.mjs";

const RELEASE_DIR = "/opt/pe-cc-agents/maya-slack-listener";
const HERMES_HOME = "/opt/pe-cc-agents/maya-hermes-home";
const HERMES_VENV = "/usr/local/lib/hermes-agent/venv";
const HERMES_PYTHON_ROOT = "/usr/local/share/uv/python/cpython-3.11.15-linux-x86_64-gnu";
const HERMES_PYTHON_SHA256 = "d73832af1d5c8d85d73d26d9dfb8c9ea285246668f2abf5213230435bbd0ac65";
const HERMES_VENV_SHA256 = "cdca2f048cd88cfdbcac4f3268d0e3eff58ebab937281f35b18ac3d8f8209ef7";

function octalMode(stat) {
  return stat.mode & 0o777;
}

function fail(target, reason) {
  throw new Error(`Untrusted path ${target}: ${reason}`);
}

export async function assertExactPath(
  target,
  { kind, uid, gid, mode, allowSymlinkTo },
) {
  const stat = await lstat(target);
  if (stat.isSymbolicLink()) {
    if (!allowSymlinkTo) fail(target, "symbolic link is forbidden");
    const resolved = await realpath(target);
    if (resolved !== allowSymlinkTo) fail(target, "symbolic link target changed");
    return;
  }
  if (kind === "directory" && !stat.isDirectory()) fail(target, "not a directory");
  if (kind === "file" && !stat.isFile()) fail(target, "not a regular file");
  if (stat.uid !== uid || stat.gid !== gid) fail(target, "owner changed");
  if (octalMode(stat) !== mode) fail(target, "mode changed");
}

export async function validateTree(
  root,
  {
    uid,
    gid,
    directoryModes = [0o755],
    fileModes = [0o644],
    executableFiles = [],
    allowSymlinksWithin = [],
  },
) {
  const executableSet = new Set(executableFiles.map((item) => path.resolve(item)));
  const approvedRoots = await Promise.all(
    allowSymlinksWithin.map(async (item) => path.resolve(await realpath(item))),
  );

  async function visit(target) {
    const stat = await lstat(target);
    if (stat.uid !== uid || stat.gid !== gid) fail(target, "owner changed");
    if (stat.isSymbolicLink()) {
      if (approvedRoots.length === 0) fail(target, "symbolic link is forbidden");
      const resolved = path.resolve(await realpath(target));
      const allowed = approvedRoots.some(
        (approvedRoot) => resolved === approvedRoot || resolved.startsWith(`${approvedRoot}${path.sep}`),
      );
      if (!allowed) fail(target, "symbolic link escaped approved roots");
      return;
    }
    if (stat.isDirectory()) {
      if (!directoryModes.includes(octalMode(stat))) fail(target, "directory mode changed");
      for (const entry of await readdir(target)) await visit(path.join(target, entry));
      return;
    }
    if (!stat.isFile()) fail(target, "unsupported file type");
    const expectedModes = executableSet.has(path.resolve(target)) ? [0o755] : fileModes;
    if (!expectedModes.includes(octalMode(stat))) fail(target, "file mode changed");
  }

  await visit(root);
}

async function assertTreeHash(target, expected) {
  const actual = await hashTree(target);
  if (actual !== expected) fail(target, "integrity hash changed");
}

function assertHermesHasNoTools() {
  const output = execFileSync(
    `${HERMES_VENV}/bin/python3`,
    [`${RELEASE_DIR}/verify-hermes-no-tools.py`, `${HERMES_HOME}/config.yaml`],
    {
      encoding: "utf8",
      env: {
        PATH: `${HERMES_VENV}/bin:/usr/bin:/bin`,
        PYTHONPATH: "/usr/local/lib/hermes-agent",
        PYTHONDONTWRITEBYTECODE: "1",
      },
    },
  ).trim();
  if (output !== "hermes_toolsets=0") fail(`${HERMES_HOME}/config.yaml`, "tool policy check failed");
}

export async function verifyHermesIntegrityBeforeSelector({
  assertTreeHashImpl = assertTreeHash,
  validateTreeImpl = validateTree,
  selectorImpl = assertHermesHasNoTools,
} = {}) {
  await assertTreeHashImpl(HERMES_PYTHON_ROOT, HERMES_PYTHON_SHA256);
  await validateTreeImpl(HERMES_PYTHON_ROOT, {
    uid: 0,
    gid: 0,
    fileModes: [0o644, 0o755],
    allowSymlinksWithin: [HERMES_PYTHON_ROOT],
  });
  await assertTreeHashImpl(HERMES_VENV, HERMES_VENV_SHA256);
  await validateTreeImpl(HERMES_VENV, {
    uid: 0,
    gid: 0,
    fileModes: [0o644, 0o755],
    allowSymlinksWithin: [HERMES_VENV, HERMES_PYTHON_ROOT],
  });
  await selectorImpl();
}

export async function verifyProductionTrustChain() {
  const rootPaths = ["/", "/home", "/usr", "/usr/bin", "/usr/local", "/usr/local/bin", "/opt"];
  for (const target of rootPaths) {
    await assertExactPath(target, { kind: "directory", uid: 0, gid: 0, mode: 0o755 });
  }
  await assertExactPath("/home/orgo", { kind: "directory", uid: 1001, gid: 1001, mode: 0o750 });
  await assertExactPath("/usr/bin/env", { kind: "file", uid: 0, gid: 0, mode: 0o755 });
  await assertExactPath("/usr/bin/node", { kind: "file", uid: 0, gid: 0, mode: 0o755 });
  await assertExactPath("/usr/bin/bash", { kind: "file", uid: 0, gid: 0, mode: 0o755 });
  await assertExactPath("/usr/bin/id", { kind: "file", uid: 0, gid: 0, mode: 0o755 });
  await assertExactPath("/usr/bin/stat", { kind: "file", uid: 0, gid: 0, mode: 0o755 });
  await assertExactPath("/usr/local/bin/hermes", { kind: "file", uid: 0, gid: 0, mode: 0o755 });
  await assertExactPath("/usr/local/lib", { kind: "directory", uid: 0, gid: 0, mode: 0o755 });
  await assertExactPath("/usr/local/lib/hermes-agent", {
    kind: "directory",
    uid: 0,
    gid: 0,
    mode: 0o755,
  });
  for (const target of ["/usr/local/share", "/usr/local/share/uv", "/usr/local/share/uv/python"]) {
    await assertExactPath(target, { kind: "directory", uid: 0, gid: 0, mode: 0o755 });
  }
  await assertExactPath(HERMES_PYTHON_ROOT, { kind: "directory", uid: 0, gid: 0, mode: 0o755 });
  await assertExactPath(`${HERMES_PYTHON_ROOT}/bin/python3.11`, {
    kind: "file",
    uid: 0,
    gid: 0,
    mode: 0o755,
  });
  await assertExactPath(`${HERMES_VENV}/bin/python3`, {
    allowSymlinkTo: `${HERMES_PYTHON_ROOT}/bin/python3.11`,
  });

  const runtimeUid = process.getuid();
  const runtimeGid = process.getgid();
  for (const target of [
    "/home/orgo/maya-agent",
    "/home/orgo/maya-agent/secrets",
    "/home/orgo/maya-agent/runtime",
    "/home/orgo/maya-agent/state",
    "/home/orgo/maya-agent/state/receipts",
  ]) {
    await assertExactPath(target, {
      kind: "directory",
      uid: runtimeUid,
      gid: runtimeGid,
      mode: 0o700,
    });
  }
  await assertExactPath("/home/orgo/maya-agent/secrets/listener.env", {
    kind: "file",
    uid: runtimeUid,
    gid: runtimeGid,
    mode: 0o600,
  });

  await assertExactPath("/opt/pe-cc-agents", { kind: "directory", uid: 0, gid: 0, mode: 0o755 });
  await validateTree(RELEASE_DIR, {
    uid: 0,
    gid: 0,
    executableFiles: [
      `${RELEASE_DIR}/start-listener.sh`,
      `${RELEASE_DIR}/hermes-no-file-logging.py`,
    ],
  });
  await validateTree(HERMES_HOME, { uid: 0, gid: 0 });
  await verifyHermesIntegrityBeforeSelector();
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await verifyProductionTrustChain();
}
