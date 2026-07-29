# JobTread createDocument Line-Item Probe — Round 3

## Probe Goal

Test the hypothesis that Pave resolves `createDocument.lineItems` union
variants from the bare element's key set rather than from a wrapper key.

The probe used one pilot job, `22PbdV2TvzU2`, in JobTread organization
`22PazeRM5FCH`. The verified executed unit ID was `22PbdLixhBJr`, and the
verified executed catalog cost-item ID was `22PbdRX5Fnuh`.

## Commands Run

1. Loaded credentials with `set -a; source
   /Users/chussey/.config/cleverwork/master.env; set +a`. No credential value
   was printed or written.
2. Queried `jt_mirror.crosswalk` read-only and selected pilot job
   `22PbdV2TvzU2`.
3. Queried `jt_mirror.pending_write` read-only and verified unit
   `22PbdLixhBJr` and catalog cost item `22PbdRX5Fnuh` both have status
   `executed`.
4. Built each Supabase and Pave request body using Python `json.dumps`.
5. POSTed V8, V9, V10, and then conditional V11 to
   `https://api.jobtread.com/pave`, in that order.
6. Checked every response for `createDocument.createdDocument.id` before
   proceeding. Every response was HTTP 400 and contained no created ID.
7. Redacted `query.$.grantKey` before recording the complete requests in
   `probe-output.json`.

## Observed Behavior

- V8, the bare new-item-shaped element with both cost IDs, returned HTTP 400.
  Pave reported that the complete bare value did not resolve to
  `existingCostGroup`, `existingCostItem`, `newCostGroup`, or `newCostItem`.
- V9, the bare existing-item-shaped element with verified executed
  `costItemId` and `quantity`, returned HTTP 400 with the same union-resolution
  class.
- V10, the bare new-item-shaped element with `costTypeId` but no `costCodeId`,
  returned HTTP 400 with the same union-resolution class.
- Because V8–V10 all failed, V11 was run. Adding `isSelected: true` to V8 did
  not change the result: HTTP 400 and the same union-resolution class.

Every full response body is preserved verbatim in `probe-output.json`. No
response contained `createDocument.createdDocument.id`.

## Winning Shape

none succeeded

## Cleanup Proof

Created documents: **0**.

All four requests failed validation with HTTP 400 before returning a created
document ID. Therefore there was no temporary document ID to pass to
`deleteDocument`, and no created ID to query after deletion. Each
`probe-output.json` cleanup record explicitly shows `createdDocumentId: null`,
that deletion was not applicable, and zero outstanding temporary documents.

Outstanding temporary documents: **0**.

## Verdict

The new bare-element hypothesis is rejected for all tested discriminators.
Neither the full new-cost-item key set, a verified existing `costItemId`,
`costTypeId` as the sole cost discriminator, nor `isSelected: true` caused the
union to resolve.

These results make the specific cost-code/cost-type values and name length
unlikely to be the primary failure. Pave is rejecting both wrapped and bare
representations before inner-field validation. The remaining likely cause is
an undocumented line-item input shape or discriminator not represented by the
tested fields.
