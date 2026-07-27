## Verdict

**PASS — the corrected fencing action is security-safe only when executed exactly under this fail-closed contract and a separate current, unexpired human approval.** The previous blocker is resolved: rollback artifacts and candidates are created for Alex and Ops Conductor only, only those two stores may be atomically replaced, and the other six stores remain read-only hash negative controls. The action also requires exact PID/start-time/executable/argv-hash/ancestry predicates, root-only private rollback artifacts whose contents never enter output, value-free receipts, JSON validation before atomic replacement, SIGTERM before bounded escalation, immutable exclusions, a continuous 600-second zero-restart watch, and explicit stop conditions.

This PASS approves the action design, not any uncaptured live PID or command identity and not production execution by itself. Sanitized evidence intentionally contains no PID or argv values. Immediately before action, the operator and independent reviewer must sign the closed live manifest and verify that Christopher Hussey's durable approval names this action, its systems and effects, evidence and predecessor IDs, rollback owner, and an explicit expiry that is still in the future. Missing, ambiguous, read-only-only, superseded, or expired approval is a hard stop.

This review used only local sanitized evidence, the three local inventory artifacts, and the sibling candidate plan. It accessed no network and mutated no system. This file contains no secret, environment, message, job-body, customer, endpoint, or credential value.

## Exact Targets

The executable action must use a signed, immutable manifest produced on the legacy host immediately before execution. A process identity is the tuple `(host, PID, /proc start time, UID, PPID, executable identity, exact argv hash, complete relevant ancestry)`; PID or process name alone is never sufficient.

- One unit only: `roofing-ops-slack-listeners.service`, and only while loaded, enabled, inactive/dead, and `MainPID=0`. The sole allowed unit operation is disable without `--now`.
- Exactly eight PID-1-parented persona wrappers, one for each inventoried persona, each matched by its approved executable identity and exact persona-specific argv hash, with no ambiguous or additional child.
- Exactly eight direct `slack-socket-runtime.mjs` children, one under each approved wrapper, each matched by PID/start time, executable identity, exact argv hash, and direct parent identity.
- Exactly four stable Roofing-Ops job records: one enabled boolean in Alex's store and three enabled booleans in Ops Conductor's store. Only those four `enabled: true` fields may become `false`.
- Exactly two mutable JSON files: the Alex and Ops Conductor `jobs.json` stores. The other six stores are read-only negative controls and must not be staged, renamed, rewritten, chmodded, or touched.
- Exactly one old `gateway restart` leaf, matched by exact PID/start time/executable/argv hash and complete ancestry beneath an inventoried dashboard, while excluding the dashboard and every ancestor and sibling.
- Exactly one old Kasm `hermes cron list --all` leaf, matched by the same exact identity tuple and workload ancestry, while excluding its container init, supervisor, ancestors, and siblings.

Wildcards, name-only matches, regex-only matches, `pkill`, `killall`, process groups, recursive descendant signaling, cgroup/container actions, and a PID whose start time has changed are forbidden. An exited PID is success/already quiesced, not permission to signal a reused PID.

## Protected Exclusions

The closed manifest must contain a denylist, resolved before and rechecked after every action:

- Kasm services, supervisors, sessions, containers, container init, and the Hermes/Chrome workload, except the single exact stuck leaf.
- All five Hermes dashboards, sockets, ancestors, and siblings, except the single exact stuck gateway leaf.
- The independent ABC sync timer/service, its processes, state, data, and normal independently scheduled execution.
- Command Center processes, deployment, queues, state, data, and health surface.
- The six non-target Hermes cron stores and every profile/persona file other than the two target stores.
- Slack and email connections, provider APIs, webhooks, mailbox cursors, messages, sends, replies, drafts, and delivery queues.
- Credentials, process environments, tokens, cookies, browser sessions, secret stores, job bodies, logs, customer data, and historical message/receipt content.
- Every other unit, timer, process, scheduler, file, container, endpoint, and runtime.

No command may print `/proc/*/environ`, JSON bodies, argv text containing values, environment files, logs, messages, or backup bytes. Evidence may contain approved labels, paths, ownership/mode, counts, timestamps, hashes, PID identity metadata, and boolean before/after counts only.

## Preflight Evidence

Before mutation, the executor must acquire a host-local exclusive lock; record host identity, UTC run ID, approval reference, operator, and reviewer; and stop if another deployment or fencing action is active.

