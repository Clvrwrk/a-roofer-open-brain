# CRM weekly Friday companion

2026-09-06 Pacific. Owned worktree `artifacts/companion/brain-design`, branch `codex/crm-shared-design`. Source Clvrwrk/CRM_PWA branch `codex/prd-grill`, following86ecf5a. Immutable archives identify this candidate; source `docs/delivery/evidence/weekly-friday-ui.json` records the companion commit after creation.

Adopts sales-workspace0.1.4/contracts0.1.2 with design0.1.0 unchanged. Existing `/accounting/friday-wip` mounts the shared weekly workbench only when `CRM_WEEKLY_CANONICAL_ENABLED=true`; otherwise the preserved LegacyFridayWip component renders. Canonical mode establishes the existing same-origin staff session and does not call the legacy loader, inline edits, packs or Send. Staff BFF remains closed; no flag was activated. AppShell and service worker exclude Friday rendered HTML and purge previously cached Friday entries.

- sales-workspace archive SHA256: `4d807027b90a987cfdd5f946a6fb93962f1a1fc4797c863c8a089ca7fc230120`.
- contracts archive SHA256: `200b799eb85ff0023cace261a52f19aa96249ff6144e6b1d2153e9813d4164d4`.
-29 compiled/style files and weekly runtime contract byte-match the source.
-336 Command Center tests and build passed; source checks cover shared conditional consumer, closed staff boundary, Friday/Sales cache bypass/purge and absence of legacy actions in the canonical consumer.

Reciprocal source report: `docs/delivery/WEEKLY-FRIDAY-UI.md`; independent review: `docs/delivery/WEEKLY-FRIDAY-RED-TEAM.md`. Local source HTTP validated the complete synthetic audit chain, not this host's actual staff integration. Browser control remains unavailable because Mac is locked. No live financial/source acceptance, production deployment, production/source write, outreach or spend. Frozen failed UX/Technical scores remain unchanged. Next: staff forwarding/source reconciliation and actual CRM/CC Sales/CC Friday browser/device parity before live activation.
