# Command Center app versioning

Human-facing release label for the Command Center (`cc.proexteriorsus.net`), shown under the runtime pill in the top bar. Deploy traceability stays on `/healthz` → `buildCommit` (git SHA from Coolify).

## Format

```text
{major}.{minor}.{patch}{stage}
```

| Segment | Meaning | Example |
| --- | --- | --- |
| `{major}` | Pre-GA vs GA | `0` through alpha/beta; `1` only at GA |
| `{minor}` | Feature track | Invoice Audit = `6`; bump on major surfaces |
| `{patch}` | Commit counter | Auto-increments every commit |
| `{stage}` | Release phase | `A` = alpha, `B` = beta, omitted at GA |

**GA** is `1.0.0` only after beta — never while `A` or `B` is set.

Current target: **`v0.6.1A`** (alpha, feature track 6).

## Source of truth

`app/command-center/src/lib/version.ts` — maintained by `scripts/bump-app-version.mjs`. Do not edit by hand.

## Automatic bump (every commit)

After clone or if hooks are missing:

```bash
bash scripts/setup-githooks.sh
```

The `.githooks/pre-commit` hook:

1. Increments **patch** and sets **date** to today (local calendar).
2. Stages `version.ts` into the commit.

Skip when needed:

- Env: `SKIP_VERSION_BUMP=1 git commit …`
- Message tag: `[skip version]` (merge commits are skipped automatically).

## Minor bump (feature / big update)

Second digit forward — resets patch to `0`.

**Option A — commit message** (works with `git commit -m`):

```text
feat: service warranty routing [minor]
```

Tags: `[minor]`, `[feature]`, or `version:minor`.

**Option B — explicit script** (interactive commit or before merge):

```bash
node scripts/bump-app-version.mjs minor
git add app/command-center/src/lib/version.ts
```

The next pre-commit still runs; if you already ran `minor`, include `[minor]` only when you want minor **and** patch 0 in the same commit — otherwise commit after `minor` with a normal message (patch will tick to `1` on that commit).

Recommended flow for a feature ship:

```bash
node scripts/bump-app-version.mjs minor   # e.g. 0.6.xA → 0.7.0A
git add …
git commit -m "feat: …"                   # pre-commit → 0.7.1A
```

## Stage promotion (manual, rare)

```bash
node scripts/bump-app-version.mjs beta    # A → B (same minor.patch)
node scripts/bump-app-version.mjs ga      # B → 1.0.0 (clears stage)
```

`ga` refuses to run unless stage is `B`.

## Display

`AppShell.astro` renders:

```text
v{APP_VERSION} · {APP_VERSION_DATE}
```

Example: `v0.6.1A · 2026-06-29`

## Related

- Deploy SHA: `GET /healthz` → `buildCommit`
- npm `package.json` version is **not** synced (internal tooling only)
