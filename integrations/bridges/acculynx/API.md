# AccuLynx API Documentation

Last generated: 2026-06-09T20:54:34Z

This is the local working guide for AccuLynx API tasks in the roofer Open Brain. It is generated from `https://apidocs.acculynx.com/llms.txt` plus each linked Markdown/OpenAPI page. Use the `acculynx-api` skill before implementing AccuLynx bridge work, planning one-off API calls, or creating webhook subscriptions.

## Source Scope

- Guides: getting started, rate limits, webhook endpoint guidance, listener guidance, and code samples.
- API reference: all operations discoverable from AccuLynx `llms.txt` with embedded OpenAPI definitions.
- Changelog: all changelog Markdown pages discoverable from `llms.txt`.

## Base URLs

| Surface | Base URL | Notes |
| --- | --- | --- |
| AccuLynx API V2 | `https://api.acculynx.com/api/v2` | Jobs, contacts, estimates, financials, company settings, users, reports, supplements. |
| AccuLynx Webhooks API | `https://api.acculynx.com/webhooks/v2` | Subscription CRUD, topics, and test events. |

## Authentication

- Use a Bearer API key: `Authorization: Bearer {ACCULYNX_API_KEY}`.
- API keys are created in the AccuLynx account API page. Use descriptive, per-integration keys so keys can be rotated without breaking unrelated systems.
- Never store API keys, webhook secrets, raw customer exports, or unredacted homeowner PII in curated memory.
- Production API calls affect real AccuLynx data. Treat `POST`, `PUT`, `PATCH`, and `DELETE` as write operations that require explicit human approval unless the user has already authorized that exact action.

## Rate Limits

- Public docs state an IP concurrent limit of 30 requests per second and an API-key limit of 10 requests per second.
- On HTTP `429`, back off with jitter and retry only idempotent reads by default.
- For backfills, page by date windows instead of trying to sweep more than 100,000 records from one listing query.

## Endpoint Coverage

| Category | Operations |
| --- | ---: |
| AccuLynx Common | 5 |
| Calendar | 3 |
| Company | 17 |
| Contacts | 14 |
| Diagnostics | 1 |
| Estimates | 6 |
| Financials | 5 |
| Invoices | 1 |
| Jobs | 53 |
| Leads | 1 |
| Reports | 5 |
| Subscriptions | 6 |
| Supplements | 4 |
| Topics | 1 |
| Users | 2 |

## Common Endpoint Choices

- Countries/states: `GET /acculynx/countries`, `GET /acculynx/countries/{countryId}/states`. Use `includes=states` where supported.
- Company settings lookups: use job categories, trade types, work types, lead sources, insurance companies, photo/video tags, milestones, and statuses before hard-coding customer-specific IDs.
- Job sync: use `GET /jobs` for listing and `GET /jobs/{jobId}` for detail. Use `assignment=unassigned` in a separate request when you need unassigned/dead leads.
- Job writes: use the specific update endpoints for insurance, adjuster, initial appointment, job location address, priority, category, lead source, trade types, and work type. Do not fake these through generic job update calls.
- Contacts: use contact list/detail/search endpoints, then contact email/phone/custom-field endpoints for enrichment.
- Financials: use job financials, estimates, invoices, worksheet, amendments, payments, and supplements endpoints. Supplements are top-level under `/supplements`, not nested under `/jobs/{jobId}`.
- Webhook management: use `/subscriptions`, `/subscriptions/{subscriptionId}`, `/subscriptions/{subscriptionId}/test-event`, and `/topics` on the webhooks base URL.

## Roofing Bridge Gotchas

- AccuLynx treats leads as job files. In bridge code, distinguish lead/job state by milestone and assignment filters, not by assuming a separate lead object.
- Milestone names are customer-configurable and case-sensitive. Pull company milestones and map them through `config/roofer.config.yaml`.
- Some fields are only available through includes. Check the endpoint detail before assuming nested objects will be present.
- Dedicated message/log endpoints may be write-only. Use history/detail endpoints for read paths when the public reference does not expose a `GET` route.
- Webhook access can be account-tier gated. If `/topics` does not return JSON, fall back to polling and ask the human to confirm account capabilities.

## Changelog Signals

- New Job Update Endpoints: https://apidocs.acculynx.com/changelog/update-endpoints-for-job-details
- Custom Fields Release: https://apidocs.acculynx.com/changelog/custom-fields-release
- AccuLynx API V1 Documentation Removed: https://apidocs.acculynx.com/changelog/acculynx-api-v1-documentation-removed
- AccuLynx version 2.2522.0: https://apidocs.acculynx.com/changelog/acculynx-version-225220
- AccuLynx version 2.2506.0: https://apidocs.acculynx.com/changelog/acculynx-version-225060

## Local Reference Files

- `skills/cleverwork-roofer/acculynx-api/SKILL.md` — execution playbook for agents.
- `skills/cleverwork-roofer/acculynx-api/reference/full-endpoint-reference.md` — human-readable endpoint details.
- `skills/cleverwork-roofer/acculynx-api/reference/openapi-index.json` — machine-readable operation index.
- `skills/cleverwork-roofer/acculynx-api/reference/source-index.md` — fetched source inventory.
