# Ghost Commands

Status: active KB v1
Last verified: 2026-06-10 with Ghost CLI `v0.19.0`

## Identity And Setup

```bash
ghost version
ghost id
ghost list --json
ghost mcp list --json
codex mcp list
```

Expected local state:

- `ghost id` reports OAuth user `chussey@cleverwork.io`.
- `ghost list --json` includes `pro-exteriors-open-brain-lab`.
- `codex mcp list` includes `ghost`.

## Login

```bash
ghost login --headless
```

Use the GitHub device code shown by the CLI. If login fails after authorization, rerun a fresh device flow.

## MCP Install

```bash
ghost mcp install codex --json
```

Do this once per machine/user profile. Restart Codex after install if dynamic Ghost MCP tools do not appear.

## Database Lifecycle

```bash
ghost create pro-exteriors-open-brain-lab --wait --json
ghost list --json
ghost schema pro-exteriors-open-brain-lab
ghost logs pro-exteriors-open-brain-lab --tail 100 --json
ghost pause pro-exteriors-open-brain-lab
ghost resume pro-exteriors-open-brain-lab --wait
```

Destructive:

```bash
ghost delete <name-or-id>
```

Do not delete a lab DB unless it is covered by the retention rule or a human names the target.

## SQL

Safe read:

```bash
ghost sql pro-exteriors-open-brain-lab "select now();"
```

DDL/data experiments are allowed only with synthetic, public, or approved sanitized data.

## Connection Strings

```bash
ghost connect pro-exteriors-open-brain-lab
```

This returns a password-bearing connection string. Do not print it in final answers, docs, commits, or logs.

## Password Reset

```bash
ghost password pro-exteriors-open-brain-lab --generate
```

This changes the DB password and breaks existing connections. Treat as destructive and update any vault/runtime references.
