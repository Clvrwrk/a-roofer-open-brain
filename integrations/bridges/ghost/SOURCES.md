# Ghost Sources

Status: active KB v1
Last verified: 2026-06-10

## Official Sources

| Topic | URL | Notes |
| --- | --- | --- |
| Ghost docs | https://ghost.build/docs/#introduction | CLI installation, login, create, list, fork, SQL, schema, pause/resume/delete. |
| MCP integration | https://ghost.build/docs/#mcp-integration | MCP install/start/list/get and exposed tools. |
| API reference | https://ghost.build/docs/#api-reference | HTTP API shape for spaces, DBs, keys, and health. |
| Upstream repo | https://github.com/timescale/ghost.git | Source repo named by user. |

## Local Verification

| Tool | Observed |
| --- | --- |
| Ghost CLI | `v0.19.0` |
| Auth | OAuth user `chussey@cleverwork.io` |
| Space | `hz2rr0kc04` |
| Lab DB | `pro-exteriors-open-brain-lab` / `izdj443x7x` / `running` |
| Codex MCP | `ghost` installed in user config. |

## KB Decisions

- Use Ghost for disposable Postgres experiments and restore drills.
- Do not use Ghost as production source of truth.
- Do not load raw production PII unless explicitly approved.
- Treat `ghost delete` and `ghost password` as destructive.
