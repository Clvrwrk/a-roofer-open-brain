# StartInfinity → brain field mapping

StartInfinity is a Tier-1 (modern SaaS w/ API) bridge. Where a client runs both AccuLynx and StartInfinity, **AccuLynx is authoritative** for the job record; StartInfinity cards link to the same `job` by address/parcel resolution (see `integrations/bridges/_template/contract.md`).

| StartInfinity object | → brain target | Notes |
| --- | --- | --- |
| Board | context only | not stored as a row |
| Card | `public.job` (upsert) + atom | `external_ref` = card id, `source_system` = `"startinfinity"` |
| Column (list) | `job.job_phase` | via the column→phase map in `metadata.json` |
| Card move (column change) | `job` update + atom | a phase transition; may fire `job.closed` → debrief |
| Card field / custom field | `job.metadata` + atom | `trust_tier = evidence` |
| Comment | atom (`soft_or_hard` inferred) | `trust_tier = evidence` |
| Attachment | atom + `agent_memory_artifacts` ref | photos may carry `eeat_signal` candidates (see companycam contract) |
| Assignee / member | `public.crew` | `role` inferred; `consent_to_attribute = false` by default |

Every atom carries `model_card = {provider:"bridge", model_name:"startinfinity", model_version:"0.1.0"}`, resolves `property_id` from the card's address, and de-dupes via `content_fingerprint`. The column→`job_phase` map is configurable in `metadata.json`; `closed`/`won`/`warranty` phases trigger the post-op debrief through Conductor.
