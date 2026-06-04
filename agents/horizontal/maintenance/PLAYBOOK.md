# Maintenance Playbook — v1.0

> **Version:** 1.0
> **Effective:** 2026-05-29
> **Status:** Active
> **Previous versions:** none (initial release)
> **Next review:** End of first full operating month (target 2026-07-01)
> **Governed by:** Kaizen Review loop — see `kaizen_observations.md` and `docs/00-architecture-brief.md` §4.4
>
> This document is the living operational manual for the Maintenance agent. It evolves through the monthly Kaizen Review cycle. Chris + AM accept, defer, or kill proposed changes. Accepted changes increment the minor version (v1.0 → v1.1). Prior versions are archived under `agents/horizontal/maintenance/archive/`. **Maintenance never deletes its own history.**

---

## The 5S Spine

5S is a Toyota / Kaizen lean discipline applied here at the level of the brain's atom corpus rather than a physical workspace. Sort, Set in Order, Shine, Standardize, and Sustain map directly to the cadence and goals of memory hygiene. The brain rot equivalent of a cluttered factory floor is an atom corpus full of duplicates, missing era stamps, broken provenance chains, and trust tiers that have drifted from their original intent.

A brain that is not actively maintained will confidently mislead within 18 months of going live. This playbook is the discipline that prevents that outcome.

---

## DAILY — Sort

**Trigger:** 01:00 local cron. Runs after Capture's overnight atomization batch has completed.

**Goal:** Enter each business day with a clean, validated atom set from the prior day's ingests.

### Steps

**S1. Fingerprint deduplication (OB1 recipe)**

Run `skills/ob1/fingerprint-dedup` against all atoms with `created_at` in the last 24 hours.

- **True duplicate (identical fingerprint, identical client_id):** Merge. Retain the atom with the richer metadata; set the other to `cold_archive_status = deprecated`; write a merge log atom referencing both IDs.
- **Near-duplicate (fingerprint within edit-distance threshold, same property_id + job_id):** Do not auto-merge. Flag both atoms with `near_duplicate_flag: true` in metadata; write a contradiction flag atom; route to weekly Set in Order for human-review queue.

**S2. Required metadata validation**

For every atom with `created_at` in the last 24 hours, verify the following fields are populated:

| Field | Rule |
|---|---|
| `client_id` | Must not be null |
| `trust_tier` | Must be one of `instruction`, `evidence`, `inference` |
| `source_type` | Must not be null |
| `model_card` | Must not be null; must include `provider`, `model_name`, `captured_at` |
| `property_id` | Required when `source_type` is `acculynx`, `companycam`, `granola` (debrief) |
| `era_of_practice` | Required when content contains code-section references (detected by `era-tagger` pattern) |
| `soft_or_hard` | Required for all debrief-sourced atoms (`source_type = granola` or `fireflies`) |
| `eeat_signal` | Required on soft debrief atoms (`soft_or_hard = soft`); may be null-with-reason on others |
| `consent_flags` | Must not be null; `cross_client_shareable` must be explicitly set |

**Missing field action:** Write a missing-field flag atom referencing the atom ID and the specific missing field. Route to `flag_for_capture` queue. Do not modify the atom in place.

**S3. Provenance chain validation**

For every atom with `derived_from` set, verify the referenced atom IDs resolve. Walk up the chain up to 5 levels.

- **Broken chain (referenced atom not found):** Write a broken-chain flag atom; do not delete the referencing atom; route to QC flag queue.
- **Chain resolves:** No action.

**S4. Orphan atom detection**

Flag atoms where:
- `property_id` is null AND `job_id` is null AND `source_type` is NOT one of `slack`, `conductor`, `quality-control`, `auditor`, `innovator`, `maintenance` (i.e., operational atoms that by design may not have a job/property FK)

Flagged orphans go to a human-review queue in the Conductor dashboard. Do not delete.

**S5. One-line hygiene status**

Write the daily hygiene status atom and route to Conductor for inclusion in the morning digest.

Format:
```
Sort [YYYY-MM-DD]: [N] atoms processed | [N] true dups merged | [N] near-dups flagged | [N] missing-field flags | [N] broken chains | [N] orphans quarantined | status: [CLEAN | ATTENTION | ALERT]
```

