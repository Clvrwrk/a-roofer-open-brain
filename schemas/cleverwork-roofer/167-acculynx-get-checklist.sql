-- 167 — AccuLynx GET probe checklist (Phase 1, REQ-05)
--
-- The deterministic, spec-driven target for the sandbox read sweep: every documented GET
-- operation (86) from skills/cleverwork-roofer/acculynx-api/reference/openapi-index.json, with
-- its tier (A=no path param, B=single, C=two+), pagination param (recordStartIndex vs
-- pageStartIndex per the OpenAPI parameters), path params, includes support, and a probeability
-- flag (webhook GETs are tier_gated; the 5 Reports GETs are unprobeable_no_seed — no list
-- endpoint exists for scheduledReportId). The sweep (01-02) reads this table and marks `swept`
-- per row for watermark-resume. Rows generated from the spec, not by hand. Additive + idempotent.

create table if not exists public.acculynx_get_checklist (
  operation_id        text primary key,
  path                text not null,
  base_url            text not null,
  tier                text not null check (tier in ('A','B','C')),
  path_params         jsonb not null default '[]'::jsonb,
  pagination_param    text,
  includes_supported  boolean not null default false,
  seed_source         text,
  probeability        text not null default 'probeable'
                        check (probeability in ('probeable','tier_gated','unprobeable_no_seed')),
  swept               boolean not null default false,
  created_at          timestamptz not null default now()
);

comment on table public.acculynx_get_checklist is
  'Spec-driven checklist of the 86 documented AccuLynx GET operations. Drives the sandbox read sweep (Phase 1, REQ-05); swept flag supports watermark-resume.';

insert into public.acculynx_get_checklist
  (operation_id, path, base_url, tier, path_params, pagination_param, includes_supported, seed_source, probeability)
