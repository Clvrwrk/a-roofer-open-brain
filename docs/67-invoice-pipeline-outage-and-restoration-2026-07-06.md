# 67 — Invoice pipeline outage (Jun 29 – Jul 6) and restoration

**Status:** RESOLVED 2026-07-06. All four root causes fixed, deployed, and verified live.
**Date:** 2026-07-06
**Branches:** `contrib/cleverwork/host-scheduler`, `contrib/cleverwork/invoice-audit-kpi-consistency`, `contrib/cleverwork/sop-disposition-endpoint` → all merged to `main` (`6ab1b75`, `e74705d`).

---

## 1. Symptom (as reported)

The Invoice Audit screen looked disjointed — filter, KPI cards, and invoice tree disagreed. The
"Invoices To Be Paid" KPI showed 2 with an enabled **Process** button, but clicking it returned
"no invoices ready to process." The weekly payment deliverable was a week behind, the pricing
agent appeared off, and Slack had gone quiet.

## 2. Root causes (four independent failures that looked like one)

1. **Nightly ABC sync scheduled in a host that cannot run it.** The sync was a Cowork scheduled
   task; that sandbox kills any process after ~45s (`bwrap --die-with-parent`), so the 20–45 min
   job died every night from ~Jul 1 (daily logs 07-04/05/06). Last invoice ingest 06-29; newest
   invoice stuck at 06-27.
2. **The agent fleet's scheduler was designed but never installed.** docs/56 chose host-driven
   systemd ticks; no unit files, timers, or crontab existed on `5.78.146.161`. Worse, every
   Hermes cron job sat `enabled: false` — the fleet's last run was 06-30 07:03, seven minutes
   before a debugging container (`hermes cron list --all`) was started and left running. Slack
   went quiet because the agents stopped, not because Slack broke.
3. **`agent-tick.sh` never reached hermes.** `docker run IMAGE hermes cron tick` is swallowed by
   the Kasm image's `vnc_startup.sh` entrypoint, which ignores args and boots a full desktop —
   the oneshot hung in "activating" forever. Fixed with `--entrypoint hermes` (+ `--network host`,
   1h hang-stop). The docs/56 design had never actually been exercised.
4. **Three "ready to pay" predicates + a cache gap in the app.**
   - KPI card + Process button counted `totals.toBePaid` (`isInvoiceToBePaid`) while
     `process-batch` exports `isInvoicePayable` (`toBePaid && approvedToPay`) — so held invoices
     (credit-memo do-not-pay) inflated the count and then 409'd the export. Live examples: one
     transferred Commercial invoice with a credit-flag hold, one `returned`-status ledger row.
   - The client tree ran a third local predicate missing the `transferred` short-circuit.
   - `mark`/`reset` never invalidated the 5-minute summary cache, so KPI cards lagged the tree
     after dispositions.

## 3. Fixes shipped

| Fix | Where |
| --- | --- |
| Host-portable `abc-nightly-sync.sh` (derives `REPO_ROOT`; was hardcoded to a Mac path) + appended **daily invoice ingest** (`mirror-backfill --only=invoices`, rolling 10-day idempotent window per docs/63) | `scripts/abc-nightly-sync.sh` |
| `openbrain-abc-sync.{service,timer}` — nightly 03:30 America/New_York on the agent host | `deployment/remote/systemd/` (installed + enabled on 5.78.146.161) |
| `agent-tick.sh` `--entrypoint hermes` fix; `openbrain-dev-tick@alex.rivers.timer` enabled (1-min ticks, proven end-to-end) | `scripts/agent-tick.sh` |
| Repo clone + scoped `.env` provisioned on the agent host (`/opt/openbrain/a-roofers-open-brain`; replaced a broken rsync'd worktree snapshot, preserved at `*.broken-worktree-20260706`) | agent host |
| Invoice-audit **payable/held** consistency: totals gain `payable` + `held`; Process button counts `payable`; held count on the KPI card + "Held — credit memo" pill; client predicate mirrors the server; 409 explains held invoices; `mark`/`reset` invalidate the summary cache; regression test | `app/command-center` (merge `6ab1b75`) |
| **`POST /api/invoice-audit/run-disposition`** — the docs/57 §1 pass wired to the tested engine (`invoice-audit-disposition.ts`), human-gated (`approval.decide`), `dryRun`/`office`/`maxInvoices` staged-rollout params, mark-parity writes (`source='backfill'`, `approved_by='Alex'`), paginated per docs/42 playbooks 3/9/11 | `app/command-center` (merge `e74705d`) |
| Alex profile: `nepq-agent-communication` skill collision resolved (duplicate `autonomous-ai-agents/` copy disabled; `cleverwork-roofer/` canonical); `alex-morning-abc-sync` re-enabled (backup `jobs.json.bak-20260706`) | agent host |

## 4. Backlog cleared (2026-07-06)

Invoice catch-up: 27 history rows / 20 invoices / 136 lines ingested (invoices current through
07-02). Disposition pass (5-invoice gate run, then full): **62 invoices, 191 line decisions** —
148 accept-neg · 23 accept-nochallenge (coverage gaps → Jordan) · 7 accept-30d · 3 accept-svc ·
**5 credit-flag** (credit-memo requests drafted) · **16 gate-negotiated lines left pending for
human ruling** (40 invoices held at the gate, correctly out of the payment export). Summary
posted to `#accounting-invoice-processing` as Alex (`ts 1783351625.222829`).

## 5. Discoveries worth keeping

- **The "24/7 agent" was never an autonomous loop.** Alex's historical decisions were
  `source='backfill'` bulk passes + `manual` dashboard actions; the Hermes cron job is a thin
  scaffold (`web`+`file` toolsets, empty sandbox, no repo mount) that returns `[SILENT]`. The
  engine of record (`disposeInvoice`) existed, tested — with zero production callers until now.
- `invoice_line_audit.source` CHECK allows only `auto_match | manual | backfill`.
- Named agents deliberately lack `approval.decide` — the disposition pass is therefore
  human-triggered (or local-operator in dev); the negotiated gate protects the money boundary
  inside the engine itself.
- Doc-number collisions continue past 66; this doc claims 67 on the Roofing-Ops track.

## 6. Open items (next session)

1. **Daily automation of the disposition pass.** Options: provision Alex a Command Center bearer
   (`AGENT_SERVICE_TOKEN_SHA256_ALEX-RIVERS`, generated fresh — never reuse existing secrets) plus a
   permission-model decision (named agents lack `approval.decide` by design), or an in-app
   scheduled cadence under a system actor, or a daily human click. Until decided, the pass is
   one click/curl away and the negotiated gate keeps it safe.
2. **Widen tick timers to the other 7 agents** (staged, per the production-gating rule): enable
   per-agent `openbrain-dev-tick@<email-prefix>.timer` + re-enable their Hermes jobs one at a time.
3. **Rewrite `alex-morning-abc-sync` cron prompt** — it cannot execute the SOP as written; point
   it at the run-disposition endpoint once auth exists, or reduce it to a freshness/summary post.
4. **`returned`-invoice UX** — a returned ledger row silently re-enters To-Be-Paid; consider a
   distinct pill so it's visible why the count moved.
5. **Cowork scheduled task** for the nightly sync should be **cancelled** (human action in the
   Cowork UI) now that systemd owns it.
6. Consider `sop-run` as an allowed `invoice_line_audit.source` value (additive CHECK migration)
   so engine passes are distinguishable from historical backfills.
