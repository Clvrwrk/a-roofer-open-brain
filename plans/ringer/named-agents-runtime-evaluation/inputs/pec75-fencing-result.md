# PEC-75 Fencing Result Evidence

Captured 2026-07-26 after the approved live action. This is a value-free evidence summary.

- Approval: Christopher Hussey, through 2026-07-26 16:30 PDT.
- Preflight Ringer: `pec75-legacy-runtime-fencing-preflight-20260726T211206Z-p60653`, PASS/PASS.
- Execution receipt: `pec75-fence-final-20260726T232034Z`, postcheck PASS.
- Unit: disabled, inactive/dead, MainPID 0.
- Legacy Slack processes: zero wrappers and zero runtime children after action.
- Alex enabled legacy jobs: 0 (previously 1).
- Ops Conductor enabled legacy jobs: 0 (previously 3).
- Six other job stores: hashes unchanged throughout the observation.
- Stuck gateway leaf: terminated; briefly a non-executing zombie, then reaped.
- Stuck Kasm cron-list leaf: terminated.
- Observation: 600 continuous seconds, 20 clean samples from elapsed second 0 through 571, final duration assertion 600 seconds.
- Each sample asserted no restart, no job re-enable, unchanged negative controls, Command Center health success, and enabled/static ABC sync timer.
- Protected Kasm platform/container, five Hermes dashboards, ABC sync, and Command Center were not targeted.
- Two fail-closed resumptions occurred: first for expected child reparenting after wrapper exit, second to distinguish a non-executing zombie from a live process. Each continuation re-resolved exact live identities and did not widen scope.
- Two root-only private rollback artifacts exist on the legacy host; their paths and contents are deliberately excluded.
- Linear PEC-75 comment `f3cd8979-ae18-4846-975a-b548aa01f0b7` records the result.

## Fresh read-only postcheck

- Approval: Christopher Hussey, through 2026-07-26 17:15 PDT.
- Run: `pec75-readonly-postcheck-20260727T001015Z`.
- Verdict: PASS.
- Samples: 25 full predicate samples.
- First sample: elapsed 0 ms.
- Final sample: elapsed 600,000 ms.
- Maximum sample gap: 25,000 ms.
- Every sample asserted: unit disabled/inactive/dead/MainPID 0; zero legacy wrappers, Slack children, gateway commands, and Kasm cron-list commands; zero enabled Alex/Ops Conductor jobs; six negative-control hashes unchanged; five Hermes dashboards unchanged; container inventory hash unchanged; ABC sync timer enabled; Command Center service/status healthy.
- Rollback metadata: root-owned 0700 directory; exactly two root-owned 0600 artifacts; JSON parse PASS; original enabled counts 1 and 3. Paths and contents remain private and excluded.
- The durable value-free receipt is held on the legacy host under `/var/tmp`; it contains no credentials, job bodies, message content, or private rollback paths.