values
  ($$getAccuLynxCountries$$, $$/acculynx/countries$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, null, true, null, $$probeable$$),
  ($$getAccuLynxCountry$$, $$/acculynx/countries/{countryId}$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["countryId"]$$::jsonb, null, true, $$countryId$$, $$probeable$$),
  ($$getAccuLynxStates$$, $$/acculynx/countries/{countryId}/states$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["countryId"]$$::jsonb, null, false, $$countryId$$, $$probeable$$),
  ($$getAccuLynxState$$, $$/acculynx/countries/{countryId}/states/{stateId}$$, $$https://api.acculynx.com/api/v2$$, $$C$$, $$["countryId","stateId"]$$::jsonb, null, false, $$countryId -> stateId$$, $$probeable$$),
  ($$getAcculynxUnitsOfMeasure$$, $$/acculynx/units-of-measure$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, null, false, null, $$probeable$$),
  ($$getCalendars$$, $$/calendars$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, $$recordStartIndex$$, false, null, $$probeable$$),
  ($$getAppointments$$, $$/calendars/{calendarId}/appointments$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["calendarId"]$$::jsonb, $$pageStartIndex$$, false, $$calendarId$$, $$probeable$$),
  ($$getAppointmentById$$, $$/calendars/{calendarId}/appointments/{appointmentId}$$, $$https://api.acculynx.com/api/v2$$, $$C$$, $$["calendarId","appointmentId"]$$::jsonb, null, false, $$calendarId -> appointmentId$$, $$probeable$$),
  ($$getCompanySettings$$, $$/company-settings$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, null, false, null, $$probeable$$),
  ($$getCompanySettingsCustomFields$$, $$/company-settings/custom-fields$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, $$recordStartIndex$$, true, null, $$probeable$$),
  ($$getCompanyDocumentFolders$$, $$/company-settings/job-file-settings/document-folders$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, $$recordStartIndex$$, false, null, $$probeable$$),
  ($$getInsuranceCompanies$$, $$/company-settings/job-file-settings/insurance-companies$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, $$recordStartIndex$$, false, null, $$probeable$$),
  ($$getCompanySettingsJobSettingsJobCategories$$, $$/company-settings/job-file-settings/job-categories$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, $$recordStartIndex$$, false, null, $$probeable$$),
  ($$getPhotoVideoTags$$, $$/company-settings/job-file-settings/photo-video-tags$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, $$recordStartIndex$$, false, null, $$probeable$$),
  ($$getCompanySettingsJobSettingsTradeTypes$$, $$/company-settings/job-file-settings/trade-types$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, $$recordStartIndex$$, false, null, $$probeable$$),
  ($$getCompanySettingsJobSettingsWorkTypes$$, $$/company-settings/job-file-settings/work-types$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, $$recordStartIndex$$, false, null, $$probeable$$),
  ($$getMilestones$$, $$/company-settings/job-file-settings/workflow-milestones$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, null, true, null, $$probeable$$),
  ($$getStatusesForMilestone$$, $$/company-settings/job-file-settings/workflow-milestones/{milestone}/statuses$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["milestone"]$$::jsonb, null, false, $$milestone$$, $$probeable$$),
  ($$getActiveLeadSources$$, $$/company-settings/leads/lead-sources$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, $$recordStartIndex$$, false, null, $$probeable$$),
  ($$getLeadSourceById$$, $$/company-settings/leads/lead-sources/{leadSourceId}$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["leadSourceId"]$$::jsonb, null, false, $$leadSourceId$$, $$probeable$$),
  ($$getLeadSourceChildById$$, $$/company-settings/leads/lead-sources/{leadSourceParentId}/children/{leadSourceId}$$, $$https://api.acculynx.com/api/v2$$, $$C$$, $$["leadSourceParentId","leadSourceId"]$$::jsonb, null, false, $$leadSourceParentId -> leadSourceId$$, $$probeable$$),
  ($$getActiveAccountTypes$$, $$/company-settings/location-settings/account-types$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, null, false, null, $$probeable$$),
  ($$getAccountTypeById$$, $$/company-settings/location-settings/account-types/{accountTypeId}$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["accountTypeId"]$$::jsonb, null, false, $$accountTypeId$$, $$probeable$$),
  ($$getCompanySettingsLocationSettingsCountries$$, $$/company-settings/location-settings/countries$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, $$recordStartIndex$$, true, null, $$probeable$$),
  ($$getcompanySettingsLocationSettingsCountriesCountryIdStates$$, $$/company-settings/location-settings/countries/{countryId}/states$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["countryId"]$$::jsonb, $$recordStartIndex$$, false, $$countryId$$, $$probeable$$),
  ($$getContacts$$, $$/contacts$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, $$pageStartIndex$$, true, null, $$probeable$$),
  ($$getContact$$, $$/contacts/{contactId}$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["contactId"]$$::jsonb, null, true, $$contactId$$, $$probeable$$),
  ($$getContactCustomFields$$, $$/contacts/{contactId}/custom-fields$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["contactId"]$$::jsonb, $$recordStartIndex$$, false, $$contactId$$, $$probeable$$),
  ($$getContactCustomFieldById$$, $$/contacts/{contactId}/custom-fields/{customFieldId}$$, $$https://api.acculynx.com/api/v2$$, $$C$$, $$["contactId","customFieldId"]$$::jsonb, null, false, $$contactId -> customFieldId$$, $$probeable$$),
  ($$getContactEmailAddresses$$, $$/contacts/{contactId}/email-addresses$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["contactId"]$$::jsonb, null, false, $$contactId$$, $$probeable$$),
  ($$getContactEmailAddressById$$, $$/contacts/{contactId}/email-addresses/{emailId}$$, $$https://api.acculynx.com/api/v2$$, $$C$$, $$["contactId","emailId"]$$::jsonb, null, false, $$contactId -> emailId$$, $$probeable$$),
  ($$getContactPhoneNumber$$, $$/contacts/{contactId}/phone-numbers$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["contactId"]$$::jsonb, null, false, $$contactId$$, $$probeable$$),
  ($$getContactPhoneNumberById$$, $$/contacts/{contactId}/phone-numbers/{phoneId}$$, $$https://api.acculynx.com/api/v2$$, $$C$$, $$["contactId","phoneId"]$$::jsonb, null, false, $$contactId -> phoneId$$, $$probeable$$),
  ($$getContactTypes$$, $$/contacts/contact-types$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, $$pageStartIndex$$, false, null, $$probeable$$),
  ($$getPing$$, $$/diagnostics/ping$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, null, false, null, $$probeable$$),
  ($$getEstimates$$, $$/estimates$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, $$pageStartIndex$$, true, null, $$probeable$$),
  ($$getEstimateById$$, $$/estimates/{estimateId}$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["estimateId"]$$::jsonb, null, true, $$estimateId$$, $$probeable$$),
  ($$getEstimateSections$$, $$/estimates/{estimateId}/sections$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["estimateId"]$$::jsonb, null, true, $$estimateId$$, $$probeable$$),
  ($$getEstimateSectionById$$, $$/estimates/{estimateId}/sections/{estimateSectionId}$$, $$https://api.acculynx.com/api/v2$$, $$C$$, $$["estimateId","estimateSectionId"]$$::jsonb, null, true, $$estimateId -> estimateSectionId$$, $$probeable$$),
  ($$getEstimateSectionItems$$, $$/estimates/{estimateId}/sections/{estimateSectionId}/items$$, $$https://api.acculynx.com/api/v2$$, $$C$$, $$["estimateId","estimateSectionId"]$$::jsonb, null, false, $$estimateId -> estimateSectionId$$, $$probeable$$),
  ($$getEstimateSectionItem$$, $$/estimates/{estimateId}/sections/{estimateSectionId}/items/{estimateItemId}$$, $$https://api.acculynx.com/api/v2$$, $$C$$, $$["estimateId","estimateSectionId","estimateItemId"]$$::jsonb, null, false, $$estimateId -> estimateSectionId -> estimateItemId$$, $$probeable$$),
  ($$getFinancialsByFinancialId$$, $$/financials/{financialsId}$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["financialsId"]$$::jsonb, null, true, $$financialsId$$, $$probeable$$),
  ($$getWorksheetAmendmentsById$$, $$/financials/{financialsId}/amendments$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["financialsId"]$$::jsonb, $$pageStartIndex$$, false, $$financialsId$$, $$probeable$$),
  ($$getWorksheetAmendmentById$$, $$/financials/{financialsId}/amendments/{financialsAmendmentId}$$, $$https://api.acculynx.com/api/v2$$, $$C$$, $$["financialsId","financialsAmendmentId"]$$::jsonb, null, false, $$financialsId -> financialsAmendmentId$$, $$probeable$$),
  ($$getWorksheetById$$, $$/financials/{financialsId}/worksheet$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["financialsId"]$$::jsonb, null, false, $$financialsId$$, $$probeable$$),
  ($$getInvoiceById$$, $$/invoices/{invoiceId}$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["invoiceId"]$$::jsonb, null, false, $$invoiceId$$, $$probeable$$),
  ($$getJobs$$, $$/jobs$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, $$recordStartIndex$$, true, null, $$probeable$$),
  ($$getJob$$, $$/jobs/{jobId}$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["jobId"]$$::jsonb, null, true, $$jobId$$, $$probeable$$),
  ($$getAccountingIntegrationsSyncChangesForJob$$, $$/jobs/{jobId}/accounting/integration-status$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["jobId"]$$::jsonb, null, false, $$jobId$$, $$probeable$$),
  ($$getAdjusterForJob$$, $$/jobs/{jobId}/adjuster$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["jobId"]$$::jsonb, null, false, $$jobId$$, $$probeable$$),
  ($$getJobContacts$$, $$/jobs/{jobId}/contacts$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["jobId"]$$::jsonb, null, true, $$jobId$$, $$probeable$$),
  ($$getJobContact$$, $$/jobs/{jobId}/contacts/{jobContactId}$$, $$https://api.acculynx.com/api/v2$$, $$C$$, $$["jobId","jobContactId"]$$::jsonb, null, true, $$jobId -> jobContactId$$, $$probeable$$),
  ($$GetJobCustomFields$$, $$/jobs/{jobId}/custom-fields$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["jobId"]$$::jsonb, $$recordStartIndex$$, false, $$jobId$$, $$probeable$$),
  ($$getJobCustomFieldById$$, $$/jobs/{jobId}/custom-fields/{customFieldId}$$, $$https://api.acculynx.com/api/v2$$, $$C$$, $$["jobId","customFieldId"]$$::jsonb, null, false, $$jobId -> customFieldId$$, $$probeable$$),
  ($$getEstimatesForJob$$, $$/jobs/{jobId}/estimates$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["jobId"]$$::jsonb, $$recordStartIndex$$, false, $$jobId$$, $$probeable$$),
  ($$getFinancialsForJob$$, $$/jobs/{jobId}/financials$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["jobId"]$$::jsonb, null, true, $$jobId$$, $$probeable$$),
  ($$getJobHistory$$, $$/jobs/{jobId}/history$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["jobId"]$$::jsonb, $$recordStartIndex$$, true, $$jobId$$, $$probeable$$),
  ($$getInitialAppointmentForJob$$, $$/jobs/{jobId}/initial-appointment$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["jobId"]$$::jsonb, null, false, $$jobId$$, $$probeable$$),
  ($$getInsuranceForJob$$, $$/jobs/{jobId}/insurance$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["jobId"]$$::jsonb, null, false, $$jobId$$, $$probeable$$),
  ($$getInvoicesForJob$$, $$/jobs/{jobId}/invoices$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["jobId"]$$::jsonb, $$pageStartIndex$$, false, $$jobId$$, $$probeable$$),
  ($$getMilestonesForJob$$, $$/jobs/{jobId}/milestone-history$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["jobId"]$$::jsonb, null, false, $$jobId$$, $$probeable$$),
  ($$getJobMilestoneById$$, $$/jobs/{jobId}/milestones/{milestoneId}$$, $$https://api.acculynx.com/api/v2$$, $$C$$, $$["jobId","milestoneId"]$$::jsonb, null, true, $$jobId -> milestoneId$$, $$probeable$$),
  ($$getJobStatusById$$, $$/jobs/{jobId}/milestones/{milestoneId}/status/{statusId}$$, $$https://api.acculynx.com/api/v2$$, $$C$$, $$["jobId","milestoneId","statusId"]$$::jsonb, null, false, $$jobId -> milestoneId -> statusId$$, $$probeable$$),
  ($$getCurrentJobMilestone$$, $$/jobs/{jobId}/milestones/current$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["jobId"]$$::jsonb, null, true, $$jobId$$, $$probeable$$),
  ($$getPayments$$, $$/jobs/{jobId}/payments$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["jobId"]$$::jsonb, null, false, $$jobId$$, $$probeable$$),
  ($$getPaymentsOverviewForJob$$, $$/jobs/{jobId}/payments/overview$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["jobId"]$$::jsonb, null, false, $$jobId$$, $$probeable$$),
  ($$getRepresentativesForJob$$, $$/jobs/{jobId}/representatives$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["jobId"]$$::jsonb, $$recordStartIndex$$, false, $$jobId$$, $$probeable$$),
  ($$getAROwnerForJob$$, $$/jobs/{jobId}/representatives/ar-owner$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["jobId"]$$::jsonb, null, false, $$jobId$$, $$probeable$$),
  ($$getCompanyRepresentativeForJob$$, $$/jobs/{jobId}/representatives/company$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["jobId"]$$::jsonb, null, false, $$jobId$$, $$probeable$$),
  ($$getSalesOwnerForJob$$, $$/jobs/{jobId}/representatives/sales-owner$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["jobId"]$$::jsonb, null, false, $$jobId$$, $$probeable$$),
  ($$getJobExternalReferences$$, $$/jobs/external-references$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, null, false, null, $$probeable$$),
  ($$getLeadHistory$$, $$/leads/{leadId}/history$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["leadId"]$$::jsonb, null, true, $$leadId$$, $$probeable$$),
  ($$getReportsByInstanceInstanceRunsByScheduleId$$, $$/reports/scheduled-reports/{scheduledReportId}/runs$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["scheduledReportId"]$$::jsonb, $$pageStartIndex$$, false, $$scheduledReportId$$, $$unprobeable_no_seed$$),
  ($$getReportByInstanceId$$, $$/reports/scheduled-reports/{scheduledReportId}/runs/{instanceRunId}$$, $$https://api.acculynx.com/api/v2$$, $$C$$, $$["scheduledReportId","instanceRunId"]$$::jsonb, null, false, $$scheduledReportId -> instanceRunId$$, $$unprobeable_no_seed$$),
  ($$getReportsRecipientsByInstanceId$$, $$/reports/scheduled-reports/{scheduledReportId}/runs/{instanceRunId}/recipients$$, $$https://api.acculynx.com/api/v2$$, $$C$$, $$["scheduledReportId","instanceRunId"]$$::jsonb, $$pageStartIndex$$, false, $$scheduledReportId -> instanceRunId$$, $$unprobeable_no_seed$$),
  ($$getReportInstaceRecipientById$$, $$/reports/scheduled-reports/{scheduledReportId}/runs/{instanceRunId}/recipients/{recipientId}$$, $$https://api.acculynx.com/api/v2$$, $$C$$, $$["scheduledReportId","instanceRunId","recipientId"]$$::jsonb, null, false, $$scheduledReportId -> instanceRunId -> recipientId$$, $$unprobeable_no_seed$$),
  ($$getReportLatestInstance$$, $$/reports/scheduled-reports/{scheduledReportId}/runs/latest$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["scheduledReportId"]$$::jsonb, null, false, $$scheduledReportId$$, $$unprobeable_no_seed$$),
  ($$getSubscriptions$$, $$/subscriptions$$, $$https://api.acculynx.com/webhooks/v2$$, $$A$$, $$[]$$::jsonb, $$pageStartIndex$$, false, null, $$tier_gated$$),
  ($$getSubscription$$, $$/subscriptions/{subscriptionId}$$, $$https://api.acculynx.com/webhooks/v2$$, $$B$$, $$["subscriptionId"]$$::jsonb, null, false, $$subscriptionId$$, $$tier_gated$$),
  ($$getFinancialsSupplementsForCompany$$, $$/supplements$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, $$recordStartIndex$$, true, null, $$probeable$$),
  ($$getSupplementById$$, $$/supplements/{supplementId}$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["supplementId"]$$::jsonb, null, false, $$supplementId$$, $$probeable$$),
  ($$getFinancialsSupplementItemCollection$$, $$/supplements/{supplementId}/items$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["supplementId"]$$::jsonb, $$recordStartIndex$$, false, $$supplementId$$, $$probeable$$),
  ($$getFinancialsSupplementNotationCollection$$, $$/supplements/{supplementId}/notations$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["supplementId"]$$::jsonb, $$recordStartIndex$$, false, $$supplementId$$, $$probeable$$),
  ($$getTopics$$, $$/topics$$, $$https://api.acculynx.com/webhooks/v2$$, $$A$$, $$[]$$::jsonb, $$pageStartIndex$$, false, null, $$tier_gated$$),
  ($$getUsers$$, $$/users$$, $$https://api.acculynx.com/api/v2$$, $$A$$, $$[]$$::jsonb, $$recordStartIndex$$, false, null, $$probeable$$),
  ($$getUser$$, $$/users/{userId}$$, $$https://api.acculynx.com/api/v2$$, $$B$$, $$["userId"]$$::jsonb, null, false, $$userId$$, $$probeable$$)
on conflict (operation_id) do nothing;

alter table public.acculynx_get_checklist enable row level security;
grant select on public.acculynx_get_checklist to authenticated, service_role;
