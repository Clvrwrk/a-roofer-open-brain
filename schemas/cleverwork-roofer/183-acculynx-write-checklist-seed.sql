-- 183 — AccuLynx write-capability checklist seed (Phase 4, REQ-06)
--
-- The deterministic, spec-driven INPUT target list for the sandbox write sweep: all 38
-- documented POST/PUT/DELETE operations (19 POST / 15 PUT / 4 DELETE) from
-- skills/cleverwork-roofer/acculynx-api/reference/openapi-index.json, enumerated in
-- 04-RESEARCH.md's "Full 38-Endpoint Enumeration". Distinct from acculynx_write_catalog
-- (schema 182) — the catalog is the evidence OUTPUT (verdict per endpoint after probing);
-- this checklist is the INPUT list the write-sweep (Wave 2/3) walks and marks `swept` for
-- watermark-resume, mirroring acculynx_get_checklist (167).
--
-- tier: 'deep' = the 14 "meaningful write lane" rows (13 POST + 1 PUT) getting the full
-- 5-dimension red-team per D-05; 'smoke' = the remaining 24 rows (happy-path + 1 bad-input).
-- 14 deep + 24 smoke = 38, matching the locked 19/15/4 method breakdown exactly.
--
-- Rows generated from the research enumeration, not by hand. Additive + idempotent.

create table if not exists public.acculynx_write_checklist (
  operation_id           text primary key,
  path                   text not null,
  base_url               text not null,
  tier                   text not null check (tier in ('deep','smoke')),
  method                 text not null check (method in ('POST','PUT','DELETE')),
  path_params            jsonb not null default '[]'::jsonb,
  required_body_fields   jsonb,
  dependency_chain       text,
  red_team_dimensions    jsonb not null default '["bad_input"]'::jsonb,
  probeability           text not null default 'probeable'
                           check (probeability in ('probeable','tier_gated','blocked-by-dependency')),
  swept                  boolean not null default false,
  created_at             timestamptz not null default now()
);

comment on table public.acculynx_write_checklist is
  'Spec-driven checklist of the 38 documented AccuLynx write operations (19 POST/15 PUT/4 DELETE). Drives the sandbox write sweep (Phase 4, REQ-06); swept flag supports watermark-resume. Distinct from acculynx_write_catalog (the evidence output).';

insert into public.acculynx_write_checklist
  (operation_id, path, base_url, tier, method, path_params, required_body_fields, dependency_chain, red_team_dimensions, probeability)
