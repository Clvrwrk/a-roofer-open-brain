# Stormwatch Forensic Review (Conversation-Derived)

Date: 2026-06-25

This document captures high-value lessons, repeatable workflows, and automation targets discovered during the full Stormwatch implementation thread.

## 1) Tasks That Repeated (and should be standardized)

1. **Schema drift verification**
   - Repeated failures occurred when scripts assumed columns existed but remote schema lagged or differed.
   - Standard: preflight schema probe against live DB before runtime.

2. **Credential/alias validation**
   - Repeated `Missing required env var` and alias mismatch issues.
   - Standard: explicit alias-aware env checks before run.

3. **GHL sync diagnostics**
   - Runs finished with zero writes and no concise root-cause packet.
   - Standard: post-run query always returns ID list + top rejection reason.

4. **Storm event uniqueness guard**
   - Duplicate `external_event_id` caused unique key conflicts.
   - Standard: enforce new event ID per live run via preflight.

5. **Approval-path execution**
   - Shared-state writes were auto-blocked multiple times.
   - Standard: live write commands should be clearly separated from non-push simulation commands.

## 2) Expensive Issues We Should Not Re-Learn

## A. Integration/runtime failures

- **Cloudflare/WAF behavior (`1010`)**: fixed by stable explicit `User-Agent`.
- **Token expiration (`401 ZI0005`)**: required token refresh path.
- **Transient network timeouts**: required tolerant collectors + fallback to seed data.

## B. Data-contract failures

- **Partial upsert into strict tables** (`stormwatch_field_contract`) triggered `NOT NULL` failures.
- **Replay insert-vs-patch mismatch** triggered `run_id`/`office_id` constraints.
- **Seed-company missing IDs** violated unique constraints; resolved with deterministic synthetic IDs.

## C. Business-result failures

- **All contacts rejected on mandatory gate** (`missing_office_address`) -> zero GHL object creation despite successful pipeline execution.
- Interpretation: operationally "run succeeded" but business objective failed.

## 3) Repeatable Steps (Golden Path)

1. Run preflight:
   - `python3 scripts/stormwatch/stormwatch_preflight.py --event-id <new_id>`
2. Run non-push validation:
   - `python3 scripts/stormwatch/run_storm_alert_pipeline.py --event-file ... --property-seed-file ...`
3. Confirm accepted leads expected (>0) and gate reasons acceptable.
4. Run live push:
   - `python3 scripts/stormwatch/run_storm_alert_pipeline.py --event-file ... --property-seed-file ... --push-ghl`
5. Return exact IDs from DB for contact/opportunity/property records.

## 4) What Belongs Where

## Knowledge base updates (done)

- `docs/53-storm-alert-sla-validation-2026-06-24.md`
- this forensic report (`docs/54-stormwatch-forensic-review-2026-06-25.md`)
- field contract + GHL capability docs updated in previous pass.

## Memory updates (done this session)

- Added durable Stormwatch forensic summary to daily memory log and curated memory snapshot.

## Skillization (done)

- New skill: `.codex/skills/stormwatch-live-run-ops/SKILL.md`
- Encodes mandatory preflight + execution + ID-return contract.

## Pluginization (implemented as plugin-ready automation)

- New script: `scripts/stormwatch/stormwatch_preflight.py`
- This script is plugin-ready and can be exposed as an MCP/custom command with one method:
  - input: `event_id`, `office_id`
  - output: pass/fail JSON, failing checks, next action.

## 5) Build Decisions Locked

1. **Preflight is mandatory before `--push-ghl`**
2. **User-Agent headers are mandatory across external APIs**
3. **Event IDs must be unique per run**
4. **Live-write run must always report exact created IDs or explicit none + reason**
5. **Mandatory gate failures are treated as operational blockers, not just data quality notes**

## 6) Configuration Work That Should Benefit Next

1. Wire `stormwatch_preflight.py` into runbooks/automation entrypoint.
2. Add CI/check target to run preflight in non-live mode on sample event IDs.
3. Add "gate-attrition alert" threshold (e.g., >60% rejected for one reason).
4. Add automatic fallback branch: if accepted=0 in non-push simulation, block live push and require operator acknowledgement.