1. Resolve the unit properties and hash its installed definition without sourcing environment files.
2. Resolve exactly the 8-wrapper/8-child graph twice at least five seconds apart. Require exact counts, unique persona mapping, UID, PPID, start time, executable identity, argv hash, and unchanged identity. Reject unclassified children.
3. Resolve the gateway and Kasm leaf identities and complete ancestry twice. Prove each is a leaf, old enough under the approved threshold, and not an ancestor, supervisor, dashboard, container-init, or shared runtime.
4. Resolve all eight stores from the installed persona-home mapping without following symlinks. Require regular files, expected owner/mode, unique stable job IDs, valid schema, and boolean `enabled`. Require the observed distribution of four enabled Roofing-Ops jobs. Hash all eight as negative-control evidence.
5. Classify only Alex and Ops Conductor as mutable. Create rollback artifacts only for those two sources in a root-owned `0700` run directory, with each artifact root-owned and mode `0600`. These are classified private rollback artifacts, not value-free receipts: their bytes may contain original JSON but must never appear in output, logs, receipts, uploads, or reviewer-visible evidence. Require same-run provenance, byte/hash equivalence, successful JSON parsing without emission, `fsync`, and a rehearsed atomic restore using disposable copies.
6. Create candidates beside only the two mutable sources, with private mode and correct final owner/mode. Parse before use. Compare normalized trees by stable job ID and require that exactly four booleans change from true to false and every other value, record, order requirement, ID set, and schema invariant remains unchanged.
7. Establish negative-control baselines for Kasm/container identities, dashboards and listeners, ABC sync, Command Center, the six read-only stores, and protected profile metadata/hashes. Collection is local metadata inspection only and must not connect to a socket or endpoint.
8. Produce a value-free receipt and closed manifest hash. Record the durable approval's identifier, authorized scope, approval time, explicit expiry, rollback owner, evidence IDs, and predecessor IDs without recording secret values. Immediately before the first mutation, the independent reviewer must confirm every exact predicate, every denylisted exclusion, both private restore rehearsals, and that the approval is authentic, applicable to this exact manifest, unsuperseded, and unexpired. Record only value-free pass/fail facts and timestamps; any approval without an explicit future expiry is invalid.

Any absence, mismatch, ambiguity, secret-bearing output, or inability to meet the backup classification is a hard stop.

## Action Sequence

Execute only under the exclusive lock. Immediately before each operation, revalidate the complete unit, PID, ancestry, or file identity predicate. Drift means stop.

1. Disable only the inactive target unit, without starting, stopping, masking, reloading, or altering another unit. Confirm disabled, inactive/dead, and PID-less.
2. Revalidate and send SIGTERM individually to the eight wrappers. Then revalidate and send SIGTERM individually to each still-live direct Slack child. Wait a bounded 60 seconds while sampling identities.
3. For each survivor, revalidate the full identity, send one further SIGTERM, and wait a bounded 30 seconds. Only then may an individually revalidated survivor receive SIGKILL. Never signal a group, descendant set, container, or changed/reused PID.
4. For Alex and Ops Conductor only, revalidate source device/inode/hash, parse the already validated candidate again, atomically rename it over the source on the same filesystem, `fsync` file and directory, reparse, and prove exact four-field semantic scope plus owner/mode. Do not replace the other six stores.
5. Revalidate the exact gateway leaf, send SIGTERM, wait 60 seconds, revalidate, send a second SIGTERM if needed, wait 30 seconds, and only then use SIGKILL on the same revalidated leaf if it survives.
6. Apply the identical bounded leaf-only sequence to the exact Kasm cron-list command.
7. Begin a **10 minutes (at least 600 continuous seconds)** observation window immediately after the last mutation, using a monotonic clock. Record value-free start, sample, and end timestamps; sample every 30 seconds or less, including at both endpoints. Any sampling gap over 30 seconds, clock discontinuity, new mutation, unexplained state, or loss of the lock invalidates and resets the full 600-second window. During the window, do not start/restart any runtime, invoke Hermes cron/gateway commands, connect Slack/email, query an application endpoint, send a message, access a mailbox, or exercise an effect.

## Rollback

Before action, prove each of the two mutable stores can be restored from its run-specific root-only private rollback artifact by private same-directory staging, parse validation, owner/group/mode restoration, atomic rename, file/directory `fsync`, and equality with the captured source hash. Retain rollback artifacts under the approved access and disposal policy until closure; receipts expose hashes and state counts only.

If either JSON replacement or its postcheck fails, stop all forward action and restore every store already replaced. Revalidate the rollback artifact before staging and require the restored source hash to equal its original hash. The six negative-control stores must never need rollback because they must never be changed.

