export const APPROVED = Object.freeze({
  composioUserId: "maya-chen",
  connectedAccountId: "ca_X9dQyRDSS0sa",
  triggerId: "ti_G_lnPrrKPhWj",
  triggerUuid: "32f67255-b604-419b-8f86-85b92c9dbe30",
  teamId: "T0B8QEGPVQW",
  mayaBotUserId: "U0BD0Q0H55G",
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
