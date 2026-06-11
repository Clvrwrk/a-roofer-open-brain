# AccuLynx API Blocker Email Draft

Date: 2026-06-09
Owner: Cleverwork / Open Brain AccuLynx integration
Repository worktree: `/private/tmp/a-roofers-open-brain-acculynx-api-blockers-worktree`

## Validation Scope

This draft is based on:

- Current AccuLynx public docs extracted with Global Web Intel on 2026-06-09:
  - `https://apidocs.acculynx.com/llms.txt`
  - `https://apidocs.acculynx.com/changelog`
  - `https://apidocs.acculynx.com/reference/postcreatejobmessage`
  - `https://apidocs.acculynx.com/reference/postreplyjobmessage`
  - `https://apidocs.acculynx.com/reference/postcontactlog`
  - `https://apidocs.acculynx.com/reference/getjob`
  - `https://apidocs.acculynx.com/reference/getjobhistory`
  - `https://apidocs.acculynx.com/reference/gettopics`
  - `https://apidocs.acculynx.com/docs/webhooks-listener-documentation`
  - `https://apidocs.acculynx.com/docs/webhooks-end-user-reference`
- Generated local AccuLynx reference from the 2026-06-09 `acculynx-api` skill:
  - `skills/cleverwork-roofer/acculynx-api/reference/openapi-index.json`
  - `skills/cleverwork-roofer/acculynx-api/reference/full-endpoint-reference.md`
- Project files reviewed:
  - `integrations/bridges/acculynx/README.md`
  - `integrations/bridges/acculynx/mapping.md`
  - `integrations/bridges/acculynx/handler.ts`
  - `agents/horizontal/capture/ROLE.md`
  - `agents/horizontal/capture/io-contract.md`
  - `agents/horizontal/conductor/ROLE.md`
  - `agents/vertical/accounting/ROLE.md`
  - `agents/vertical/ops/ROLE.md`
  - `agents/vertical/sales/ROLE.md`
  - `agents/vertical/marketing/ROLE.md`
  - `docs/01-onboard-a-roofer.md`
  - `docs/TROUBLESHOOTING.md`
  - `app/command-center/src/lib/live-work.ts`
  - local untracked context: `docs/33-roofing-estimate-to-proposal-system-spec.md`

No live production AccuLynx customer-data probe was performed during this pass. Where the notes mention prior test behavior, that is marked as project-note evidence rather than a fresh production API test.

## Blocker Matrix