Status thresholds:
- `CLEAN`: 0 broken chains, 0 missing-field flags on atoms with `source_type` in (`acculynx`, `granola`, `fireflies`, `companycam`), 0 orphans.
- `ATTENTION`: 1–4 missing-field flags or 1–2 near-dups or 1 broken chain.
- `ALERT`: 5+ missing-field flags, 3+ broken chains, or any atom with `client_id = null`.

---

## WEEKLY — Set in Order

**Trigger:** Sunday 03:00 cron (same run as Shine; Set in Order runs first).

**Goal:** A well-organized atom corpus where contradictions are flagged, cross-references are accurate, and the embedding landscape reflects the current model's sense of semantic proximity.

### Steps

**SO1. Contradiction reconciliation**

Search for atoms that share:
- Same `property_id` AND same semantic field (e.g., "roof material", "load-bearing wall", "foundation type")
- Different stated values

Contradictions are not resolved by Maintenance. Both atoms are flagged with a `contradicts` cross-reference to each other. Write one contradiction flag atom per pair. Route to QC.

*Roofer-specific attention:* Material and warranty atoms on the same property are a common contradiction source — one atom says "GAF Timberline HDZ installed 2020" and a later one says "Owens Corning Duration installed 2020." Flag for QC; do not auto-resolve.

**SO2. Cross-reference integrity**

For every atom that includes a `references`, `contradicts`, or `supersedes` field, verify all referenced atom IDs resolve in `public.thoughts`. Mark broken cross-references in the atom's metadata (add `cross_ref_broken: [array of broken IDs]`). Do not delete the referencing atom. Route broken refs to QC.

**SO3. Embedding drift re-clustering**

If the brain's configured embedding model has been updated since the last Set-in-Order run (check `model_card` of most recent embedding batch vs. current embedding model from config), identify atoms whose nearest neighbors have shifted by more than the configured cosine-drift threshold.

Log a re-cluster atom with counts. Flag to Conductor if more than 10% of the corpus has shifted neighborhoods — this warrants a full Quarterly Sustain embedding refresh ahead of schedule.

**SO4. Taxonomy drift (InfraNodus Ontology Creator)**

Run `skills/infranodus/ontology-creator` against the week's new atoms (last 7 days, `trust_tier IN (evidence, instruction)`).

Surface any new conceptual nodes or neighborhood shifts that represent new terminology or domain concepts entering the brain. Write an ontology drift atom with the summary. Route to QC with the note: *"New conceptual territory detected this week — consider whether the debrief script or agent prompts should be updated to capture these concepts explicitly."*

**SO5. Brain smoke-test**

Run `skills/ob1/brain-smoke-test`. Verifies: atom retrieval (semantic search), atom write, embedding generation, and MCP endpoint health.

- All green → write smoke-test pass atom.
- Any red → write smoke-test fail atom AND page Chris immediately via Conductor DM. Do not wait for next morning digest.

---

## WEEKLY — Shine

**Trigger:** Same Sunday 03:00 cron as Set in Order. Runs immediately after Set in Order completes.

**Goal:** Atoms that are actively used remain accurate and trustworthy. Stale references, expired consents, and decayed trust-tier confidence are surfaced and flagged before they mislead.

### Steps

**SH1. Trust-tier confidence refresh on high-leverage atoms**

Identify atoms that:
- `original_capture_date` is 6+ months ago
- Retrieved 3+ times in the last 90 days (high-leverage: worth a currency check)
- `trust_tier = evidence` or `instruction` (not inference)

For each, update `revalidation_timestamp` to today. Set `recontextualization_notes` to: *"Flagged for revalidation [date] — high retrieval frequency on an atom older than 6 months. Recommend human review if regulatory or technical content."*

Do not change `trust_tier`. Notify QC via flag atom that these atoms are candidates for a trust-tier review.

*Roofer-specific:* Insurance carrier bulletin atoms are especially prone to staleness. Any insurance-related `evidence` atom older than 12 months that has been retrieved 3+ times gets the revalidation flag and a specific note: *"Insurance carrier guidelines change frequently. Recommend Researcher fetch to verify currency."*

**SH2. Tool-spec-hash refresh**

For atoms derived from tool calls where `tool_spec_hash` is set, check whether the tool's current spec hash (from the running MCP version) matches the stored hash.

