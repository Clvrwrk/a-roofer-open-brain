import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { COMMAND_CENTER_ORIGIN, CONTRACT_VERSION, createPec78Client } from "../cc-client.mjs";

test("DPoP client obtains a capability token then binds the exact operation", async () => {
  const pair = generateKeyPairSync("ed25519");
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/token")) return new Response(JSON.stringify({ tokenType: "DPoP", accessToken: "fixture.access.token" }), { status: 200 });
    return new Response(JSON.stringify({ status: "empty" }), { status: 200 });
  };
  const client = createPec78Client({
    privateJwk: pair.privateKey.export({ format: "jwk" }),
    credentialId: "78000000-0000-4000-8000-000000000101",
    runtimeInstanceId: "78000000-0000-4000-8000-000000000102",
    fetchImpl,
  });
  const result = await client.request("slack.receive.christopher", "/api/agent/runtime/v1/events/slack/claim", {}, "claim-fixture");
  assert.equal(result.status, "empty");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, `${COMMAND_CENTER_ORIGIN}/api/agent/runtime/v1/token`);
  assert.equal(calls[1].options.headers["x-pec78-contract"], CONTRACT_VERSION);
  assert.equal(calls[1].options.headers.authorization, "DPoP fixture.access.token");
  assert.equal(calls[1].options.headers["idempotency-key"], "claim-fixture");
  assert.match(calls[0].options.headers.dpop, /^[^.]+\.[^.]+\.[^.]+$/);
  assert.match(calls[1].options.headers.dpop, /^[^.]+\.[^.]+\.[^.]+$/);
  assert.equal(calls[0].options.redirect, "error");
});

test("DPoP client rejects malformed runtime identities and keys", () => {
  assert.throws(() => createPec78Client({ privateJwk: {}, credentialId: "bad", runtimeInstanceId: "bad" }), /private key/);
});
