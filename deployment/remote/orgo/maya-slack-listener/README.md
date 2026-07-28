# Maya Composio Slack listener

This package runs Maya's Slack conversation loop on her existing Orgo computer.
Composio supplies both the Slack trigger and send tool, while Hermes produces a
short tool-free answer. Maya responds when any human in any channel accessible to
her Slack app begins a message with `Maya` or an exact `@Maya` mention.

Security invariants:

- exact Composio user/account/trigger, Slack workspace, and Maya bot values are
  pinned in the release;
- the listener release and Hermes configuration are root-owned under `/opt`; the
  launcher verifies their complete ownership/mode/symlink trust chain, the pinned
  system executables, and Maya's writable runtime/state/secret paths before strictly
  reading the two allowed credentials;
- all human authors and all accessible channel, private-channel, and multi-person
  channel types are accepted when the message addresses Maya;
- bot/self messages, subtypes, duplicates, and malformed scope fail closed;
- routing, destination, thread binding, deduplication, and the Maya prefix are code;
- an interrupted or failed send is `ambiguous` and is never retried automatically;
- receipts contain only hashes and provider IDs, never messages, prompts, replies,
  tokens, headers, or credentials;
- Hermes runs a single low-cost, tool-free, bounded one-shot response; its
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
Ringer review, the exact enabled Composio trigger, the owner-only two-credential
environment file with mode 0600, and Hermes configuration validation. Once started,
the listener remains online and serializes overlapping messages instead of dropping
them. Only the Supervisor definition is shipped; there is no systemd fallback.

`install-disabled.sh` builds a fresh root-owned release, rejects symlinks, normalizes
all release modes, hardens the pre-existing Hermes lock file, preserves any prior
release as a private rollback artifact, loads the Supervisor definition, and explicitly
leaves the program stopped. It accepts source only from a root-owned mode-0700 staging
directory and never creates credentials or enables the Composio trigger.
