# AccuLynx API Source Provenance

Status: source index for existing bridge  
Last verified: 2026-06-04

The AccuLynx bridge is already present in this repo. This file anchors its assumptions to public
AccuLynx documentation so planning and future maintenance can verify behavior.

## Core docs

| Topic | Source |
| --- | --- |
| Getting started | https://apidocs.acculynx.com/docs/getting-started |
| Overview | https://apidocs.acculynx.com/docs/overview |
| Authentication | https://apidocs.acculynx.com/docs/authentication |
| Rate limits | https://apidocs.acculynx.com/docs/rate-limits |
| API reference root | https://apidocs.acculynx.com/reference |
| Webhooks end-user reference | https://apidocs.acculynx.com/docs/webhooks-end-user-reference |
| Webhook endpoints | https://apidocs.acculynx.com/docs/endpoints |
| Changelog: V1 docs removed | https://apidocs.acculynx.com/changelog/acculynx-api-v1-documentation-removed |

## Authentication and limits

| Fact | Source |
| --- | --- |
| Every API request requires an API key. | https://apidocs.acculynx.com/docs/authentication |
| Each integration/location should have its own descriptive API key. | https://apidocs.acculynx.com/docs/authentication |
| IP concurrent limit is 30 requests/sec. | https://apidocs.acculynx.com/docs/rate-limits |
| Valid API keys are limited to 10 requests/sec per key. | https://apidocs.acculynx.com/docs/rate-limits |

## Endpoint provenance

| Bridge object | Endpoint/source |
| --- | --- |
| Jobs list | https://apidocs.acculynx.com/reference/getjobs |
| Job by ID | https://apidocs.acculynx.com/reference/getjob-1 |
| Job external references | https://apidocs.acculynx.com/reference/getjobexternalreferences |
| Contacts list | https://apidocs.acculynx.com/reference/getcontacts |
| Contact by ID | https://apidocs.acculynx.com/reference/getcontact |
| Contact types | https://apidocs.acculynx.com/reference/getcontacttypes |
| Job contacts | https://apidocs.acculynx.com/reference/getjobcontacts |
| Estimates for job | https://apidocs.acculynx.com/reference/getestimatesforjob |
| Estimate by ID | https://apidocs.acculynx.com/reference/getestimatebyid |
| Financials for job | https://apidocs.acculynx.com/reference/getfinancialsforjob |
| Payments for job | https://apidocs.acculynx.com/reference/getpayments |
| Payments overview | https://apidocs.acculynx.com/reference/getpaymentsoverviewforjob |
| Invoices for job | https://apidocs.acculynx.com/reference/getinvoicesforjob |
| Supplements | https://apidocs.acculynx.com/reference/getfinancialssupplementsforcompany |
| Webhook subscriptions list | https://apidocs.acculynx.com/reference/getsubscriptions |
| Webhook endpoint guide | https://apidocs.acculynx.com/docs/endpoints |
| Reply to job message | https://apidocs.acculynx.com/reference/postreplyjobmessage |

## Bridge planning notes to preserve

- `GET /api/v2/jobs` supports date filtering, milestone filtering, sorting, includes, and assignment
  filtering. Use `assignment=unassigned` for unassigned/dead leads.
- Jobs use `recordStartIndex` pagination; contacts use `pageStartIndex`.
- Supported job-list includes called out publicly include contact/contacts and initial appointment.
- Supplements are available through `GET /api/v2/supplements` with optional `jobId` and includes;
  do not assume a nested `/jobs/{jobId}/supplements` route.
- Webhooks are managed separately under `https://api.acculynx.com/webhooks/v2/...`.
- Webhook management includes create/list/read/update/delete subscriptions, test event, and topics.
- Keep milestone mapping configurable because customer milestone names may differ.
