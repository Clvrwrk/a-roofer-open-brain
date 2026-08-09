# 88 · Multi-vendor Credit Memo pill (2026-08-09)

Chris's directive 2026-08-09: the "Credit Memo Requested" KPI card on
`/accounting/invoice-audit` must reflect **every vendor**, with one button per
vendor that opens that vendor's credit-memo email + downloads — the same flow ABC
has always had — and future agents must have written instructions for extending
it when a vendor is added.

```
┌──────────────────────────────────────────────┐
│ Credit Memo Requested            $1,920.42   │
│ 47 approved ($1,920.42) · 0 draft ($0.00)    │
│ [ABC →]   [SRS]*   [QXO]**                   │   * greyed: no CMs this run
└──────────────────────────────────────────────┘  ** greyed: Coming Soon
        │
        └─ /accounting/credit-memos/weekly?vendor=<slug>
             ├─ vendor-scoped request email (approved invoices only)
             ├─ ⬇ Reconciliation spreadsheet  (?vendor=<slug>)
             └─ ⬇ Tracker CSV                 (?vendor=<slug>)
```

## How it works

- **`lib/cm-vendor-roster.ts` is the single seam.** `CM_VENDORS` lists every
  vendor that appears on the pill: `{ slug, label, acronym, cmStatus }`. The
  pill, the weekly page, and the weekly-csv endpoint all iterate this array.
- **Button states** (rendered in `pages/accounting/invoice-audit.astro`):
  - `cmStatus: "live"` + ≥1 draft/approved CM → active button →
    `/accounting/credit-memos/weekly?vendor=<slug>`.
  - `cmStatus: "live"` + 0 CMs → greyed (`.iv-vendor-off`), tooltip
    *"No credit memos exist for this weekly run"*.
  - `cmStatus: "coming_soon"` → greyed, tooltip *"Coming Soon"* (QXO today).
  - Greyed buttons keep pointer events (no `pointer-events:none`) so the
    tooltip still shows — that is why `.iv-vendor-off` exists instead of
    reusing `.is-disabled`.
- **Vendor scoping** rides `credit_memo_requests.vendor_slug` (the docs/87 silo
  key), never `packet.vendor` (legacy label, fallback only).
  `/accounting/credit-memos/weekly?vendor=<slug>` filters requests **and**
  pending receipts; both download links carry the same `vendor` param and the
  CSV filenames gain a vendor tag.

## FUTURE AGENTS — adding vendor N+1 to the pill

1. Confirm the vendor exists in the DB `vendors` table; **use exactly that
   `vendors.slug`** (docs/87 hard rule: vendor slugs are the silo key on every
   money table — never invent a spelling).
2. Add one entry to `CM_VENDORS` in
   `app/command-center/src/lib/cm-vendor-roster.ts` with
   `cmStatus: "coming_soon"`. That alone puts the greyed "Coming Soon" button on
   the pill. **Do not touch invoice-audit.astro, weekly.astro, or
   weekly-csv.ts** — they iterate the roster.
3. Flip to `cmStatus: "live"` only when the vendor's CM pipeline is proven
   end-to-end: the claims engine writes `credit_memo_requests` rows carrying the
   vendor's slug, and `/accounting/credit-memos/weekly?vendor=<slug>` renders
   its email with correct totals. Verify through the live call path (click the
   button on the deployed page) — not just build/tests.
4. The zero-CM grey-out needs no work; it is computed from live counts.
5. Record the addition in the daily log and update this doc's roster table:

| Vendor | slug | acronym | cmStatus | Since |
|---|---|---|---|---|
| ABC Supply | `abc-supply` | ABC | live | 2026-08-09 |
| SRS Distribution | `srs` | SRS | live | 2026-08-09 |
| QXO | `qxo` | QXO | coming_soon | 2026-08-09 |

Related: docs/81 (weekly email semantics), docs/82 (KPI card), docs/87 (vendor
silo), PEC-189 (the 2026-08-09 catch-up that reset ABC's queues).
