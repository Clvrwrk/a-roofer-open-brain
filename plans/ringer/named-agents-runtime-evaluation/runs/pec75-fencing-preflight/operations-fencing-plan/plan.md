## Verdict

**PASS** as an operations preflight for one separately approved, bounded production fencing run. This verdict approves the runbook, not execution and not any PID inferred from the sanitized evidence. The executor must build a closed host-local manifest immediately before action and an independent reviewer must verify it against a current, unexpired approval from Christopher Hussey. No network access, service activation, mailbox/Slack connection, deployment, or other production effect is authorized by this plan.

PASS requires every predicate, rollback rehearsal, protected baseline, and continuous 10-minute observation below. Ambiguity fails closed. The sanitized inputs contain no live PID, command value, job body, or store path sufficient for blind execution; none may be guessed.

## Exact Targets

The closed manifest must identify each process by the complete tuple `(host, PID, /proc start time, UID, PPID, executable identity, exact argv hash, complete relevant ancestry)`. PID, name, substring, or age alone is insufficient.

- Disable only `roofing-ops-slack-listeners.service`, provided it is loaded, enabled, inactive/dead, and has `MainPID=0`. Do not use `--now`, mask, stop, start, reload, or alter its definition.
- Terminate exactly eight PID-1-parented persona wrappers—Alex, Casey, Jordan, Maya, Lena, Rowan, Sam, and Ops Conductor—and exactly one direct `slack-socket-runtime.mjs` child of each wrapper. Require a unique one-to-one persona graph and exact identities.
- In Alex and Ops Conductor only, create root-only private rollback artifacts and change exactly four stable job records from `enabled: true` to `enabled: false`: Alex's one currently enabled job and Ops Conductor's three currently enabled jobs. Only their two `jobs.json` stores are mutable.
- Treat the other six persona stores as read-only hash negative controls. They must remain at zero enabled jobs and must not be staged, renamed, rewritten, chmodded, or otherwise touched.
- Terminate only the single stuck `gateway restart` leaf descendant of an inventoried Hermes dashboard. The dashboard, its ancestors, and siblings are not targets.
- Terminate only the single stuck Kasm `hermes cron list --all` leaf. Container init, supervisor, workload ancestors, siblings, platform, and containers are not targets.

Forbid wildcards, `pkill`, `killall`, process-group/cgroup/container signaling, recursive descendant signaling, and reused or changed PIDs. A target already exited is quiesced; it does not permit matching a replacement.

## Protected Exclusions

The manifest must carry and recheck a denylist covering:

- Kasm platform, services, sessions, supervisors, containers, container init, and the Hermes/Chrome workload, except the exact cron-list leaf.
- All five Hermes dashboards, their sockets, ancestors, and siblings, except the exact gateway-restart leaf.
- ABC sync timer/service, processes, data, state, and independent schedule.
- Command Center deployment, processes, queues, state, data, and health surface.
- All profiles and persona metadata; the six non-target `jobs.json` stores; every file other than the two expressly mutable stores.
- Credentials, tokens, cookies, environments, browser sessions, secret stores, logs, job bodies, messages, mailboxes, customer data, Slack/email connections, webhooks, cursors, queues, sends, replies, and drafts.
- Every other unit, timer, process, scheduler, file, container, runtime, and endpoint.

Never print environment contents, argv values, JSON/job values, rollback bytes, logs, messages, or secrets. Permitted evidence is limited to approved labels, identity metadata, counts, timestamps, file ownership/mode, hashes, boolean transition counts, and pass/fail results.

## Preflight Evidence

1. Acquire a host-local exclusive fencing lock. Record a UTC run ID, host identity, operator, independent reviewer, approval reference, explicit future expiry, rollback owner, evidence IDs, and predecessor IDs. Abort if another deployment or fencing run is active.
2. Inspect the target unit locally and hash its installed definition. Require the exact enabled/inactive/dead/PID-less state.
3. Resolve the eight-wrapper/eight-child graph twice at least five seconds apart. Require stable identity tuples, eight unique persona mappings, direct child relationships, and no additional or unclassified child.
4. Resolve the gateway and Kasm leaves with complete ancestry twice at least five seconds apart. Require unchanged identities, approved minimum ages, and proof that each is a leaf—not a dashboard, shared runtime, supervisor, ancestor, or container init.
5. Resolve all eight stores through the installed persona-home mapping without following symlinks. Require regular files, expected owner/mode, valid JSON/schema, unique stable job IDs, boolean `enabled` fields, and the exact enabled distribution: Alex 1, Ops Conductor 3, other six 0. Capture hashes and file identity metadata for all eight.
6. For Alex and Ops Conductor only, create a root-owned mode `0700` per-run directory and one root-owned mode `0600` private rollback artifact per mutable store. Prove same-run provenance, byte/hash equality to its source, parse validity without emission, durable file/directory `fsync`, and an atomic restore rehearsal using disposable private copies.
7. Build private candidates beside only the two mutable stores. Preserve required owner/mode; parse them; compare normalized trees by stable job ID; and prove exactly four `true`-to-`false` boolean changes with every other value, ID, record, schema property, and ordering requirement unchanged.
8. Baseline local metadata/hashes for the protected Kasm/container workload, dashboards, ABC sync, Command Center, profiles, and six negative-control stores. Do not connect to any socket or endpoint.
9. Seal the manifest and produce a **value-free receipt**. The receipt may hold manifest/artifact hashes and classification but never the contents of a **private rollback artifact**. Immediately before mutation, the reviewer must revalidate every predicate, denylist intersection, restore rehearsal, and approval scope/expiry.

## Action Sequence

Hold the exclusive lock throughout. Immediately before every operation, revalidate the complete unit, file, or process identity; stop on drift.