values
  -- ===== DEEP TIER (14 rows: 13 POST + 1 PUT) — full 5-dimension red-team =====
  ($$postContact$$, $$/contacts$$, $$https://api.acculynx.com/api/v2$$, $$deep$$, $$POST$$,
   $$[]$$::jsonb, $$["contactTypeIds"]$$::jsonb, null,
   $$["bad_input","partial_failure","idempotency","ordering_dependency","authz_scope"]$$::jsonb, $$probeable$$),

  ($$postJob$$, $$/jobs$$, $$https://api.acculynx.com/api/v2$$, $$deep$$, $$POST$$,
   $$[]$$::jsonb, $$["contact"]$$::jsonb, $$contactId -> jobId$$,
   $$["bad_input","partial_failure","idempotency","ordering_dependency","authz_scope"]$$::jsonb, $$probeable$$),

  ($$putJobCustomFields$$, $$/jobs/{jobId}/custom-fields$$, $$https://api.acculynx.com/api/v2$$, $$deep$$, $$PUT$$,
   $$["jobId"]$$::jsonb, $$["customFields"]$$::jsonb, $$jobId -> customFieldDefinitionId$$,
   $$["bad_input","partial_failure","idempotency","ordering_dependency","authz_scope"]$$::jsonb, $$probeable$$),

  ($$postWorksheetItem$$, $$/financials/{financialsId}/worksheet/items$$, $$https://api.acculynx.com/api/v2$$, $$deep$$, $$POST$$,
   $$["financialsId"]$$::jsonb, $$["price"]$$::jsonb, $$contactId -> jobId -> financialsId$$,
   $$["bad_input","partial_failure","idempotency","ordering_dependency","authz_scope"]$$::jsonb, $$probeable$$),

  ($$postPaymentReceived$$, $$/jobs/{jobId}/payments/received$$, $$https://api.acculynx.com/api/v2$$, $$deep$$, $$POST$$,
   $$["jobId"]$$::jsonb, $$["from","amount","paymentDate","checkNumber","notes"]$$::jsonb, $$jobId$$,
   $$["bad_input","partial_failure","idempotency","ordering_dependency","authz_scope"]$$::jsonb, $$probeable$$),

  ($$postPaymentPaid$$, $$/jobs/{jobId}/payments/paid$$, $$https://api.acculynx.com/api/v2$$, $$deep$$, $$POST$$,
   $$["jobId"]$$::jsonb, $$["to","paymentMethod","amount","paymentDate","notes","accountTypeId","refNumber","isPaid"]$$::jsonb, $$jobId -> accountTypeId$$,
   $$["bad_input","partial_failure","idempotency","ordering_dependency","authz_scope"]$$::jsonb, $$probeable$$),

  ($$postPaymentExpense$$, $$/jobs/{jobId}/payments/expense$$, $$https://api.acculynx.com/api/v2$$, $$deep$$, $$POST$$,
   $$["jobId"]$$::jsonb, $$["to","amount","notes","accountTypeId","isPaid","refNumber"]$$::jsonb, $$jobId -> accountTypeId$$,
   $$["bad_input","partial_failure","idempotency","ordering_dependency","authz_scope"]$$::jsonb, $$probeable$$),

  ($$postJobDocument$$, $$/jobs/{jobId}/documents$$, $$https://api.acculynx.com/api/v2$$, $$deep$$, $$POST$$,
   $$["jobId"]$$::jsonb, $$["file","documentFolderId"]$$::jsonb, $$jobId -> documentFolderId$$,
   $$["bad_input","partial_failure","idempotency","ordering_dependency","authz_scope"]$$::jsonb, $$probeable$$),

  ($$postJobPhotoVideo$$, $$/jobs/{jobId}/photos-videos$$, $$https://api.acculynx.com/api/v2$$, $$deep$$, $$POST$$,
   $$["jobId"]$$::jsonb, $$["file","description","tags","fileUri","externalId","externalSource"]$$::jsonb, $$jobId$$,
   $$["bad_input","partial_failure","idempotency","ordering_dependency","authz_scope"]$$::jsonb, $$probeable$$),

  ($$postJobMessage$$, $$/jobs/{jobId}/messages$$, $$https://api.acculynx.com/api/v2$$, $$deep$$, $$POST$$,
   $$["jobId"]$$::jsonb, $$["message"]$$::jsonb, $$jobId$$,
   $$["bad_input","partial_failure","idempotency","ordering_dependency","authz_scope"]$$::jsonb, $$probeable$$),

  ($$postCompanyRepresentativeForJob$$, $$/jobs/{jobId}/representatives/company$$, $$https://api.acculynx.com/api/v2$$, $$deep$$, $$POST$$,
   $$["jobId"]$$::jsonb, $$["id"]$$::jsonb, $$jobId -> userId$$,
   $$["bad_input","partial_failure","idempotency","ordering_dependency","authz_scope"]$$::jsonb, $$probeable$$),

  ($$postSalesOwnerForJob$$, $$/jobs/{jobId}/representatives/sales-owner$$, $$https://api.acculynx.com/api/v2$$, $$deep$$, $$POST$$,
   $$["jobId"]$$::jsonb, $$["id"]$$::jsonb, $$jobId -> userId$$,
   $$["bad_input","partial_failure","idempotency","ordering_dependency","authz_scope"]$$::jsonb, $$probeable$$),

  ($$postAROwnerForJob$$, $$/jobs/{jobId}/representatives/ar-owner$$, $$https://api.acculynx.com/api/v2$$, $$deep$$, $$POST$$,
   $$["jobId"]$$::jsonb, $$["id"]$$::jsonb, $$jobId -> userId$$,
   $$["bad_input","partial_failure","idempotency","ordering_dependency","authz_scope"]$$::jsonb, $$probeable$$),

  ($$postJobExternalReference$$, $$/jobs/external-references$$, $$https://api.acculynx.com/api/v2$$, $$deep$$, $$POST$$,
   $$[]$$::jsonb, $$["jobId","source","projectId"]$$::jsonb, $$jobId$$,
   $$["bad_input","partial_failure","idempotency","ordering_dependency","authz_scope"]$$::jsonb, $$probeable$$),

  -- ===== SMOKE TIER (24 rows: 6 POST + 14 PUT + 4 DELETE) — happy-path + 1 bad-input probe =====
  ($$putContactCustomFields$$, $$/contacts/{contactId}/custom-fields$$, $$https://api.acculynx.com/api/v2$$, $$smoke$$, $$PUT$$,
   $$["contactId"]$$::jsonb, $$["customFields"]$$::jsonb, $$contactId$$,
   $$["bad_input"]$$::jsonb, $$probeable$$),

  ($$putContactCustomFieldById$$, $$/contacts/{contactId}/custom-fields/{customFieldId}$$, $$https://api.acculynx.com/api/v2$$, $$smoke$$, $$PUT$$,
   $$["contactId","customFieldId"]$$::jsonb, $$["fieldType","values"]$$::jsonb, $$contactId -> customFieldId$$,
   $$["bad_input"]$$::jsonb, $$probeable$$),

  ($$postContactLog$$, $$/contacts/{contactId}/logs$$, $$https://api.acculynx.com/api/v2$$, $$smoke$$, $$POST$$,
   $$["contactId"]$$::jsonb, null, $$contactId$$,
   $$["bad_input"]$$::jsonb, $$probeable$$),

  ($$postContactsSearch$$, $$/contacts/search$$, $$https://api.acculynx.com/api/v2$$, $$smoke$$, $$POST$$,
   $$[]$$::jsonb, $$["startDate","endDate","sort"]$$::jsonb, null,
   $$["bad_input"]$$::jsonb, $$probeable$$),

  ($$postJobsSearch$$, $$/jobs/search$$, $$https://api.acculynx.com/api/v2$$, $$smoke$$, $$POST$$,
   $$[]$$::jsonb, null, null,
   $$["bad_input"]$$::jsonb, $$probeable$$),

  ($$putJobAddress$$, $$/jobs/{jobId}/address$$, $$https://api.acculynx.com/api/v2$$, $$smoke$$, $$PUT$$,
   $$["jobId"]$$::jsonb, $$["street1","street2","city","state","country","zipCode"]$$::jsonb, $$jobId$$,
   $$["bad_input"]$$::jsonb, $$probeable$$),

  ($$putAdjusterForJob$$, $$/jobs/{jobId}/adjuster$$, $$https://api.acculynx.com/api/v2$$, $$smoke$$, $$PUT$$,
   $$["jobId"]$$::jsonb, $$["adjusterName","phone","fax","email","claimApproved","claimApprovedDate","metWithAdjuster","metWithAdjusterDate"]$$::jsonb, $$jobId$$,
   $$["bad_input"]$$::jsonb, $$blocked-by-dependency$$),

  ($$putJobCustomFieldById$$, $$/jobs/{jobId}/custom-fields/{customFieldId}$$, $$https://api.acculynx.com/api/v2$$, $$smoke$$, $$PUT$$,
   $$["jobId","customFieldId"]$$::jsonb, $$["fieldType","values"]$$::jsonb, $$jobId -> customFieldId$$,
   $$["bad_input"]$$::jsonb, $$probeable$$),

  ($$putInitialAppointmentForJob$$, $$/jobs/{jobId}/initial-appointment$$, $$https://api.acculynx.com/api/v2$$, $$smoke$$, $$PUT$$,
   $$["jobId"]$$::jsonb, $$["startDate","endDate","notes"]$$::jsonb, $$jobId$$,
   $$["bad_input","ordering_dependency"]$$::jsonb, $$probeable$$),

  ($$deleteInitialAppointmentForJob$$, $$/jobs/{jobId}/initial-appointment$$, $$https://api.acculynx.com/api/v2$$, $$smoke$$, $$DELETE$$,
   $$["jobId"]$$::jsonb, $$["note"]$$::jsonb, $$jobId -> putInitialAppointmentForJob$$,
   $$["bad_input","idempotency","ordering_dependency"]$$::jsonb, $$probeable$$),

  ($$putInsuranceForJob$$, $$/jobs/{jobId}/insurance$$, $$https://api.acculynx.com/api/v2$$, $$smoke$$, $$PUT$$,
   $$["jobId"]$$::jsonb, null, $$jobId$$,
   $$["bad_input"]$$::jsonb, $$probeable$$),

  ($$putInsuranceCompanyForJob$$, $$/jobs/{jobId}/insurance/insurance-company$$, $$https://api.acculynx.com/api/v2$$, $$smoke$$, $$PUT$$,
   $$["jobId"]$$::jsonb, $$["insuranceCompanyId","insuranceCompanyName"]$$::jsonb, $$jobId$$,
   $$["bad_input","ordering_dependency"]$$::jsonb, $$probeable$$),

  ($$putJobCategoriesForJob$$, $$/jobs/{jobId}/job-categories$$, $$https://api.acculynx.com/api/v2$$, $$smoke$$, $$PUT$$,
   $$["jobId"]$$::jsonb, $$["id"]$$::jsonb, $$jobId -> jobCategoryId$$,
   $$["bad_input","ordering_dependency"]$$::jsonb, $$probeable$$),

  ($$putLeadSourceForJob$$, $$/jobs/{jobId}/lead-source$$, $$https://api.acculynx.com/api/v2$$, $$smoke$$, $$PUT$$,
   $$["jobId"]$$::jsonb, $$["id"]$$::jsonb, $$jobId -> leadSourceId$$,
   $$["bad_input"]$$::jsonb, $$probeable$$),

  ($$putPriorityForJob$$, $$/jobs/{jobId}/priority$$, $$https://api.acculynx.com/api/v2$$, $$smoke$$, $$PUT$$,
   $$["jobId"]$$::jsonb, $$["priority"]$$::jsonb, $$jobId$$,
   $$["bad_input"]$$::jsonb, $$probeable$$),

  ($$putTradeTypesForJob$$, $$/jobs/{jobId}/trade-types$$, $$https://api.acculynx.com/api/v2$$, $$smoke$$, $$PUT$$,
   $$["jobId"]$$::jsonb, null, $$jobId$$,
   $$["bad_input"]$$::jsonb, $$probeable$$),

  ($$putWorkTypeForJob$$, $$/jobs/{jobId}/work-type$$, $$https://api.acculynx.com/api/v2$$, $$smoke$$, $$PUT$$,
   $$["jobId"]$$::jsonb, $$["id"]$$::jsonb, $$jobId -> workTypeId$$,
   $$["bad_input"]$$::jsonb, $$probeable$$),

  ($$postJobMessageReply$$, $$/jobs/{jobId}/messages/{messageId}/replies$$, $$https://api.acculynx.com/api/v2$$, $$smoke$$, $$POST$$,
   $$["jobId","messageId"]$$::jsonb, $$["message"]$$::jsonb, $$jobId -> postJobMessage -> messageId$$,
   $$["bad_input","ordering_dependency"]$$::jsonb, $$probeable$$),

  ($$deleteAROwnerForJob$$, $$/jobs/{jobId}/representatives/ar-owner$$, $$https://api.acculynx.com/api/v2$$, $$smoke$$, $$DELETE$$,
   $$["jobId"]$$::jsonb, null, $$jobId -> postAROwnerForJob$$,
   $$["bad_input","idempotency","ordering_dependency"]$$::jsonb, $$probeable$$),

  ($$deleteSalesOwnerForJob$$, $$/jobs/{jobId}/representatives/sales-owner$$, $$https://api.acculynx.com/api/v2$$, $$smoke$$, $$DELETE$$,
   $$["jobId"]$$::jsonb, null, $$jobId -> postSalesOwnerForJob$$,
   $$["bad_input","idempotency","ordering_dependency"]$$::jsonb, $$probeable$$),

  ($$postSubscription$$, $$/subscriptions$$, $$https://api.acculynx.com/webhooks/v2$$, $$smoke$$, $$POST$$,
   $$[]$$::jsonb, $$["consumerUrl","techContact","topicNames"]$$::jsonb, null,
   $$["bad_input","ordering_dependency"]$$::jsonb, $$tier_gated$$),

  ($$putSubscription$$, $$/subscriptions/{subscriptionId}$$, $$https://api.acculynx.com/webhooks/v2$$, $$smoke$$, $$PUT$$,
   $$["subscriptionId"]$$::jsonb, $$["technicalContact","topicNames"]$$::jsonb, $$postSubscription -> subscriptionId$$,
   $$["bad_input","ordering_dependency"]$$::jsonb, $$tier_gated$$),

  ($$deleteSubscription$$, $$/subscriptions/{subscriptionId}$$, $$https://api.acculynx.com/webhooks/v2$$, $$smoke$$, $$DELETE$$,
   $$["subscriptionId"]$$::jsonb, null, $$postSubscription -> subscriptionId$$,
   $$["bad_input","idempotency","ordering_dependency"]$$::jsonb, $$tier_gated$$),

  ($$postSubscriptionTestEvent$$, $$/subscriptions/{subscriptionId}/test-event$$, $$https://api.acculynx.com/webhooks/v2$$, $$smoke$$, $$POST$$,
   $$["subscriptionId"]$$::jsonb, $$["topicName"]$$::jsonb, $$postSubscription -> subscriptionId$$,
   $$["bad_input"]$$::jsonb, $$tier_gated$$)
on conflict (operation_id) do nothing;

alter table public.acculynx_write_checklist enable row level security;
grant select on public.acculynx_write_checklist to authenticated, service_role;
