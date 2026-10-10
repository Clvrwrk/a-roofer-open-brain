# Maya rollback runbook

1. Pause activation and require zero active provider call.
2. Stop `maya-runtime-v1` and capture the active release digest.
3. Preserve the failed release, health, queue, schedule, and effect receipts.
4. Install the prior accepted root-owned release at the versioned path.
5. Start the service with `MAYA_ENABLED=false`.
6. Require local health `paused`, the accepted release digest, one Supervisor process, and zero `.lock`, `.lease`, or stale active-claim artifact.
7. Re-enable only with a new signed activation receipt for the restored runtime version.

Never fall back to the fenced legacy effect-capable worker as an automatic recovery path.
