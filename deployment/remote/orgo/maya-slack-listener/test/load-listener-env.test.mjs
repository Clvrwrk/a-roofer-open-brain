import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const shellLoader = new URL("../load-listener-env.sh", import.meta.url).pathname;
const jwkLoader = new URL("../load-private-jwk.mjs", import.meta.url).pathname;

async function fixture(jwk) {
  const dir = await mkdtemp(path.join(tmpdir(), "pec78-listener-env-"));
  const envFile = path.join(dir, "listener.env");
  const expectedFile = path.join(dir, "expected.json");
  const markerFile = path.join(dir, "worker-ran");
  await writeFile(envFile, [
    "COMPOSIO_API_KEY=fixture-composio",
    "OPENROUTER_API_KEY=fixture-openrouter",
    `PEC78_MAYA_PRIVATE_JWK=${jwk}`,
    "PEC78_CREDENTIAL_ID=00000000-0000-4000-8000-000000000001",
    "PEC78_RUNTIME_INSTANCE_ID=00000000-0000-4000-8000-000000000002",
    "",
  ].join("\n"), { mode: 0o600 });
  await chmod(envFile, 0o600);
  await writeFile(expectedFile, jwk, { mode: 0o600 });
  return { envFile, expectedFile, markerFile };
}

function run({ envFile, expectedFile, markerFile }) {
  const program = [
    "set -euo pipefail",
    '. "$1" "$2" "$3" "$4"',
    `"$4" -e 'const fs=require("fs"); const expected=fs.readFileSync(process.argv[1],"utf8"); if(process.env.PEC78_MAYA_PRIVATE_JWK!==expected) process.exit(9); fs.writeFileSync(process.argv[2],"ok")' "$5" "$6"`,
  ].join("\n");
  return spawnSync("/bin/bash", ["-c", program, "pec78-test", shellLoader, envFile, jwkLoader, process.execPath, expectedFile, markerFile], { encoding: "utf8" });
}

test("the real Bash source-and-override boundary preserves the incident-form JWK", async () => {
  const valid = JSON.stringify(generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" }));
  const files = await fixture(valid);
  const result = run(files);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
  assert.equal(await readFile(files.markerFile, "utf8"), "ok");
});

test("the real Bash boundary never invokes the worker for a rejected JWK", async () => {
  const invalid = JSON.stringify({ kty: "OKP", crv: "Ed25519", d: "do-not-log-fixture", x: "invalid" });
  const files = await fixture(invalid);
  const result = run(files);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "invalid DPoP credential JSON\n");
  assert.equal(result.stderr.includes("do-not-log-fixture"), false);
  await assert.rejects(readFile(files.markerFile, "utf8"), /ENOENT/);
});
