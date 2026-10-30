# Project Handoff — Pro Exteriors Open Brain / Command Center
**Project:** a-roofers-open-brain (Pro Exteriors Command Center + agent fleet)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain
**Production URL:** https://cc.proexteriorsus.net
**Date:** 2026-08-18 10:05 (CT)
**Agent:** Lead Orchestrator (Claude Code)
**Reason:** User-requested /wrapup + /project-handoff

---

## Accomplished This Session

### Friday WIP/AR board UX (shipped, live)

- `app/command-center/src/pages/accounting/friday-wip.astro`: expanded PE-office group is now a 70vh scroll pane — vertical row scroll + horizontal scroll for the yellow edit columns, sticky header row, and **Job # + Client frozen left** (72px col 1, edge shadow on col 2). Required `border-collapse: separate` and moving zebra/hover paint from `tr` to `td` so sticky cells stay opaque.
- `app/command-center/src/pages/accounting/friday-wip.astro`: Status column reduced to the **AccuLynx status only** (dropped the `· ref bucket` trailer); ref bucket + collection status remain in the hover tooltip. Removed the now-dead `statusClass` helper and `.fw-ref` / `.fw-status-*` CSS.

### P0 — wrong-office pricing (PEC-209 / PEC-210)

- `schemas/cleverwork-roofer/230-invoice-office-servicing-branch.sql` **(applied to prod)**: `v_invoice_pricing_office` now derives the PE office from the invoice's **servicing branch** (`abc_invoices.branch_number_extracted`), vendor-scoped to abc-supply, instead of the ship-to's *home* branch. **49 invoices / $119,576 were mis-officed.** Fails closed (unknown / uncovered / no-office branch drops out → Alex No-Price triage). Same migration widens `agent_intake_notices.status` CHECK to accept `ack_in_thread` (was throwing 23514 on every Maya gate run) and refreshes `mv_invoice_pricing_office` (the live call path used by `credit-memos/add-line.ts` and `credit_memo_claims_sync`).

### P1 — ledger (PEC-203 / 206 / 207 / 208)

- `app/command-center/src/pages/api/accounting/qb-bank-csv.ts`: PEC-208 sloppy-PO job recovery (live).
- PEC-203 diagnosed: the ABC mirror was **complete**; the gap is an export seam (hard-coded `since=2026-08-01` floor + legacy register CSV last run 7/19 ⇒ 7/20–7/31 fell in the crack). 62-row catch-up preview generated since 7/1; `mode=export` deliberately left for a human to fire.

### P3 — intake queue hygiene

- `app/command-center/src/lib/agent-intake-guard.ts` **(new)**: server-side boundary guard for `POST /api/agent/intake`. Rule `self_receipt_loop` drops messages whose sender is an agent workspace address (`*@cc.proexteriorsus.net`) — the echo that produced PEC-167/169/170. Rule `security_notice_fold` rewrites the `orchestrationKey` of Google/WorkOS/Drive account notices to `security-notice:<YYYY-MM>` so they converge onto ONE rolling monthly work item via the existing `work_key` upsert instead of one Urgent ticket each (produced PEC-149…158). Nothing is suppressed — each notice still appends its own audit row.
- `app/command-center/src/lib/agent-intake-guard.unit.test.ts` **(new)**: 9 tests built from the real historical messages (Maya self-echo, the 6/6 Google cluster, Drive-share + WorkOS senders, monthly bucket rotation, Lucinda/vendor pass-through, unparseable date).
- `app/command-center/src/pages/api/agent/intake.ts`: guard wired in between validation and row construction; `drop` returns `{status:"ignored", rule, reason}`.

### Investigation — "why is the audit queue empty?" (no code change)

Verified against prod, replicating the surface's exact `pendingLines` rule. Findings in **Decisions** below.

## Git State
- **Branch:** `main` (== `origin/main`)
- **Last commit:** `ed92198` — "docs(memory): 2026-08-18 session 2 — Maya queue P0-P3 wave"
- **Uncommitted changes:** none at time of writing (this handoff + memory updates commit next)

## Task Cut Off
None — session ended at a clean boundary. All code is committed, pushed, and deployed (`/healthz` buildCommit `36227c5`, status ok). Three Linear tickets are deliberately parked on human answers (see Blockers).

## Next Task — Start Here

**Task:** Renew the expired Wichita price agreements and work the agreement gap queue by spend.

**What to check / do:**
1. Confirm the coverage hole is still open:
   `select office, vendor, max(expiry_date) from ...` — as of 2026-08-18 the **SRS Wichita** agreement `0049828559` expired **7/23/26** and **ABC Wichita** `2036874-16` expired **7/31/26**. With no successor loaded, every new Wichita invoice fails closed to No-Price.
2. Pull the gap queue ranked by spend: `select * from agreement_gap_queue order by spend_ytd desc` — **302 items / 1,707 purchases / $578,950 YTD, all still `status='candidate'`**. The top ~20 items carry most of the dollars.
3. Load the renewal price sheets as **versioned** agreements (never overwrite): new `price_agreements` row + `price_agreement_items` at `approval_status='pending'`, provenance + effective/expiry dates attached.
4. Optional but recommended: surface `agreement_gap_queue` count in the Invoice Audit header so "0 to audit" can never read as "all clean" while 302 candidates wait.

