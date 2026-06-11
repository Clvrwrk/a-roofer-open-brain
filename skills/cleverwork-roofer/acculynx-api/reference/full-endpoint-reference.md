# AccuLynx API Full Endpoint Reference

Generated: 2026-06-09T20:54:34Z
Source: https://apidocs.acculynx.com/llms.txt

This file is generated from AccuLynx's public Markdown pages and embedded OpenAPI definitions. Use it with `openapi-index.json` for endpoint selection, request planning, and bridge maintenance.

## Summary

- API operations parsed: 124
- Webhook event references parsed: 23
- Source pages fetched: 159

## Endpoint Catalog

### AccuLynx Common

| Method | Path | Operation | Source |
| --- | --- | --- | --- |
| `GET` | `/acculynx/countries` | Get AccuLynx Countries | [getacculynxcountries](https://apidocs.acculynx.com/reference/getacculynxcountries.md) |
| `GET` | `/acculynx/countries/{countryId}` | Get an AccuLynx Country | [getacculynxcountry](https://apidocs.acculynx.com/reference/getacculynxcountry.md) |
| `GET` | `/acculynx/countries/{countryId}/states` | Get States | [getacculynxstates](https://apidocs.acculynx.com/reference/getacculynxstates.md) |
| `GET` | `/acculynx/countries/{countryId}/states/{stateId}` | Get a particular state | [getacculynxstate](https://apidocs.acculynx.com/reference/getacculynxstate.md) |
| `GET` | `/acculynx/units-of-measure` | Get units of measure | [getacculynxunitsofmeasure](https://apidocs.acculynx.com/reference/getacculynxunitsofmeasure.md) |

### Calendar

| Method | Path | Operation | Source |
| --- | --- | --- | --- |
| `GET` | `/calendars` | Calendar List | [getcalendars](https://apidocs.acculynx.com/reference/getcalendars.md) |
| `GET` | `/calendars/{calendarId}/appointments` | Calendar Appointments Summary | [getappointments](https://apidocs.acculynx.com/reference/getappointments.md) |
| `GET` | `/calendars/{calendarId}/appointments/{appointmentId}` | Get Appointment Details | [getappointmentbyid](https://apidocs.acculynx.com/reference/getappointmentbyid.md) |

### Company

| Method | Path | Operation | Source |
| --- | --- | --- | --- |
| `GET` | `/company-settings` | Get Company Settings. | [getcompanysettings](https://apidocs.acculynx.com/reference/getcompanysettings.md) |
| `GET` | `/company-settings/custom-fields` | Get Custom Field Definitions | [getcompanysettingscustomfields](https://apidocs.acculynx.com/reference/getcompanysettingscustomfields.md) |
| `GET` | `/company-settings/job-file-settings/document-folders` | Get Documents Folders | [getcompanydocumentfolders](https://apidocs.acculynx.com/reference/getcompanydocumentfolders.md) |
| `GET` | `/company-settings/job-file-settings/insurance-companies` | Get Insurance Companies. | [getinsurancecompanies](https://apidocs.acculynx.com/reference/getinsurancecompanies.md) |
| `GET` | `/company-settings/job-file-settings/job-categories` | Get Job Categories of the company. | [getcompanysettingsjobsettingsjobcategories](https://apidocs.acculynx.com/reference/getcompanysettingsjobsettingsjobcategories.md) |
| `GET` | `/company-settings/job-file-settings/photo-video-tags` | Get Company Photo and Video Tags. | [getphotovideotags](https://apidocs.acculynx.com/reference/getphotovideotags.md) |
| `GET` | `/company-settings/job-file-settings/trade-types` | Get Trade Types of the company. | [getcompanysettingsjobsettingstradetypes](https://apidocs.acculynx.com/reference/getcompanysettingsjobsettingstradetypes.md) |
| `GET` | `/company-settings/job-file-settings/work-types` | Get Work Types of a company. | [getcompanysettingsjobsettingsworktypes](https://apidocs.acculynx.com/reference/getcompanysettingsjobsettingsworktypes.md) |
| `GET` | `/company-settings/job-file-settings/workflow-milestones` | Get milestones | [getmilestones](https://apidocs.acculynx.com/reference/getmilestones.md) |
| `GET` | `/company-settings/job-file-settings/workflow-milestones/{milestone}/statuses` | Get statuses for a milestone | [getstatusesformilestone](https://apidocs.acculynx.com/reference/getstatusesformilestone.md) |
| `GET` | `/company-settings/leads/lead-sources` | Get Active Lead Sources for a company. | [getactiveleadsources](https://apidocs.acculynx.com/reference/getactiveleadsources.md) |
| `GET` | `/company-settings/leads/lead-sources/{leadSourceId}` | Get Company Lead Source by Id. | [getleadsourcebyid](https://apidocs.acculynx.com/reference/getleadsourcebyid.md) |
| `GET` | `/company-settings/leads/lead-sources/{leadSourceParentId}/children/{leadSourceId}` | Get Company Child Lead Source by Id. | [getleadsourcechildbyid](https://apidocs.acculynx.com/reference/getleadsourcechildbyid.md) |
| `GET` | `/company-settings/location-settings/account-types` | Get Company Active Account Types. | [getactiveaccounttypes](https://apidocs.acculynx.com/reference/getactiveaccounttypes.md) |
| `GET` | `/company-settings/location-settings/account-types/{accountTypeId}` | Get Company Active Account Type by id. | [getaccounttypebyid](https://apidocs.acculynx.com/reference/getaccounttypebyid.md) |
| `GET` | `/company-settings/location-settings/countries` | Get Company Countries | [getcompanysettingslocationsettingscountries](https://apidocs.acculynx.com/reference/getcompanysettingslocationsettingscountries.md) |
| `GET` | `/company-settings/location-settings/countries/{countryId}/states` | Get Company States | [getcompanysettingslocationsettingscountriescountryidstates](https://apidocs.acculynx.com/reference/getcompanysettingslocationsettingscountriescountryidstates.md) |

### Contacts

| Method | Path | Operation | Source |
| --- | --- | --- | --- |
| `GET` | `/contacts` | Contacts Summary | [getcontacts](https://apidocs.acculynx.com/reference/getcontacts.md) |
| `POST` | `/contacts` | Create Contact | [postcontacts](https://apidocs.acculynx.com/reference/postcontacts.md) |
| `GET` | `/contacts/{contactId}` | Get Contact by Id. | [getcontact](https://apidocs.acculynx.com/reference/getcontact.md) |
| `GET` | `/contacts/{contactId}/custom-fields` | Retrieve all custom fields for a contact by id. | [getcontactcustomfields](https://apidocs.acculynx.com/reference/getcontactcustomfields.md) |
| `PUT` | `/contacts/{contactId}/custom-fields` | Sets multiple custom field values for a contact by id | [putcontactcustomfields](https://apidocs.acculynx.com/reference/putcontactcustomfields.md) |
| `GET` | `/contacts/{contactId}/custom-fields/{customFieldId}` | Retrieve a specific custom field for a contact by id | [getcontactcustomfieldbyid](https://apidocs.acculynx.com/reference/getcontactcustomfieldbyid.md) |
| `PUT` | `/contacts/{contactId}/custom-fields/{customFieldId}` | Sets a value for a specific custom field for a contact by id | [putcontactcustomfieldbyid](https://apidocs.acculynx.com/reference/putcontactcustomfieldbyid.md) |
| `GET` | `/contacts/{contactId}/email-addresses` | Get Email Address List. | [getcontactemailaddresses](https://apidocs.acculynx.com/reference/getcontactemailaddresses.md) |
| `GET` | `/contacts/{contactId}/email-addresses/{emailId}` | Get Email Address. | [getcontactemailaddressbyid](https://apidocs.acculynx.com/reference/getcontactemailaddressbyid.md) |
| `POST` | `/contacts/{contactId}/logs` | Create Contact - Log | [postcontactlog](https://apidocs.acculynx.com/reference/postcontactlog.md) |
| `GET` | `/contacts/{contactId}/phone-numbers` | Get Phone Number List. | [getcontactphonenumber](https://apidocs.acculynx.com/reference/getcontactphonenumber.md) |
| `GET` | `/contacts/{contactId}/phone-numbers/{phoneId}` | Get a phone number | [getcontactphonenumberbyid](https://apidocs.acculynx.com/reference/getcontactphonenumberbyid.md) |
| `GET` | `/contacts/contact-types` | Get the contact types | [getcontacttypes](https://apidocs.acculynx.com/reference/getcontacttypes.md) |
| `POST` | `/contacts/search` | Contacts Search. | [postcontactsearch](https://apidocs.acculynx.com/reference/postcontactsearch.md) |

### Diagnostics

| Method | Path | Operation | Source |
| --- | --- | --- | --- |
| `GET` | `/diagnostics/ping` | Check if the API server is responsive | [getping](https://apidocs.acculynx.com/reference/getping.md) |

### Estimates

| Method | Path | Operation | Source |
| --- | --- | --- | --- |
| `GET` | `/estimates` | Get Estimates | [getestimates](https://apidocs.acculynx.com/reference/getestimates.md) |
| `GET` | `/estimates/{estimateId}` | Get Estimate | [getestimatebyid](https://apidocs.acculynx.com/reference/getestimatebyid.md) |
| `GET` | `/estimates/{estimateId}/sections` | Get Estimate Sections | [getestimatesections](https://apidocs.acculynx.com/reference/getestimatesections.md) |
| `GET` | `/estimates/{estimateId}/sections/{estimateSectionId}` | Get Estimate Section | [getestimatesectionbyid](https://apidocs.acculynx.com/reference/getestimatesectionbyid.md) |
| `GET` | `/estimates/{estimateId}/sections/{estimateSectionId}/items` | Get Estimate Section Items | [getestimatesectionitems](https://apidocs.acculynx.com/reference/getestimatesectionitems.md) |
| `GET` | `/estimates/{estimateId}/sections/{estimateSectionId}/items/{estimateItemId}` | Get Estimate Section Item | [getestimatesectionitem](https://apidocs.acculynx.com/reference/getestimatesectionitem.md) |

### Financials

| Method | Path | Operation | Source |
| --- | --- | --- | --- |
| `GET` | `/financials/{financialsId}` | Get Financials | [getfinancialsbyfinancialid](https://apidocs.acculynx.com/reference/getfinancialsbyfinancialid.md) |
| `GET` | `/financials/{financialsId}/amendments` | Get Financial Amendments | [getworksheetamendmentsbyid](https://apidocs.acculynx.com/reference/getworksheetamendmentsbyid.md) |
| `GET` | `/financials/{financialsId}/amendments/{financialsAmendmentId}` | Get Financial Amendment | [getworksheetamendmentbyid](https://apidocs.acculynx.com/reference/getworksheetamendmentbyid.md) |
| `GET` | `/financials/{financialsId}/worksheet` | Get Worksheet | [getworksheetbyid](https://apidocs.acculynx.com/reference/getworksheetbyid.md) |
| `POST` | `/financials/{financialsId}/worksheet/items` | Create Worksheet Item | [postworksheetsectionitem](https://apidocs.acculynx.com/reference/postworksheetsectionitem.md) |

### Invoices

| Method | Path | Operation | Source |
| --- | --- | --- | --- |
| `GET` | `/invoices/{invoiceId}` | Get Invoice | [getinvoicebyid](https://apidocs.acculynx.com/reference/getinvoicebyid.md) |

### Jobs

| Method | Path | Operation | Source |
| --- | --- | --- | --- |
| `GET` | `/jobs` | Jobs List. | [getjobs](https://apidocs.acculynx.com/reference/getjobs.md) |
| `POST` | `/jobs` | Create job | [postjob](https://apidocs.acculynx.com/reference/postjob.md) |
| `GET` | `/jobs/{jobId}` | Get Job by Id. | [getjob](https://apidocs.acculynx.com/reference/getjob.md) |
| `GET` | `/jobs/{jobId}/accounting/integration-status` | Get accounting integration status for a job | [getaccountingintegrationssyncchangesforjob](https://apidocs.acculynx.com/reference/getaccountingintegrationssyncchangesforjob.md) |
| `PUT` | `/jobs/{jobId}/address` | Updates job location address information. | [putjoblocationaddress](https://apidocs.acculynx.com/reference/putjoblocationaddress.md) |
| `GET` | `/jobs/{jobId}/adjuster` | Get Job Adjuster Information. | [getadjusterforjob](https://apidocs.acculynx.com/reference/getadjusterforjob.md) |
| `PUT` | `/jobs/{jobId}/adjuster` | Set/Update Job Adjuster Information. | [putadjusterforjob](https://apidocs.acculynx.com/reference/putadjusterforjob.md) |
| `GET` | `/jobs/{jobId}/contacts` | Contact List | [getjobcontacts](https://apidocs.acculynx.com/reference/getjobcontacts.md) |
| `GET` | `/jobs/{jobId}/contacts/{jobContactId}` | Get a job contact by Id | [getjobcontact](https://apidocs.acculynx.com/reference/getjobcontact.md) |
| `GET` | `/jobs/{jobId}/custom-fields` | Retrieve all the custom fields for a job by id | [getjobcustomfields](https://apidocs.acculynx.com/reference/getjobcustomfields.md) |
| `PUT` | `/jobs/{jobId}/custom-fields` | Sets multiple custom field values for a job by id | [putjobcustomfields](https://apidocs.acculynx.com/reference/putjobcustomfields.md) |
| `GET` | `/jobs/{jobId}/custom-fields/{customFieldId}` | Retrieve a specific custom field for a job by id | [getjobcustomfieldbyid](https://apidocs.acculynx.com/reference/getjobcustomfieldbyid.md) |
| `PUT` | `/jobs/{jobId}/custom-fields/{customFieldId}` | Sets a value for a specific custom field for a job by id | [putjobcustomfieldbyid](https://apidocs.acculynx.com/reference/putjobcustomfieldbyid.md) |
| `POST` | `/jobs/{jobId}/documents` | Add JobDocument | [postaddjobdocument](https://apidocs.acculynx.com/reference/postaddjobdocument.md) |
| `GET` | `/jobs/{jobId}/estimates` | Get estimates for a job | [getestimatesforjob](https://apidocs.acculynx.com/reference/getestimatesforjob.md) |
| `GET` | `/jobs/{jobId}/financials` | Get Financials for a job | [getfinancialsforjob](https://apidocs.acculynx.com/reference/getfinancialsforjob.md) |
| `GET` | `/jobs/{jobId}/history` | Job change history | [getjobhistory](https://apidocs.acculynx.com/reference/getjobhistory.md) |
| `DELETE` | `/jobs/{jobId}/initial-appointment` | Delete the job Initial Appointment. | [deletejobinitialappointment](https://apidocs.acculynx.com/reference/deletejobinitialappointment.md) |
| `GET` | `/jobs/{jobId}/initial-appointment` | Job Initial Appointment. | [getinitialappointmentforjob](https://apidocs.acculynx.com/reference/getinitialappointmentforjob.md) |
| `PUT` | `/jobs/{jobId}/initial-appointment` | Add or Update Initial Appointment | [putinitialappointmentforjob](https://apidocs.acculynx.com/reference/putinitialappointmentforjob.md) |
| `GET` | `/jobs/{jobId}/insurance` | Get Job Insurance Information. | [getinsuranceforjob](https://apidocs.acculynx.com/reference/getinsuranceforjob.md) |
| `PUT` | `/jobs/{jobId}/insurance` | Set Insurance Information for an existing Job. | [putinsuranceinformationforjob](https://apidocs.acculynx.com/reference/putinsuranceinformationforjob.md) |
| `PUT` | `/jobs/{jobId}/insurance/insurance-company` | Set Insurance Company for an existing Job. | [putinsurancecompanyforjob](https://apidocs.acculynx.com/reference/putinsurancecompanyforjob.md) |
| `GET` | `/jobs/{jobId}/invoices` | Get invoices for a job | [getinvoicesforjob](https://apidocs.acculynx.com/reference/getinvoicesforjob.md) |
| `PUT` | `/jobs/{jobId}/job-categories` | Update Job Category. | [updatejobcategory](https://apidocs.acculynx.com/reference/updatejobcategory.md) |
| `PUT` | `/jobs/{jobId}/lead-source` | Update job lead source | [updatejobleadsource](https://apidocs.acculynx.com/reference/updatejobleadsource.md) |
| `POST` | `/jobs/{jobId}/messages` | Create Job Message | [postcreatejobmessage](https://apidocs.acculynx.com/reference/postcreatejobmessage.md) |
| `POST` | `/jobs/{jobId}/messages/{messageId}/replies` | Reply Job Message | [postreplyjobmessage](https://apidocs.acculynx.com/reference/postreplyjobmessage.md) |
| `GET` | `/jobs/{jobId}/milestone-history` | Get milestone history for the specified Job. | [getmilestonesforjob](https://apidocs.acculynx.com/reference/getmilestonesforjob.md) |
| `GET` | `/jobs/{jobId}/milestones/{milestoneId}` | Get a single milestone for a job by milestone id. | [getjobmilestonebyid](https://apidocs.acculynx.com/reference/getjobmilestonebyid.md) |
| `GET` | `/jobs/{jobId}/milestones/{milestoneId}/status/{statusId}` | Get a single status for a milestone by status id. | [getjobstatusbyid](https://apidocs.acculynx.com/reference/getjobstatusbyid.md) |
| `GET` | `/jobs/{jobId}/milestones/current` | Get the current milestone for a job. | [getcurrentjobmilestone](https://apidocs.acculynx.com/reference/getcurrentjobmilestone.md) |
| `GET` | `/jobs/{jobId}/payments` | Get Job Payments | [getpayments](https://apidocs.acculynx.com/reference/getpayments.md) |
| `POST` | `/jobs/{jobId}/payments/expense` | Create Payment Additional Job Expenses | [postcreatepaymentadditionalexpense](https://apidocs.acculynx.com/reference/postcreatepaymentadditionalexpense.md) |
| `GET` | `/jobs/{jobId}/payments/overview` | Get Job Payments Overview | [getpaymentsoverviewforjob](https://apidocs.acculynx.com/reference/getpaymentsoverviewforjob.md) |
| `POST` | `/jobs/{jobId}/payments/paid` | Create Payment Paid | [postcreatepaymentpaid](https://apidocs.acculynx.com/reference/postcreatepaymentpaid.md) |
| `POST` | `/jobs/{jobId}/payments/received` | Create Payment Received | [postcreatepaymentreceived](https://apidocs.acculynx.com/reference/postcreatepaymentreceived.md) |
| `POST` | `/jobs/{jobId}/photos-videos` | Upload a photo or video to a Job | [postuploadphotoorvideo](https://apidocs.acculynx.com/reference/postuploadphotoorvideo.md) |
| `PUT` | `/jobs/{jobId}/priority` | Set the priority for an existing Job. | [putpriorityforjob](https://apidocs.acculynx.com/reference/putpriorityforjob.md) |
| `GET` | `/jobs/{jobId}/representatives` | Job Representatives List | [getrepresentativesforjob](https://apidocs.acculynx.com/reference/getrepresentativesforjob.md) |
| `DELETE` | `/jobs/{jobId}/representatives/ar-owner` | Delete A/R Owner | [deletearownerfromjob](https://apidocs.acculynx.com/reference/deletearownerfromjob.md) |
| `GET` | `/jobs/{jobId}/representatives/ar-owner` | Get A/R Owner | [getarownerforjob](https://apidocs.acculynx.com/reference/getarownerforjob.md) |
| `POST` | `/jobs/{jobId}/representatives/ar-owner` | Add or Update A/R Owner | [postarownerforjob](https://apidocs.acculynx.com/reference/postarownerforjob.md) |
| `GET` | `/jobs/{jobId}/representatives/company` | Get Company Representative | [getcompanyrepresentativeforjob](https://apidocs.acculynx.com/reference/getcompanyrepresentativeforjob.md) |
| `POST` | `/jobs/{jobId}/representatives/company` | Update Company Representative | [postcompanyrepresentativeforjob](https://apidocs.acculynx.com/reference/postcompanyrepresentativeforjob.md) |
| `DELETE` | `/jobs/{jobId}/representatives/sales-owner` | Delete Sales Owner | [deletesalesownerfromjob](https://apidocs.acculynx.com/reference/deletesalesownerfromjob.md) |
| `GET` | `/jobs/{jobId}/representatives/sales-owner` | Get Sales Owner | [getsalesownerforjob](https://apidocs.acculynx.com/reference/getsalesownerforjob.md) |
| `POST` | `/jobs/{jobId}/representatives/sales-owner` | Add or Update Sales Owner | [postsalesownerforjob](https://apidocs.acculynx.com/reference/postsalesownerforjob.md) |
| `PUT` | `/jobs/{jobId}/trade-types` | Update job trade types | [updatejobtradetypes](https://apidocs.acculynx.com/reference/updatejobtradetypes.md) |
| `PUT` | `/jobs/{jobId}/work-type` | Update job work type | [updatejobworktype](https://apidocs.acculynx.com/reference/updatejobworktype.md) |
| `GET` | `/jobs/external-references` | Get an external reference | [getjobexternalreferences](https://apidocs.acculynx.com/reference/getjobexternalreferences.md) |
| `POST` | `/jobs/external-references` | Set an external reference for a job | [postcreatejobexternalreference](https://apidocs.acculynx.com/reference/postcreatejobexternalreference.md) |
| `POST` | `/jobs/search` | Jobs Search. | [jobssearch](https://apidocs.acculynx.com/reference/jobssearch.md) |

### Leads

| Method | Path | Operation | Source |
| --- | --- | --- | --- |
| `GET` | `/leads/{leadId}/history` | Get the history of the specified Lead. | [getleadhistory](https://apidocs.acculynx.com/reference/getleadhistory.md) |

### Reports

| Method | Path | Operation | Source |
| --- | --- | --- | --- |
| `GET` | `/reports/scheduled-reports/{scheduledReportId}/runs` | Get a list of instance runs for a Report Schedule Id | [getreportsbyinstanceinstancerunsbyscheduleid](https://apidocs.acculynx.com/reference/getreportsbyinstanceinstancerunsbyscheduleid.md) |
| `GET` | `/reports/scheduled-reports/{scheduledReportId}/runs/{instanceRunId}` | Report by instance Id | [getreportbyinstanceid](https://apidocs.acculynx.com/reference/getreportbyinstanceid.md) |
| `GET` | `/reports/scheduled-reports/{scheduledReportId}/runs/{instanceRunId}/recipients` | Get a list of recipients for a specific instance of a Report Schedule Id | [getreportsrecipientsbyinstanceid](https://apidocs.acculynx.com/reference/getreportsrecipientsbyinstanceid.md) |
| `GET` | `/reports/scheduled-reports/{scheduledReportId}/runs/{instanceRunId}/recipients/{recipientId}` | Recipient of instance run by recipient Id | [getreportinstacerecipientbyid](https://apidocs.acculynx.com/reference/getreportinstacerecipientbyid.md) |
| `GET` | `/reports/scheduled-reports/{scheduledReportId}/runs/latest` | Report get latest instance | [getreportlatestinstance](https://apidocs.acculynx.com/reference/getreportlatestinstance.md) |

### Subscriptions

| Method | Path | Operation | Source |
| --- | --- | --- | --- |
| `GET` | `/subscriptions` | Get subscriptions | [getsubscriptions](https://apidocs.acculynx.com/reference/getsubscriptions.md) |
| `POST` | `/subscriptions` | Create Subscription | [postsubscription](https://apidocs.acculynx.com/reference/postsubscription.md) |
| `DELETE` | `/subscriptions/{subscriptionId}` | Delete subscription by id | [deletesubscription](https://apidocs.acculynx.com/reference/deletesubscription.md) |
| `GET` | `/subscriptions/{subscriptionId}` | Get subscription | [getsubscription](https://apidocs.acculynx.com/reference/getsubscription.md) |
| `PUT` | `/subscriptions/{subscriptionId}` | Update subscription by id | [updatesubscription](https://apidocs.acculynx.com/reference/updatesubscription.md) |
| `POST` | `/subscriptions/{subscriptionId}/test-event` | Send a test event | [postsendtestevent](https://apidocs.acculynx.com/reference/postsendtestevent.md) |

### Supplements

| Method | Path | Operation | Source |
| --- | --- | --- | --- |
| `GET` | `/supplements` | Get all the supplements across the company. | [getfinancialssupplementsforcompany](https://apidocs.acculynx.com/reference/getfinancialssupplementsforcompany.md) |
| `GET` | `/supplements/{supplementId}` | Get supplement by the given ID. | [getsupplementbyid](https://apidocs.acculynx.com/reference/getsupplementbyid.md) |
| `GET` | `/supplements/{supplementId}/items` | Get all the items for a specific supplement. | [getfinancialssupplementitemcollection](https://apidocs.acculynx.com/reference/getfinancialssupplementitemcollection.md) |
| `GET` | `/supplements/{supplementId}/notations` | Get all the notations for a specific supplement. | [getfinancialssupplementnotationcollection](https://apidocs.acculynx.com/reference/getfinancialssupplementnotationcollection.md) |

### Topics

| Method | Path | Operation | Source |
| --- | --- | --- | --- |
| `GET` | `/topics` | Get topics | [gettopics](https://apidocs.acculynx.com/reference/gettopics.md) |

### Users

| Method | Path | Operation | Source |
| --- | --- | --- | --- |
| `GET` | `/users` | Get Users | [getusers](https://apidocs.acculynx.com/reference/getusers.md) |
| `GET` | `/users/{userId}` | Get User | [getuser](https://apidocs.acculynx.com/reference/getuser.md) |

## Operation Details

### GET /acculynx/countries

- Title: Get AccuLynx Countries
- Operation ID: `getAccuLynxCountries`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getacculynxcountries.md
- Summary: Get AccuLynx Countries
- Notes: Use this endpoint to get a listing of the countries supported by AccuLynx. Supported includes values: states

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`includes` | query | no | string | Optional fields to include in full with the response.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `countryCollection`
`401` | API Key is invalid or deactivated | `error`

### GET /acculynx/countries/{countryId}

- Title: Get an AccuLynx Country
- Operation ID: `getAccuLynxCountry`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getacculynxcountry.md
- Summary: Get an AccuLynx Country
- Notes: Use this endpoint to get a specific country. Supported includes values: states

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`countryId` | path | yes | string (integer) | The country's identifier
`includes` | query | no | string | Optional fields to include in full with the response.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `country`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /acculynx/countries/{countryId}/states

- Title: Get States
- Operation ID: `getAccuLynxStates`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getacculynxstates.md
- Summary: Get States
- Notes: Use this endpoint to get the states supported by AccuLynx for a country. Supported includes values: states

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`countryId` | path | yes | string (integer) | The country's identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `stateCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /acculynx/countries/{countryId}/states/{stateId}

- Title: Get a particular state
- Operation ID: `getAccuLynxState`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getacculynxstate.md
- Summary: Get a particular state
- Notes: Use this endpoint to get a specific state within a specific country.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`countryId` | path | yes | string (integer) | The country's identifier
`stateId` | path | yes | string (integer) | The state's identifier.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `state`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /acculynx/units-of-measure

- Title: Get units of measure
- Operation ID: `getAcculynxUnitsOfMeasure`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getacculynxunitsofmeasure.md
- Summary: Get units of measure
- Notes: Use this endpoint to get the list of the catalog units of measure.

Parameters:

None.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `unitOfMeasureCollection`
`401` | API Key is invalid or deactivated | `error`

### GET /calendars

- Title: Calendar List
- Operation ID: `getCalendars`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getcalendars.md
- Summary: Calendar List
- Notes: Use this endpoint to get a list of calendars for the location. This endpoint will return a paginated response starting from the given record index.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`pageSize` | query | no | integer | How many items to be returned at a time.
`recordStartIndex` | query | no | integer | The index of the first element to return

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `calendarCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /calendars/{calendarId}/appointments

- Title: Calendar Appointments Summary
- Operation ID: `getAppointments`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getappointments.md
- Summary: Calendar Appointments Summary
- Notes: Use this endpoint to get a list of appointments for the specified calendar. The request range should not exceed 90 days.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`calendarId` | path | yes | string (uuid) | The calendar's unique identifier
`pageSize` | query | no | integer | How many items to be returned at a time.
`pageStartIndex` | query | no | integer | The index of the page to return
`startDate` | query | yes | string (date) | Start date for the query, in YYYY-MM-DD format.
`endDate` | query | yes | string (date) | End date for the query, in YYYY-MM-DD format.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `calendarEventCollection`
`400` | The query parameters are invalid. |
`404` | The given calendar was not found. |
`416` | The value for the pageStartIndex query parameter is outside the range of the return values. |

### GET /calendars/{calendarId}/appointments/{appointmentId}

- Title: Get Appointment Details
- Operation ID: `getAppointmentById`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getappointmentbyid.md
- Summary: Get Appointment Details
- Notes: Use this endpoint to get the appointment details for a specific calendar event.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`calendarId` | path | yes | string (uuid) | The calendar's unique identifier
`appointmentId` | path | yes | string (uuid) | The appointment's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `calendarEvent`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /company-settings

- Title: Get Company Settings.
- Operation ID: `getCompanySettings`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getcompanysettings.md
- Summary: Get Company Settings.
- Notes: Use this endpoint to get a list of settings for the current location.

Parameters:

None.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `companySettings`
`401` | API Key is invalid or deactivated | `error`

### GET /company-settings/custom-fields

- Title: Get Custom Field Definitions
- Operation ID: `getCompanySettingsCustomFields`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getcompanysettingscustomfields.md
- Summary: Get Custom Field Definitions
- Notes: Use this endpoint to retrieve custom field definitions and the options related to each custom field definition by company. Returns Custom Field Definitions for types "contact" and "job" with only active status. Includes field options with active status by default. Custom Field Definitions are returned by grouped by field type . StartIndex starts at 0. Default PageSize is 25. Pagination parameters are optional. You can filter by type 'jobs' or 'contacts'. By default both filters are included. `e.g. ?filter=jobs`. Valid includes are 'user'. `e.g. ?includes=user`

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`filter` | query | no | string | Filter custom field definitions by type. When not specified, returns both job and contact custom field definitions.
`pageSize` | query | no | integer | How many items to be returned at a time.
`recordStartIndex` | query | no | integer | The index of the first element to return
`includes` | query | no | string | Optional fields to include in full with the response.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `customFieldDefinitionsCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`403` | Not enough permissions. | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /company-settings/job-file-settings/document-folders

- Title: Get Documents Folders
- Operation ID: `getCompanyDocumentFolders`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getcompanydocumentfolders.md
- Summary: Get Documents Folders
- Notes: Use this endpoint to get the document folders for a company. This endpoint will return a paginated response starting from the given record index.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`pageSize` | query | no | integer | How many items to be returned at a time.
`recordStartIndex` | query | no | integer | The index of the first element to return
`sortOrder` | query | no | string | return jobs in Ascending (default) or Descending order

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `documentFoldersCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /company-settings/job-file-settings/insurance-companies

- Title: Get Insurance Companies.
- Operation ID: `getInsuranceCompanies`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getinsurancecompanies.md
- Summary: Get Insurance Companies.
- Notes: Use this endpoint to get a list of insurance companies for the current location. The response is paginated based on the pageSize and StartIndex query parameters and sorted by based on tag name in the order given by the sortOrder query parameter. All the query parameters are optional. pageSize defaults to 50 and StartIndex defaults to 0.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`pageSize` | query | no | integer | How many items to be returned at a time.
`recordStartIndex` | query | no | integer | The index of the first element to return

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `insuranceCompanyCollection`
`401` | API Key is invalid or deactivated | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /company-settings/job-file-settings/job-categories

- Title: Get Job Categories of the company.
- Operation ID: `getCompanySettingsJobSettingsJobCategories`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getcompanysettingsjobsettingsjobcategories.md
- Summary: Get Job Categories of the company.
- Notes: Use this endpoint to get all the Job Categories for a company. StartIndex starts at 0. Default PageSize is 25. Pagination parameters are optional. Only active job category values are returned.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`pageSize` | query | no | integer | How many items to be returned at a time.
`recordStartIndex` | query | no | integer | The index of the first element to return

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `jobCategoriesCollection`
`401` | API Key is invalid or deactivated | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /company-settings/job-file-settings/photo-video-tags

- Title: Get Company Photo and Video Tags.
- Operation ID: `getPhotoVideoTags`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getphotovideotags.md
- Summary: Get Company Photo and Video Tags.
- Notes: Use this endpoint to get a list of the photo and video tags for the current location. The response is paginated based on the pageSize and StartIndex query parameters starting from the given record index and sorted by based on tag name in the order given by the sortOrder query parameter. All the query parameters are optional. pageSize defaults to 50.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`pageSize` | query | no | integer | How many items to be returned at a time.
`recordStartIndex` | query | no | integer | The index of the first element to return
`sortOrder` | query | no | string | return jobs in Ascending (default) or Descending order

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `photoVideoTagCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /company-settings/job-file-settings/trade-types

- Title: Get Trade Types of the company.
- Operation ID: `getCompanySettingsJobSettingsTradeTypes`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getcompanysettingsjobsettingstradetypes.md
- Summary: Get Trade Types of the company.
- Notes: Use this endpoint to get all the Trade Types for a company. StartIndex starts at 0. Default PageSize is 25. Pagination parameters are optional. This endpoint will return a paginated response starting from the given record index. Only active trade type values are returned.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`pageSize` | query | no | integer | How many items to be returned at a time.
`recordStartIndex` | query | no | integer | The index of the first element to return

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `companyTradeTypeCollection`
`401` | API Key is invalid or deactivated | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /company-settings/job-file-settings/work-types

- Title: Get Work Types of a company.
- Operation ID: `getCompanySettingsJobSettingsWorkTypes`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getcompanysettingsjobsettingsworktypes.md
- Summary: Get Work Types of a company.
- Notes: Use this endpoint to get all the Work Types for a company. StartIndex starts at 0. Default PageSize is 100. Pagination parameters are optional. Only active work type values are returned.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`pageSize` | query | no | integer | How many items to be returned at a time.
`recordStartIndex` | query | no | integer | The index of the first element to return

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `workTypeCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /company-settings/job-file-settings/workflow-milestones

- Title: Get milestones
- Operation ID: `getMilestones`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getmilestones.md
- Summary: Get milestones
- Notes: Get milestones related to company. For including statuses, the company must have enabled custom workflows. Valid include value is: status.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`includes` | query | no | string | Optional fields to include in full with the response.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `workflowMilestoneCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`403` | Not enough permissions. | `error`
`404` | Requested resource does not exist. | `error`
`412` | The request could not be completed due to the failure of a required precondition. | `error`

### GET /company-settings/job-file-settings/workflow-milestones/{milestone}/statuses

- Title: Get statuses for a milestone
- Operation ID: `getStatusesForMilestone`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getstatusesformilestone.md
- Summary: Get statuses for a milestone
- Notes: Get statuses for a milestone.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`milestone` | path | yes | string | Include only status currently in one of the listed milestone. Only one value is allowed. Possible values: lead, prospect, approved, completed, invoiced, closed, cancelled

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `workflowMilestoneStatusItem`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`403` | Not enough permissions. | `error`
`404` | Requested resource does not exist. | `error`
`412` | The request could not be completed due to the failure of a required precondition. | `error`

### GET /company-settings/leads/lead-sources

- Title: Get Active Lead Sources for a company.
- Operation ID: `getActiveLeadSources`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getactiveleadsources.md
- Summary: Get Active Lead Sources for a company.
- Notes: Use this endpoint to get a list of active lead sources for the current location. This will return the complete lead sources list available for the current location. Inactive lead sources won't be returned. StartIndex starts at 0. Default PageSize is 25. Pagination parameters are optional.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`pageSize` | query | no | integer | How many items to be returned at a time.
`recordStartIndex` | query | no | integer | The index of the first element to return

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `leadSourcesCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /company-settings/leads/lead-sources/{leadSourceId}

- Title: Get Company Lead Source by Id.
- Operation ID: `getLeadSourceById`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getleadsourcebyid.md
- Summary: Get Company Lead Source by Id.
- Notes: Use this endpoint to get a lead source for the current location. This will return a lead source available for the current location.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`leadSourceId` | path | yes | string (uuid) | The lead source's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `leadSource`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /company-settings/leads/lead-sources/{leadSourceParentId}/children/{leadSourceId}

- Title: Get Company Child Lead Source by Id.
- Operation ID: `getLeadSourceChildById`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getleadsourcechildbyid.md
- Summary: Get Company Child Lead Source by Id.
- Notes: Use this endpoint to get a child lead source for the current location. This will return a child lead source available for the current location.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`leadSourceId` | path | yes | string (uuid) | The lead source's unique identifier
`leadSourceParentId` | path | yes | string (uuid) | The parent lead source's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `leadSourceChild`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /company-settings/location-settings/account-types

- Title: Get Company Active Account Types.
- Operation ID: `getActiveAccountTypes`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getactiveaccounttypes.md
- Summary: Get Company Active Account Types.
- Notes: Use this endpoint to get a list of 'active' Account Types for the current company.

Parameters:

None.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `companyAccountTypeCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /company-settings/location-settings/account-types/{accountTypeId}

- Title: Get Company Active Account Type by id.
- Operation ID: `getAccountTypeById`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getaccounttypebyid.md
- Summary: Get Company Active Account Type by id.
- Notes: Use this endpoint to get an account type by id.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`accountTypeId` | path | yes | string (uuid) | The account type's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `companyAccountType`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /company-settings/location-settings/countries

- Title: Get Company Countries
- Operation ID: `getCompanySettingsLocationSettingsCountries`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getcompanysettingslocationsettingscountries.md
- Summary: Get Company Countries
- Notes: Use this endpoint to get a list of countries supported by the current company. This endpoint will return a paginated response starting from the given record index.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`includes` | query | no | string | Optional fields to include in full with the response.
`pageSize` | query | no | integer | How many items to be returned at a time.
`recordStartIndex` | query | no | integer | The index of the first element to return

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `companyCountriesCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /company-settings/location-settings/countries/{countryId}/states

- Title: Get Company States
- Operation ID: `getcompanySettingsLocationSettingsCountriesCountryIdStates`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getcompanysettingslocationsettingscountriescountryidstates.md
- Summary: Get Company States
- Notes: Use this endpoint to get a list of the states supported by the current company. CountryId must be an existing country supported by the current company. This endpoint will return a paginated response starting from the given record index. StartIndex starts at 0. Default PageSize is 100. Pagination parameters are optional.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`countryId` | path | yes | string (integer) | The country's identifier
`pageSize` | query | no | integer | How many items to be returned at a time.
`recordStartIndex` | query | no | integer | The index of the first element to return

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `companyStatesCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /contacts

- Title: Contacts Summary
- Operation ID: `getContacts`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getcontacts.md
- Summary: Contacts Summary
- Notes: Use this endpoint to get a listing of Contacts. supported includes values: emailAddress, phoneNumber.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`pageSize` | query | no | integer | How many items to be returned at a time.
`pageStartIndex` | query | no | integer | The index of the page to return
`includes` | query | no | string | Optional fields to include in full with the response.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `contactCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`416` | The range of data requested from the resource is invalid | `error`

### POST /contacts

- Title: Create Contact
- Operation ID: `postContacts`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/postcontacts.md
- Summary: Create Contact
- Notes: Use this endpoint to create a new contact

Parameters:

None.

Request body:

Required: no.
- `application/json`: `contactPost`
  Fields: `contactTypeIds` array, `firstName` string, `lastName` string, `crossReference` string, `companyName` string, `companyJobTitle` string, `note` string, `phoneNumbers` array, `emailAddresses` array, `mailingAddress` contactAddress, `billingAddress` contactAddress, `billingAddressSameAsMailingAddress` boolean

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`201` | Created | `contactLink`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`

### GET /contacts/{contactId}

- Title: Get Contact by Id.
- Operation ID: `getContact`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getcontact.md
- Summary: Get Contact by Id.
- Notes: Use this endpoint to get details for a specific contact. supported includes values: emailAddress, phoneNumber.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`contactId` | path | yes | string (uuid) | The contact's unique identifier
`includes` | query | no | string | Optional fields to include in full with the response.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `contact`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /contacts/{contactId}/custom-fields

- Title: Retrieve all custom fields for a contact by id.
- Operation ID: `getContactCustomFields`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getcontactcustomfields.md
- Summary: Retrieve all custom fields for a contact by id.
- Notes: Get a list of all custom fields related to a specific contact by its contact Id. This endpoint will return a paginated response starting from the given record index. StartIndex starts at 0. Default PageSize is 25. Pagination parameters are optional.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`contactId` | path | yes | string (uuid) | The contact's unique identifier
`pageSize` | query | no | integer | How many items to be returned at a time.
`recordStartIndex` | query | no | integer | The index of the first element to return

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | A list of custom fields objects | `customFieldsCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`403` | Not enough permissions. | `error`
`404` | Requested resource does not exist. | `error`

### PUT /contacts/{contactId}/custom-fields

- Title: Sets multiple custom field values for a contact by id
- Operation ID: `PutContactCustomFields`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/putcontactcustomfields.md
- Summary: Sets multiple custom field values for a contact by id
- Notes: Use this endpoint to update multiple custom field values for a contact. The limit of the Custom Field list to update cannot be greater than 120. If the custom field type is Text, the maximum lenght of the text is 500 characters. Any text beyond that limit will be truncated.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`contactId` | path | yes | string (uuid) | The contact's unique identifier

Request body:

Required: no.
- `application/json`: `contactCustomFieldsBodyPut`
  Fields: `customFields` array

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | No Content |
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /contacts/{contactId}/custom-fields/{customFieldId}

- Title: Retrieve a specific custom field for a contact by id
- Operation ID: `getContactCustomFieldById`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getcontactcustomfieldbyid.md
- Summary: Retrieve a specific custom field for a contact by id
- Notes: Get a custom field object inside a contact provided a custom field id and a valid contact id

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`contactId` | path | yes | string (uuid) | The contact's unique identifier
`customFieldId` | path | yes | string (uuid) | The ID of the custom field

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | A custom field object | `customField`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`403` | Not enough permissions. | `error`
`404` | Requested resource does not exist. | `error`
`412` | The request could not be completed due to the failure of a required precondition. | `error`

### PUT /contacts/{contactId}/custom-fields/{customFieldId}

- Title: Sets a value for a specific custom field for a contact by id
- Operation ID: `PutContactCustomFieldById`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/putcontactcustomfieldbyid.md
- Summary: Sets a value for a specific custom field for a contact by id
- Notes: Sets a value for the specified custom field in the contact If the custom field type is Text, the maximum lenght of the text is 500 characters. Any text beyond that limit will be truncated.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`contactId` | path | yes | string (uuid) | The contact's unique identifier
`customFieldId` | path | yes | string (uuid) | The ID of the custom field

Request body:

Required: no.
- `application/json`: `customFieldBodyPut`
  Fields: `fieldType` customFieldType, `values` array

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | No Content |
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /contacts/{contactId}/email-addresses

- Title: Get Email Address List.
- Operation ID: `getContactEmailAddresses`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getcontactemailaddresses.md
- Summary: Get Email Address List.
- Notes: Use this endpoint to get the list of email addresses for a specific contact.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`contactId` | path | yes | string (uuid) | The contact's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `emailAddressCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /contacts/{contactId}/email-addresses/{emailId}

- Title: Get Email Address.
- Operation ID: `getContactEmailAddressById`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getcontactemailaddressbyid.md
- Summary: Get Email Address.
- Notes: Use this endpoint to get the email addresses for a specific emailId associated with a specific contact.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`contactId` | path | yes | string (uuid) | The contact's unique identifier
`emailId` | path | yes | string (uuid) | The unique id of an email address

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `emailAddress`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### POST /contacts/{contactId}/logs

- Title: Create Contact - Log
- Operation ID: `postContactLog`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/postcontactlog.md
- Summary: Create Contact - Log
- Notes: Use this endpoint to create a new Log for an existing contact

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`contactId` | path | yes | string (uuid) | The contact's unique identifier

Request body:

Required: no.
- `application/json`: `contactLogPost`

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | No Content |
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /contacts/{contactId}/phone-numbers

- Title: Get Phone Number List.
- Operation ID: `getContactPhoneNumber`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getcontactphonenumber.md
- Summary: Get Phone Number List.
- Notes: Use this endpoint to get the list of phone numbers for a specific contact.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`contactId` | path | yes | string (uuid) | The contact's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `phoneNumberCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /contacts/{contactId}/phone-numbers/{phoneId}

- Title: Get a phone number
- Operation ID: `getContactPhoneNumberById`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getcontactphonenumberbyid.md
- Summary: Get a phone number
- Notes: Use this endpoint to get the phone number for a specific phoneId associated with a specific contact.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`contactId` | path | yes | string (uuid) | The contact's unique identifier
`phoneId` | path | yes | string (uuid) | The unique id of a phone number

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `phoneNumber`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /contacts/contact-types

- Title: Get the contact types
- Operation ID: `getContactTypes`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getcontacttypes.md
- Summary: Get the contact types
- Notes: Use this endpoint to get the list of contact types from a company.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`pageSize` | query | no | integer | How many items to be returned at a time.
`pageStartIndex` | query | no | integer | The index of the page to return

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `contactTypesCollection`
`401` | API Key is invalid or deactivated | `error`
`416` | The range of data requested from the resource is invalid | `error`

### POST /contacts/search

- Title: Contacts Search.
- Operation ID: `postContactSearch`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/postcontactsearch.md
- Summary: Contacts Search.
- Notes: Use this endpoint to get a list of contacts matching the given search criteria. Contacts are returned if they include a given first name, last name, company name, and contact type. it will filter by range of dates, using the CreationDate of the contact. The size of the return is controlled with the pageSize query parameter which defaults to 25 and must be > 0 and 0 to access contacts past the first page when more than pageSize contacts meet the search criteria. Sort criteria, startDate and endDate are required. The search returns includes like phone numbers, email addresses and location address.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`pageSize` | query | no | integer | How many items to be returned at a time.
`pageStartIndex` | query | no | integer | The index of the page to return

Request body:

Required: no.
- `application/json`: `contactSearchPost`
  Fields: `contactTypes` array, `searchTerm` string, `startDate` string (date-time), `endDate` string (date-time), `sort` contactSort

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `contactCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /diagnostics/ping

- Title: Check if the API server is responsive
- Operation ID: `getPing`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getping.md
- Summary: Check if the API server is responsive
- Notes: Use this endpoint to verify that the API server is responsive.

Parameters:

None.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `date`
`400` | Bad Request | `error`

### GET /estimates

- Title: Get Estimates
- Operation ID: `getEstimates`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getestimates.md
- Summary: Get Estimates
- Notes: Use this endpoint to get all estimates for the current location. Supported includes values: job

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`pageSize` | query | no | integer | How many items to be returned at a time.
`pageStartIndex` | query | no | integer | The index of the page to return
`includes` | query | no | string | Optional fields to include in full with the response.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `estimateCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /estimates/{estimateId}

- Title: Get Estimate
- Operation ID: `getEstimateById`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getestimatebyid.md
- Summary: Get Estimate
- Notes: Use this endpoint to get a specific estimate. Supported includes values: job, createdBy, modifiedBy, sections

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`estimateId` | path | yes | string (uuid) | The estimate's unique identifier
`includes` | query | no | string | Optional fields to include in full with the response.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `estimate`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /estimates/{estimateId}/sections

- Title: Get Estimate Sections
- Operation ID: `getEstimateSections`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getestimatesections.md
- Summary: Get Estimate Sections
- Notes: Use this endpoint to get all sections for the given estimate. Supported includes values: createdBy, modifiedBy, items

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`estimateId` | path | yes | string (uuid) | The estimate's unique identifier
`includes` | query | no | string | Optional fields to include in full with the response.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `estimateSectionCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /estimates/{estimateId}/sections/{estimateSectionId}

- Title: Get Estimate Section
- Operation ID: `getEstimateSectionById`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getestimatesectionbyid.md
- Summary: Get Estimate Section
- Notes: Use this endpoint to get a specific estimate section. Supported includes values: createdBy, modifiedBy, items

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`estimateId` | path | yes | string (uuid) | The estimate's unique identifier
`estimateSectionId` | path | yes | string (uuid) | The estimate section's unique identifier
`includes` | query | no | string | Optional fields to include in full with the response.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `estimateSection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /estimates/{estimateId}/sections/{estimateSectionId}/items

- Title: Get Estimate Section Items
- Operation ID: `getEstimateSectionItems`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getestimatesectionitems.md
- Summary: Get Estimate Section Items
- Notes: Use this endpoint to get all items for the given estimate section.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`estimateId` | path | yes | string (uuid) | The estimate's unique identifier
`estimateSectionId` | path | yes | string (uuid) | The estimate section's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `estimateItemCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /estimates/{estimateId}/sections/{estimateSectionId}/items/{estimateItemId}

- Title: Get Estimate Section Item
- Operation ID: `getEstimateSectionItem`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getestimatesectionitem.md
- Summary: Get Estimate Section Item
- Notes: Use this endpoint to get a specific estimate item.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`estimateId` | path | yes | string (uuid) | The estimate's unique identifier
`estimateSectionId` | path | yes | string (uuid) | The estimate section's unique identifier
`estimateItemId` | path | yes | string (uuid) | The estimate item's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `estimateItem`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /financials/{financialsId}

- Title: Get Financials
- Operation ID: `getFinancialsByFinancialId`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getfinancialsbyfinancialid.md
- Summary: Get Financials
- Notes: Use this endpoint to get the Financials for the specified financialID. Supported includes value: worksheet, amendments.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`financialsId` | path | yes | string (uuid) | The Financial's unique identifier
`includes` | query | no | string | Optional fields to include in full with the response

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `financials`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /financials/{financialsId}/amendments

- Title: Get Financial Amendments
- Operation ID: `getWorksheetAmendmentsById`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getworksheetamendmentsbyid.md
- Summary: Get Financial Amendments
- Notes: Use this endpoint to get a specific Financial's Amendments.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`financialsId` | path | yes | string (uuid) | The Financial's unique identifier
`pageSize` | query | no | integer | How many items to be returned at a time.
`pageStartIndex` | query | no | integer | The index of the page to return

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `worksheetAmendmentCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /financials/{financialsId}/amendments/{financialsAmendmentId}

- Title: Get Financial Amendment
- Operation ID: `getWorksheetAmendmentById`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getworksheetamendmentbyid.md
- Summary: Get Financial Amendment
- Notes: Use this endpoint to get a specific Amendment.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`financialsId` | path | yes | string (uuid) | The Financial's unique identifier
`financialsAmendmentId` | path | yes | string (uuid) | The Worksheet's Amendment's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `worksheetAmendment`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /financials/{financialsId}/worksheet

- Title: Get Worksheet
- Operation ID: `getWorksheetById`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getworksheetbyid.md
- Summary: Get Worksheet
- Notes: Use this endpoint to get a specific Worksheet by financialId.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`financialsId` | path | yes | string (uuid) | The Financial's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `worksheet`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### POST /financials/{financialsId}/worksheet/items

- Title: Create Worksheet Item
- Operation ID: `postWorksheetSectionItem`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/postworksheetsectionitem.md
- Summary: Create Worksheet Item
- Notes: Creates a new item in a worksheet using its financial ID. If the worksheet does not exist, it will be created, and the sectionId parameter should be left empty. If the worksheet already exists, you must provide the sectionId parameter, which should be a valid section ID within the worksheet.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`financialsId` | path | yes | string (uuid) | The Financial's unique identifier

Request body:

Required: no.
- `application/json`: `worksheetItemPost`
  Fields: `sectionId` string (uuid), `parentItemId` string (uuid), `itemName` string, `description` string, `quantity` integer, `unitOfMeasure` string (uuid), `costPerUnit` number, `cost` number, `price` number

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`201` | Created | `idPost`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /invoices/{invoiceId}

- Title: Get Invoice
- Operation ID: `getInvoiceById`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getinvoicebyid.md
- Summary: Get Invoice
- Notes: Use this endpoint to get a specific Invoice.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`invoiceId` | path | yes | string (uuid) | The invoice's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `invoice`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /jobs

- Title: Jobs List.
- Operation ID: `getJobs`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getjobs.md
- Summary: Jobs List.
- Notes: Use this endpoint to get a listing of Jobs. When startDate and endDate are specified, jobs returned will be filtered to the given date range (inclusive). The date field to filter on is given with dateFilterType which defaults to CreatedDate. Optionally use milestones to limit the jobs to those in the listed milestones. Optionally use sortBy to sort jobs by either CreatedDate, MilestoneDate, or ModifiedDate. CreatedDate is the default. Optionally use sortOrder to indicate newest to oldest (Descending) ordering or oldest to newest (Ascending) ordering. Ascending is the default. The pageStartIndex parameter to start looking for records should not exceed 100000 To Get Jobs: Supported includes values: contact, initalAppointment. Example: return the jobs (including initial appointment) that are prospects and were modified in April sorted most recent first (descending ModifiedDate) */jobs?pageSize=25&includes=initialAppointment&filterByDate=ModifiedDate&startDate=2021-04-01&endDate=2021-04-30&sortBy=ModifiedDate&sortOrder=Descending* To Get Unassigned Jobs: Supported includes values: contact. Example: return the unassigned jobs (including contacts) that were modified in March sorted most recent first (descending ModifiedDate) */jobs?assignment=unassigned&pageSize=25&includes=contacts&filterByDate=ModifiedDate&startDate=2025-03-01&endDate=2025-03-30&sortBy=ModifiedDate&sortOrder=Descending* *jobs?assignment=unassigned&milestones=Lead&pageSize=25&includes=contacts&filterByDate=ModifiedDate&startDate=2025-03-01&endDate=2025-03-30* Example: return the unassigned jobs (including contacts) that were marked as Dead */jobs?assignment=unassigned&milestones=Dead&pageSize=25&includes=contacts&filterByDate=ModifiedDate&startDate=2025-03-01&endDate=2025-03-30*

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`pageSize` | query | no | integer | How many items to be returned at a time.
`recordStartIndex` | query | no | integer | The index of the first element to return
`includes` | query | no | string | Optional fields to include in full with the response.
`startDate` | query | no | string (date) | Start date for the query, in YYYY-MM-DD format.
`endDate` | query | no | string (date) | End date for the query, in YYYY-MM-DD format.
`dateFilterType` | query | no | string | The date field to which startDate/endDate apply. Ignored when neither startDate nor endDate is given.
`milestones` | query | no | string | Include only jobs currently in one of the listed milestones. Enter one or more values, separated by commas. The default is no milestone filtering. Possible values: lead, prospect, approved, completed, invoiced, closed, cancelled, dead. Note: When filtering for dead leads ensure that the assignment is set to unassigned, otherwise no results will be returned.
`sortBy` | query | no | string | sort the returned jobs by this date field.
`sortOrder` | query | no | string | return jobs in Ascending (default) or Descending order
`assignment` | query | no | string | Optional field to filter only unassigned jobs in the response. Possible values: unassigned, assigned

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `jobCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`416` | The range of data requested from the resource is invalid | `error`

### POST /jobs

- Title: Create job
- Operation ID: `postjob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/postjob.md
- Summary: Create job
- Notes: Use this endpoint to create a job in the milestone Lead (Unassigned).

Parameters:

None.

Request body:

Required: no.
- `application/json`: `jobPost`
  Fields: `contact` contactId, `leadSource` leadSourcePost, `locationAddress` jobAddressPost, `priority` jobPriorityPost, `jobCategory` jobCategoryPost, `workType` workTypePost, `tradeTypes` array, `notes` string

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`201` | job created | oneOf(`jobLink`)
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`403` | Not enough permissions. | `error`
`404` | Requested resource does not exist. | `error`

### GET /jobs/{jobId}

- Title: Get Job by Id.
- Operation ID: `getJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getjob.md
- Summary: Get Job by Id.
- Notes: Use this endpoint to get details for a specific job. Unassigned leads or jobs will not be returned. Supported includes values: contact, initalAppointment.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`includes` | query | no | string | Optional fields to include in full with the response.
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `job`
`404` | The job specified by jobId was not found. |

### GET /jobs/{jobId}/accounting/integration-status

- Title: Get accounting integration status for a job
- Operation ID: `getAccountingIntegrationsSyncChangesForJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getaccountingintegrationssyncchangesforjob.md
- Summary: Get accounting integration status for a job
- Notes: Use this endpoint to get status of the accounting integration sync for the specified job.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `accountingIntegrationStatus`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`403` | Not enough permissions. | `error`
`404` | Requested resource does not exist. | `error`

### PUT /jobs/{jobId}/address

- Title: Updates job location address information.
- Operation ID: `putJobLocationAddress`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/putjoblocationaddress.md
- Summary: Updates job location address information.
- Notes: This endpoint updates the job location address information

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

Required: no.
- `application/json`: `jobAddressPut`
  Fields: `street1` string, `street2` string, `city` string, `state` string, `country` string, `zipCode` string

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | No Content |
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /jobs/{jobId}/adjuster

- Title: Get Job Adjuster Information.
- Operation ID: `getAdjusterForJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getadjusterforjob.md
- Summary: Get Job Adjuster Information.
- Notes: This endpoint returns the job's insurance adjuster information.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `jobAdjuster`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`
`412` | The request could not be completed due to the failure of a required precondition. | `error`

### PUT /jobs/{jobId}/adjuster

- Title: Set/Update Job Adjuster Information.
- Operation ID: `putAdjusterForJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/putadjusterforjob.md
- Summary: Set/Update Job Adjuster Information.
- Notes: This endpoint sets or updates the job adjuster information

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

Required: no.
- `application/json`: `jobAdjuster`
  Fields: `adjusterName` string, `phone`, `fax` string, `email` string, `claimApproved` boolean, `claimApprovedDate` string, `metWithAdjuster` boolean, `metWithAdjusterDate` string

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | No Content |
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /jobs/{jobId}/contacts

- Title: Contact List
- Operation ID: `getJobContacts`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getjobcontacts.md
- Summary: Contact List
- Notes: Use this endpoint to get the list of contacts for a job. Supported includes value: contact.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`includes` | query | no | string | Optional fields to include in full with the response.
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `jobContactCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /jobs/{jobId}/contacts/{jobContactId}

- Title: Get a job contact by Id
- Operation ID: `getJobContact`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getjobcontact.md
- Summary: Get a job contact by Id
- Notes: Use this endpoint to get details of a specific job contact. Supported includes value: contact.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier
`jobContactId` | path | yes | string (uuid) | The job contact's unique identifier
`includes` | query | no | string | Optional fields to include in full with the response.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `jobContact`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /jobs/{jobId}/custom-fields

- Title: Retrieve all the custom fields for a job by id
- Operation ID: `GetJobCustomFields`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getjobcustomfields.md
- Summary: Retrieve all the custom fields for a job by id
- Notes: Get a list of all custom fields related to a specific job by its job Id. This endpoint will return a paginated response starting from the given record index. StartIndex starts at 0. Default PageSize is 25. Pagination parameters are optional.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier
`pageSize` | query | no | integer | How many items to be returned at a time.
`recordStartIndex` | query | no | integer | The index of the first element to return

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | A list of custom fields objects | `customFieldsCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`403` | Not enough permissions. | `error`
`404` | Requested resource does not exist. | `error`

### PUT /jobs/{jobId}/custom-fields

- Title: Sets multiple custom field values for a job by id
- Operation ID: `PutJobCustomFields`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/putjobcustomfields.md
- Summary: Sets multiple custom field values for a job by id
- Notes: Use this endpoint to update multiple custom field values for a Job. The limit of the Custom Field list to update cannot be greater than 120. If the custom field type is Text, the maximum lenght of the text is 500 characters. Any text beyond that limit that will be truncated.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

Required: no.
- `application/json`: `jobCustomFieldsBodyPut`
  Fields: `customFields` array

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | No Content |
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /jobs/{jobId}/custom-fields/{customFieldId}

- Title: Retrieve a specific custom field for a job by id
- Operation ID: `getJobCustomFieldById`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getjobcustomfieldbyid.md
- Summary: Retrieve a specific custom field for a job by id
- Notes: Get a custom field object inside a job provided a custom field id and a valid Job id

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier
`customFieldId` | path | yes | string (uuid) | The ID of the custom field

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | A custom field object | `customField`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`403` | Not enough permissions. | `error`
`404` | Requested resource does not exist. | `error`
`412` | The request could not be completed due to the failure of a required precondition. | `error`

### PUT /jobs/{jobId}/custom-fields/{customFieldId}

- Title: Sets a value for a specific custom field for a job by id
- Operation ID: `PutJobCustomFieldById`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/putjobcustomfieldbyid.md
- Summary: Sets a value for a specific custom field for a job by id
- Notes: Sets a value for the specified custom field in the Job. If the custom field type is Text, the maximum lenght of the text is 500 characters. Any text beyond that limit will be truncated.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier
`customFieldId` | path | yes | string (uuid) | The ID of the custom field

Request body:

Required: no.
- `application/json`: `customFieldBodyPut`
  Fields: `fieldType` customFieldType, `values` array

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | No Content |
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### POST /jobs/{jobId}/documents

- Title: Add JobDocument
- Operation ID: `postAddJobDocument`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/postaddjobdocument.md
- Summary: Add JobDocument
- Notes: Use this endpoint to add a job document for a specific job. Special characters and spaces will be removed from the file name before upload.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

Required: no.
- `multipart/form-data`: `addJobDocumentPost`
  Fields: `file` string (binary), `description` string, `documentFolderId` string (uuid), `externalId` string, `externalSource` string

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`202` | Accepted |
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /jobs/{jobId}/estimates

- Title: Get estimates for a job
- Operation ID: `getEstimatesForJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getestimatesforjob.md
- Summary: Get estimates for a job
- Notes: 'Use this endpoint to get a list of estimates for the specified job.'. This endpoint will return a paginated response starting from the given record index.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`pageSize` | query | no | integer | How many items to be returned at a time.
`recordStartIndex` | query | no | integer | The index of the first element to return
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `estimateCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /jobs/{jobId}/financials

- Title: Get Financials for a job
- Operation ID: `getFinancialsForJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getfinancialsforjob.md
- Summary: Get Financials for a job
- Notes: Use this endpoint to get the Financials for the specified job. Supported includes value: worksheet, amendments.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier
`includes` | query | no | string | Optional fields to include in full with the response

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `financials`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /jobs/{jobId}/history

- Title: Job change history
- Operation ID: `getJobHistory`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getjobhistory.md
- Summary: Job change history
- Notes: Use this endpoint to get a history of actions performed for a job. Supported includes values: createdBy. When startDate and endDate are specified, actions returned will be filtered to those created between those dates (inclusive). This endpoint will return a paginated response starting from the given record index.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier
`pageSize` | query | no | integer | How many items to be returned at a time.
`recordStartIndex` | query | no | integer | The index of the first element to return
`includes` | query | no | string | Optional fields to include in full with the response.
`startDate` | query | no | string (date) | Start date for the query, in YYYY-MM-DD format.
`endDate` | query | no | string (date) | End date for the query, in YYYY-MM-DD format.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `jobActionCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`
`416` | The range of data requested from the resource is invalid | `error`

### DELETE /jobs/{jobId}/initial-appointment

- Title: Delete the job Initial Appointment.
- Operation ID: `deleteJobInitialAppointment`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/deletejobinitialappointment.md
- Summary: Delete the job Initial Appointment.
- Notes: Use this endpoint to remove the Initial Appointment assigned to an existing job. The job must have an initial appointment date previously set.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

Required: no.
- `application/json`: `initialAppointmentDelete`
  Fields: `note` string

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | No Content |
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /jobs/{jobId}/initial-appointment

- Title: Job Initial Appointment.
- Operation ID: `getInitialAppointmentForJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getinitialappointmentforjob.md
- Summary: Job Initial Appointment.
- Notes: Use this endpoint to get the initial appointment for a job.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `initialAppointment`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### PUT /jobs/{jobId}/initial-appointment

- Title: Add or Update Initial Appointment
- Operation ID: `putInitialAppointmentForJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/putinitialappointmentforjob.md
- Summary: Add or Update Initial Appointment
- Notes: Use this endpoint to add or modify the initial appointment for a job. All datetimes should be UTC and in ISO 8601 format (suffixed with 'Z').

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

Required: no.
- `application/json`: `initialAppointmentPut`
  Fields: `startDate` string, `endDate` string, `notes` string

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | No Content |
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`
`412` | The request could not be completed due to the failure of a required precondition. | `error`

### GET /jobs/{jobId}/insurance

- Title: Get Job Insurance Information.
- Operation ID: `getInsuranceForJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getinsuranceforjob.md
- Summary: Get Job Insurance Information.
- Notes: This endpoint returns the job's insurance information.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `jobInsurance`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`
`412` | The request could not be completed due to the failure of a required precondition. | `error`

### PUT /jobs/{jobId}/insurance

- Title: Set Insurance Information for an existing Job.
- Operation ID: `putInsuranceInformationForJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/putinsuranceinformationforjob.md
- Summary: Set Insurance Information for an existing Job.
- Notes: This endpoint sets the insurance information for an existing job. - "Insurance company" section: It can be set by ID or by name, but not both. The ID should belong to the existing insurance companies. If the name is used it will be assigned to "Other" (active) insurance company. Set them as not assigned can be done, just sending both(ID & name) null or empty will do it. - dateOfLoss & claimFiledDate should be UTC and in ISO 8601 format (suffixed with 'Z').

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

Required: no.
- `application/json`: `jobInsurancePut`

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | No Content |
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### PUT /jobs/{jobId}/insurance/insurance-company

- Title: Set Insurance Company for an existing Job.
- Operation ID: `putInsuranceCompanyForJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/putinsurancecompanyforjob.md
- Summary: Set Insurance Company for an existing Job.
- Notes: This endpoint sets an insurance company to an existing job. It can be set by ID or by name, but not both. The ID should belong to the existing insurance companies. If the name is used it will be assigned to "Other" (active) insurance company. Set them as not assigned can be done, just sending both(ID & name) null or empty will do it.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

Required: no.
- `application/json`: `jobInsuranceCompanyPut`
  Fields: `insuranceCompanyId` string (uuid), `insuranceCompanyName` string

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | No Content |
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`
`412` | The request could not be completed due to the failure of a required precondition. | `error`

### GET /jobs/{jobId}/invoices

- Title: Get invoices for a job
- Operation ID: `getInvoicesForJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getinvoicesforjob.md
- Summary: Get invoices for a job
- Notes: 'Use this endpoint to get a list of invoices for the specified job.'

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`pageSize` | query | no | integer | How many items to be returned at a time.
`pageStartIndex` | query | no | integer | The index of the page to return
`jobId` | path | yes | string (uuid) | The job's unique identifier
`sortOrder` | query | no | string | return jobs in Ascending (default) or Descending order

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `invoiceCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`
`416` | The range of data requested from the resource is invalid | `error`

### PUT /jobs/{jobId}/job-categories

- Title: Update Job Category.
- Operation ID: `updateJobCategory`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/updatejobcategory.md
- Summary: Update Job Category.
- Notes: Allows a user to set a job category for a given job.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

Required: no.
- `application/json`: `jobCategoryBodyPut`
  Fields: `id` string (uuid)

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | No Content. The job category was already set to the provided ID. |
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`403` | Not enough permissions. | `error`
`404` | Requested resource does not exist. | `error`
`412` | The request could not be completed due to the failure of a required precondition. | `error`

### PUT /jobs/{jobId}/lead-source

- Title: Update job lead source
- Operation ID: `updateJobLeadSource`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/updatejobleadsource.md
- Summary: Update job lead source
- Notes: Updates the lead source for a specified job. The endpoint validates that both job and lead source belong to the company associated with the API key. If the provided lead source ID matches the current one, no update will be performed. Empty GUIDs are not allowed.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

Required: yes.
- `application/json`: `jobLeadSource`
  Fields: `id` string (uuid)

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | Lead source updated successfully |
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`403` | Not enough permissions. | `error`
`404` | Requested resource does not exist. | `error`

### POST /jobs/{jobId}/messages

- Title: Create Job Message
- Operation ID: `postCreateJobMessage`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/postcreatejobmessage.md
- Summary: Create Job Message
- Notes: Use this endpoint to create a job message. Please note that the message will only be created as a comment.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

Required: no.
- `application/json`: `createJobMessagePost`
  Fields: `message` string

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`201` | Created | `jobMessage`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### POST /jobs/{jobId}/messages/{messageId}/replies

- Title: Reply Job Message
- Operation ID: `postReplyJobMessage`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/postreplyjobmessage.md
- Summary: Reply Job Message
- Notes: Use this endpoint to reply to an existing job message. Please note that the message will only be created as a comment.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier
`messageId` | path | yes | string (uuid) | The job message unique identifier

Request body:

Required: no.
- `application/json`: `createJobMessageReplyPost`
  Fields: `message` string

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`201` | Created | `jobMessage`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /jobs/{jobId}/milestone-history

- Title: Get milestone history for the specified Job.
- Operation ID: `getMilestonesForJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getmilestonesforjob.md
- Summary: Get milestone history for the specified Job.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `milestoneCollection`
`404` | Job ID was not found. |

### GET /jobs/{jobId}/milestones/{milestoneId}

- Title: Get a single milestone for a job by milestone id.
- Operation ID: `getJobMilestoneById`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getjobmilestonebyid.md
- Summary: Get a single milestone for a job by milestone id.
- Notes: Get a single milestone information by id. For including statuses the company must have enabled custom workflows. Valid include values are: status.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier
`milestoneId` | path | yes | string (uuid) | The milestone unique identifier
`includes` | query | no | string | Optional fields to include in full with the response.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `jobMilestone`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`403` | Not enough permissions. | `error`
`404` | Requested resource does not exist. | `error`
`412` | The request could not be completed due to the failure of a required precondition. | `error`

### GET /jobs/{jobId}/milestones/{milestoneId}/status/{statusId}

- Title: Get a single status for a milestone by status id.
- Operation ID: `getJobStatusById`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getjobstatusbyid.md
- Summary: Get a single status for a milestone by status id.
- Notes: Get a single status information by id.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier
`milestoneId` | path | yes | string (uuid) | The milestone unique identifier
`statusId` | path | yes | string (uuid) | The status unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `jobMilestoneStatus`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`403` | Not enough permissions. | `error`
`404` | Requested resource does not exist. | `error`
`412` | The request could not be completed due to the failure of a required precondition. | `error`

### GET /jobs/{jobId}/milestones/current

- Title: Get the current milestone for a job.
- Operation ID: `getCurrentJobMilestone`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getcurrentjobmilestone.md
- Summary: Get the current milestone for a job.
- Notes: Get the current milestone information. For including statuses the company must have enabled custom workflows. Valid include value is: status.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier
`includes` | query | no | string | Optional fields to include in full with the response.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `jobMilestone`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`403` | Not enough permissions. | `error`
`404` | Requested resource does not exist. | `error`
`412` | The request could not be completed due to the failure of a required precondition. | `error`

### GET /jobs/{jobId}/payments

- Title: Get Job Payments
- Operation ID: `getPayments`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getpayments.md
- Summary: Get Job Payments
- Notes: Use this endpoint to get payments information for the specified job.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `jobPayments`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### POST /jobs/{jobId}/payments/expense

- Title: Create Payment Additional Job Expenses
- Operation ID: `postCreatePaymentAdditionalExpense`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/postcreatepaymentadditionalexpense.md
- Summary: Create Payment Additional Job Expenses
- Notes: Use this endpoint to create a new payment Additional Job Expenses

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

Required: no.
- `application/json`: `paymentAdditionalExpense`
  Fields: `to` string, `amount` number (float), `notes` string, `accountTypeId` string (uuid), `isPaid` boolean, `refNumber` string

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`201` | Created | `paymentLink`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`
`412` | The request could not be completed due to the failure of a required precondition. | `error`

### GET /jobs/{jobId}/payments/overview

- Title: Get Job Payments Overview
- Operation ID: `getPaymentsOverviewForJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getpaymentsoverviewforjob.md
- Summary: Get Job Payments Overview
- Notes: Use this endpoint to get a high-level overview of financial information for the specified job.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `paymentOverview`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### POST /jobs/{jobId}/payments/paid

- Title: Create Payment Paid
- Operation ID: `postCreatePaymentPaid`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/postcreatepaymentpaid.md
- Summary: Create Payment Paid
- Notes: Use this endpoint to create a new payment paid

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

Required: no.
- `application/json`: `paymentPaid`
  Fields: `to` string, `paymentMethod` string, `amount` number (float), `paymentDate` string (date-time), `notes` string, `accountTypeId` string (uuid), `refNumber` string, `isPaid` boolean

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`201` | Created | `paymentLink`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### POST /jobs/{jobId}/payments/received

- Title: Create Payment Received
- Operation ID: `postCreatePaymentReceived`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/postcreatepaymentreceived.md
- Summary: Create Payment Received
- Notes: Use this endpoint to create a new payment received

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

Required: no.
- `application/json`: `paymentReceived`
  Fields: `from` string, `amount` number (float), `paymentDate` string (date-time), `checkNumber` string, `notes` string

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`201` | Created | `paymentLink`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### POST /jobs/{jobId}/photos-videos

- Title: Upload a photo or video to a Job
- Operation ID: `postUploadPhotoOrVideo`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/postuploadphotoorvideo.md
- Summary: Upload a photo or video to a Job
- Notes: Use this endpoint to Upload a single Photo or Video for the specified job. Special characters and spaces will be removed from the file name before upload.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

Required: no.
- `multipart/form-data`: `jobPhotoVideoFormPost`
  Fields: `file` string (binary), `description` string, `tags` string, `fileUri` string (uri), `externalId` string, `externalSource` string

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`202` | OK |
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### PUT /jobs/{jobId}/priority

- Title: Set the priority for an existing Job.
- Operation ID: `putPriorityForJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/putpriorityforjob.md
- Summary: Set the priority for an existing Job.
- Notes: This endpoint sets the priority for an existing job.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

Required: no.
- `application/json`: `jobPriorityPut`
  Fields: `priority` jobPriority

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | No Content |
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /jobs/{jobId}/representatives

- Title: Job Representatives List
- Operation ID: `getRepresentativesForJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getrepresentativesforjob.md
- Summary: Job Representatives List
- Notes: Use this endpoint to get the list of representatives for a Job. This endpoint will return a paginated response starting from the given record index.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`pageSize` | query | no | integer | How many items to be returned at a time.
`recordStartIndex` | query | no | integer | The index of the first element to return
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `companyRepresentativeCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`
`416` | The range of data requested from the resource is invalid | `error`

### DELETE /jobs/{jobId}/representatives/ar-owner

- Title: Delete A/R Owner
- Operation ID: `deleteAROwnerFromJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/deletearownerfromjob.md
- Summary: Delete A/R Owner
- Notes: Use this endpoint to remove the A/R owner from a job.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | No Content |
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /jobs/{jobId}/representatives/ar-owner

- Title: Get A/R Owner
- Operation ID: `getAROwnerForJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getarownerforjob.md
- Summary: Get A/R Owner
- Notes: Use this endpoint to get the A/R representative for a job.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `companyRepresentative`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### POST /jobs/{jobId}/representatives/ar-owner

- Title: Add or Update A/R Owner
- Operation ID: `postAROwnerForJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/postarownerforjob.md
- Summary: Add or Update A/R Owner
- Notes: Use this endpoint to add or update the A/R Owner for a job.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

Required: no.
- `application/json`: `idPost`
  Fields: `id` string (uuid)

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | No Content |
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /jobs/{jobId}/representatives/company

- Title: Get Company Representative
- Operation ID: `getCompanyRepresentativeForJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getcompanyrepresentativeforjob.md
- Summary: Get Company Representative
- Notes: Use this endpoint to get the company representative for a job.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `companyRepresentative`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### POST /jobs/{jobId}/representatives/company

- Title: Update Company Representative
- Operation ID: `postCompanyRepresentativeForJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/postcompanyrepresentativeforjob.md
- Summary: Update Company Representative
- Notes: Use this endpoint to update the company representative for a job.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

Required: no.
- `application/json`: `idPost`
  Fields: `id` string (uuid)

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | No Content |
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### DELETE /jobs/{jobId}/representatives/sales-owner

- Title: Delete Sales Owner
- Operation ID: `deleteSalesOwnerFromJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/deletesalesownerfromjob.md
- Summary: Delete Sales Owner
- Notes: Use this endpoint to remove the sales owner from a job.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | No Content |
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /jobs/{jobId}/representatives/sales-owner

- Title: Get Sales Owner
- Operation ID: `getSalesOwnerForJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getsalesownerforjob.md
- Summary: Get Sales Owner
- Notes: Use this endpoint to get the sales owner for a job.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `companyRepresentative`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### POST /jobs/{jobId}/representatives/sales-owner

- Title: Add or Update Sales Owner
- Operation ID: `postSalesOwnerForJob`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/postsalesownerforjob.md
- Summary: Add or Update Sales Owner
- Notes: Use this endpoint to add or update the sales owner for a job.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

Required: no.
- `application/json`: `idPost`
  Fields: `id` string (uuid)

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | No Content |
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### PUT /jobs/{jobId}/trade-types

- Title: Update job trade types
- Operation ID: `updateJobTradeTypes`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/updatejobtradetypes.md
- Summary: Update job trade types
- Notes: Updates trade types for a specific job. Trade types passed on the body will replace those already existing on the job. If an empty array is provided, current trade types in the job will be unassigned.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

Required: yes.
- `application/json`: `jobTradeTypeCollection`

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | Trade types of the job were updated successfully |
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`403` | Not enough permissions. | `error`
`404` | Requested resource does not exist. | `error`

### PUT /jobs/{jobId}/work-type

- Title: Update job work type
- Operation ID: `updateJobWorkType`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/updatejobworktype.md
- Summary: Update job work type
- Notes: Updates work type for a specific job.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | path | yes | string (uuid) | The job's unique identifier

Request body:

Required: yes.
- `application/json`: `jobWorkType`
  Fields: `id` integer

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | The work type of the job was updated successfully |
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`403` | Not enough permissions. | `error`
`404` | Requested resource does not exist. | `error`

### GET /jobs/external-references

- Title: Get an external reference
- Operation ID: `getJobExternalReferences`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getjobexternalreferences.md
- Summary: Get an external reference
- Notes: Use this endpoint to get a external reference based on the following query parameters: - `jobId` - `projectId` * case insensitive - `source` * mandatory & case insensitive - `jobId` and `projectId` are optional, but at least one of them are needed in the request.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`jobId` | query | yes | string (uuid) | The job's unique identifier
`projectId` | query | no | string | The unique identifier of the project associated with the external reference.
`source` | query | yes | string | The name of the source associated with the external reference.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `externalReferenceList`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### POST /jobs/external-references

- Title: Set an external reference for a job
- Operation ID: `postCreateJobExternalReference`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/postcreatejobexternalreference.md
- Summary: Set an external reference for a job
- Notes: Use this endpoint to create a new external reference for a job to an external source and project

Parameters:

None.

Request body:

Required: no.
- `application/json`: `createExternalReferenceBodyPost`
  Fields: `jobId` string (uuid), `source` string, `projectId` string

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`201` | Created | `externalReference`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### POST /jobs/search

- Title: Jobs Search.
- Operation ID: `JobsSearch`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/jobssearch.md
- Summary: Jobs Search.
- Notes: Use this endpoint to get a listing of jobs matching the given search criteria. Jobs are returned if they include a given search term and/or they are near a given set of map coordinates. At least one of searchTerm or geoLocation must be included. If both are included, jobs returned must match both criteria. The size of the return is controlled with the pageSize query parameter which defaults to 10 and must be > 0 and = 0 to access jobs past the first page when more than pageSize jobs meet the search criteria. The StartIndex parameter to start looking for records should not exceed 100000 Unassigned leads or jobs will not be returned. Supported includes values: contact, initalAppointment. Example: return up to 25 jobs (including initial appointment) that contain "Maple Lane" and are within 1 kilometer of the map location (40.689247,-74.044502). /jobs/search?pageSize=25&includes=initialAppointment { "searchTerm": "Maple Lane", "geoLocation": { "latitude": 40.689247, "longitude": -74.044502, "mapRadius" 1 } }

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`pageSize` | query | no | integer | How many items to be returned at a time.
`recordStartIndex` | query | no | integer | The index of the first element to return
`includes` | query | no | string | Optional fields to include in full with the response.

Request body:

Required: no.
- `application/json`: `jobSearchPost`
  Fields: `searchTerm` string, `geoLocation` mapCoordinates

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `jobCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /leads/{leadId}/history

- Title: Get the history of the specified Lead.
- Operation ID: `getLeadHistory`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getleadhistory.md
- Summary: Get the history of the specified Lead.
- Notes: Use this endpoint to get a history of actions performed for a lead. Supported includes values: createdBy.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`leadId` | path | yes | string (uuid) | The lead's unique identifier
`includes` | query | no | string | Optional fields to include in full with the response.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `leadActionCollection`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /reports/scheduled-reports/{scheduledReportId}/runs

- Title: Get a list of instance runs for a Report Schedule Id
- Operation ID: `getReportsByInstanceInstanceRunsByScheduleId`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getreportsbyinstanceinstancerunsbyscheduleid.md
- Summary: Get a list of instance runs for a Report Schedule Id
- Notes: Use this endpoint to get a list of instances for a scheduled report by it's unique identifier. If the scheduled report requested is not available the response will be a Not Found error. If the scheduled report requested hasn'run yet the response will be an Empty response.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`scheduledReportId` | path | yes | string (uuid) | The scheduled report's unique identifier
`pageSize` | query | no | integer | How many items to be returned at a time.
`pageStartIndex` | query | no | integer | The index of the page to return

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `reportInstanceCollection`
`204` | No Content |
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /reports/scheduled-reports/{scheduledReportId}/runs/{instanceRunId}

- Title: Report by instance Id
- Operation ID: `getReportByInstanceId`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getreportbyinstanceid.md
- Summary: Report by instance Id
- Notes: Use this endpoint to get a scheduled report instance by it's instance run unique identifier. If the scheduled report requested is not available the response will be a not found error. If the instance of the scheduled report doesn't exists, the response will be a Not Found error

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`scheduledReportId` | path | yes | string (uuid) | The scheduled report's unique identifier
`instanceRunId` | path | yes | string (uuid) | The scheduled report's instance run unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `reportInstance`
`204` | No Content |
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /reports/scheduled-reports/{scheduledReportId}/runs/{instanceRunId}/recipients

- Title: Get a list of recipients for a specific instance of a Report Schedule Id
- Operation ID: `getReportsRecipientsByInstanceId`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getreportsrecipientsbyinstanceid.md
- Summary: Get a list of recipients for a specific instance of a Report Schedule Id
- Notes: Use this endpoint to get a list of recipients for a specific instance of a given scheduled report by it's unique identifier. If the scheduled report requested is not available the response will be a Not Found error. The instance of the report should be a valid instance of the scheduled report. If the scheduled report doesn't have any recipient the response will be an Empty response.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`scheduledReportId` | path | yes | string (uuid) | The scheduled report's unique identifier
`instanceRunId` | path | yes | string (uuid) | The scheduled report's instance run unique identifier
`pageSize` | query | no | integer | How many items to be returned at a time.
`pageStartIndex` | query | no | integer | The index of the page to return

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `reportInstanceRecipientCollection`
`204` | No Content |
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /reports/scheduled-reports/{scheduledReportId}/runs/{instanceRunId}/recipients/{recipientId}

- Title: Recipient of instance run by recipient Id
- Operation ID: `getReportInstaceRecipientById`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getreportinstacerecipientbyid.md
- Summary: Recipient of instance run by recipient Id
- Notes: Use this endpoint to get a scheduled report recipient data of a given instance by it's recipient unique identifier. If the scheduled report requested is not available the response will be a not found error. If the instance of the scheduled report doesn't exists, the response will be a Not Found error If the recipient of the scheduled report doesn't exists, the response will be a Not Found error

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`scheduledReportId` | path | yes | string (uuid) | The scheduled report's unique identifier
`instanceRunId` | path | yes | string (uuid) | The scheduled report's instance run unique identifier
`recipientId` | path | yes | string (uuid) | The scheduled report's recipient unique identifier of a given instance run

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `reportInstanceRecipient`
`204` | No Content |
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /reports/scheduled-reports/{scheduledReportId}/runs/latest

- Title: Report get latest instance
- Operation ID: `getReportLatestInstance`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getreportlatestinstance.md
- Summary: Report get latest instance
- Notes: Use this endpoint to get a scheduled report latest instance. If the scheduled report requested is not available the response will be a Not Found error. If the scheduled report requested hasn't run yet, the response will be an Empty response.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`scheduledReportId` | path | yes | string (uuid) | The scheduled report's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `reportInstance`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

### GET /subscriptions

- Title: Get subscriptions
- Operation ID: `getSubscriptions`
- Base URL: `https://api.acculynx.com/webhooks/v2`
- Source: https://apidocs.acculynx.com/reference/getsubscriptions.md
- Summary: Get subscriptions
- Notes: Retrieves all webhook subscriptions for your company. This endpoint returns a paginated list of webhook subscriptions, including: - Subscription status (enabled/disabled) - Consumer URLs where webhook events are sent - Technical contact information - Topics each subscription is listening for. - Integration type of the current subscription. Use the pagination parameters to control the number of results returned. Use the subscription status filter to narrow results by subscription state.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`pageSize` | query | no | integer | Controls how many items are returned per page in paginated responses. - Default: 25 items per page if not specified - Minimum: 1 item per page - Use with pageStartIndex for navigating through large result sets
`pageStartIndex` | query | no | integer | Specifies the starting position for paginated results. - Default: 0 (first page) if not specified - Minimum: 0 - Example: pageStartIndex=25 with pageSize=25 returns the second page of results
`subscriptionStatusQueryFilter` | query | no | string | Filters subscriptions by their current status. Allowed values: - All: Returns all subscriptions regardless of status (default) - Active: Returns only active subscriptions - Inactive: Returns only inactive subscriptions When omitted, defaults to "All" and returns all subscriptions.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | A paged list of subscriptions | `subscriptionCollection`
`400` | Bad Request - The server cannot process the request due to a client error. Common causes: - Invalid request format - Missing required fields - Validation errors in the request data | `error`
`401` | Unauthorized - Authentication is required or has failed. Common causes: - Missing API key - Invalid API key - Expired or deactivated API key | `error`
`416` | Range Not Satisfiable - The requested page of results is not available. Common causes: - pageStartIndex is beyond the available data range - Invalid pagination parameters | `error`

### POST /subscriptions

- Title: Create Subscription
- Operation ID: `postSubscription`
- Base URL: `https://api.acculynx.com/webhooks/v2`
- Source: https://apidocs.acculynx.com/reference/postsubscription.md
- Summary: Create Subscription
- Notes: Creates a new webhook subscription for your company. You must provide: - A valid consumer URL where webhook events will be sent - A technical contact email for notifications about the subscription - At least one topic name to subscribe to - An integration type that indicates the purpose of the subscription Upon successful creation, you'll receive a subscription ID that you can use to manage this subscription.

Parameters:

None.

Request body:

Required: no.
- `application/json`: `subscriptionBodyPost`
  Fields: `consumerUrl` string (uri), `techContact` string (email), `topicNames` topicNamesCollection, `integrationType` enum: Api

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | Ok | `subscriptionPostResponseOk`
`400` | Bad Request - The server cannot process the request due to a client error. Common causes: - Invalid request format - Missing required fields - Validation errors in the request data | `error`
`401` | Unauthorized - Authentication is required or has failed. Common causes: - Missing API key - Invalid API key - Expired or deactivated API key | `error`
`412` | Precondition Failed - The request cannot be completed due to failed preconditions. Common causes: - Attempting to update a subscription with invalid topic names - Trying to create a subscription with an invalid URL - Validation errors specific to the operation | `error`

### DELETE /subscriptions/{subscriptionId}

- Title: Delete subscription by id
- Operation ID: `deleteSubscription`
- Base URL: `https://api.acculynx.com/webhooks/v2`
- Source: https://apidocs.acculynx.com/reference/deletesubscription.md
- Summary: Delete subscription by id
- Notes: Permanently deletes a subscription. Once deleted: - The subscription will no longer receive any webhook events - The subscription cannot be recovered - Any new events for the topics it was listening to will not be sent Use this endpoint when you no longer need a particular webhook subscription.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`subscriptionId` | path | yes | string (uuid) | The unique identifier (UUID) of the subscription you want to interact with. This ID is returned when you create a subscription and can be retrieved from the GET /subscriptions endpoint.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | The resource was deleted successfully. |
`400` | Bad Request - The server cannot process the request due to a client error. Common causes: - Invalid request format - Missing required fields - Validation errors in the request data | `error`
`401` | Unauthorized - Authentication is required or has failed. Common causes: - Missing API key - Invalid API key - Expired or deactivated API key | `error`
`404` | Not Found - The requested resource does not exist. Common causes: - Invalid subscription ID - Subscription has been deleted - URL path contains typos or incorrect values | `error`

### GET /subscriptions/{subscriptionId}

- Title: Get subscription
- Operation ID: `getSubscription`
- Base URL: `https://api.acculynx.com/webhooks/v2`
- Source: https://apidocs.acculynx.com/reference/getsubscription.md
- Summary: Get subscription
- Notes: Retrieves detailed information about a specific subscription. This endpoint returns comprehensive details about the requested subscription: - Creation and last modification dates - Consumer URL where webhook events are sent - Technical contact information - Current status (enabled/disabled) - List of topics this subscription is listening for - Integration type of the current subscription Use this endpoint when you need to check the configuration of a specific subscription.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`subscriptionId` | path | yes | string (uuid) | The unique identifier (UUID) of the subscription you want to interact with. This ID is returned when you create a subscription and can be retrieved from the GET /subscriptions endpoint.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | The given subscription | `subscription`
`400` | Bad Request - The server cannot process the request due to a client error. Common causes: - Invalid request format - Missing required fields - Validation errors in the request data | `error`
`401` | Unauthorized - Authentication is required or has failed. Common causes: - Missing API key - Invalid API key - Expired or deactivated API key | `error`
`404` | Not Found - The requested resource does not exist. Common causes: - Invalid subscription ID - Subscription has been deleted - URL path contains typos or incorrect values | `error`

### PUT /subscriptions/{subscriptionId}

- Title: Update subscription by id
- Operation ID: `updateSubscription`
- Base URL: `https://api.acculynx.com/webhooks/v2`
- Source: https://apidocs.acculynx.com/reference/updatesubscription.md
- Summary: Update subscription by id
- Notes: Updates an existing subscription. You can modify: - The technical contact email address - The list of topics this subscription is listening for Note that you cannot update the consumer URL after creation. If you need to change the URL, you must delete this subscription and create a new one.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`subscriptionId` | path | yes | string (uuid) | The unique identifier (UUID) of the subscription you want to interact with. This ID is returned when you create a subscription and can be retrieved from the GET /subscriptions endpoint.

Request body:

Required: no.
- `application/json`: `subscriptionBodyPut`
  Fields: `technicalContact` string (email), `topicNames` topicNamesCollection

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`204` | The resource was updated successfully. |
`400` | Bad Request - The server cannot process the request due to a client error. Common causes: - Invalid request format - Missing required fields - Validation errors in the request data | `error`
`401` | Unauthorized - Authentication is required or has failed. Common causes: - Missing API key - Invalid API key - Expired or deactivated API key | `error`
`404` | Not Found - The requested resource does not exist. Common causes: - Invalid subscription ID - Subscription has been deleted - URL path contains typos or incorrect values | `error`
`412` | Precondition Failed - The request cannot be completed due to failed preconditions. Common causes: - Attempting to update a subscription with invalid topic names - Trying to create a subscription with an invalid URL - Validation errors specific to the operation | `error`

### POST /subscriptions/{subscriptionId}/test-event

- Title: Send a test event
- Operation ID: `postSendTestEvent`
- Base URL: `https://api.acculynx.com/webhooks/v2`
- Source: https://apidocs.acculynx.com/reference/postsendtestevent.md
- Summary: Send a test event
- Notes: Sends a test event to your webhook endpoint. This is extremely useful for: - Verifying your webhook receiver is properly configured - Testing your event handling logic - Confirming connectivity between AccuLynx and your systems You must specify a valid topic name in the request body. The test event will be sent to the consumer URL associated with this subscription, regardless of whether the subscription is actually listening for that specific topic.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`subscriptionId` | path | yes | string (uuid) | The unique identifier (UUID) of the subscription you want to interact with. This ID is returned when you create a subscription and can be retrieved from the GET /subscriptions endpoint.

Request body:

Required: no.
- `application/json`: `testEventBodyPost`
  Fields: `topicName` string

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`202` | Ok |
`400` | Bad Request - The server cannot process the request due to a client error. Common causes: - Invalid request format - Missing required fields - Validation errors in the request data | `error`
`401` | Unauthorized - Authentication is required or has failed. Common causes: - Missing API key - Invalid API key - Expired or deactivated API key | `error`
`404` | Not Found - The requested resource does not exist. Common causes: - Invalid subscription ID - Subscription has been deleted - URL path contains typos or incorrect values | `error`

### GET /supplements

- Title: Get all the supplements across the company.
- Operation ID: `getFinancialsSupplementsForCompany`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getfinancialssupplementsforcompany.md
- Summary: Get all the supplements across the company.
- Notes: Use this endpoint to get a list of supplements for the current location. StartIndex starts at 0. Default PageSize is 25. Pagination parameters are optional. Supported includes values: items, notations. Example: api/v2/supplements?pageSize=25&pageStartIndex=0&includes=items,notations&jobId=e591bf22-9828-4144-bca8-42cbb8c6e2c0

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`pageSize` | query | no | integer | How many items to be returned at a time.
`recordStartIndex` | query | no | integer | The index of the first element to return
`includes` | query | no | string | Optional fields to include in full with the response.
`jobId` | query | no | string (uuid) | The job's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `supplementCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /supplements/{supplementId}

- Title: Get supplement by the given ID.
- Operation ID: `getSupplementById`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getsupplementbyid.md
- Summary: Get supplement by the given ID.
- Notes: Use this endpoint to get a particular supplement for the current location.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`supplementId` | path | yes | string (uuid) | The supplement's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `supplement`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | The range of data requested from the resource is invalid | `error`

### GET /supplements/{supplementId}/items

- Title: Get all the items for a specific supplement.
- Operation ID: `getFinancialsSupplementItemCollection`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getfinancialssupplementitemcollection.md
- Summary: Get all the items for a specific supplement.
- Notes: Use this endpoint to get a list of items for a specific supplement in the current location. StartIndex starts at 0. The default PageSize is 25. Pagination parameters are optional. Example: api/v2/supplements/{supplementId}/items?pageSize=25&pageStartIndex=0

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`supplementId` | path | yes | string (uuid) | The supplement's unique identifier
`pageSize` | query | no | integer | How many items to be returned at a time.
`recordStartIndex` | query | no | integer | The index of the first element to return

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `supplementItemCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /supplements/{supplementId}/notations

- Title: Get all the notations for a specific supplement.
- Operation ID: `getFinancialsSupplementNotationCollection`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getfinancialssupplementnotationcollection.md
- Summary: Get all the notations for a specific supplement.
- Notes: Use this endpoint to get a list of notations for a specific supplement in the current location. StartIndex starts at 0. The default PageSize is 25. Pagination parameters are optional. Example: api/v2/supplements/{supplementId}/notations?pageSize=25&pageStartIndex=0

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`supplementId` | path | yes | string (uuid) | The supplement's unique identifier
`pageSize` | query | no | integer | How many items to be returned at a time.
`recordStartIndex` | query | no | integer | The index of the first element to return

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `supplementNotationCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /topics

- Title: Get topics
- Operation ID: `getTopics`
- Base URL: `https://api.acculynx.com/webhooks/v2`
- Source: https://apidocs.acculynx.com/reference/gettopics.md
- Summary: Get topics
- Notes: Retrieves all available webhook topics you can subscribe to. This endpoint returns a paginated list of all active topics, including: - Topic names that you can use when creating or updating subscriptions - Descriptions explaining what events each topic represents Use this endpoint to discover what events you can receive through webhooks.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`pageSize` | query | no | integer | Controls how many items are returned per page in paginated responses. - Default: 25 items per page if not specified - Minimum: 1 item per page - Use with pageStartIndex for navigating through large result sets
`pageStartIndex` | query | no | integer | Specifies the starting position for paginated results. - Default: 0 (first page) if not specified - Minimum: 0 - Example: pageStartIndex=25 with pageSize=25 returns the second page of results

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | list of topics | `topicCollection`
`400` | Bad Request - The server cannot process the request due to a client error. Common causes: - Invalid request format - Missing required fields - Validation errors in the request data | `error`
`401` | Unauthorized - Authentication is required or has failed. Common causes: - Missing API key - Invalid API key - Expired or deactivated API key | `error`
`416` | Range Not Satisfiable - The requested page of results is not available. Common causes: - pageStartIndex is beyond the available data range - Invalid pagination parameters | `error`

### GET /users

- Title: Get Users
- Operation ID: `getUsers`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getusers.md
- Summary: Get Users
- Notes: Use this endpoint to get the list of users for a company. The status filter can be used to filter users based on status - active, inactive, archived, or deleted. By default, only active users will be returned. This endpoint will return a paginated response starting from the given record index.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`pageSize` | query | no | integer | How many items to be returned at a time.
`recordStartIndex` | query | no | integer | The index of the first element to return
`status` | query | no | string | Return users of the listed status. Possible values are Active, Inactive, Archived, and Deleted. Multiple values are given comma seperated. To return all users - Active,Inactive,Archive,Deleted. When no status parameter is given, the Active users are returned.

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `companyUserCollection`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`416` | The range of data requested from the resource is invalid | `error`

### GET /users/{userId}

- Title: Get User
- Operation ID: `getUser`
- Base URL: `https://api.acculynx.com/api/v2`
- Source: https://apidocs.acculynx.com/reference/getuser.md
- Summary: Get User
- Notes: Use this endpoint to get the details of a specific user.

Parameters:

| Name | In | Required | Type | Notes |
| --- | --- | --- | --- | --- |
`userId` | path | yes | string (uuid) | The user's unique identifier

Request body:

None.

Responses:

| Status | Description | Schema |
| --- | --- | --- |
`200` | OK | `companyUser`
`400` | Bad Request | `error`
`401` | API Key is invalid or deactivated | `error`
`404` | Requested resource does not exist. | `error`

## Webhook Event References

Topic hints are generated from the event documentation page. Call `GET /topics` in the target AccuLynx account before creating or updating a subscription.

| Topic hint | Event | Source |
| --- | --- | --- |
| `approvedjobvaluechanged` | Job Financials Approved Value Changed Webhook | [approvedjobvaluechanged](https://apidocs.acculynx.com/reference/approvedjobvaluechanged.md) |
| `contactadded` | Contact Added Webhook | [contactadded](https://apidocs.acculynx.com/reference/contactadded.md) |
| `contactchanged` | Contact Changed Webhook | [contactchanged](https://apidocs.acculynx.com/reference/contactchanged.md) |
| `contactcustomfieldstatuschanged` | Contact Custom Field Status Changed Webhook | [contactcustomfieldstatuschanged](https://apidocs.acculynx.com/reference/contactcustomfieldstatuschanged.md) |
| `contactcustomfieldvaluechanged` | Contact Custom Field Value Changed Webhook | [contactcustomfieldvaluechanged](https://apidocs.acculynx.com/reference/contactcustomfieldvaluechanged.md) |
| `invoiceupdated` | Job Invoice Updated Webhook | [invoiceupdated](https://apidocs.acculynx.com/reference/invoiceupdated.md) |
| `invoicevoided` | Job Invoice Voided Webhook | [invoicevoided](https://apidocs.acculynx.com/reference/invoicevoided.md) |
| `jobaccountingintegrationstatuscurrentchanged` | Job Accounting Integration Status Current Changed Webhook | [jobaccountingintegrationstatuscurrentchanged](https://apidocs.acculynx.com/reference/jobaccountingintegrationstatuscurrentchanged.md) |
| `jobcategorychanged` | Job Category Changed Webhook | [jobcategorychanged](https://apidocs.acculynx.com/reference/jobcategorychanged.md) |
| `jobcontactsprimarychanged` | Job Contact Primary Changed Webhook | [jobcontactsprimarychanged](https://apidocs.acculynx.com/reference/jobcontactsprimarychanged.md) |
| `jobcreated` | Job Created Webhook | [jobcreated](https://apidocs.acculynx.com/reference/jobcreated.md) |
| `jobcustomfieldstatuschanged` | Job Custom Field Status Changed Webhook | [jobcustomfieldstatuschanged](https://apidocs.acculynx.com/reference/jobcustomfieldstatuschanged.md) |
| `jobcustomfieldvaluechanged` | Job Custom Field Value Changed Webhook | [jobcustomfieldvaluechanged](https://apidocs.acculynx.com/reference/jobcustomfieldvaluechanged.md) |
| `jobinitialappointmentcreated` | Job Appointments Initial Created Webhook | [jobinitialappointmentcreated](https://apidocs.acculynx.com/reference/jobinitialappointmentcreated.md) |
| `jobinitialappointmentupdated` | Job Appointments Initial Updated Webhook | [jobinitialappointmentupdated](https://apidocs.acculynx.com/reference/jobinitialappointmentupdated.md) |
| `jobmilestonecurrentchanged` | Job Milestone Current Changed Webhook | [jobmilestonecurrentchanged](https://apidocs.acculynx.com/reference/jobmilestonecurrentchanged.md) |
| `jobmilestonestatuscurrentchanged` | Job Milestone Status Current Changed Webhook | [jobmilestonestatuscurrentchanged](https://apidocs.acculynx.com/reference/jobmilestonestatuscurrentchanged.md) |
| `jobprimarycontactchanged` | Job Primary Contact Changed/Added Webhook | [jobprimarycontactchanged](https://apidocs.acculynx.com/reference/jobprimarycontactchanged.md) |
| `jobrepresentativescompanyassigned` | Job Representatives Company Assigned Webhook | [jobrepresentativescompanyassigned](https://apidocs.acculynx.com/reference/jobrepresentativescompanyassigned.md) |
| `jobrepresentativescompanychanged` | Job Representatives Company Changed Webhook | [jobrepresentativescompanychanged](https://apidocs.acculynx.com/reference/jobrepresentativescompanychanged.md) |
| `jobtradetypechanged` | Job Trade Type Changed Webhook | [jobtradetypechanged](https://apidocs.acculynx.com/reference/jobtradetypechanged.md) |
| `jobupdated` | Job Updated Webhook | [jobupdated](https://apidocs.acculynx.com/reference/jobupdated.md) |
| `jobworktypechanged` | Job Work Type Changed Webhook | [jobworktypechanged](https://apidocs.acculynx.com/reference/jobworktypechanged.md) |
