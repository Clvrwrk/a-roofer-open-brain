# CompanyCam Public API v1 — operation index

Generated 2026-10-01 from the official spec `https://developers.companycam.com/openapi/public_api_v1.yaml` (157 operations). Base URL `https://app.companycam.com/public_api/v1`. Regenerate from the spec rather than editing by hand. Guides: auth/scopes, rate limits (240 GET/min, 100 writes/min per token), webhooks (scopes, HMAC-SHA1 signature, retries), mobile deep links — summarised in [docs/120](../../../docs/120-companycam-integration.md) §1.

**This bridge uses GET operations only** (read-only mirror).

## Access Tokens

| Method | Path | Summary |
|---|---|---|
| POST | `/access_tokens/verify` | verify |

## Advanced Checklists

| Method | Path | Summary |
|---|---|---|
| GET | `/conditional_checklists` | List company-wide advanced checklists |

## Board Phase Projects

| Method | Path | Summary |
|---|---|---|
| GET | `/boards/{board_id}/phases/{phase_id}/projects` | index |

## Board Projects

| Method | Path | Summary |
|---|---|---|
| POST | `/boards/{board_id}/projects/{id}/move` | move |

## Boards

| Method | Path | Summary |
|---|---|---|
| GET | `/boards` | index |
| POST | `/boards` | create |
| GET | `/boards/{id}` | show |

## Companies

| Method | Path | Summary |
|---|---|---|
| GET | `/companies/{id}` | show |

## Current Company

| Method | Path | Summary |
|---|---|---|
| GET | `/companies/current` | show |

## Current User

| Method | Path | Summary |
|---|---|---|
| GET | `/users/current` | show |

## Custom Field Definitions

| Method | Path | Summary |
|---|---|---|
| GET | `/custom_field_definitions` | List the company's custom field definitions |
| POST | `/custom_field_definitions` | Define a custom field |
| DELETE | `/custom_field_definitions/{id}` | Delete a custom field definition |
| PATCH | `/custom_field_definitions/{id}` | Update a custom field definition |

## Customer Contact

| Method | Path | Summary |
|---|---|---|
| GET | `/customers/{customer_id}/contacts` | index |
| POST | `/customers/{customer_id}/contacts` | create |
| DELETE | `/customers/{customer_id}/contacts/{id}` | destroy |
| PATCH | `/customers/{customer_id}/contacts/{id}` | update |

## Customers

| Method | Path | Summary |
|---|---|---|
| GET | `/customers` | index |
| POST | `/customers` | create |
| DELETE | `/customers/{id}` | destroy |
| GET | `/customers/{id}` | show |
| PATCH | `/customers/{id}` | update |

## Document Folders

| Method | Path | Summary |
|---|---|---|
| GET | `/document_folders` | index |
| DELETE | `/document_folders/{id}` | destroy |
| GET | `/document_folders/{id}` | show |
| PATCH | `/document_folders/{id}` | update |

## Documents

| Method | Path | Summary |
|---|---|---|
| GET | `/documents` | index |
| GET | `/documents/{id}` | show |

## Groups

| Method | Path | Summary |
|---|---|---|
| GET | `/groups` | index |
| POST | `/groups` | create |
| DELETE | `/groups/{id}` | destroy |
| GET | `/groups/{id}` | show |
| PATCH | `/groups/{id}` | update |

## Invoice Line Item

| Method | Path | Summary |
|---|---|---|
| GET | `/invoices/{invoice_id}/line_items` | index |
| POST | `/invoices/{invoice_id}/line_items` | create |
| DELETE | `/invoices/{invoice_id}/line_items/{id}` | destroy |
| GET | `/invoices/{invoice_id}/line_items/{id}` | show |
| PATCH | `/invoices/{invoice_id}/line_items/{id}` | update |

## Invoices

| Method | Path | Summary |
|---|---|---|
| GET | `/invoices` | index |
| POST | `/invoices` | create |
| GET | `/invoices/{id}` | show |
| PATCH | `/invoices/{id}` | update |

## Labels

| Method | Path | Summary |
|---|---|---|
| GET | `/labels` | index |

## Mcp Calls

| Method | Path | Summary |
|---|---|---|
| GET | `/mcp_calls` | index |
| GET | `/mcp_calls/{id}` | show |

## Pages

