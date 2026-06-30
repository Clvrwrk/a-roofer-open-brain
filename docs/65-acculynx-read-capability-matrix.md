# AccuLynx Read-Capability Matrix (Phase 1, REQ-05)

Generated: 2026-06-30 from sandbox sweep batch `sweep-2026-06-30T11-06-22-039Z`
Source account: **sandbox** (`PE_CC_SANDBOX_ACCULYNX_API_KEY`) — no production account was touched.
Pairs with the write matrix [docs/37](37-acculynx-write-capability-matrix.md). Source of truth: `public.acculynx_get_checklist` (86 GETs from `openapi-index.json`) reconciled against `public.acculynx_api_probe`.

## How to read this

One row per documented GET (86 total). **Sandbox status** verdict vocabulary:
`200` works · `empty` 200 but zero items in sandbox · `204` no content · `4xx` error ·
`tier_gated` webhook endpoint gated by account tier · `unprobeable` no seed id available in the sandbox
(sparse data: 1 job / 1 contact / 1 supplement — Phase 4 write-seeding can deepen coverage on a re-run).
Evidence: every row traces to probe batch `sweep-2026-06-30T11-06-22-039Z`.

**Verdict totals:** 52× 200 · 22× unprobeable · 6× empty · 2× 204 · 2× 400 · 1× 404 · 1× 416

## Matrix

