# QuickBooks Online — production read-only / mirror-only guardrails

**Status:** standing invariant (2026-07-26)  
**Linear:** [PEC-98](https://linear.app/cleverwork/issue/PEC-98/qbo-production-read-only-guardrails-for-pe-cc-dashboard-native-oauth)  
**Related:** [PEC-53](https://linear.app/cleverwork/issue/PEC-53/quickbooks-mirror-seeded-and-verified-gated-pipeline) (Decision Cockpit mirror, READ-ONLY already proven)

## Invariant

**Live QuickBooks Online (Pro Exteriors LLC) is extract/mirror only.**

Agents, sync jobs, Composio tools, and bridge code may **read** production QB and write a **mirror** into Supabase / Open Brain / spreadsheets. They must **never**:

- create, update, delete, void, or pay any QB entity
- post journals, bills, invoices, credits, deposits, transfers, or payroll
- change customers, vendors, accounts, classes, or settings
- call Intuit Payments APIs against the production company

Sandbox (`QUICKBOOKS_SANDBOX_MODE=true`) may be used for connection/plumbing tests. It is not a license to write production.

## Why Intuit alone is not enough

OAuth scope `com.intuit.quickbooks.accounting` is **not** a platform-enforced read-only grant. A bearer token that can read can also mutate unless **we** refuse mutating calls. Guardrails are therefore Cleverwork-enforced at every layer below.

## Layers

| Layer | Control |
| --- | --- |
| Env kill switch | `QUICKBOOKS_ACCESS_MODE=read_only` and `QUICKBOOKS_WRITE_ENABLED=false` (default). Writes require both flipped **and** a separate human-approved Linear ticket. |
| HTTP client | `integrations/bridges/quickbooks/read-only-client.mjs` — only GET + query against QBO company API; OAuth token refresh is the sole allowed POST (to Intuit token endpoint, not company data). |
| Bridge metadata | `access_mode: read_only`, `write_enabled: false` in `metadata.json`. |
| Composio | Ban `QUICKBOOKS_CREATE_*`, `UPDATE_*`, `DELETE_*`, `VOID_*`, payment/capture tools against the production realm. Prefer native read-only client for prod pulls. |
| Agents | `@ob-accounting` and all harness hard rules: draft/recommend in the brain; Lucinda/Chandler change books in QB UI if needed. |
| Mirror destination | Supabase / Open Brain tables are the mutable copy. Production QB is upstream SoR for cash books; we do not write back. |

## Allowed operations (production)

- `GET /v3/company/{realmId}/…` (entity reads, reports, CDC)
- `GET /v3/company/{realmId}/query?query=select …` (read queries only — no DML)
- `POST https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer` with `grant_type=refresh_token` (token hygiene only)

## Forbidden operations (production)

Any of: `POST` / `PUT` / `PATCH` / `DELETE` to `*.quickbooks.api.intuit.com` or `sandbox-quickbooks.api.intuit.com` when the active realm is the **live** Pro Exteriors company, including batch ops that embed writes.

If a future product need requires write-back: open a Linear ticket, get human approval, flip env flags, and ship an allowlisted write lane with audit log — never silent.

## Connect-live checklist (after guardrails)

1. Confirm `QUICKBOOKS_ACCESS_MODE=read_only` and `QUICKBOOKS_WRITE_ENABLED=false` in `~/.config/cleverwork/master.env`.
2. Production OAuth Playground → select **Pro Exteriors LLC** → store `QUICKBOOKS_PROD_*` refresh + realm.
3. Smoke with read-only client: `companyinfo` + one `select count(*)` query only.
4. Proceed to mirror sync (PEC-69 cadence) — never enable write tools.

## Operator note

Chandler’s books stay cash-basis in QB. The WIP / runway dashboard is a **read-side mirror + AccuLynx/ABC join**, not a second set of books written into QBO.
