# Ghost Troubleshooting

Status: active KB v1

## Login Authorized But CLI Says Unauthorized

Cause:

- Device-flow process expired or completed after the CLI had already exited.

Fix:

```bash
ghost login --headless
```

Use the newest displayed code only.

## Codex Does Not Show Ghost MCP Tools

Fix:

1. Run `ghost mcp install codex --json`.
2. Verify `codex mcp list` includes `ghost`.
3. Restart Codex session if dynamic tools are not exposed.

## Database Missing

Check:

```bash
ghost list --json
```

If absent, create:

```bash
ghost create pro-exteriors-open-brain-lab --wait --json
```

Do not repeat the returned connection string in chat.

## Database Paused

Fix:

```bash
ghost resume <name-or-id> --wait
```

## Password Reset Broke Connections

Fix:

1. Retrieve the new connection string locally.
2. Update vault entry.
3. Update runtime env if any lab automation depends on it.
4. Do not commit the value.

## Delete Was Run By Mistake

Ghost delete is irreversible for that database. Recovery depends on whether the source data also exists in a dump, Supabase branch, or another lab DB. Stop and check backup manifests before recreating.