| Method | Path | Summary |
|---|---|---|
| GET | `/pages` | index |
| GET | `/pages/{id}` | show |
| PATCH | `/pages/{id}` | update |

## Photo Comment

| Method | Path | Summary |
|---|---|---|
| GET | `/photos/{photo_id}/comments` | index |
| POST | `/photos/{photo_id}/comments` | create |

## Photo Description

| Method | Path | Summary |
|---|---|---|
| POST | `/photos/{photo_id}/descriptions` | create |

## Photo Tag

| Method | Path | Summary |
|---|---|---|
| GET | `/photos/{photo_id}/tags` | index |
| POST | `/photos/{photo_id}/tags` | create |

## Photos

| Method | Path | Summary |
|---|---|---|
| GET | `/photos` | index |
| DELETE | `/photos/{id}` | destroy |
| GET | `/photos/{id}` | show |
| PATCH | `/photos/{id}` | update |

## Price Book Items

| Method | Path | Summary |
|---|---|---|
| GET | `/price_book_items` | index |
| POST | `/price_book_items` | create |
| DELETE | `/price_book_items/{id}` | destroy |
| GET | `/price_book_items/{id}` | show |
| PATCH | `/price_book_items/{id}` | update |

## Project Advanced Checklist

| Method | Path | Summary |
|---|---|---|
| GET | `/projects/{project_id}/conditional_checklists` | index |
| POST | `/projects/{project_id}/conditional_checklists/create_from_template` | create_from_template |
| GET | `/projects/{project_id}/conditional_checklists/{id}` | show |
| PATCH | `/projects/{project_id}/conditional_checklists/{id}` | Update project checklist field responses |
| PATCH | `/projects/{project_id}/conditional_checklists/{id}/details` | Update a project checklist title and description |

## Project Assigned User

| Method | Path | Summary |
|---|---|---|
| GET | `/projects/{project_id}/assigned_users` | index |
| DELETE | `/projects/{project_id}/assigned_users/{id}` | destroy |
| PUT | `/projects/{project_id}/assigned_users/{id}` | update |

## Project Collaborator

| Method | Path | Summary |
|---|---|---|
| GET | `/projects/{project_id}/collaborators` | index |

## Project Comment

| Method | Path | Summary |
|---|---|---|
| GET | `/projects/{project_id}/comments` | index |
| POST | `/projects/{project_id}/comments` | create |

## Project Custom Field

| Method | Path | Summary |
|---|---|---|
| GET | `/projects/{project_id}/custom_fields` | List a project's custom fields |
| DELETE | `/projects/{project_id}/custom_fields/{key}` | Clear a project's custom field value |
| PATCH | `/projects/{project_id}/custom_fields/{key}` | Set a project's custom field value |

## Project Customer

| Method | Path | Summary |
|---|---|---|
| DELETE | `/projects/{project_id}/customer` | destroy |
| GET | `/projects/{project_id}/customer` | show |
| PUT | `/projects/{project_id}/customer` | update |

## Project Document

| Method | Path | Summary |
|---|---|---|
| GET | `/projects/{project_id}/documents` | index |
| POST | `/projects/{project_id}/documents` | create |

## Project Document Folder

| Method | Path | Summary |
|---|---|---|
| POST | `/projects/{project_id}/document_folders` | create |

## Project Group Project

| Method | Path | Summary |
|---|---|---|
| GET | `/project_groups/{project_group_id}/projects` | index |
| POST | `/project_groups/{project_group_id}/projects` | create |
| DELETE | `/project_groups/{project_group_id}/projects/{id}` | destroy |

## Project Groups

| Method | Path | Summary |
|---|---|---|
| GET | `/project_groups` | index |
| POST | `/project_groups` | create |
| DELETE | `/project_groups/{id}` | destroy |
| GET | `/project_groups/{id}` | show |
| PATCH | `/project_groups/{id}` | update |

## Project Invitation

| Method | Path | Summary |
|---|---|---|
| GET | `/projects/{project_id}/invitations` | index |
| POST | `/projects/{project_id}/invitations` | create |

## Project Label

| Method | Path | Summary |
|---|---|---|
| GET | `/projects/{project_id}/labels` | index |
| POST | `/projects/{project_id}/labels` | create |
| DELETE | `/projects/{project_id}/labels/{id}` | destroy |

## Project Page

| Method | Path | Summary |
|---|---|---|
| GET | `/projects/{project_id}/pages` | index |
| POST | `/projects/{project_id}/pages` | create |

