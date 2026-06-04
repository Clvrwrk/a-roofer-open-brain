<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## Active Threads

- Command Center runs from `app/command-center` with Supabase product surface and WorkOS/auth.md discovery skeleton merged on `main`.
- MemSearch is the selected semantic memory layer. Use curated `context/` files as source-of-truth and `.memsearch/` as generated/plugin runtime state.
- Raw imports are parked in `archive/local-uncommitted-2026-06-04/` pending Maintenance sanitize/extract manifest.

## Environment Notes

- Command Center local URL: `http://127.0.0.1:4326/`.
- Supabase project: `rnhmvcpsvtqjlffpsayu` (`https://rnhmvcpsvtqjlffpsayu.supabase.co`).
- Planned public UI origin: `https://cc.proexteriorsus.net`.
- `memsearch` is available on PATH at `/Users/chussey/.local/bin/memsearch`; observed version: `0.4.6`.

## Pending Decisions

- Choose MemSearch backend for shared agent memory: local Milvus Lite for single-user bootstrap, or Zilliz Cloud/Milvus Server for multi-agent shared memory.
- Decide when to install/enable user-level MemSearch Codex hooks because they modify `~/.codex/hooks.json` and `~/.agents/skills`.
- Define the sanitizer for archived website, pricing/accounting, and property-enrichment imports before indexing or committing extracted knowledge.
