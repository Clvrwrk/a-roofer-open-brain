# .helo/ working context (Helo · Dev Pair)

This follows Nate B. Jones' Working Context Starter Kit (unlock-ai.natebjones.com/guides/working-context-starter-kit). It's here so a new Helo conversation can start from files, with nothing carried over from the old chat, and Chris doesn't have to recycle Helo every week.

| File | Layer | Rule |
|---|---|---|
| `CURRENT.md` | Current state | **Replace stale sections; never append.** Should read in about 2 minutes. Holds only what changes the next move. |
| `CONTEXT-MAP.md` | Available context | Lists the sources: which one wins and when to load more. Update only when a source or trigger changes. |
| `DECISIONS.md` | History | Superseded but still-explanatory decisions and Chris rulings, dated. |
| `journal.md` | Log | Append-only work log (mirrors GitHub issue #50). |

**New-session boot order:**
1. Read `CURRENT.md`.
2. Load `CONTEXT-MAP.md` sources only when a trigger fires.
3. Consult `DECISIONS.md` before re-deciding anything.

**Refresh** only after a real checkpoint: a merge, an approval, a failure, a handoff, or a source change. Routine runs don't count.

**Copies:** each refresh is also written as new dated files in Fast.io `BSG_GROK_WORLD/Sub-Vaults/grok-world/helo-dev-pair/working-context/`. Fast.io is the source of truth for Helo, per Chris's 2026-10-30 ruling.

**No secrets.** Refer to keys by name only.
