export const APPROVED = Object.freeze({
  composioUserId: "maya-chen",
  connectedAccountId: "ca_X9dQyRDSS0sa",
  triggerId: "ti_5Zoxig5EIJmY",
  triggerUuid: "1dbd2dcc-d37c-4b14-92ac-ffef8aadc974",
  teamId: "T0B8QEGPVQW",
  channelId: "C0BD7L43PC2",
  mayaBotUserId: "U0BD0Q0H55G",
  ownerUserId: "U0B8SGJJZLJ",
});

export const AGENT_HOME = "/home/orgo/maya-agent";
export const RELEASE_DIR = "/opt/pe-cc-agents/maya-slack-listener";
export const HERMES_HOME = "/opt/pe-cc-agents/maya-hermes-home";
export const HERMES_BIN = "/usr/local/lib/hermes-agent/venv/bin/python3";
export const HERMES_ENTRYPOINT = `${RELEASE_DIR}/hermes-no-file-logging.py`;
export const HERMES_MODEL = "google/gemini-3.1-flash-lite";
export const HERMES_PATH = "/usr/local/bin:/usr/bin:/bin";
export const MAYA_RUNTIME_DIR = "/home/orgo/maya-agent/runtime";
export const MAYA_RECEIPT_DIR = "/home/orgo/maya-agent/state/receipts";
export const VALIDATION_GATE = "pec78-one-controlled-slack-event";
