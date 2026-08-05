# JobTread createDocument Line-Item Probe — Round 4

## Probe Goal

Test whether Pave requires a `_type` discriminator on `createDocument.$.lineItems`
union elements. The probe used one pilot job, `22PbdV2TvzU2`, in JobTread
organization `22PazeRM5FCH`. The real unit ID was `22PbdLixhBJr`, and the
executed catalog cost-item ID was `22PbdRX5Fnuh`.

## Commands Run

1. Loaded credentials with `set -a; source
   /Users/chussey/.config/cleverwork/master.env; set +a`. No credential value
   was printed or written.
2. Queried `jt_mirror.crosswalk` and `jt_mirror.pending_write` read-only to
   ground the pilot job, unit, and executed catalog cost-item IDs.
3. Built every Supabase and Pave request body using Python `json.dumps`.
4. POSTed V12, V13, and V14 in order to `https://api.jobtread.com/pave`.
5. After all three returned HTTP 400 without a created document ID, POSTed the
   conditional V15 casing probe.
6. Checked every response for a created document ID. None contained one.
7. Redacted `query.$.grantKey` before recording each complete request in
   `probe-output.json`.

## Observed Behavior

- V12 used `_type: "newCostItem"` with the full proposed new-cost-item fields.
  Pave returned HTTP 400 and said the complete element did not resolve to
  `existingCostGroup`, `existingCostItem`, `newCostGroup`, or `newCostItem`.
- V13 used `_type: "existingCostItem"` with an executed catalog cost-item ID
  and quantity. It returned the same union-resolution error class.
- V14 used `_type: "newCostItem"` with only name, quantity, and unit price. It
  returned the same union-resolution error class.
- V15 changed the minimal discriminator casing to `_type: "NewCostItem"`. It
  also returned the same union-resolution error class.

All four responses were HTTP 400. The complete response bodies are preserved
verbatim in `probe-output.json`. No response contained a created document ID.

## Winning Shape

none succeeded

## Cleanup Proof

Created documents: **0**.

Each request failed union validation before returning a created document ID.
Consequently there was no temporary document ID on which `deleteDocument` or
document-ID read-back could operate. Every cleanup record in
`probe-output.json` records `createdDocumentId: null`, deletion as not called,
read-back as not applicable, and zero outstanding temporary documents.

Outstanding temporary documents: **0**.

## Verdict

The `_type` discriminator hypothesis is rejected for the tested lowercase and
PascalCase values. `_type` did not make either a new-cost-item-shaped element
or an existing-cost-item-shaped element resolve. The minimal V14 result also
makes the supplied cost-code ID, cost-type ID, unit ID, and description
unlikely to be the immediate cause: Pave rejected an element without those
fields at the same union-resolution stage.

The failure remains an undocumented `createDocument.lineItems` input-shape or
union-discriminator requirement rather than a demonstrated inner-field
constraint.