| operationId | Path | Tier | Sandbox status | Top-level keys | Item keys (collections) | Pagination | Reported count | Quirks / delta-from-docs |
|---|---|---|---|---|---|---|---|---|
| getAccuLynxCountries | `/acculynx/countries` | A | 200 | items | id name abbreviation _link | — | — |  |
| getAcculynxUnitsOfMeasure | `/acculynx/units-of-measure` | A | 200 | — | — | — | — |  |
| getActiveAccountTypes | `/company-settings/location-settings/account-types` | A | 200 | — | — | — | — |  |
| getActiveLeadSources | `/company-settings/leads/lead-sources` | A | 200 | count pageSize pageStartIndex items | id name _link | recordStartIndex | 15 |  |
| getCalendars | `/calendars` | A | 200 | count pageSize pageStartIndex items | id name | recordStartIndex | 10 |  |
| getCompanyDocumentFolders | `/company-settings/job-file-settings/document-folders` | A | 200 | count pageSize pageStartIndex items | documentFolderId companyID name description | recordStartIndex | 9 |  |
| getCompanySettings | `/company-settings` | A | 200 | companyId name timeZoneInfo hasInsurance | — | — | — |  |
| getCompanySettingsCustomFields | `/company-settings/custom-fields` | A | 200 | count pageSize pageStartIndex items | id entityType isActive options createdDate fieldType label modifiedBy modifiedDate _link | recordStartIndex | 3 |  |
| getCompanySettingsJobSettingsJobCategories | `/company-settings/job-file-settings/job-categories` | A | 200 | count pageSize pageStartIndex items | id categoryId name | recordStartIndex | 3 |  |
| getCompanySettingsJobSettingsTradeTypes | `/company-settings/job-file-settings/trade-types` | A | 200 | count pageSize pageStartIndex items | id name | recordStartIndex | 9 |  |
| getCompanySettingsJobSettingsWorkTypes | `/company-settings/job-file-settings/work-types` | A | 200 | count pageSize pageStartIndex items | id name systemDefault _link | recordStartIndex | 7 |  |
| getCompanySettingsLocationSettingsCountries | `/company-settings/location-settings/countries` | A | 200 | count pageSize pageStartIndex items | id name abbreviation _link | recordStartIndex | 1 |  |
| getContacts | `/contacts` | A | 200 | count pageSize pageStartIndex items | id firstName lastName salutation crossReference companyName mailingAddress phoneNumbers emailAddresses _link | pageStartIndex | 53 |  |
| getContactTypes | `/contacts/contact-types` | A | 200 | count pageSize pageStartIndex items | id name isDefault | pageStartIndex | 2 |  |
| getEstimates | `/estimates` | A | empty | count pageSize pageStartIndex items | — | pageStartIndex | 0 |  |
| getFinancialsSupplementsForCompany | `/supplements` | A | 200 | count pageSize pageStartIndex items | id name state job assignedSupplementer itemsToSupplement notations createdDate createdBy editedDate editedBy closedDate closedBy appliedDate appliedBy _link | recordStartIndex | 1 | company-level /supplements (not nested under a job) |
| getInsuranceCompanies | `/company-settings/job-file-settings/insurance-companies` | A | 200 | count pageSize pageStartIndex items | id name isActive | recordStartIndex | 12 |  |
| getJobExternalReferences | `/jobs/external-references` | A | 400 | type title status detail traceId | — | — | — |  |
| getJobs | `/jobs` | A | 200 | count pageSize pageStartIndex items | id contacts locationAddress geoLocation tradeTypes jobCategory workType leadSource leadDeadReason currentMilestone milestoneDate createdDate modifiedDate jobName jobNumber priority _link | recordStartIndex | 1 | milestone filter case-sensitive; assignment=unassigned needed for dead leads |
| getMilestones | `/company-settings/job-file-settings/workflow-milestones` | A | 200 | — | — | — | — |  |
| getPhotoVideoTags | `/company-settings/job-file-settings/photo-video-tags` | A | 200 | count pageSize pageStartIndex items | tagId tagName | recordStartIndex | 2 |  |
| getPing | `/diagnostics/ping` | A | 200 | date | — | — | — |  |
| getSubscriptions | `/subscriptions` (webhooks) | A | 416 | type title status detail traceId | — | pageStartIndex | — | tier_gated |
| getTopics | `/topics` (webhooks) | A | 200 | count pageSize pageStartIndex items | topicName description | pageStartIndex | 22 | tier_gated |
| getUsers | `/users` | A | 200 | count pageSize pageStartIndex items | id displayName firstName lastName initials role status phone mobilePhone email _link | recordStartIndex | 9 |  |
| getAccountingIntegrationsSyncChangesForJob | `/jobs/{jobId}/accounting/integration-status` | B | 404 | type title status detail traceId | — | — | — |  |
| getAccountTypeById | `/company-settings/location-settings/account-types/{accountTypeId}` | B | unprobeable | — | — | — | — |  |
| getAccuLynxCountry | `/acculynx/countries/{countryId}` | B | 200 | id name abbreviation _link | — | — | — |  |
| getAccuLynxStates | `/acculynx/countries/{countryId}/states` | B | 200 | items | id name abbreviation _link | — | — |  |
| getAdjusterForJob | `/jobs/{jobId}/adjuster` | B | 200 | adjusterName phone fax email claimApproved claimApprovedDate metWithAdjuster | — | — | — |  |
| getAppointments | `/calendars/{calendarId}/appointments` | B | 400 | type title status detail traceId | — | pageStartIndex | — |  |
| getAROwnerForJob | `/jobs/{jobId}/representatives/ar-owner` | B | 204 | — | — | — | — |  |
| getCompanyRepresentativeForJob | `/jobs/{jobId}/representatives/company` | B | 200 | id type user _link | — | — | — |  |
| getcompanySettingsLocationSettingsCountriesCountryIdStates | `/company-settings/location-settings/countries/{countryId}/states` | B | 200 | count pageSize pageStartIndex items | id name abbreviation _link | recordStartIndex | 54 |  |
| getContact | `/contacts/{contactId}` | B | 200 | id firstName lastName salutation crossReference companyName mailingAddress billingAddress phoneNumbers emailAddresses _link | — | — | — |  |
| getContactCustomFields | `/contacts/{contactId}/custom-fields` | B | empty | count pageSize pageStartIndex items | — | recordStartIndex | 0 |  |
| getContactEmailAddresses | `/contacts/{contactId}/email-addresses` | B | 200 | items | id address primary type _link | — | — |  |
| getContactPhoneNumber | `/contacts/{contactId}/phone-numbers` | B | 200 | items | id number ext type primary smsOptOut _link | — | — |  |
| getCurrentJobMilestone | `/jobs/{jobId}/milestones/current` | B | 200 | name isCurrent statuses duration id jobId _link | — | — | — |  |
| getEstimateById | `/estimates/{estimateId}` | B | unprobeable | — | — | — | — |  |
| getEstimateSections | `/estimates/{estimateId}/sections` | B | unprobeable | — | — | — | — |  |
| getEstimatesForJob | `/jobs/{jobId}/estimates` | B | empty | count pageSize pageStartIndex items | — | recordStartIndex | 0 |  |
| getFinancialsByFinancialId | `/financials/{financialsId}` | B | unprobeable | — | — | — | — |  |
| getFinancialsForJob | `/jobs/{jobId}/financials` | B | 200 | id jobId approvedJobValue balanceDue worksheetSectionTotals amendments worksheet _link | — | — | — |  |
| getFinancialsSupplementItemCollection | `/supplements/{supplementId}/items` | B | 200 | count pageSize pageStartIndex items | id name description originalClaimAmount requestedAmount approvedAmount appliedAmount _link | recordStartIndex | 3 |  |
| getFinancialsSupplementNotationCollection | `/supplements/{supplementId}/notations` | B | empty | count pageSize pageStartIndex items | — | recordStartIndex | 0 |  |
| getInitialAppointmentForJob | `/jobs/{jobId}/initial-appointment` | B | 200 | startDate endDate notes _link | — | — | — |  |
| getInsuranceForJob | `/jobs/{jobId}/insurance` | B | 200 | insuranceCompany customInsuranceCompanyName damageLocation dateOfLoss claimFiled claimFiledDate claimNumber hasPaperwork | — | — | — |  |
| getInvoiceById | `/invoices/{invoiceId}` | B | unprobeable | — | — | — | — |  |
| getInvoicesForJob | `/jobs/{jobId}/invoices` | B | empty | count pageSize pageStartIndex items | — | pageStartIndex | 0 |  |
| getJob | `/jobs/{jobId}` | B | 200 | id contacts locationAddress geoLocation tradeTypes jobCategory workType leadSource leadDeadReason currentMilestone milestoneDate createdDate modifiedDate jobName jobNumber priority _link | — | — | — |  |
| getJobContacts | `/jobs/{jobId}/contacts` | B | 200 | items | id contact isPrimary relationToPrimary _link | — | — |  |
| GetJobCustomFields | `/jobs/{jobId}/custom-fields` | B | 200 | count pageSize pageStartIndex items | id fieldType label values formattedValues modifiedBy modifiedDate _link | recordStartIndex | 3 |  |
| getJobHistory | `/jobs/{jobId}/history` | B | 200 | count pageSize pageStartIndex items | action date createdBy | recordStartIndex | 63 |  |
| getLeadHistory | `/leads/{leadId}/history` | B | unprobeable | — | — | — | — |  |
| getLeadSourceById | `/company-settings/leads/lead-sources/{leadSourceId}` | B | 200 | id name _link | — | — | — |  |
| getMilestonesForJob | `/jobs/{jobId}/milestone-history` | B | 200 | items | name date | — | — | path is /jobs/{jobId}/milestone-history (not /milestones/history) |
| getPayments | `/jobs/{jobId}/payments` | B | 200 | paidPayments receivedPayments additionalExpenses | — | — | — |  |
| getPaymentsOverviewForJob | `/jobs/{jobId}/payments/overview` | B | 200 | salesAmount balanceDue arAge percentageCollected | — | — | — |  |
| getReportLatestInstance | `/reports/scheduled-reports/{scheduledReportId}/runs/latest` | B | unprobeable | — | — | — | — | unprobeable_no_seed |
| getReportsByInstanceInstanceRunsByScheduleId | `/reports/scheduled-reports/{scheduledReportId}/runs` | B | unprobeable | — | — | pageStartIndex | — | unprobeable_no_seed |
| getRepresentativesForJob | `/jobs/{jobId}/representatives` | B | 200 | count pageSize pageStartIndex items | id type user _link | recordStartIndex | 1 |  |
| getSalesOwnerForJob | `/jobs/{jobId}/representatives/sales-owner` | B | 204 | — | — | — | — |  |
| getStatusesForMilestone | `/company-settings/job-file-settings/workflow-milestones/{milestone}/statuses` | B | unprobeable | — | — | — | — |  |
| getSubscription | `/subscriptions/{subscriptionId}` (webhooks) | B | unprobeable | — | — | — | — | tier_gated |
| getSupplementById | `/supplements/{supplementId}` | B | 200 | id name state job assignedSupplementer itemsToSupplement notations createdDate createdBy editedDate editedBy closedDate closedBy appliedDate appliedBy _link | — | — | — |  |
| getUser | `/users/{userId}` | B | 200 | id displayName firstName lastName initials role status phone mobilePhone email _link | — | — | — |  |
| getWorksheetAmendmentsById | `/financials/{financialsId}/amendments` | B | empty | count pageSize pageStartIndex items | — | pageStartIndex | 0 |  |
| getWorksheetById | `/financials/{financialsId}/worksheet` | B | 200 | id sections jobId currentState totalPrice title _link | — | — | — |  |
| getAccuLynxState | `/acculynx/countries/{countryId}/states/{stateId}` | C | 200 | id name abbreviation _link | — | — | — |  |
| getAppointmentById | `/calendars/{calendarId}/appointments/{appointmentId}` | C | unprobeable | — | — | — | — |  |
| getContactCustomFieldById | `/contacts/{contactId}/custom-fields/{customFieldId}` | C | unprobeable | — | — | — | — |  |
| getContactEmailAddressById | `/contacts/{contactId}/email-addresses/{emailId}` | C | 200 | id address primary type _link | — | — | — |  |
| getContactPhoneNumberById | `/contacts/{contactId}/phone-numbers/{phoneId}` | C | 200 | id number ext type primary smsOptOut _link | — | — | — |  |
| getEstimateSectionById | `/estimates/{estimateId}/sections/{estimateSectionId}` | C | unprobeable | — | — | — | — |  |
| getEstimateSectionItem | `/estimates/{estimateId}/sections/{estimateSectionId}/items/{estimateItemId}` | C | unprobeable | — | — | — | — |  |
| getEstimateSectionItems | `/estimates/{estimateId}/sections/{estimateSectionId}/items` | C | unprobeable | — | — | — | — |  |
| getJobContact | `/jobs/{jobId}/contacts/{jobContactId}` | C | 200 | id contact isPrimary relationToPrimary _link | — | — | — |  |
| getJobCustomFieldById | `/jobs/{jobId}/custom-fields/{customFieldId}` | C | unprobeable | — | — | — | — |  |
| getJobMilestoneById | `/jobs/{jobId}/milestones/{milestoneId}` | C | 200 | name isCurrent statuses duration id jobId _link | — | — | — |  |
| getJobStatusById | `/jobs/{jobId}/milestones/{milestoneId}/status/{statusId}` | C | unprobeable | — | — | — | — |  |
| getLeadSourceChildById | `/company-settings/leads/lead-sources/{leadSourceParentId}/children/{leadSourceId}` | C | unprobeable | — | — | — | — |  |
| getReportByInstanceId | `/reports/scheduled-reports/{scheduledReportId}/runs/{instanceRunId}` | C | unprobeable | — | — | — | — | unprobeable_no_seed |
| getReportInstaceRecipientById | `/reports/scheduled-reports/{scheduledReportId}/runs/{instanceRunId}/recipients/{recipientId}` | C | unprobeable | — | — | — | — | unprobeable_no_seed |
| getReportsRecipientsByInstanceId | `/reports/scheduled-reports/{scheduledReportId}/runs/{instanceRunId}/recipients` | C | unprobeable | — | — | pageStartIndex | — | unprobeable_no_seed |
| getWorksheetAmendmentById | `/financials/{financialsId}/amendments/{financialsAmendmentId}` | C | unprobeable | — | — | — | — |  |

## Known structural notes (independent of sandbox data)

- **Write-only paths have no read GET:** `POST /jobs/{jobId}/messages` and `POST /contacts/{contactId}/logs` are not in the 86 GETs — there is no read path (docs/37).
- **Reports (5 ops):** `/reports/scheduled-reports/{scheduledReportId}/...` require a `scheduledReportId` but no GET lists them — `unprobeable` without a human-supplied id from the AccuLynx UI.
- **Webhooks (3 ops):** `/subscriptions`, `/subscriptions/{id}`, `/topics` are on the webhooks base URL and may be account-tier gated.
- **Pagination split:** 21 GETs use `recordStartIndex`, 10 use `pageStartIndex` — selected per-endpoint, never globally.
