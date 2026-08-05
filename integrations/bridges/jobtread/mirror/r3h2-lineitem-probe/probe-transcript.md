# JobTread createDocument Line-Item Probe — Round 2

## Probe Goal

Determine whether `createDocument.lineItems` union resolution succeeds when a
`newCostItem` includes `unitCost`, when the known cost IDs are also included,
when an existing catalog cost item is referenced, or when the numeric values are
sent as strings.

The probe used one pilot job, `22PbdV2TvzU2`, in JobTread organization
`22PazeRM5FCH`. The real unit ID was `22PbdLixhBJr`. V6 used cost-item crosswalk
ID `22PbdRX5Fnuh`.

## Commands Run

1. Loaded credentials from
   `/Users/chussey/.config/cleverwork/master.env` with `set -a; source ...;
   set +a`. No credential value was printed or written.
2. Queried Supabase read-only for a cost-item crosswalk ID:

   ```sql
   select jt_id, source_table, source_id
   from jt_mirror.crosswalk
   where jt_type='costItem'
   limit 1
   ```

   Result: `22PbdRX5Fnuh`, sourced from `acculynx_estimate_items` with source ID
   `catalog-9d337eaf8f418a932314b6d79934aeee`. A second read-only query confirmed its
   matching `jt_mirror.pending_write` row is in domain `catalog_items` with
   status `executed`.
3. Built every Pave body with Python `json.dumps` and POSTed it to
   `https://api.jobtread.com/pave`.
4. Submitted V4, V5, V6, and V7 in order. Each response was inspected for
   `createDocument.createdDocument.id` before proceeding.
5. Redacted `query.$.grantKey` before recording each complete request.

## Observed Behavior

- V4 (`newCostItem` with numeric `unitCost`, no cost IDs): HTTP 400. Pave said
  the line-item value did not resolve to any of the four union variants.
- V5 (V4 plus `costCodeId` and `costTypeId`): HTTP 400 with the same union
  resolution failure.
- V6 (`existingCostItem` with `costItemId` and numeric `quantity`): HTTP 400
  with the same union resolution failure. The error did not name a replacement
  or expected inner ID key, so no key adjustment was indicated.
- V7 (V5 with `quantity`, `unitCost`, and `unitPrice` as strings): HTTP 400 with
  the same union resolution failure.

No response contained a created document ID. Full verbatim errors are preserved
in `probe-output.json`.

## Winning Shape

none succeeded

## Cleanup Proof

Created documents: **0**.

Every request failed at union resolution with HTTP 400 and returned no
`createDocument.createdDocument.id`. Consequently there was no created ID that
could be passed to `deleteDocument` or read back. No deletion call was needed or
possible, and the number of outstanding temporary documents from this probe is
**0**.

## Verdict

The hypothesis that adding `unitCost` makes `newCostItem` resolve is rejected.
The known cost IDs do not repair resolution, and converting the numeric fields
to strings also does not repair it. The failure is broader than those values:
even the tested `existingCostItem` wrapper failed identically.

These results do not isolate hypothesis A versus B by themselves because Pave
rejects the union element before returning inner-field-specific validation.
They point instead to an undocumented or different document-line-item union
shape (including potentially a different discriminator/wrapper or required
inner fields) rather than `unitCost`, the two cost IDs, name length, or numeric
encoding alone.