**If the renewal PDFs aren't available:** do not infer prices from invoices. Leave the office at No-Price (fail closed per silo doctrine) and ask Chris for the source documents — this is exactly how PEC-111 and PEC-177 went wrong.

**Prompt to use:** "Read docs/handoffs/current.md. Then pull agreement_gap_queue ranked by spend_ytd and give me the top 20 items with their office, vendor, purchase count and YTD spend, so we can prioritise agreement renewals. Do not promote any prices without source documents."

## Decisions Made This Session

- **PEC-209 — credit NOT supported.** Invoice 2009034778-001 (Winfield KS job, serviced by ABC branch 113 Wichita) was genuinely mis-officed to Richardson, but on every line the May Wichita agreement covers it was billed **at or below** Wichita pricing (net −$188). Only possible overcharge is $35.20 on caps against a quote dated *after* the invoice. The office bug was real; the overbilling was not. Do not re-open as a credit.
- **PEC-210 — credit SUPPORTED at $40.26, not the $22.30 requested.** Three lines over Wichita terms (caps +$17.40, Pro-Start +$8.70, Anchordeck +$14.16). The $22.30 ask implies a $17.30 cap price that matches no agreement or quote on file; the defensible benchmark is $19.75 (Wichita quote 0049828559). Request references Kansas City, but the servicing branch is Wichita and no KC agreement prices these items.
- **PEC-111 — HELD, do not promote.** The three "DFW" IKO prices match the **Kansas** book, not DFW (Cambridge $92 = Wichita exactly; DFW is $112. Dynasty $103 ≈ Wichita $102; DFW $117). Writing them as DFW would cut Cambridge 18% and generate **false credit-memo requests against SRS**. Needs Chris to confirm office from the original 7/8 email.
- **PEC-177 — HELD, do not promote.** Tamko Titan XT at $101/SQ is $21 below the latest Wichita SRS price ($122) and $34 below ABC Wichita ($134.90), against an industry trend that is *rising*. Not promotable on an email figure; needs the source quote document.
- **Security batch NOT closed** (deliberate deviation from the approved plan). The underlying emails are **6/6, 6/7 and 6/25** — 8/5–8/6 was only the ticket-creation date during backlog intake. Cluster A (6/6, 22:55–23:17) reads as Chris provisioning Maya (two messages name Chris as sender); Cluster B (6/25) pairs a WorkOS OTP with a Linux sign-in, consistent with agent-host bringup. But password-reset / account-recovery / "OTP not initiated by the agent" are also the exact signature of a takeover, and only Chris knows. **Auto-closing security alerts on agent inference is not an agent call** — all ten moved to `Agent Needs Input` with the timeline instead.
- **"Zero invoices to audit" is real but does NOT mean verified-and-matched.** Of 819 flagged lines on the 135 actionable invoices, **769 (94%) were No-Price** — cleared with no benchmark to compare against; only 47 were genuine over-agreement. ~400 were cleared by the **Alex agent** (129 `auto_match`, 272 `backfill`), 274 by Chris in a bulk `pipeline_v2` pass on 8/6–8/8. This is by design: `alex_no_price_triage()` (mig 229b / PEC-195) stamps pending No-Price lines passed and routes repeats to `agreement_gap_queue`. **The work moved, it did not vanish.** No-Price share is climbing (Apr 73% → May 62% → Jun 65% → **Jul 83% → Aug 83%**) because agreements are expiring unreplaced. An empty audit queue is currently a *symptom of missing price agreements*, not evidence of clean billing.

## Blockers Requiring Human Action

1. **PEC-111 (IKO DFW pricing)** — Confirm from the original 7/8 email whether Cambridge $92 / Dynasty $103 / Nordic $129 are **DFW or Kansas**. Nothing is staged until then.
2. **PEC-177 (Tamko Titan $101/SQ)** — Provide the source quote document (number, effective/expiry, volume conditions, exact Titan line).
3. **Security batch PEC-149…158** — One sentence: *"Yes, I provisioned Maya's Google account the evening of 6/6 and brought her up on the agent host 6/25."* That closes nine tickets.
4. **PEC-172** — Confirm **Billy Cowell (billy@proexteriorsus.com)** should have sub-account access on the Pro Exteriors LLC AIA4 account, or it needs revoking. This is a live third-party access grant, unrelated to Maya.
5. **PEC-203 catch-up export** — 62-row CSV since 7/1 is previewed; a human fires `mode=export` (it stamps `qb_bank_export_log`) and sends the file to Lucinda for QBO import.
6. **Wichita price coverage** — SRS expired 7/23/26, ABC expired 7/31/26. Renewal sheets needed; until then all new Wichita invoices are No-Price.
7. **567 price_agreement_items are all `approval_status='pending'`** — the approval workflow has never been exercised. Decide whether the existing corpus gets a bulk verification pass.

