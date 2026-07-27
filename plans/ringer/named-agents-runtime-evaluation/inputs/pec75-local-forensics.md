# PEC-75 Local-Only Forensic Evidence

Captured 2026-07-26 at 18:49 PDT under Christopher Hussey's read-only approval through 22:15 PDT. No endpoint was queried and no production state was changed.

## Proven from surviving state

- Unit remains loaded, disabled, inactive/dead, MainPID 0.
- Target process counts remain 0 wrappers, 0 Slack children, 0 gateway-restart leaves, and 0 Kasm cron-list leaves.
- Alex and Ops Conductor each have 0 enabled jobs.
- Two valid private rollback JSON artifacts exist under one root-owned mode 0700 directory; both artifacts are root-owned mode 0600.
- The rollback/current stable job-ID sets are identical.
- Exactly four stable jobs changed, represented by four distinct non-reversible SHA-256 identifier hashes: Alex 1 and Ops Conductor 3.
- For every changed job, the only semantic delta is `enabled: true` to `enabled: false`. There are zero invalid or additional field deltas.
- Current file metadata matches the pre-action inventory facts: Alex remains root:root mode 0600; Ops Conductor remains uid/gid 1000 mode 0644.
- Six negative-control stores currently retain their previously captured observation hashes and remain uid/gid 1000 mode 0600.

## Confirmed control violations

- No exclusive host-local lock was acquired.
- No sealed host-local target manifest or durable independent-reviewer signature was created.
- The executor checked approval expiry but recorded no durable approval identifier/signature immediately before mutation.
- Leaf cleanup used 30-second then 10-second waits, not the approved 60-second then 30-second sequence.
- Command Center endpoint queries occurred during the original and fresh observations despite the preflight's local-only boundary.
- Rollback artifacts and containing directory were not explicitly fsynced.
- No disposable atomic restore rehearsal was performed.

## Permanently unprovable from surviving evidence

- Exact signals delivered to every target PID, including whether SIGKILL was used.
- Twice-resolved complete ancestry and denylist intersection for every target at mutation time.
- Pre-mutation inode/device/owner/mode baselines for all six negative controls beyond the inventory facts already recorded.
- Absence of every Slack/email connection attempt or outbound effect during the action.
- Unit-definition hash and concurrent-deployment state at the mutation instant.
- Source/candidate/installed-file fsync completion.

## Safety conclusion boundary

The current fence is durable and the two JSON mutations are now proven semantically exact. No evidence indicates protected-system damage, secret disclosure, unintended message delivery, or a wrong job mutation. Historical process-control and durability gaps cannot be retroactively repaired. Reviewers must decide whether PEC-75 can close with permanent execution exceptions or requires additional human risk acceptance; they must not recommend recreating evidence through mutation, rollback, relaunch, endpoint access, or artifact disposal.

## Human disposition

Christopher Hussey explicitly accepted every confirmed violation and permanently unprovable fact documented in Linear comment `43b6800d-3af7-4718-8786-71a79094b751`. The acceptance does not assert preflight compliance. The disabled fence and private rollback artifacts are the retained terminal state, and evidence recreation through mutation, rollback, relaunch, endpoint access, or artifact disposal is forbidden.

PEC-75 disposition: **PASS_WITH_EXCEPTIONS**. Linear closure comment: `544d5f7b-e02a-4de7-a990-c92e68edef92`.
