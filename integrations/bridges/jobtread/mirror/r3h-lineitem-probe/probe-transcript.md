# JobTread createDocument Line-Item Probe

## Probe Goal

Isolate whether `createDocument.lineItems[].newCostItem` union resolution fails
because of `costCodeId`, `costTypeId`, or another inner-field constraint.

The probe used one pilot job (`22PbdV2TvzU2`), one mirrored JobTread unit
(`22PbdLixhBJr`), and the staged document type `customerOrder`.

## Commands Run

1. Loaded credentials from `/Users/chussey/.config/cleverwork/master.env`
   without printing them.
2. Queried `jt_mirror.pending_write` read-only and copied the staged top-level
   shape: `type`, `name`, `jobId`, and `lineItems`.
3. Queried `jt_mirror.crosswalk` read-only for one job ID and one unit ID.
4. Built every Supabase and Pave request body with `python3` `json.dumps`.
5. POSTed V1, V2, and V3 to `https://api.jobtread.com/pave` in order.
6. Checked each response specifically for
   `createDocument.createdDocument.id`.
7. Stopped after V3 because none of the variants returned a created ID.

Before the actual probes, response-selection preflight calls were rejected
before mutation because `document` is not the mutation result field. A
successful `createJob` audit record showed the proven Pave convention
`created<Entity>`, so the actual probes requested `createdDocument.id`.
These preflight calls created no documents.

The exact redacted requests and complete HTTP response bodies for the actual
three probes are in `probe-output.json`.

## Observed Behavior

- V1, with neither cost ID, returned HTTP 400 and:
  `The value {"newCostItem":{"name":"Probe Item","unitId":"22PbdLixhBJr","quantity":1,"unitPrice":10,"description":"probe"}} at "createDocument"."$"."lineItems"."0" does not resolve to "existingCostGroup", "existingCostItem", "newCostGroup", or "newCostItem"`
- V2, with `costCodeId` only, returned HTTP 400 and:
  `The value {"newCostItem":{"name":"Probe Item","unitId":"22PbdLixhBJr","quantity":1,"unitPrice":10,"description":"probe","costCodeId":"22PbdLkpZX5s"}} at "createDocument"."$"."lineItems"."0" does not resolve to "existingCostGroup", "existingCostItem", "newCostGroup", or "newCostItem"`
- V3, with both known IDs, returned HTTP 400 and:
  `The value {"newCostItem":{"name":"Probe Item","unitId":"22PbdLixhBJr","quantity":1,"unitPrice":10,"description":"probe","costCodeId":"22PbdLkpZX5s","costTypeId":"22PazefY5x4j"}} at "createDocument"."$"."lineItems"."0" does not resolve to "existingCostGroup", "existingCostItem", "newCostGroup", or "newCostItem"`

No response contained `createDocument.createdDocument.id`.

## Winning Shape

none succeeded

## Cleanup Proof

No temporary document was created by V1, V2, or V3: every actual probe
returned HTTP 400 and none contained a created document ID. Accordingly,
there was no created ID that could be passed to `deleteDocument` or queried
after deletion. Each record's `cleanup` value in `probe-output.json` is
therefore `null`.

Created documents: **0**. Outstanding temporary documents: **0**.

## Verdict

Hypothesis A is disproved in its narrow form: removing `costCodeId` and
`costTypeId` did not make `newCostItem` resolve. Hypothesis B is also not
supported as the sole cause: the failure occurs without either specific ID.

The evidence supports hypothesis C or an untested shape constraint. Even the
short name `Probe Item` fails, so name length is not the likely constraint.
The unresolved issue is another required/forbidden field or a different
document-context tagged-union representation. No variant worked.
