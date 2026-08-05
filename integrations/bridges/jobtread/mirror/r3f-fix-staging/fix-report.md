# jt-acculynx-mirror — Third Repair Pass

## Repairs Applied

- Repaired the single failed `jobs/createJob` row without touching any `executed` or `skipped` row.
  - Shortened the 55-character job name to no more than JobTread's 30-character limit.
  - Used a word boundary and a single-character ellipsis where possible.
  - Prepended the original full name to `description` as `AccuLynx name: <full name>\n\n<existing description>`.
  - Reset `status = 'staged'`, `error = null`, and `attempt = 0`.
- Rebuilt all 25 repairable `job_custom_values/updateJob` payloads (16 formerly failed and 9 already staged) to the canonical Pave update shape:

  ```json
  {
    "$": {
      "id": "<JobTread job id>",
      "customFieldValues": {
        "<JobTread custom field id>": "<preserved value>"
      }
    },
    "job": {
      "$": {
        "id": "<same JobTread job id>"
      },
      "id": {}
    },
    "__execution_order": 100
  }
  ```

- Preserved all 124 original custom-field values exactly. Twenty-four rows carried five values; one row carried four.
- Used literal JobTread job IDs for the 24 jobs present in `jt_mirror.crosswalk`. The one not-yet-created job retained its `acculynx_job:<id>` `$ref` in both required ID positions.
- Reset all 25 custom-value rows to `status = 'staged'`, `error = null`, and `attempt = 0`.

The bulk loader needs a systematic job-name rule: cap every JobTread job name at 30 characters, prefer a word-boundary truncation plus ellipsis, and preserve the original full AccuLynx name in the description.

## Id Resolution

Old payload references were matched by removing the `jt_stage_custom_field:` prefix and joining the remaining field name to `jt_mirror.crosswalk.source_id`, restricted to `jt_type = 'customField'` and `source_table = 'jt_stage_custom_field'`.

| Payload field reference | Literal JobTread custom field ID |
| --- | --- |
| `AccuLynx Branch` | `22PbdNJvDh4i` |
| `AccuLynx Sales Rep` | `22PbdNTtsPtx` |
| `AccuLynx Milestone` | `22PbdNTy5jc7` |
| `AccuLynx Job #` | `22PbdLir32Hv` |
| `CompanyCam Link` | `22PbdLiuM4Rn` |

Job IDs were resolved from the AccuLynx job ID in each row's `source_ref` against `jt_mirror.crosswalk`, restricted to `jt_type = 'job'`.

## Closed-Job Note

These seven literal JobTread job IDs previously returned `You don't have permission to update this job`:

| JobTread job ID | Did its `createJob` payload carry `closedOn`? |
| --- | --- |
| `22PbdV2TvzU2` | No |
| `22PbdV48SXCC` | No |
| `22PbdV3ptKxk` | No |
| `22PbdV3gnFH7` | No |
| `22PbdV3SKMjG` | No |
| `22PbdV3Aphhh` | No |
| `22PbdV2t8Vgk` | No |

This is a pure SQL finding for executor handling: all seven corresponding `createJob` rows were executed, but none of their create payloads included a `closedOn` key.

## Verdict

**PASS.**

Live SQL verification after the repair:

- 25 staged `job_custom_values` rows.
- 25 canonical Pave payloads.
- 1 deferred `$ref` row for the not-yet-created truncated-name job.
- 124 custom-field keys, all 124 present in the crosswalk as `jt_type = 'customField'`.
- 1 repaired staged `createJob` row with a name of at most 30 characters and the original name preserved in its description.
- 0 failed rows anywhere in `jt_mirror.pending_write`.
- 0 `executed` or `skipped` rows updated by this repair.
