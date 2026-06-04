# 13 — Pro Exteriors Admin Interface MVP

> **Status:** Working plan, created 2026-06-01.
> **Purpose:** Build the human viewport before Slack automation so Pro Exteriors can review agent work safely in a browser.

## Decision

Build the admin interface before Slack communication. Slack should notify and collect fast approvals after the workflow is trustworthy; the admin app is where we prove the workflow, inspect evidence, and tune the gates.

The first implementation lives at:

`deployment/remote/dashboard/`

It is dependency-light static HTML/CSS/JS with Node scripts for local serving, checking, and static build. It currently uses sample pilot data and browser `localStorage` so Chris and Lucinda can test the review experience before agents write to production-shaped workflow tables.

## MVP Screens

| Screen | Purpose |
| --- | --- |
| Command Center | One place to see expected credit, ready audits, pending product matches, and open credit memo packets. |
| Invoice Audits | Invoice-level queue showing vendor, region, disputed lines, expected credit, and the current gate. |
| Product Matches | Human review for vendor SKU/product equivalency candidates before they become instruction-grade. |
| Credit Memos | One-invoice packet preview and draft email body with approve, request changes, reject, sent-by-human, and received states. |
| Audit Log | Append-only event stream for agent actions, human decisions, and status changes. |
| Settings | Pilot guardrails: Supabase source of truth, human-only external sends, archive-only records, independent audit gate. |

## Current Local Behavior

- Real browser UI works without Slack.
- Decisions persist in browser `localStorage`.
- Approval action IDs mirror the planned Slack callback IDs:
  - `product_match.approve`
  - `product_match.reject`
  - `product_match.needs_review`
  - `credit_memo_request.approve`
  - `credit_memo_request.request_changes`
  - `credit_memo_request.reject`
  - `credit_memo_followup.mark_sent_by_human`
  - `credit_memo_followup.mark_received`
- No external communication is sent.
- No source records are changed.
- Reset only clears local demo state.

## Supabase Wiring Contract

The browser app must not receive `SUPABASE_SERVICE_ROLE_KEY`. The next build should add a server-side admin API that owns privileged Supabase writes.

Initial API seam:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/admin/state` | Return dashboard queues and selected packet data. |
| `POST /api/admin/product-matches/:id/approve` | Approve product equivalency candidate after human click. |
| `POST /api/admin/product-matches/:id/reject` | Reject and retain candidate history. |
| `POST /api/admin/credit-memos/:id/approve` | Mark one-invoice packet approved internally. |
| `POST /api/admin/credit-memos/:id/request-changes` | Return packet to agent with correction reason. |
| `POST /api/admin/credit-memos/:id/reject` | Reject packet and retain audit history. |
| `POST /api/admin/credit-memos/:id/mark-sent` | Human confirms external vendor email was sent. |
| `POST /api/admin/credit-memos/:id/mark-received` | Human confirms credit memo receipt and amount. |

## Workflow Tables Still Needed

Use the existing Pro Exteriors tables for vendors, regions, price agreements, products, invoices, and ABC imports. Add only workflow/control tables for the admin layer:

- `agent_action_log`
- `vendor_invoice_batches`
- `vendor_region_mappings`
- `product_equivalency_candidates`
- `product_equivalency_approvals`
- `vendor_invoice_audits`
- `credit_memo_requests`
- `credit_memo_request_lines`
- `credit_memo_followups`
- `admin_review_packets`

Each table should include `environment`, `status`, `created_at`, `updated_at`, `archived_at`, and provenance fields where applicable.

## Build Order

1. Validate the admin MVP with sample data in the browser.
2. Query real Supabase region/product/invoice values and shape the admin API response.
3. Draft workflow/control table migration locally.
4. Wire `GET /api/admin/state` to read real invoices, agreements, matches, and packets.
5. Wire write actions to workflow/control tables only.
6. Add authentication before any non-local deployment.
7. Add Slack as a notification/approval mirror after the admin flow is comfortable.

