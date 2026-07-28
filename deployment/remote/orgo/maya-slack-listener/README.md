# Maya Composio production worker

This package is the installed-disabled PEC-78 production worker for Maya's existing
Orgo computer. Command Center accepts a signed Composio V3 webhook, encrypts the
minimized event, and stores it behind the PEC-78 database authority plane. The Orgo
worker obtains DPoP-bound short-lived authorization, claims one encrypted event,
generates one tool-free Hermes reply, reserves and uniquely authorizes the exact
Slack effect, and sends only through Maya's pinned Composio connected account.

`listener.mjs` is the quarantined validation prototype. It is retained only for
forensic and rollback evidence; Supervisor launches `production-worker.mjs` and
the production path never uses Composio WebSocket `subscribe()`.

Security invariants:

- exact Composio user/account/trigger and Slack workspace/channel/bot/owner values
  are verified by the signed webhook boundary and database source binding;
- the listener release and Hermes configuration are root-owned under `/opt`; the
  launcher verifies their complete ownership/mode/symlink trust chain, the pinned
  system executables, and Maya's writable runtime/state/secret paths before sourcing
  any credential;
- only human-authored, owner-authored, addressed messages are accepted;
- bot/self messages, subtypes, attachments, duplicates, and scope mismatches fail
  closed;
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
- the durable validation authorization is bound to the exact build, registry,
  runtime instance, source, principal fence, and one fresh owner event;
- structured journal events contain only reason codes and identifier hashes;
- rollback disables and confirms the reviewed new Composio trigger first, fences
  database authority and active leases, stops/quarantines the worker credentials,
  and disables the dedicated inference key while retaining ambiguous effects.

The service is installed disabled under Orgo's existing Supervisor process manager.
`autostart` and automatic start retries remain disabled; unexpected restart is
bounded by the database-consumed authorization and lease/effect state. Activation
requires a passed Ringer review, creation of the exact disabled Composio trigger,
completion of the owner-only two-credential environment file with mode 0600, Hermes config
validation, and an explicit controlled test. Only the Supervisor definition is shipped;
there is no systemd fallback that could accidentally restart this one-shot listener.

`install-disabled.sh` builds a fresh root-owned release, rejects symlinks, normalizes
all release modes, hardens the pre-existing Hermes lock file, preserves any prior
release as a private rollback artifact, loads the Supervisor definition, and explicitly
leaves the program stopped. It accepts source only from a root-owned mode-0700 staging
directory and never creates credentials or enables the Composio trigger.
