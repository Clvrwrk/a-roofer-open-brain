## Session — CRM nesting + speed (worktree crm-performance-nesting-760bc9)

**Goal:** fix the CRM UI/UX with the standard nesting protocol, then speed the app up. Chris's workflow was mockup, then approval, then PR, then release the same day.

**Deliverables:**
- **Mockup:** https://claude.ai/artifact/BbsguKoAycSCXit7SboQtC, 7 boards. Chris approved it as drawn.
- **CRM PR:** Clvrwrk/CRM_PWA#137 on branch `claude/crm-nesting-speed`.
  - Nested Customers, Jobs (Office › Rep › Trade › Estimates), Properties and Staff.
  - Jobs is one menu link.
  - Corner rule: controls 8, containers 12, tags 4, circles for people.
  - The Roles tab is grouped by department.
  - Today loads in one batched read.
- **Migration:** `20261022010000_crm_nest_reads` applied to prod. Its sha `b03b7603…` matches the file.
- **Design system:** the S-10 corner rule and the CRM nest-order rows, as commit df3c9f3d on this branch.

**Decisions (Chris):**
- Stage means the 10 journey phases.
- On load, offices are open and reps are closed.
- The Jobs nest is built now and shows its gaps: "No trade recorded" sorts last, and approved estimates carry "Approved · inferred".
- Roles are grouped by department.
- No pills.
- Every job row links twice.

**Speed baseline (Sentry, 14 days):** p50 2.3 s, p75 5.9 s, p95 14.2 s. The worst loads made 219–239 per-lead calls on Today, now fixed. The list RPCs take 2–6 s; Search is a follow-up.

**Lessons:**
- A Mac reboot wiped /tmp and the scratchpad mid-build. Durable work now lives in `~/<task>-build/`, recorded in the global `~/.claude/CLAUDE.md` and the `survive-mac-restart` memory.
- The auto-mode classifier blocks a background backup loop, read-only SSH to the CRM host, and reads of the main checkout. Chris runs the host stage and switch.

**Open threads:**
- Release switch of the #137 merge on port 4464, then the release record.
- Follow-ups:
  - Search and `list_open_work` RPC speed.
  - The AccuLynx estimate un-archive bug.
  - Job-profile trade JSON pills.
  - Notify the A1 owner that first-rows timing now fires after a rep and stage are opened.
- The design-system companion still needs to merge to open-brain main.
