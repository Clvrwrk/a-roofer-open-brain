# 2026-10-08 — CRM alpha feedback round 1

## Session 1

**Goal**: Chris's first alpha-tester feedback: gate Edit/Update, the Today vs Jobs job page mismatch, Quick Note, note alerts with unread on Today, and clickable stage pills.
**Deliverables**:
- Design canvas https://claude.ai/artifact/Pya4vqUHwyoL1yKq3hmC9C, approved as drawn twice.
- CRM PR Clvrwrk/CRM_PWA#154 (branch `claude/alpha-feedback`, 13f7445d).
- Migrations 20261031010000 (job notes) and 20261031020000 (journey work ahead), both live-safe.
- Decisions ALPHA-1..14 and EX-131.
- Build folder `~/alpha-feedback-build/`, with the contract, code map, lane logs and verify logs.
**Decisions** (Chris):
- Phone bar: Today · Jobs · Talk · More · Note.
- Unread notes go to everyone accountable for the office, rep or job.
- Alerts are in-app only; push comes next round.
- File scanner on (already on in prod; the worker is connected).
- Stage pills: progress colors; dashed while working ahead; the official stage advances by itself; the same people may act in any stage.
**Open threads**:
- Chris merges #154 → apply both migrations (notes, then journey) → pinned release on 4471 → verify a live upload → release-record PR → design-system rows.
- Follow-ups: scheduled journey-phase refresh for AccuLynx-only stage advances; lock-screen push.
