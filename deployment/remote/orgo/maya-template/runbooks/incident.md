# Maya incident runbook

## Immediate stop

Set the activation flag false, stop the service if an effect remains in flight, and mark any unknown provider result `ambiguous`. Do not retry an ambiguous effect.

## Evidence

Preserve the issue, run, occurrence, release digest, active claim, effect reservation, provider reference digest, health receipt, and relevant timestamps. Record credential names only.

## Escalation

Park after three identical failures. Cross-agent access, cross-client access, duplicate effect, missing receipt, budget breach, or untrusted-content authority change is a hard incident and blocks restart until independently reviewed.