| Blocker | Status | Current API evidence | Work blocked | Request |
| --- | --- | --- | --- | --- |
| Job message / comment stream read access | Confirmed public-doc blocker | Current docs expose `POST /jobs/{jobId}/messages` and `POST /jobs/{jobId}/messages/{messageId}/replies`; no `GET` or list endpoint appears in the 124-operation index. `GET /jobs/{jobId}` supports includes `contact` and `initalAppointment`, not messages. Project notes record `GET /jobs/{jobId}/messages` returning `404` with `Allow: POST`. | Capture atomization, Conductor triggers, soft/hard job memory, Ops daily logs, Sales adjuster/claim context, Accounting follow-up context. | Provide read/list API and message webhooks, or confirm this is intentionally human-only and give supported workaround. |
| Contact log read access | Confirmed public-doc blocker | Current docs expose `POST /contacts/{contactId}/logs`; no `GET /contacts/{contactId}/logs` or log webhook appears. Project notes record the path as write-only. | Sales/accounting follow-up aging, communication history, last-contact context, customer preference memory. | Provide contact-log read/list API and webhook, or confirm human-only. |
| Message/note webhooks | Confirmed missing from current public topics | Generated docs include 23 webhook event reference pages; none are message/comment/note created, message replied, or contact-log created. Capture role currently expected `note.created`, but that topic is not present in the current docs index. | Real-time AI triggers are being funneled into a human chat/comment surface that agents cannot see. | Add/enable message/comment/log webhooks or confirm no event exists and recommend polling/human workflow. |
| Webhook topic names, access, and signature verification | Access/ambiguity blocker | Docs expose `GET /topics`, `POST /subscriptions`, and `POST /subscriptions/{subscriptionId}/test-event`. Repo notes say webhooks can be tier-gated. Handler still has TODO for exact signature header and algorithm. Listener docs describe a returned secret but do not clearly document signing header/canonicalization. | Reliable production webhook ingestion, debrief trigger, sync health, auditability. | Confirm account webhook entitlement, canonical `topicName` values, exact signature header, algorithm, replay protection expectations, and sample payloads. |
| Job milestone/status/task write-back | Partial blocker | Read endpoints exist for current milestone, milestone history, milestone statuses, and webhook events. Current public index does not show an endpoint to move a job milestone/status or mark task completion. It does show specific update endpoints for priority, category, lead source, work type, trade types, location, initial appointment, insurance, adjuster, and representatives. | Conductor PM-tool sync; Sales pipeline stage automation; Ops workflow status updates. | Provide milestone/status/task write endpoints or confirm those updates must be done by a human in AccuLynx. |
| Proposal/contract/signature workflow | Likely blocker / needs AccuLynx confirmation | Current public index has zero `contract` operations and zero `proposal` operations. Project estimate-to-proposal spec requires Good/Better/Best options, selected-option acceptance, initials, and full signature. | Proposal acceptance flow, contract packet handoff, signed-scope verification. | Confirm whether AccuLynx contract/proposal APIs exist, are private/partner-only, or are human-only. |
| Invoice and change-order write-back | Partial blocker | Invoice reads exist: `GET /jobs/{jobId}/invoices`, `GET /invoices/{invoiceId}`. Payment writes exist for paid/received/expense records. Worksheet item creation exists. Current public index does not show invoice create/update/void endpoints or a named change-order entity endpoint. | Accounting progress/final invoice drafts, change order accounting, draw schedule automation. | Provide invoice/change-order write APIs or confirm invoice/change-order creation must remain human-only. |
| Documents/photos/videos read/list/download | Likely blocker | Upload endpoints exist: `POST /jobs/{jobId}/documents`, `POST /jobs/{jobId}/photos-videos`. Settings reads exist for document folders and photo/video tags. Current public index does not show job document list/download or job photo/video list/download endpoints. Older bridge notes assumed job-detail includes could read photos, but current `GET /jobs/{jobId}` docs only list `contact` and `initalAppointment`. | EEAT/photo atoms, claim evidence review, closeout proof pack, document audit, proposal/contract attachment verification. | Provide list/download/metadata endpoints or the correct include parameter; confirm whether file webhooks exist. |
| Supplement change events | Polling blocker | Supplement reads exist: `GET /supplements`, `GET /supplements/{supplementId}`, `GET /supplements/{supplementId}/items`, `GET /supplements/{supplementId}/notations`. No supplement webhook appears in the generated event list. Repo bridge already plans 4-hour polling. | Insurance supplement tracking, revenue changes, claim status triggers. | Provide supplement created/updated/approved webhooks or confirm polling is the intended pattern. |
| Measurement files endpoint mismatch | Docs inconsistency / likely blocker | Changelog says "Add Measurement Files" at `GET /api/v2/jobs/{jobId}/measurements/files`, but the generated 124-operation reference contains zero measurement operations. | Measurement upload/handoff in the estimate-to-proposal workflow. | Confirm current endpoint path, method, request body, account availability, and whether the changelog method is correct. |
| Materials/order APIs | Likely human-workaround blocker | Current public index contains zero material/order operations. The project spec explicitly requires material order draft generation and human approval, with external ordering out of scope unless separately approved. | Ops material-order draft writeback and order state sync. | Confirm whether AccuLynx has material-order APIs; otherwise we will keep Slack/dashboard handoff as the supported workflow. |

## Sendable Email Draft

Subject: AccuLynx API blockers for AI workflow integration - request for access or confirmed workarounds

Hi AccuLynx API Team,

We are building an AI-assisted operating layer for a roofing contractor using AccuLynx as the system of record. The goal is not to bypass AccuLynx or automate risky external actions. The goal is to keep AccuLynx as the authoritative PM system while letting our internal AI agents capture job context, route work, draft internal handoffs, and ask humans for approval when a task requires judgment.

We reviewed the current public API documentation and our project implementation notes on June 9, 2026. Several workflows are blocked because the user activity that drives the business is happening inside AccuLynx surfaces that the public API does not appear to expose for read access or webhook triggers.

The largest blocker is the AccuLynx job message/comment stream. Our human users are putting operational notes, daily updates, customer preferences, adjuster details, field issues, and follow-up triggers in the AccuLynx message/comment interface. Our AI agents cannot reliably complete their work if they cannot read that stream or receive events when it changes.

### Task list we are blocked on

