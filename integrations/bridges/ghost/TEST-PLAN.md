# Ghost Test Plan

Status: active KB v1

## Smoke Test

```bash
node scripts/ghost-lab-preflight.mjs --database pro-exteriors-open-brain-lab
```

Expected:

- Ghost CLI is installed.
- Auth identity is active.
- Lab DB exists.
- Lab DB status is `running`.
- Codex MCP lists Ghost.

## CLI Checks

```bash
ghost version
ghost id
ghost list --json
ghost schema pro-exteriors-open-brain-lab
```

## MCP Checks

```bash
ghost mcp list --json
codex mcp list
```

Expected MCP tools include database lifecycle, schema, SQL, logs, and documentation skills.

## Experiment Drill

1. Create temp table in Ghost.
2. Insert synthetic row.
3. Query row.
4. Drop temp table.
5. Record SQL as experiment evidence.

Do not run this drill against production Supabase.

## Pass Criteria

- OAuth identity is valid.
- At least one lab DB is reachable.
- Codex MCP entry is installed.
- Schema read works.
- No connection string is committed or printed in docs.