- Match → no action.
- Mismatch → set `recontextualization_notes` to include: *"Tool surface changed since this atom was written. Content derived from this tool may reflect old behavior. Revalidation recommended."* Route flag to QC.

**SH3. External source URL HEAD check**

For all atoms where `source_url` is populated AND `original_capture_date` is less than 12 months ago:

Run `head_check_url` for each URL.

- 200/301/302 → no action.
- 404/410 → set `source_link_broken = true` via `update_thought`. Do not modify `content` or `source_url`. Write a broken-link log atom.
- Timeout / 5xx → retry once after 60 seconds. If still failing, write a "source temporarily unreachable" note; re-check next week.

Atoms older than 12 months are not HEAD-checked unless they have been retrieved 3+ times in the last 90 days (same high-leverage criterion as SH1).

**SH4. Consent flag verification**

For every atom with `consent_flags.cross_client_shareable = true`:

- Verify `consent_flags.expires_at` is null OR in the future.
- If `expires_at` is within 30 days of today → write a consent-expiration warning atom; notify Conductor so Chris/AM can confirm renewal.
- If `expires_at` has already passed → immediately set `cross_client_shareable = false` via `update_thought`; write an expiration-enforced atom; notify Conductor.
- Verify `consent_flags.trade_restriction` is appropriate for the atom's content. If the atom describes a roofing-specific practice and `trade_restriction` does not include `roofing`, flag for QC review (this is likely a configuration oversight at capture time).

---

## MONTHLY — Standardize

**Trigger:** 1st of each month, 03:00 cron.

**Goal:** Ensure that agents are consistently filling required fields, that EEAT classification is stable, and that era stamps are applied wherever they are required.

### Steps

**ST1. Schema usage audit**

For each producing agent (`source_type IN (capture, ob-ops, ob-sales, ob-marketing, ob-accounting, ob-exec, conductor, auditor, quality-control, innovator)`), compute:

- Total atoms written in the last 30 days
- % of those atoms with each required field populated (see S2 field list above)

Produce a per-agent score. Any agent scoring below 90% on any required field → write a schema audit flag atom; route to QC for agent-prompt review.

Write the full schema audit atom with all per-agent scores.

**ST2. EEAT classification consistency**

Random-sample 50 soft atoms from the last 90 days (`soft_or_hard = soft`). Re-run the EEAT classifier on their content. Compare the re-classification result against the stored `eeat_signal`.

If agreement rate < 90% → write an EEAT consistency flag atom; route to QC with the disagreement examples. The classifier rubric may need updating.

**ST3. Era / regulatory snapshot completeness**

Scan all atoms written in the last 30 days for content that includes:
- IRC section references (e.g., "R905", "R903")
- OSHA reference numbers
- Local code amendment language (e.g., "AHJ requires", "per local amendment")
- Manufacturer installation requirement language that is code-dependent

For any such atoms without `era_of_practice` set → write a missing-era flag atom; route to `flag_for_capture` for re-atomization with era stamp.

*This is where knowledge-loss prevention is most fragile.* An IRC-2018 practice captured without an era stamp becomes indistinguishable from current practice in 2031. This step is non-negotiable.

**ST4. Provenance integrity sampling**

Random-sample 100 atoms from `public.thoughts` (across all `cold_archive_status` values except `deprecated`). For each:

- Verify `model_card` is populated and parseable
- Verify `source_type` is populated
- Walk `derived_from` chain up to source (max 5 levels); verify all IDs resolve

Report: % with complete provenance. If < 95% → route to QC as a priority integrity issue. Write provenance integrity report atom.

---

## QUARTERLY — Sustain

**Trigger:** 1st of January, April, July, October; 04:00 cron.

**Goal:** Long-arc brain health: cold-archive stale atoms, refresh embeddings, confirm PDCA validity on a human-reviewed sample, and verify backups are actually restorable.

### Steps

**SU1. Cold archive**

Identify atoms where:
- `cold_archive_status = live`
- `updated_at` < 18 months ago (no modification or revalidation in 18 months)
- Retrieved 0 times in the last 18 months (join against `atom_access_log`)

Move to cheaper storage tier: set `cold_archive_status = archived`. Write a cold-archive batch atom listing the atom IDs. These atoms remain queryable; they are returned in search results with `archived` flagged in metadata.

*Do not archive:* atoms with `trust_tier = instruction` without explicit QC authorization; atoms with active consent windows (`consent_flags.expires_at` in the future); atoms with unresolved contradiction flags.