1. Reading the job message/comment stream
   - Blocked work:
     - Capture job notes as evidence atoms.
     - Trigger Ops/Sales/Accounting work from comments humans already write.
     - Build daily job summaries from field notes.
     - Preserve high-value soft context, such as homeowner preferences and adjuster behavior.
     - Detect scope changes, safety issues, material gaps, and follow-up requests mentioned in messages.
   - Why it supports our AI initiative:
     - This is the primary human interface our team is already using. Without read access, the agents are blind to the actual operating conversation around each job.
   - Technical validation:
     - Current docs show `POST /jobs/{jobId}/messages` for creating a job message.
     - Current docs show `POST /jobs/{jobId}/messages/{messageId}/replies` for replying.
     - We could not find a documented `GET /jobs/{jobId}/messages`, message list endpoint, message history endpoint, or message webhook.
     - Current `GET /jobs/{jobId}` docs list supported includes as `contact` and `initalAppointment`; messages are not listed.
     - Current `GET /jobs/{jobId}/history` is documented as job action history with `createdBy` include, but not as the complete message/comment thread.
     - Our internal project notes record prior testing where `GET /jobs/{jobId}/messages` returned `404` with `Allow: POST`, suggesting the route is write-only.
   - Request:
     - Please provide a supported way to read job messages/comments and replies, ideally with pagination and modified-date filtering.
     - Please provide webhook topics for message/comment created, updated, replied, and deleted if available.
     - If message read access is intentionally not available, please confirm the reason and the recommended workaround, even if the answer is: "A human must manually review AccuLynx messages."

2. Reading contact communication logs
   - Blocked work:
     - Sales/accounting follow-up aging.
     - Last-contact summaries.
     - Customer communication preferences and follow-up reminders.
     - AR collection context.
   - Why it supports our AI initiative:
     - Agents need to know whether a homeowner, carrier, or adjuster has already been contacted before drafting an internal follow-up.
   - Technical validation:
     - Current docs show `POST /contacts/{contactId}/logs`.
     - We could not find a documented `GET /contacts/{contactId}/logs` or contact-log webhook.
     - Our project notes record contact logs as write-only.
   - Request:
     - Please provide a supported contact-log read/list endpoint and change webhook, or confirm that contact logs are intentionally write-only and require human review in AccuLynx.

3. Webhook access, topic names, and topic coverage
   - Blocked work:
     - Reliable real-time triggers for debriefs, job status changes, financial changes, and routing.
     - Sync health monitoring.
     - Idempotent event processing and audit records.
   - Why it supports our AI initiative:
     - Our agents need to react to source-of-truth changes without polling everything constantly.
   - Technical validation:
     - Current docs show webhook endpoints:
       - `GET /topics`
       - `GET /subscriptions`
       - `POST /subscriptions`
       - `POST /subscriptions/{subscriptionId}/test-event`
     - Current generated docs list 23 webhook event references, including job created/updated, milestone current changed, milestone status current changed, invoice updated/voided, approved value changed, custom field changes, representative changes, and initial appointment changes.
     - We did not find message/comment, contact-log, document, photo/video, supplement, material-order, or payment-received webhook topics in the current public index.
     - Our bridge still needs confirmation of the exact webhook signature header, signing algorithm, body canonicalization, and replay/idempotency expectations. The listener guide says a subscription returns a secret for validation, but it does not clearly document the header or signature format.
   - Request:
     - Please confirm our account has webhook access.
     - Please provide the canonical `topicName` values returned by `GET /topics`.
     - Please confirm whether any topics exist for messages/comments, contact logs, documents, photos/videos, supplements, material orders, and payments.
     - Please provide exact webhook signing details: header name, HMAC algorithm, signed payload format, encoding, timestamp/replay handling, and a sample signed request.

4. Updating job milestone/status/task state
   - Blocked work:
     - Conductor PM-tool sync.
     - Sales pipeline stage updates.
     - Ops status updates and task-completion writeback.
     - Automated "draft update, human approves, write to AccuLynx" flows.
   - Why it supports our AI initiative:
     - Agents can prepare and verify internal updates, but AccuLynx must remain the system of record after human approval.
   - Technical validation:
     - Current docs include read endpoints for current milestone, milestone history, workflow milestones, and milestone statuses.
     - Current docs include specific job update endpoints for location, priority, category, lead source, work type, trade types, initial appointment, insurance, adjuster, and representatives.
     - We could not find a documented endpoint to set/move the current job milestone or current milestone status, or to mark generic job tasks complete.
   - Request:
     - Please provide the supported API for moving a job milestone/status and completing PM tasks, or confirm these actions must be completed by a human in AccuLynx.

5. Proposal, contract, initials, and signature workflow
   - Blocked work:
     - Good/Better/Best proposal handoff.
     - Selected-option acceptance.
     - Required initials and full document signature verification.
     - Contract packet automation after human approval.
   - Why it supports our AI initiative:
     - We can draft and verify proposal packets internally, but need to know whether AccuLynx can own the final contract/signature workflow or whether we should use a PDF/e-sign fallback.
   - Technical validation:
     - The current public API index shows no contract endpoints and no proposal endpoints.
   - Request:
     - Please confirm whether AccuLynx has public, private, partner, or account-specific APIs for proposals/contracts/signatures.
     - If not, please confirm the recommended workflow: human creates/sends contract in AccuLynx, or external signed PDF attached back to the job.

