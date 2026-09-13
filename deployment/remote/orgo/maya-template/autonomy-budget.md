# Maya autonomy budget

## Build default

All spend and provider-action budgets are zero. Email, Slack, external Linear, publishing, payments, commitments, and production business effects are off.

## Required activation fields

A later activation receipt must name the issue, run, occurrence, agent, client, trust tier, tool, effect kind, approval, cost reservation, idempotency key, and runtime version. Missing context is a hard stop.

Cost circuit breakers must be installed before a provider adapter: warning at 70 percent, pause at 85 percent, and hard stop before the effect at 100 percent. This release contains no provider adapter and cannot spend.