## Project Photo

| Method | Path | Summary |
|---|---|---|
| GET | `/projects/{project_id}/photos` | index |
| POST | `/projects/{project_id}/photos` | create |

## Project Photo Tag

| Method | Path | Summary |
|---|---|---|
| GET | `/projects/{project_id}/photos/tags` | index |

## Project Project Task

| Method | Path | Summary |
|---|---|---|
| GET | `/projects/{project_id}/project_tasks` | index |
| POST | `/projects/{project_id}/project_tasks` | create |
| DELETE | `/projects/{project_id}/project_tasks/{id}` | destroy |
| GET | `/projects/{project_id}/project_tasks/{id}` | show |
| PATCH | `/projects/{project_id}/project_tasks/{id}` | update |

## Project Video

| Method | Path | Summary |
|---|---|---|
| GET | `/projects/{project_id}/videos` | index |

## Projects

| Method | Path | Summary |
|---|---|---|
| GET | `/projects` | index |
| POST | `/projects` | create |
| GET | `/projects/search` | search |
| DELETE | `/projects/{id}` | destroy |
| GET | `/projects/{id}` | show |
| PATCH | `/projects/{id}` | update |
| PATCH | `/projects/{id}/archive` | archive |
| PATCH | `/projects/{id}/description` | Update a project's description |
| PATCH | `/projects/{id}/restore` | restore |
| PATCH | `/projects/{id}/unarchive` | unarchive |

## Proposal Line Item

| Method | Path | Summary |
|---|---|---|
| GET | `/proposals/{proposal_id}/line_items` | index |
| POST | `/proposals/{proposal_id}/line_items` | create |
| DELETE | `/proposals/{proposal_id}/line_items/{id}` | destroy |
| GET | `/proposals/{proposal_id}/line_items/{id}` | show |
| PATCH | `/proposals/{proposal_id}/line_items/{id}` | update |
| POST | `/proposals/{proposal_id}/line_items/{id}/save_to_price_book` | save_to_price_book |

## Proposals

| Method | Path | Summary |
|---|---|---|
| GET | `/proposals` | index |
| POST | `/proposals` | create |
| GET | `/proposals/{id}` | show |
| PATCH | `/proposals/{id}` | update |

## Session

| Method | Path | Summary |
|---|---|---|
| DELETE | `/session` | destroy |
| POST | `/session` | create |

## Tags

| Method | Path | Summary |
|---|---|---|
| GET | `/tags` | index |
| POST | `/tags` | create |
| DELETE | `/tags/{id}` | destroy |
| GET | `/tags/{id}` | show |
| PATCH | `/tags/{id}` | update |

## Template Advanced Checklist

| Method | Path | Summary |
|---|---|---|
| GET | `/templates/conditional_checklists` | index |
| POST | `/templates/conditional_checklists` | create |
| DELETE | `/templates/conditional_checklists/{id}` | destroy |
| GET | `/templates/conditional_checklists/{id}` | show |
| PATCH | `/templates/conditional_checklists/{id}` | update |

## Time Entries

| Method | Path | Summary |
|---|---|---|
| GET | `/time_entries` | index |
| GET | `/time_entries/summary` | Summarize time entries by user, date, and/or project |
| GET | `/time_entries/{id}` | show |

## Uploads

| Method | Path | Summary |
|---|---|---|
| POST | `/uploads` | create |

## Users

| Method | Path | Summary |
|---|---|---|
| GET | `/users` | index |
| POST | `/users` | create |
| DELETE | `/users/{id}` | destroy |
| GET | `/users/{id}` | show |
| PATCH | `/users/{id}` | update |

## Videos

| Method | Path | Summary |
|---|---|---|
| GET | `/videos` | index |
| GET | `/videos/{id}` | show |

## Webhook Delivery

| Method | Path | Summary |
|---|---|---|
| GET | `/webhooks/{webhook_id}/deliveries` | index |
| GET | `/webhooks/{webhook_id}/deliveries/{id}` | show |

## Webhooks

| Method | Path | Summary |
|---|---|---|
| GET | `/webhooks` | index |
| POST | `/webhooks` | create |
| DELETE | `/webhooks/{id}` | destroy |
| GET | `/webhooks/{id}` | show |
| PATCH | `/webhooks/{id}` | update |