If unit disablement must be reversed, enable only the same unit and verify it remains inactive/dead with no PID. Never start it. Do not reconstruct a command from `/proc` or relaunch terminated listeners, gateway commands, or the Kasm command: relaunch could reconnect Slack, run jobs, or generate effects. Process relaunch requires a new explicit authorization and its own effect-boundary review.

No rollback operation may restart or change Kasm, a dashboard, ABC sync, Command Center, Slack/email state, or any protected process. If a safe restore predicate cannot be proven, stop and escalate rather than improvise.

## Postchecks

For **10 minutes—at least 600 continuous seconds—after the last mutation**, sample local metadata every 30 seconds or less and retain value-free monotonic start, sample, and end timestamps. The final sample must be at or after `start + 600 seconds`; there must be no gap over 30 seconds. A mutation or invalid/gapped sample restarts the full interval at zero. PASS requires all of these at every sample and continuously for the entire interval:

- The target unit remains disabled, inactive/dead, and PID-less.
- All 16 captured wrapper/runtime identities are gone; zero new process matches any exact wrapper/persona or Slack-child predicate; and zero associated listener socket appears. Socket inspection must be passive/local and must not initiate a connection.
- Alex and Ops Conductor JSON parse successfully, exactly the four approved jobs remain disabled, and no other semantic value or metadata invariant changed.
- The other six stores retain their original device/inode where applicable, hash, owner, mode, stable-ID set, and disabled state, with no rewrite.
- The gateway and Kasm leaf identities are absent and no process restarts under their exact command-and-ancestry predicates.
- Kasm/container, all dashboards/listeners, ABC sync, Command Center, and protected profiles match their baselines, except independently scheduled ABC activity that is positively attributable to its protected unit.
- Zero listener or job restart is observed for the full 10 minutes. No relevant unit activation, wrapper/gateway/Kasm-command restart, JSON rewrite/re-enable, ownership/mode drift, Slack/email connection attempt, outbound effect, or unexpected protected-control change is observed.

The receipt records only run/manifest identifiers and hashes, backup-artifact hashes/classification, unit transition, per-target signal outcomes, before/after boolean counts, restore-rehearsal result, observation timestamps and measured duration, negative-control results, and final result. It contains no argv values, JSON values, secret material, or message content. A clean 10-minute/600-second watch proves only this fence; it does not authorize PEC-76 or activation.

## Stop Conditions

Abort before mutation, or stop at the next safe boundary and perform only proven file/unit rollback, when any of the following occurs:

- Current authority is absent, expired, broader/narrower than the manifest, or still limited to read-only inventory.
- The unit is not exactly loaded, enabled, inactive/dead, and PID-less, or disablement would affect anything else.
- Counts differ from 8 wrappers, 8 direct Slack children, 2 mutable stores, 4 target booleans, 1 gateway leaf, and 1 Kasm leaf.
- Any PID/start-time, UID, parentage, ancestry, executable identity, argv hash, persona mapping, file identity/hash, unit definition, or host identity changes between capture and use.
- A process predicate is based on PID/name/substring alone; a PID is reused; a target is an ancestor/supervisor/shared runtime; or any target intersects the denylist.
- An operation would rewrite any of the six non-target stores or change anything beyond the four approved booleans.
- JSON parsing/schema/stable-ID validation fails before replacement or after replacement; candidate comparison is not exact; atomic same-filesystem replacement or `fsync` is unavailable; or owner/mode cannot be preserved.
- A rollback artifact is missing, unverified, unparsable, outside the root-owned `0700` directory, not root-owned mode `0600`, emitted in any output, or unable to restore the original hash; or the restore rehearsal fails.
- A command might disclose an environment, credential, JSON/job value, backup byte, log, message, customer datum, or protected argv value.
- SIGKILL is proposed before both bounded SIGTERM waits and fresh per-PID revalidation, or any group/container/cgroup/recursive signaling is required.
- A listener, wrapper, job, gateway command, or Kasm cron-list command restarts during the 10-minute/600-second watch; a target job is re-enabled; a protected negative control changes unexpectedly; or the watch has a sampling gap over 30 seconds, a clock discontinuity, a mutation, no valid endpoint sample, or measured duration under 600 continuous seconds.
- The lock is lost, another operator/deployment begins, an observation cannot be explained, or the operator/reviewer cannot prove the exact failed/success predicate.

On stop: do not broaden discovery, kill adjacent processes, reconnect a service, or “clean up” additional files. Preserve only approved value-free receipts and protected rollback artifacts, report the failed predicate to the sole human approver, and leave every non-target system untouched.