**SU2. Schema migration**

Check whether any new required columns have been added to `public.thoughts` since the last Quarterly Sustain (compare against schema version in `config/roofer.config.yaml`).

For each new column:
- Attempt backfill from source data where possible (e.g., `era_of_practice` can often be inferred from `regulatory_snapshot_id`).
- Where backfill is not possible: set the field to a designated backfill sentinel (`backfill_inferred: true` in metadata JSONB) so downstream readers know this field was not captured originally.
- Write a schema migration log atom.

**SU3. Embedding refresh**

If a new embedding model version has been deployed this quarter (check `model_card` of most recent Capture atoms vs. prior quarter):

- Batch-refresh embeddings for all atoms. This is a write-heavy operation; acquire a write-lock and run during low-traffic window.
- Retain old embedding values in a `embedding_prior` metadata field for 90 days (rollback capability).
- Write an embedding refresh log atom with: model previous version, model new version, atom count refreshed, start/end timestamp.

If no model change this quarter: no action. Write a "no embedding refresh needed" status atom.

**SU4. PDCA round-trip**

Select 50 random atoms from `public.thoughts` (`cold_archive_status = live`, stratified across `source_type` and `trust_tier`).

Prepare a structured review packet for Chris + AM. For each atom:
- Display: `content`, `era_of_practice`, `original_capture_date`, `trust_tier`, `recontextualization_notes`, `model_card`
- Present three questions:
  1. Is this still true to the best of your knowledge?
  2. Does this still matter operationally?
  3. Does this atom need a recontextualization note for anyone who retrieves it in the future?

Collect responses. For each atom where human says "no longer true" or "needs recontextualization":
- Do NOT modify the atom's content (provenance is sacred).
- Add a `recontextualization_note` via `update_thought`: *"Reviewed PDCA [date]. [Practitioner name] indicated this practice has changed. See [newer atom ID if one exists]."*
- Route to QC for trust-tier review if the atom's current use as `instruction` is now questionable.

Write a PDCA round-trip summary atom with: sample size, % "still true", % "still matters", % receiving recontextualization notes.

**SU5. Backup verification**

Trigger the OB1 `brain-backup` recipe to:
1. Restore the most recent daily backup to a sandbox Supabase project.
2. Run `brain-smoke-test` against the restored sandbox.
3. Verify atom count matches within 0.1% of production.
4. Discard the sandbox project.

Write a backup verification atom: pass/fail, restored atom count, test timestamp.

If smoke-test on the restored backup fails → page Chris immediately. Do not proceed with the rest of the Quarterly Sustain run until backup integrity is confirmed.

---

## STRICT DON'T LIST

The following actions are unconditionally prohibited. No edge case, no performance optimization, no time pressure overrides these rules.

- **Never delete an atom outright.** Archive (`cold_archive_status = archived`) or deprecate (`cold_archive_status = deprecated`). The row stays in `public.thoughts` forever. History is the point.
- **Never modify an existing atom's content field.** The content of an atom is the record of what was captured at a moment in time. Recontextualization notes live in a separate field, not in the content itself.
- **Never modify provenance fields on an existing atom.** This includes: `derived_from`, `original_capture_date`, `original_practitioner`, `created_at`, `source_type`, `model_card`. These are immutable once written.
- **Never change `trust_tier` on any atom.** Quality Control is the only role with that authorization. Maintenance flags concerns and routes them to QC. It does not execute the change.
- **Never cross consent boundaries.** Do not access atoms from one client's brain during a maintenance run on another client's brain. Each client's Maintenance instance runs in full isolation.
- **Never publish to a client-facing or external surface.** All Maintenance output goes to Chris/AM and internal Cleverwork only. The client never sees Maintenance's working documents.
- **Never run during an active write-heavy ingestion without acquiring a lock.** Concurrent writes and maintenance reads on the same atom set can produce false dedup hits. Wait for the lock.
- **Never evolve this playbook outside the Kaizen Review cycle.** See `kaizen_observations.md` and `docs/00-architecture-brief.md` §4.4. Edits to this file require Chris/AM acceptance, not Maintenance self-editing. Even if Maintenance's own run reveals an obvious improvement, the improvement goes into `kaizen_observations.md` as an observation — it does not get applied directly.
