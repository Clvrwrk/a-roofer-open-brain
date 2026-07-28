import assert from "node:assert/strict";
import test from "node:test";
import { executeSlackSendOnce } from "../send-once.mjs";

function harness(result) {
  const calls = [];
  return {
    calls,
    composio: { tools: { execute: async () => result } },
    store: {
      async confirm(name, providerMessageId, model) {
        calls.push(["confirm", name, providerMessageId, model]);
      },
      async ambiguous(name, errorClass) {
        calls.push(["ambiguous", name, errorClass]);
      },
    },
  };
}

async function execute(state) {
  return executeSlackSendOnce({
    composio: state.composio,
    userId: "maya-chen",
    connectedAccountId: "ca_fixture",
    arguments_: { channel: "C0123456789", markdown_text: "[NA-5][MAYA] - hi" },
    store: state.store,
    claimName: "receipt.json",
    abortSignal: new AbortController().signal,
  });
}

test("confirms only a syntactically valid Slack provider timestamp", async () => {
  const state = harness({ successful: true, data: { ok: true, ts: "1785160001.000002" } });
  assert.deepEqual(await execute(state), {
    state: "confirmed",
    providerMessageId: "1785160001.000002",
  });
  assert.equal(state.calls[0][0], "confirm");
});

test("records malformed or missing provider timestamps as ambiguous", async () => {
  for (const ts of [undefined, true, {}, "1785160001", "1785160001.2"]) {
    const state = harness({ successful: true, data: { ok: true, ts } });
    assert.deepEqual(await execute(state), { state: "ambiguous", errorClass: "Error" });
    assert.deepEqual(state.calls, [["ambiguous", "receipt.json", "Error"]]);
  }
});
