# Dolt Sources

Status: active KB v1
Last verified: 2026-06-10

Primary sources:

- Dolt introduction: https://www.dolthub.com/docs/introduction/what-is-dolt/
- Dolt CLI reference: https://www.dolthub.com/docs/cli-reference/cli
- Dolt SQL version-control reference: https://www.dolthub.com/docs/sql-reference/version-control
- DoltHub: https://www.dolthub.com/
- DoltLab: https://www.doltlab.com/
- User-provided implementation reference: https://github.com/dolthub/dolt.git

Local verification:

- `dolt version` reported `2.1.6`.
- `dolt creds check` authenticated successfully for the operator account.
- `dolt config --global --get user.name` and `dolt config --global --get user.email` returned configured author values.

Operational interpretation:

- Dolt is useful for branchable, reviewable SQL datasets.
- Supabase remains the Open Brain source of truth.
- Dolt is not a production backup strategy.
- Dolt remotes are allowed only for approved non-sensitive data classes.
