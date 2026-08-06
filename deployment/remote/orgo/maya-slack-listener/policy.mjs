export const APPROVED = Object.freeze({
  composioUserId: "maya-chen",
  receiveConnectedAccountId: "ca_X9dQyRDSS0sa",
  sendConnectedAccountId: "ca_V3cdfxA1veTS",
  gmailConnectedAccountId: "ca_lwUJ8ZzTHrr5",
  linearConnectedAccountId: "ca_CrdIUc0UNO1x",
  triggerId: "ti_G_lnPrrKPhWj",
  triggerUuid: "32f67255-b604-419b-8f86-85b92c9dbe30",
  teamId: "T0B8QEGPVQW",
  mayaBotUserId: "U0BD0Q0H55G",
  ownerSlackUserId: "U0B8SGJJZLJ",
  ownerSlackChannelId: "C0BD7L43PC2",
  linearTeamId: "f7fd2005-aa04-4de7-a17d-ddae528b5e4a",
  linearReviewStateId: "3e03cd48-d3c8-4e63-867c-734387f39efb",
  linearReviewerId: "002bc1e6-c102-42f7-86cc-45b7c499dae3",
});

export const REQUIRED_EMAIL_CC = Object.freeze([
  "admin@cc.proexteriorsus.net",
  "chussey@aia4.io",
]);

export const ACKNOWLEDGEMENT_DOMAINS = Object.freeze([
  "cc.proexteriorsus.net",
  "proexteriorsus.com",
  "aia4.io",
  "cleverwork.io",
]);

export const GMAIL_TOOL_VERSION = "20260721_00";
export const LINEAR_TOOL_VERSION = "20260724_00";
export const MAILBOX_INTERVAL_MS = 30 * 60 * 1_000;
export const MAILBOX_PAGE_SIZE = 100;
export const MAILBOX_MAX_PAGES = 5;
export const MAILBOX_CLEANUP_MAX_PAGES = 5;

export const AGENT_HOME = "/home/orgo/maya-agent";
export const RELEASE_DIR = "/opt/pe-cc-agents/maya-slack-listener";
export const HERMES_HOME = "/opt/pe-cc-agents/maya-hermes-home";
export const HERMES_BIN = "/usr/local/lib/hermes-agent/venv/bin/python3";
export const HERMES_ENTRYPOINT = `${RELEASE_DIR}/hermes-no-file-logging.py`;
export const HERMES_MODEL = "google/gemini-3.1-flash-lite";
export const HERMES_PATH = "/usr/local/bin:/usr/bin:/bin";
export const MAYA_RUNTIME_DIR = "/home/orgo/maya-agent/runtime";
export const MAYA_RECEIPT_DIR = "/home/orgo/maya-agent/state/receipts";
export const MAYA_MAILBOX_STATE_DIR = "/home/orgo/maya-agent/state/mailbox";
