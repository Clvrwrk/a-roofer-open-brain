# A3: Labor crews on the CRM Job profile (read from the Scheduler)

Proposed by: Chris (Phase 4 of the CRM profile pages, CRM `docs/delivery/PROFILE-PAGES.md`)
Date: 2026-10-01
Status: pending
Affected clients: pro-exteriors
A3 file: proposals/2026-10-01-crm-job-crews-from-scheduler.md

---

## 1. The problem (measured)

- **Task being performed today:** knowing which crew is on a job and when. The Job profile shows "Labor crews: Not connected" (contract field `team.crews_available: const false`).
- **Where crews live (measured, 2026-10-01):** the **Scheduler** (`Clvrwrk/scheduler.proexteriorsus.net`) owns crew assignment by decision — CRM RR-042: "CRM requests/displays; Scheduler owns approval/execution; no second booking writer or native crew UI". Its prod schema has the right model (`scheduler.crews`, `scheduler.visits` = job + crew + phase + start/end + status) but **`crews` 0, `visits` 0, `member_crews` 0 rows**; `scheduler.jobs` 419 (332 from AccuLynx). AccuLynx V2 has no crew or work-order resource (Labor Order calendar appointments carry no crew field; the appointments endpoint returned 400 in the sandbox). JobTread mirrors no crew data. QBO shows who **billed** labor on a job (963 jobs, 205 payees since 2022) — after the fact, not who was scheduled.
- **Frequency / time / error cost:** **not measured**; no documented workaround. Production Managers and Operations would use it; reps would see "who is on my job".
- **Total monthly human cost:** unknown.

## 2. Root cause (5 Whys)

1. Why not visible? — No populated source.
2. Why not automated? — The Scheduler is the agreed system of record and holds no crews yet.
3. Why not AccuLynx? — Its API exposes no crew assignment; mirroring Labor Order appointments would create a second scheduling source, against RR-042.
4. Why not before? — CRM crew UI is deferred by decision (AGENTS.md: "Crew/turf/route UI remains deferred"; DECISIONS Q7).
5. Why now? — The Job profile reserves the panel.

## 3. Proposed solution

- **When the Scheduler holds crews and visits:** extend the CRM job reader (Phase 0 `crm_private.profile_cc_job`-style accessor, owned by the migration owner, allow-listed columns, `profile_require`-gated) to read `scheduler.visits` + `scheduler.crews` for the job: crew name, office, phase, start/end, status. No COI or certificate documents, no member contact details. Flip `crews_available` to a real availability flag. **The CRM never writes crew assignments.**
- **Until then:** keep "Not connected", with the wording "Crews are scheduled in the Scheduler".
- **Not proposed:** mirroring AccuLynx Labor Order appointments (Option B) — second scheduling source; inferring crews from QBO labor payees (Option C) — retrospective, belongs with the labor-invoices A3.
- **Integration required:** none new (same Supabase project).
- **Trust tier:** `evidence` (mirrored Scheduler data).

## 4. The new state (projected)

- **Time per occurrence:** glance at the Job profile.
- **Agent cost:** ~$0.
- **Human review:** none; office silo respected (crews carry `office`).

## 5. The math

| Item | Value |
|---|---|
| X, current monthly cost | not measured |
| Y, new monthly cost | ~$0 |
| Z, one-time build | ~12 engineering hours × $65 ≈ **$780** (accessor, contract change, panel, tests) |
| **ROI = X / (Y + Z/12)** | **not computable** until the Scheduler is in use and PM look-up time is measured |

**Exempt from 10x gate?** No.

## 6. Risks

- **Silent empties:** a CRM definer function on an RLS-on, no-policy table reads 0 rows if owned by a NOBYPASSRLS role — own it by the migration owner and keep the fail-loud post-condition (lesson of CRM 20261003060000).
- **PII:** crew and subcontractor names, COI documents — expose crew name and role only; PMs and admins may see more than reps.
- **Ownership:** read-only; any write path stays in the Scheduler.
- **Rollback:** revoke the grant; the panel reads "Not connected" again.

## 7. Alternatives considered

- **Leave it human:** yes, until the Scheduler is populated.
- **Defer until:** `scheduler.visits` holds at least one office's real assignments for 30 days.

## 8. Decision

- [ ] **Approve** — build by [YYYY-MM-DD]
- [ ] **Kill** — reason:
- [ ] **Defer** — revisit at: when `scheduler.visits` > 0 for a live office, condition: Scheduler in production use

**Recommendation: Defer** until the Scheduler is in production use; the build is small once it is.

Approver: Chris
Approved / decided on:

---

## 9. Post-build tracking

*Fill in after a 2-week pilot if approved.*

Sources: CRM `AGENTS.md`, `docs/DECISIONS.md` (Q7, RC-041), `docs/PRD.md`, `docs/delivery/PROFILE-PAGES.md`, `packages/contracts/profile-pages.json`, `clients/pro-exteriors/residential/releases/2026-09-19-r1/requirements.json` (RR-042); this repo `docs/65`, `skills/cleverwork-roofer/acculynx-api/reference/openapi-index.json`, `docs/120`; live counts over `scheduler.*`, `v_qbo_job_cost_lines` (2026-10-01, no PII).