1. Disable only the target inactive unit without `--now`. Verify it is disabled, inactive/dead, and PID-less.
2. Send SIGTERM individually to the eight exact wrappers. Revalidate and send SIGTERM individually to each still-live exact direct Slack child. Wait up to 60 seconds while sampling identity and exit state.
3. For each survivor, revalidate the full tuple, send one second SIGTERM, and wait up to 30 seconds. Only an individually revalidated survivor may then receive SIGKILL. Never signal a group or changed/reused PID.
4. For Alex and Ops Conductor only, revalidate source device/inode/hash, reparse the candidate, atomically rename on the same filesystem, `fsync` file and directory, reparse the installed file, and prove the exact four-field semantic delta and preserved owner/mode. Do not replace the six controls.
5. Revalidate the exact gateway-restart leaf; send SIGTERM; wait 60 seconds; revalidate and send a second SIGTERM if needed; wait 30 seconds; only then SIGKILL the same revalidated survivor if necessary.
6. Apply the identical TERM-before-KILL, leaf-only sequence to the exact Kasm cron-list process.
7. After the last mutation, start a monotonic-clock **10 minutes** observation of at least 600 continuous seconds. Sample all target and exclusion predicates every 30 seconds or less, including both endpoints. A mutation, lock loss, clock discontinuity, or gap over 30 seconds invalidates and restarts the full window. During observation, do not start/restart a runtime, invoke Hermes commands, connect Slack/email, access a mailbox, query an application endpoint, or exercise an effect.

## Rollback

Before action, prove both mutable stores can be restored from their run-specific root-only private rollback artifacts through private same-directory staging, JSON validation, owner/group/mode restoration, atomic same-filesystem rename, and file/directory `fsync`; the restored disposable copy must match the original source hash.

If either store replacement or postcheck fails, stop forward action and restore every store already replaced. Revalidate the artifact before staging and require the installed store to parse and match its original hash. The six negative controls have no rollback path because changing them is forbidden.

To reverse unit disablement, enable only the same unit and confirm it remains inactive/dead and PID-less; never start it. Do not reconstruct commands from `/proc` or relaunch listeners, gateway commands, or the Kasm command. Any process relaunch needs a new explicit authorization because it could reconnect Slack or execute jobs.

Rollback must not affect Kasm, dashboards, ABC sync, Command Center, profiles, Slack/email state, or any other protected target. If a safe rollback predicate cannot be proven, stop and escalate without improvising. Retain and dispose of private artifacts only under the approved root-only policy; never emit their contents.

## Postchecks

PASS requires every sample throughout the uninterrupted 10 minutes (at least 600 seconds), plus a final sample at or after start + 600 seconds, to show:

- The unit remains disabled, inactive/dead, and PID-less.
- All 16 captured wrapper/runtime identities are absent; no new exact wrapper/child match or associated listener socket appears. Socket inspection is passive and local only.
- Alex and Ops Conductor stores parse, exactly the four approved jobs are disabled, and no other semantic or metadata invariant changed.
- The other six stores retain baseline hashes, ownership, modes, stable-ID sets, disabled states, and device/inode where applicable, with no rewrite.
- The exact gateway and Kasm leaves remain absent with no restart under their complete command-and-ancestry predicates.
- Kasm/container workload, every dashboard, ABC sync, Command Center, and protected profiles match baseline. Independently scheduled ABC activity is acceptable only when positively attributable to its protected unit.
- No listener/job restart, job re-enable, protected-control drift, Slack/email connection attempt, or outbound effect occurred.

The value-free receipt records only run/manifest IDs and hashes, private-artifact hashes/classification, unit transition, per-target signal outcome, before/after enabled counts, restore-rehearsal result, observation timestamps/duration, negative-control results, and final verdict. It contains no argv, JSON/job value, secret, log, or message content. This fence does not authorize PEC-76 or activation.

## Stop Conditions

Abort before mutation, or stop at the next safe boundary and perform only proven file/unit rollback, if:

- Approval is absent, expired, superseded, does not match the sealed manifest, lacks rollback ownership/evidence/predecessor scope, or remains read-only-only.
- Counts are not exactly 8 wrappers, 8 direct children, 2 mutable stores, 4 enabled target jobs, 6 negative-control stores, 1 gateway leaf, and 1 Kasm leaf.
- The unit is not exactly loaded, enabled, inactive/dead, and PID-less.
- Host, PID/start time, UID, PPID, ancestry, executable identity, argv hash, persona mapping, unit definition, file identity/hash, owner/mode, schema, or stable-ID set changes between capture and use.
- A target intersects the denylist, is selected by name/PID/substring alone, is a reused PID, or is an ancestor, supervisor, dashboard, shared runtime, or container init.
- Any action would touch a non-target store or change more than the four approved booleans; JSON validation, exact candidate comparison, atomic replacement, ownership preservation, or `fsync` fails.
- Either private rollback artifact is missing, emitted, mispermissioned, unverified, unparsable, unable to reproduce the original hash, or fails restore rehearsal.
- A command could expose a credential, environment, argv value, JSON/job value, artifact byte, log, message, or customer datum.
- SIGKILL is proposed before both SIGTERM waits and fresh per-PID validation, or group/container/recursive signaling is required.
- A target listener, job, gateway command, or Kasm command restarts; a job is re-enabled; a protected negative control changes; or the observation has a gap over 30 seconds, clock discontinuity, mutation, invalid endpoint sample, or duration below 600 continuous seconds.
- The lock is lost, another operator/deployment begins, or any observation cannot be explained.

On stop, do not broaden discovery, kill adjacent processes, reconnect anything, or clean up additional files. Preserve only the approved value-free receipt and classified private artifacts; report the failed predicate to the sole human approver and leave every non-target system untouched.