## Verification Commands
1. `curl -s https://cc.proexteriorsus.net/healthz | python3 -c "import sys,json;print(json.load(sys.stdin)['buildCommit'][:7])"` — should return the head of `origin/main` (was `36227c5`)
2. `git status --short` — should return empty
3. `git rev-list --left-right --count HEAD...origin/main` — should return `0	0`
4. `cd app/command-center && npx vitest run src/lib/agent-intake-guard.unit.test.ts` — should return `9 passed`
5. `select count(*) from mv_invoice_pricing_office;` — should return `1056` (was 1086 pre-mig-230; 31 fail closed by design)
6. `select count(*) from agreement_gap_queue where status='candidate';` — should return `302` until renewals are worked

## Full Context

### What was built across ALL sessions (complete feature list)
See `docs/handoffs/archive/` chain + PEC-199/202 session reports. Prior session added: Slack owner-notice path live, canonical internal-domain rule (4 apexes) across all 5 definition sites, Orgo ship kit, PEC-209 forensic findings, PEC-206 closure, Maya reprocess tasks queued through the Agent Todo gate.
**This session adds:** Friday WIP/AR frozen-column scroll viewport + AccuLynx-only status column; migration 230 (servicing-branch office derivation + `ack_in_thread` CHECK fix); PEC-208 sloppy-PO job recovery; the agent-intake boundary guard (self-receipt drop + security-notice fold) with 9 tests; verification packets on PEC-209/210/203/111/177; security-batch timeline on PEC-149; queue hygiene (4 artifacts cancelled, 11 tickets → Agent Needs Input); and the audit-queue-empty root-cause analysis.

### Architecture decisions
- Maya runtime = single supervisord process on Orgo desktop pe-maya-chen (`f914c60c-c7c0-4a5e-b9dd-dd8b9df825f6`, instance c681e86d): Slack conversation loop + mailbox cadence (UTC half-hours) + Linear claimant (5-min). Gmail/Linear/Slack effects via pinned Composio accounts.
- Release lives root-owned at `/opt/pe-cc-agents/maya-slack-listener`; installer demands root:root:700 staging, no symlinks, verified-stopped supervisor; `tree-integrity.mjs` computes the pinned hash.
- maya-gate.mjs (Hetzner, 15-min cron) = notices audit + Phase A diagnosis only. **The `ack_in_thread` 23514 bug is FIXED** in migration 230 — the CHECK now accepts it.
- **Intake classification is caller-supplied** (Maya's runtime posts it), so intake guards must live server-side at `POST /api/agent/intake` — a prompt-level fix would not survive a runtime change. That is why `agent-intake-guard.ts` exists.
- **The security-notice fold reuses the existing `orchestrationKey` → `work_key` upsert** rather than adding a suppression table. Converging the key is what makes N notices become 1 work item, and every notice still writes its own audit row.
- **Invoice audit "to audit" = discrepancy lines only.** A line is pending iff auditable, undecided, not disputed, and (UOM mismatch OR No-Price OR billed above agreement). Valid lines are hidden by the audit view. So an empty queue never proves prices matched — check `agreement_gap_queue` and the No-Price rate alongside it.

### Key invariants (never violate)
- **Silo doctrine:** price agreement = (vendor, PE office); unknown office ⇒ No-Price; fail closed. Never join pricing across vendors or offices.
- **UOM:** compare only in the vendor's pricing UOM via `price_per_uom` + `v_item_uom_map` (docs/46). Never `quantity` / `unit_price` / `pricePerUnitAmount`.
- Additive migrations only; QBO prod read-only; no secrets in repo; agents never email externally without a human.
- **A fix isn't fixed until verified through the LIVE call path** (mig-222 landed in dead code; PEC-184 #1). For office pricing that means `mv_invoice_pricing_office`, not just the view.
- **Never promote a price from an email figure alone.** Verify office + effective dates against source documents; a wrong promotion generates false credit-memo requests against a vendor.
- **Agents do not close security alerts on inference.** Park them for a human.

### Service / deployment map
| Service | Detail |
|---------|--------|
| Live app | cc.proexteriorsus.net via Coolify from origin/main (`/healthz` buildCommit) |
| Supabase (prod, shared dev/live) | rnhmvcpsvtqjlffpsayu — schemas through **230** |
| Dev server | port 4399 (`.claude/launch.json` → `command-center`) |
| Maya Orgo desktop | computer f914c60c…, instance c681e86d, dashboard https://www.orgo.ai/desktops/c681e86d |
| Orgo API | https://www.orgo.ai/api (`POST /computers/{id}/bash`); keys in 1P CW_Master |
| Slack | #pe-cc-dev-team C0BNVF99Y74 (private; maya_chen_accounting + openbrain invited 2026-08-11) |
| Hetzner agent host | PE-US-AGENTS 178.156.203.23 (`~/.ssh/hetzner_office`) — runs maya-gate.mjs cron |
| Linear | team PE-CC-DevTeam; CAT-* = audit roots, PEC-* = work issues |
