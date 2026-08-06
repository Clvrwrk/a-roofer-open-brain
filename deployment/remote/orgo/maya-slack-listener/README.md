# Maya Composio Slack listener

This package runs Maya's Slack conversation loop on her existing Orgo computer.
Composio supplies Maya's Slack trigger and the only Gmail, Linear, and Slack
application tool/auth layer. Hermes plans one bounded action at a time; the outer
executor validates and executes each action with Maya's pinned accounts and returns
provider results for the next reasoning step. Maya responds when any human in any
channel accessible to her Slack app begins a message with `Maya` or an exact `@Maya`
mention.

The same single Supervisor-owned runtime also owns Maya's canonical mailbox cadence,
daily-through-annual loop materialization, and explicit Linear work claimant. It
checks only Maya's pinned Composio Gmail connection on UTC half-hour boundaries,
bootstraps at activation time, and deduplicates by day-scoped content, Gmail thread,
and Gmail message keys. The scheduled mailbox path is deterministic: it classifies
untrusted mail; creates or resolves one CODEX AGENT TEAM source; creates or repairs
one linked PE-CC-DevTeam accounting child; assigns both to Christopher in Agent
Review; records the CAT/PEC lineage idempotently in Command Center/Supabase before
analysis; sends the pinned admin Slack route a `[REVIEW]` or
`[BLOCKED]` notice; optionally sends one standard received acknowledgement to an
approved internal-domain sender; and then applies the reviewed Gmail filing plan.
Unknown provider outcomes remain ambiguous and are never retried automatically. Known
Google and Slack account-security notices are deterministically normalized into
owner-authorization checks, preventing the classifier from inventing account
deactivation or recovery work. Slack notices resolve the source to its human `CAT-*`
identifier and suppress internal UUIDs if that display lookup is
temporarily unavailable.
The scan excludes Gmail Sent mail and Maya's own sender address, and the acknowledgement
gate independently refuses Maya's own address. These layered guards prevent receipt
messages from becoming recursive accounting issues or replies.

`mailbox-cleanup.mjs` and `run-mailbox-cleanup.sh` provide a bounded one-shot pass over
the existing inbox. Cleanup deliberately disables sender acknowledgements so old mail
does not receive a late receipt. It uses the same per-message receipts and Linear source
markers as the scheduled executor.

Direct Slack requests are CAT-first too. Recurring loops create one CAT source and one
Agent Todo child per period. The claimant polls every five minutes and claims only
CAT-linked `[MAYA]` children explicitly placed in Agent Todo. Linear-work mode may
read Gmail, Slack, Linear, and scoped Command Center accounting views, and may add
Linear evidence; external sends and financial mutations are removed from that mode.
Results finish in Agent Review. The release enforces Maya attribution, mandatory
email CC to both `admin@cc.proexteriorsus.net` and `chussey@aia4.io`, exact account/team identity,
credential secrecy, hashed effect receipts, and an operator kill switch. Permanent
deletion, payment execution, credential disclosure, and access-control administration
are not exposed because they are not required for normal Maya work.

Security invariants:

- exact Composio user, receive account, send account, trigger, Slack workspace,
  and Maya bot values are pinned in the release; the OAuth account receives channel
  events and the bot-token account sends replies;
- the listener release and Hermes configuration are root-owned under `/opt`; the
  launcher verifies their complete ownership/mode/symlink trust chain, the pinned
  system executables, and Maya's writable runtime/state/secret paths before strictly
  reading the three allowed scoped credentials;
- all human authors and all accessible channel, private-channel, and multi-person
  channel types are accepted when the message addresses Maya;
- bot/self messages, subtypes, duplicates, and malformed scope fail closed;
- identity, deduplication, both oversight email CCs, approved acknowledgement domains,
  deterministic Gmail filing, and the Maya prefix are code; normal
  Slack destinations may be selected from channels accessible to Maya;
- an interrupted or failed send is `ambiguous` and is never retried automatically;
- receipts contain only hashes and provider IDs, never messages, prompts, replies,
  tokens, headers, or credentials;
- Gmail, Linear, and Slack effects are pinned to Maya's reviewed Composio user and
  connected accounts; every new work graph is pinned to a CODEX AGENT TEAM source,
  a linked PE-CC-DevTeam child, Christopher, and reviewed workflow states;
- Maya's named Command Center token grants accounting reads and evidence only; it
  carries no approval or financial-write authority. The raw token exists only in
  Orgo's owner-only `MAYA_COMMAND_CENTER_TOKEN` secret; Supabase stores only its
  SHA-256 digest in the server-only named-agent token registry;
- price work uses ABC `priceQty.uom`, `abc_invoice_lines.price_per_uom`, and
  `v_item_uom_map`; WIP/AR keeps billed receivables separate from unbilled work, and
  QuickBooks production remains read-only;
- Signal and every new third-party channel stay disabled until the third-party-agent-
  tool gate, signed ingress, identity/replay/dedupe review, kill switch, rollback, and
  human approval are complete;
- the mailbox cursor and per-message receipts are private local state; first start
  records the activation cursor without replaying historical email, then exactly one
  in-process timer schedules the next UTC half-hour occurrence;
- Hermes runs low-cost, tool-free, bounded one-shot planning turns; all external
  tools remain in the validated outer executor. Its
  root-owned `config.yaml` disables MCP and the installed build's otherwise
  auto-recovered `kanban` toolset, and startup re-evaluates the installed Hermes
  selector to require exactly zero enabled CLI toolsets;
- Hermes's unconditional cron initialization is satisfied by empty, root-owned
  `cron/` and `cron/output/` directories; the tool-free runtime cannot create or
  alter schedules or cron output;
- Hermes's unconditional one-shot session-directory initialization is satisfied
  by an empty, root-owned mode-`0755` `sessions/` directory. JSON session snapshots
  remain disabled and the runtime cannot create transcripts or alter prior state;
- Hermes's mandatory file-logging initialization is intercepted by the root-owned
  `hermes-no-file-logging.py` compatibility entrypoint before the pinned CLI is
  entered. The shim accepts only the exact one-shot provider/model invocation,
  replaces only `hermes_logging.setup_logging()` in that process, and leaves the
  empty root-owned mode-`0755` `logs/` tree immutable;
- the remainder of Hermes's unconditional home initialization tree
  (`logs/curator`, `memories`, `pairing`, `hooks`, `image_cache`, `audio_cache`,
  and `skills`) is pre-created empty as root-owned mode-`0755`; `maya-agent`
  can traverse these paths but cannot persist state, hooks, caches, or skills;
- structured journal events contain only reason codes and identifier hashes;
- rollback disables and confirms the reviewed Composio trigger first, then stops
  the runtime and quarantines its credentials while retaining ambiguous effects.

The service is installed disabled under Orgo's existing Supervisor process manager.
`autostart` and automatic start retries remain disabled. Activation requires a passed
Ringer review, the exact enabled Composio trigger, the owner-only three-credential
environment file with mode 0600, and Hermes configuration validation. Once started,
the listener remains online and serializes overlapping messages instead of dropping
them. Only the Supervisor definition is shipped; there is no systemd fallback.

`install-disabled.sh` builds a fresh root-owned release, rejects symlinks, normalizes
all release modes, hardens the pre-existing Hermes lock file, preserves any prior
release as a private rollback artifact, loads the Supervisor definition, and explicitly
leaves the program stopped. It accepts source only from a root-owned mode-0700 staging
directory and never creates credentials or enables the Composio trigger.
