# Executive Pipeline — KPI Forensic Audit (2026-07-07)

Scope: every headline KPI pill on `/executive/pipeline`, filters = All locations / All types / All reps / **Year-to-Date**. Each number is interrogated against the context line and Res/Com split it sits with. Figures reproduced live from `crm_pipeline` (deduped, dead/cancelled excluded) joined to `acculynx_jobs` and `acculynx_job_milestone_history`.

## Verdict table

| KPI | Shown | Res/Com | Verdict | Correct value |
|---|---|---|---|---|
| Pipeline Value | $369,846 | $370K / $0 | ✅ Consistent | — |
| **Sold Value** | **$18,756,158** | $9.2M / $16K | ❌ **Headline ≠ split** | **$9,210,855** |
| **Jobs Sold** | **553** | 311 / 2 (=313) | ❌ **Headline ≠ split** | **313** |
| Close Rate | 52% | 54% / 32% | ✅ Consistent | — |
| New Leads | 332 | 296 / 36 (=332) | ✅ Consistent | — |
| Margin % | 73% | 73% / 0% | ⚠️ Com "0%" means "no data" | headline OK |
| **Average Ticket** | **$25,091** | $25K / $127K | ❌ **Headline = residential only** | **~$40,540** |
| AR Outstanding | $817,695 | (none) | ✅ Consistent | — |

## The three failures

**Sold Value ($18.76M) and Jobs Sold (553).** The headline rendered `closeRate.soldValue` / `closeRate.soldCount` — the *period-snapshot* number that sums **all four sold stages** (approved + completed + invoiced + closed). The Res/Com line rendered the **closed-in-window, by close date** value you asked for. Two different definitions in one pill. The tell: the old headline $18.76M is almost exactly the sum of the four sold-stage bars in the "Pipeline Value by Stage" chart ($2.7M approved + $1.3M completed + $5M invoiced + $9.2M closed). The split reproduces the data exactly — Res 311 jobs / $9,194,738, Com 2 / $16,117, total **313 / $9,210,855** — so the split is right and the headline was wrong. **Fixed:** headline now equals the sum of its close-date split.

**Average Ticket ($25,091).** The headline rendered `residential.avgTicket || commercial.avgTicket` — i.e. the **residential average only**. With 19 commercial jobs approved YTD at ~$118,714 each versus 107 residential at ~$26,659, the true blended average ticket is **~$40,540** — the headline understated it by ~38% under "All types." **Fixed:** headline is now the approved-count-weighted blended overall.

## The passes (justified)

- **Pipeline Value $369,846** = pre-close pipeline (prospects carrying an estimate), windowed. Res $370K + Com $0 ≈ headline; Com $0 is real — no commercial prospects currently carry an estimate.
- **Close Rate 52%** = job-count-weighted overall snapshot (Approved+Invoiced+Closed ÷ all), correctly sitting between the segment rates (54% res / 32% com) and weighted toward residential's larger job count. It is a current-funnel snapshot, not a cohort conversion — labeled as such.
- **New Leads 332** = 296 + 36. Clean.
- **AR Outstanding $817,695** = point-in-time open-invoice AR from `acculynx_invoices`; matches the AR-truth audit ($817,694.96). No split is correct for a point-in-time balance.

## Flagged (not silently changed — need your call)

**1. Margin Com "0%".** Commercial has 0% cost-data coverage, so its margin is genuinely unknown — but the pill prints a hard "0%" while the headline correctly prints "—" when coverage is zero. Recommend the Com split show "—" (needs per-segment coverage passed to the pill).

**2. Rep Leaderboard vs the fixed Sold Value.** The Rep Leaderboard "sold value" bars (and the per-location sold value) still use the **all-sold-stages** definition, so they sum to ~$18.76M — they will *not* reconcile with the corrected $9.2M headline. This is a definitional decision: a sales leaderboard often wants "sold = signed/approved," while you chose **close date** for the headline. Options: (a) move the leaderboard + location to close-date closed-only (everything = $9.2M, but a rep who signed but hasn't closed shows $0), or (b) keep the leaderboard on approved-based and relabel the two consistently. Recommend deciding the single canonical definition of "sold."

**3. Trailing-7 coverage notes.** The Invoiced→Closed pill reads "based on 0 of 73 jobs with history" despite milestone history now being well populated — worth a follow-up check that the trailing-7 transition resolver is reading the history table.

## Fixes shipped

`fix(pipeline): reconcile KPI headlines with their Res/Com splits` — Sold Value, Jobs Sold, and Average Ticket headlines corrected in both the server render (`pipeline.astro`) and the client re-render (`scripts/executive-pipeline.ts`). Loader math unchanged; 156 unit tests green.