6. Invoice and change-order write-back
   - Blocked work:
     - Progress/final invoice draft handoff.
     - Change order accounting.
     - Draw schedule automation.
     - Post-approval writeback to AccuLynx.
   - Why it supports our AI initiative:
     - Accounting agents can identify what should be invoiced or changed, but financial writes must be auditable and human-approved.
   - Technical validation:
     - Current docs expose invoice reads:
       - `GET /jobs/{jobId}/invoices`
       - `GET /invoices/{invoiceId}`
     - Current docs expose payment writes:
       - `POST /jobs/{jobId}/payments/paid`
       - `POST /jobs/{jobId}/payments/received`
       - `POST /jobs/{jobId}/payments/expense`
     - Current docs expose worksheet item creation:
       - `POST /financials/{financialsId}/worksheet/items`
     - We could not find invoice create/update/void endpoints or a named change-order endpoint in the current public index.
   - Request:
     - Please confirm whether invoice creation/update/void and change-order creation/update are available by API.
     - If not, please confirm the intended workaround: AI drafts the packet, a human performs the AccuLynx financial action manually.

7. Documents, photos, and videos read/list/download
   - Blocked work:
     - Claim evidence review.
     - Closeout proof packets.
     - EEAT/photo atoms for marketing after consent.
     - Document audit and proposal/contract attachment verification.
   - Why it supports our AI initiative:
     - Field evidence is critical in roofing. If AccuLynx contains attachments and photos but the API only supports upload, agents cannot verify what is already on the job.
   - Technical validation:
     - Current docs show upload endpoints:
       - `POST /jobs/{jobId}/documents`
       - `POST /jobs/{jobId}/photos-videos`
     - Current docs show settings endpoints for folders/tags:
       - `GET /company-settings/job-file-settings/document-folders`
       - `GET /company-settings/job-file-settings/photo-video-tags`
     - We could not find job document list/download or photo/video list/download endpoints.
     - Current `GET /jobs/{jobId}` includes do not list documents, photos, videos, or messages.
   - Request:
     - Please provide the supported method to list and retrieve job documents, photos, and videos, including metadata, tags, captions, and URLs.
     - Please confirm whether upload/list webhooks exist for files or media.
     - If read access is intentionally unavailable, please confirm human export or external photo-system integration as the expected workaround.

8. Supplement change events
   - Blocked work:
     - Insurance supplement tracking.
     - Supplement revenue change alerts.
     - Claim status automation.
   - Why it supports our AI initiative:
     - Supplements directly affect revenue, invoicing, and claim follow-up. We can poll, but event support would reduce delay and stale state.
   - Technical validation:
     - Current docs show supplement reads:
       - `GET /supplements`
       - `GET /supplements/{supplementId}`
       - `GET /supplements/{supplementId}/items`
       - `GET /supplements/{supplementId}/notations`
     - We could not find supplement created/updated/approved webhook topics.
   - Request:
     - Please confirm whether supplement webhooks exist. If not, please confirm polling is the intended approach and identify the best date fields for incremental sync.

9. Measurement files endpoint
   - Blocked work:
     - Estimate-to-proposal handoff involving measurement files.
     - Measurement document attachment or creation in AccuLynx.
   - Why it supports our AI initiative:
     - We need to preserve source measurement provenance for every estimate and proposal.
   - Technical validation:
     - The changelog mentions "Add Measurement Files" at `GET /api/v2/jobs/{jobId}/measurements/files`.
     - The current generated API reference contains zero measurement operations.
     - The changelog wording says "Add" but the method shown is `GET`, which may be a documentation mismatch.
   - Request:
     - Please confirm the current measurement-files endpoint, HTTP method, request body, account availability, and whether it is public, partner-only, or deprecated.

10. Material order APIs
    - Blocked work:
      - AccuLynx material-order draft writeback.
      - Material order status sync.
      - Ops verification that materials were ordered/scheduled.
    - Why it supports our AI initiative:
      - Agents can create internal material-order drafts, but we need to know whether AccuLynx can receive or expose order state.
    - Technical validation:
      - The current public API index shows zero material/order endpoints.
    - Request:
      - Please confirm whether material-order APIs exist. If not, we will keep material ordering as a human-approved dashboard/Slack handoff outside AccuLynx API automation.

### Requested outcome

Could you please reply with one of the following for each blocker above:

1. The supported public API endpoint/topic and any required account entitlement.
2. A private/partner endpoint or beta path we should request access to.
3. Confirmation that the workflow is intentionally not available through API, plus the recommended workaround.
4. Confirmation that a human must perform the task in AccuLynx.

The most urgent item is read access or event access for the job message/comment stream. That is where our human team is already placing the operational triggers our agents need. If that stream cannot be exposed, we need to design the AI workflow around an explicit human/manual workaround rather than continuing to search for an API path that does not exist.

Thank you,

[Your Name]
