import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const loader = new URL("../load-private-jwk.mjs", import.meta.url).pathname;
const pair = generateKeyPairSync("ed25519");
const valid = JSON.stringify(pair.privateKey.export({ format: "jwk" }));

async function run(value, { duplicate = false } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "pec78-jwk-loader-"));
  const envFile = path.join(dir, "listener.env");
  const lines = ["COMPOSIO_API_KEY=fixture", "OPENROUTER_API_KEY=fixture", `PEC78_MAYA_PRIVATE_JWK=${value}`];
  if (duplicate) lines.push(`PEC78_MAYA_PRIVATE_JWK=${value}`);
  lines.push("PEC78_CREDENTIAL_ID=00000000-0000-4000-8000-000000000001", "PEC78_RUNTIME_INSTANCE_ID=00000000-0000-4000-8000-000000000002", "");
  await writeFile(envFile, lines.join("\n"), { mode: 0o600 });
  await chmod(envFile, 0o600);
  return spawnSync(process.execPath, [loader, envFile], { encoding: "utf8" });
}

test("loads the incident-form unquoted compact JWK byte-for-byte", async () => {
  const result = await run(valid);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, valid);
  assert.equal(result.stderr, "");
});

test("rejects otherwise-valid non-compact JWK JSON without output", async () => {
  const expanded = JSON.stringify(JSON.parse(valid), null, 2).replaceAll("\n", " ");
  const result = await run(expanded);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("fails silently for malformed, inconsistent, duplicate, and broadened JWKs", async () => {
  const parsed = JSON.parse(valid);
  const wrongPair = generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" });
  const cases = [
    "{bad-json",
    "null",
    "[]",
    JSON.stringify({ ...parsed, d: "!" }),
    JSON.stringify({ ...parsed, x: wrongPair.x }),
    JSON.stringify({ ...parsed, extra: "forbidden" }),
    JSON.stringify({ ...parsed, crv: "X25519" }),
  ];
  for (const value of cases) {
    const result = await run(value);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  }
  const duplicate = await run(valid, { duplicate: true });
  assert.equal(duplicate.status, 1);
  assert.equal(duplicate.stdout, "");
  assert.equal(duplicate.stderr, "");
});
