# 50 - Invoice Audit Communications Preview Validation

This runbook validates the Invoice Audit communications preview wiring for the first vertical slice:

- Department -> submenu -> Invoice Audit
- Line-item disposition -> communications preview
- Execution layer (`Approved`, `Edit`, `Rejected`, `Delete`)
- Internal-only queueing to Slack + email (manual release required)

## Scope and safety

- External auto-send remains disabled.
- Approved actions create internal delivery records only.
- Slack queue rows are written to `slack_mirror_events`; email queue rows are written to `communication_delivery_attempts`.

## Automated verification

From `app/command-center`:

```bash
npm test
npm run build
```

Expected:

- Vitest passes:
  - `invoice-audit-communications.unit.test.ts`
  - `preview.api.test.ts`
  - `action.workflow.test.ts`
- Astro build succeeds.

## Manual QA checklist

1. Open `Accounting -> Invoice Audit`.
2. Expand an invoice, click a line, then click a disposition action.
3. Confirm tab switch to `Communications Preview`.
4. Confirm both channel drafts render:
   - Subject line
   - Message body
   - Attachment links (`Invoice PDF`)
5. Confirm validation pills render:
   - Green for ready
   - Red for missing route / link issues
6. Click `Edit (WYSIWYG)`:
   - Modify draft content
   - Save
   - Confirm updated draft re-renders and validation re-runs
7. Click `Rejected (reason)`:
   - Enter reason in WYSIWYG popout
   - Save
   - Confirm thread transitions to rejected state
8. Regenerate preview and click `Approved`:
   - Confirm success toast
   - Confirm line audit updates in the invoice tree
   - Confirm thread status is queued for release
9. Confirm DB side effects:
   - `communication_threads` row exists and updated
   - `communication_messages` channel drafts exist
   - `communication_events` ledger has lifecycle entries
   - `communication_delivery_attempts` has `ready_to_send`
   - `slack_mirror_events` has queued mirror row
10. Click `Delete` on an unapproved draft:
    - Confirm thread status transitions to deleted

## Database objects introduced

- Tables:
  - `communication_routes`
  - `communication_threads`
  - `communication_messages`
  - `communication_events`
  - `communication_delivery_attempts`
- Views:
  - `v_communication_preview_queue`
  - `v_communication_event_timeline`

## Known implementation boundaries (v1)

- Fleet/Tools communications remain placeholders.
- Email is validated + queued but not automatically sent.
- Link-health validation checks route/link integrity and invoice existence; delivery remains human-gated.
