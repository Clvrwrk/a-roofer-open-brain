# Open Brain Memory System

## Purpose

The Open Brain memory layer combines a small curated startup snapshot with MemSearch-backed semantic recall.

- Curated source: `context/MEMORY.md` and `context/USER.md`
- Daily project log: `context/memory/YYYY-MM-DD.md`
- Local transcript summaries: `context/transcripts/`
- MemSearch plugin/runtime state: `.memsearch/`
- Vector index: Milvus Lite by default, with Zilliz Cloud or Milvus Server as the shared-agent path

## Current MemSearch Baseline

Primary source reviewed:

- Repo: `https://github.com/zilliztech/memsearch`
- Docs: `https://zilliztech.github.io/memsearch/`
- Local clone commit inspected: `018a85f Fix native summary hook prompt handling (#563)`
- Local CLI observed: `memsearch, version 0.4.6`

Current MemSearch Codex behavior:

- The first-party Codex plugin installs `memory-recall` and `memory-config` skills into `~/.agents/skills/`.
- It updates `~/.codex/hooks.json` and enables hooks in `~/.codex/config.toml`.
- It writes daily plugin memory under `.memsearch/memory/`.
- The default embedding provider is `onnx` with the `gpahal/bge-m3-onnx-int8` model.
- The default vector backend is local Milvus Lite at `~/.memsearch/milvus.db`.
- Milvus is a rebuildable shadow index; markdown files are the source of truth.

The plugin installer was not run in this pass because it modifies user-level Codex state and may require network/model download.

## Layout

```text
context/
  MEMORY.md              curated working snapshot, 2,500 char cap
  USER.md                durable user preferences, 1,375 char cap
  memory/
    YYYY-MM-DD.md        daily repo/project session logs
  transcripts/           local transcript summaries; ignored except .gitkeep

.memsearch.toml          project-level MemSearch defaults
.memsearch/              generated plugin/runtime state; ignored
```

## Startup Discipline

On session start, agents should read only the frozen snapshot:

1. `context/USER.md`
2. `context/MEMORY.md`
3. Today's `context/memory/YYYY-MM-DD.md`, if present
4. Yesterday's daily log only when today's log has no prior session

Do not load raw archive folders at startup. They are intentionally outside the hot path.

## Retrieval Discipline

When past context is needed:

1. Tier 0: Check loaded snapshot and today's daily log.
2. Tier 1: Run `memsearch search "<query>" --top-k 5 --collection open_brain_memory`.
3. Tier 2: Run `memsearch expand <chunk_hash> --collection open_brain_memory`.
4. Tier 3: Use transcript/rollout drill-down only when exact prior wording matters.
5. Fallback: say no relevant memory was found.

Manual index command:

```bash
bash scripts/memsearch-index-open-brain.sh
```

The current MemSearch CLI indexes explicit paths. The older `memsearch config set paths ...` pattern from the pasted guide is not part of the observed current CLI.

## Write Discipline

`context/MEMORY.md` is curated, not a transcript dump.

- Cap: 2,500 characters.
- Check for duplicates before adding.
- Replace/update stale entries instead of appending variants.
- Do not store secrets, raw customer PII, or raw import dumps.
- Mid-session writes persist to disk but should be treated as next-session context.

`context/USER.md` is for durable preferences and working style only.

- Cap: 1,375 characters.
- Do not store technical implementation details unless they are evidence of recurring user preference.

## Archive Boundary

The raw imported projects now live under:

```text
archive/local-uncommitted-2026-06-04/
```

Do not index that archive directly. It contains nested Git repositories, build artifacts, local env files, pricing/accounting material, spreadsheets, and private property data. Build a sanitizer/extractor before promoting any of it into `context/` or Supabase memory tables.

## Enable MemSearch Codex Hooks

When ready to activate user-level hooks:

```bash
uv tool install "memsearch[onnx]"
git clone https://github.com/zilliztech/memsearch.git
bash memsearch/plugins/codex/scripts/install.sh
```

First model warm-up may require network access:

```bash
memsearch search "test" --collection test_warmup 2>/dev/null
memsearch reset --collection test_warmup --yes 2>/dev/null
```

For team/shared agent memory, configure Zilliz Cloud or Milvus Server instead of local Milvus Lite before enabling many concurrent agents.
