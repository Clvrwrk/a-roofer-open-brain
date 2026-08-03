# Maya pause runbook

1. Stop new claims and effects at the activation gate.
2. Drain or park the one active task and reconcile every reserved effect.
3. Record the last completed occurrence and provider confirmation digest.
4. Set `MAYA_ENABLED=false` and remove the activation receipt from the active gate path without deleting its audit copy.
5. Restart the service shell and require local health `paused`, zero task claim, zero schedule reservation, and zero provider adapter.
6. Keep the prior accepted release and credential bindings unchanged until the incident or cutover closes.

A provider computer stop is not an application pause because persistent state returns on resume.
