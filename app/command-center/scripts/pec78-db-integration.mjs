import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const databaseUrl = process.env.PEC78_DATABASE_URL;
const expectedProjectRef = process.env.PEC78_EXPECTED_PROJECT_REF;
if (!databaseUrl || !expectedProjectRef || process.env.PEC78_DB_TEST_TARGET !== "nonproduction") {
  throw new Error("PEC78_DATABASE_URL, PEC78_EXPECTED_PROJECT_REF, and PEC78_DB_TEST_TARGET=nonproduction are required");
}
if (expectedProjectRef === "rnhmvcpsvtqjlffpsayu" || !databaseUrl.includes(expectedProjectRef)) {
  throw new Error("Refusing to run PEC-78 database tests against production or an unverified target");
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const migrations = [
  "188-pec78-runtime-auth-v1-installed-disabled.sql",
  "189-pec78-maya-shadow-boundary.sql",
  "190-pec78-composio-slack-production.sql",
  "191-pec78-composio-slack-production-hardening.sql",
];
const sql = postgres(databaseUrl, { max: 8, connect_timeout: 20, idle_timeout: 5, prepare: false });

const P = "78000000-0000-4000-8000-000000000001";
const CREDENTIAL_ROW = "78000000-0000-4000-8000-000000000100";
const CREDENTIAL_ID = "78000000-0000-4000-8000-000000000101";
const RUNTIME_ID = "78000000-0000-4000-8000-000000000102";
const DESTINATION_ID = "78000000-0000-4000-8000-000000000120";
const GATE_ID = "78000000-0000-4000-8000-000000000130";
const AUTH_ID = "78000000-0000-4000-8000-000000000140";
const BUILD = "pec78-test-build";
const REGISTRY = `sha256:${"1".repeat(64)}`;
const TRIGGER = "ti_new_maya_proof";
const DIGEST = (character) => `sha256:${character.repeat(64)}`;

function result(rows) {
  return rows[0]?.result;
}

async function applyMigrations() {
  const existing = await sql`select to_regnamespace('runtime_auth')::text as schema_name`;
  assert.equal(existing[0].schema_name, null, "preview branch must not already contain runtime_auth");
  const connection = await sql.reserve();
  try {
    for (const migration of migrations) {
      const source = await readFile(resolve(repoRoot, "schemas/cleverwork-roofer", migration), "utf8");
      await connection.unsafe(source);
    }
  } finally {
    connection.release();
  }
}

async function seedAuthority() {
  await sql.begin(async (tx) => {
    await tx`update runtime_auth.principals set state='active',registry_version=${REGISTRY},fence_epoch=0 where id=${P}`;
    await tx`insert into runtime_auth.credentials(
      id,principal_id,credential_id,issuer,key_thumbprint,runtime_instance_id,provider_refs,state,not_before,expires_at
    ) values(
      ${CREDENTIAL_ROW},${P},${CREDENTIAL_ID},'pec78-test-issuer','pec78-test-thumbprint',${RUNTIME_ID},
      ${tx.json({ composio_account_ref: "account-digest-only" })},'active',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour'
    )`;
    await tx`update runtime_auth.capability_grants
      set state='active',valid_from=clock_timestamp()-interval '1 minute',valid_until=clock_timestamp()+interval '1 hour'
      where principal_id=${P} and capability in ('slack.receive.christopher','slack.send.christopher')`;
    await tx`insert into runtime_auth.destination_grants(
      id,capability_grant_id,provider,account_digest,destination_digest,thread_digest,destination_ref,state,valid_until
    ) values(
      ${DESTINATION_ID},'78000000-0000-4000-8000-000000000014','slack',${DIGEST("a")},${DIGEST("b")},null,
      'C0BD7L43PC2','active',clock_timestamp()+interval '1 hour'
    )`;
    await tx`insert into runtime_auth.production_gates(
      id,contract_version,principal_id,build_version,registry_version,migration_version,credential_id,
      review_packet_digest,approver_user_id,approver_org_id,state,issued_at,expires_at
    ) values(
      ${GATE_ID},'pec78-runtime-authorization-v1',${P},${BUILD},${REGISTRY},
      '191-pec78-composio-slack-production-hardening',${CREDENTIAL_ROW},${DIGEST("c")},
      'U0B8SGJJZLJ','T0B8QEGPVQW','active',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour'
    )`;
    await tx`insert into runtime_auth.activation_budgets(
      id,principal_id,slack_limit,email_limit,model_route_id,max_input_tokens,max_output_tokens,
      max_tool_steps,max_runtime_seconds,max_gate_cost_usd,state,expires_at
    ) values(
      'pec78-maya-shadow-2026-07-26',${P},1,1,'google/gemini-3.1-flash-lite',2000,500,1,90,1,
      'active',clock_timestamp()+interval '1 hour'
    )`;
    await tx`update runtime_auth.ingress_sources set trigger_id=${TRIGGER},connected_account_id='ca_X9dQyRDSS0sa',
      mode='validation',valid_until=clock_timestamp()+interval '1 hour',updated_at=clock_timestamp()
      where id='maya-composio-slack-v1'`;
    await tx`insert into runtime_auth.activation_authorizations(
      id,principal_id,source_id,approver_user_id,build_version,registry_version,runtime_instance_id,
      fence_epoch,trigger_id,channel_id,state,issued_at,expires_at
    ) values(
      ${AUTH_ID},${P},'maya-composio-slack-v1','U0B8SGJJZLJ',${BUILD},${REGISTRY},${RUNTIME_ID},0,
      ${TRIGGER},'C0BD7L43PC2','active',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '10 minutes'
    )`;
  });
}

function ingestCall(client, {
  delivery = "d", message = "e", nonce = "AAAAAAAAAAAAAAAA", provider = "evt_proof_1",
  runtimeId = RUNTIME_ID, registry = REGISTRY, build = BUILD, validationMode = true,
} = {}) {
  return client`select public.pec78_ingest_composio_slack_event_v2(
    ${provider},${DIGEST(delivery)},${DIGEST(message)},${DIGEST("f")},${DIGEST("1")},${DIGEST("2")},
    ${TRIGGER},'ca_X9dQyRDSS0sa','maya-chen','T0B8QEGPVQW','C0BD7L43PC2','U0B8SGJJZLJ',
    clock_timestamp(),'aes-256-gcm','maya-test-v1',${nonce},'AAAAAAAAAAAAAAAAAAAAAA==','AQ==',${validationMode},
    ${runtimeId},${registry},gen_random_uuid(),${build}
  ) as result`;
}

async function assertCatalogContract() {
  const tables = await sql`
    select c.relname,c.relrowsecurity,c.relforcerowsecurity,
      has_table_privilege('service_role',format('runtime_auth.%I',c.relname),'select,insert,update,delete') as service_role_dml
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='runtime_auth' and c.relname in (
      'ingress_sources','activation_authorizations','inbound_events','event_leases','slack_effects','event_receipts'
    ) order by c.relname`;
  assert.equal(tables.length, 6);
  for (const table of tables) {
    assert.equal(table.relrowsecurity, true, `${table.relname} RLS`);
    assert.equal(table.relforcerowsecurity, true, `${table.relname} forced RLS`);
    assert.equal(table.service_role_dml, false, `${table.relname} direct service-role DML`);
  }
  const grants = await sql`select
    has_function_privilege('service_role','public.pec78_ingest_composio_slack_event(text,text,text,text,text,text,text,text,text,text,text,text,timestamptz,text,text,text,text,text,boolean,uuid,text)','execute') as old_ingest,
    has_function_privilege('service_role','public.pec78_ingest_composio_slack_event_v2(text,text,text,text,text,text,text,text,text,text,text,text,timestamptz,text,text,text,text,text,boolean,uuid,text,uuid,text)','execute') as new_ingest,
    has_function_privilege('service_role','public.pec78_composio_production_readiness()','execute') as old_readiness,
    coalesce(has_function_privilege('service_role',to_regprocedure('public.pec78_composio_production_readiness(uuid,text,text)'),'execute'),false) as stale_readiness,
    has_function_privilege('service_role','public.pec78_composio_production_readiness(uuid,text,text,text)','execute') as new_readiness`;
  assert.deepEqual(grants[0], { old_ingest: false, new_ingest: true, old_readiness: false, stale_readiness: false, new_readiness: true });
}

async function assertStateMachine() {
  const ready = result(await sql`select public.pec78_composio_production_readiness(${RUNTIME_ID},${REGISTRY},${BUILD},${TRIGGER}) as result`);
  assert.equal(ready.ok, true);
  assert.equal(ready.authority_tuple_ready, true);
  const wrongTrigger = result(await sql`select public.pec78_composio_production_readiness(${RUNTIME_ID},${REGISTRY},${BUILD},'ti_wrong_fixture') as result`);
  assert.equal(wrongTrigger.ok, false);
  assert.equal(wrongTrigger.authority_tuple_ready, false);
  await sql`insert into runtime_auth.kill_switches(id,scope,target,reason,actor_subject)
    values('78000000-0000-4000-8000-000000000299','destination',${DESTINATION_ID},'readiness proof','operator:integration-test')`;
  const destinationKilled = result(await sql`select public.pec78_composio_production_readiness(${RUNTIME_ID},${REGISTRY},${BUILD},${TRIGGER}) as result`);
  assert.equal(destinationKilled.ok, false);
  assert.equal(destinationKilled.no_kill_switch, false);
  await sql`update runtime_auth.kill_switches set active=false,cleared_at=clock_timestamp()
    where id='78000000-0000-4000-8000-000000000299'`;

  await sql`update runtime_auth.capability_grants set state='revoked'
    where principal_id=${P} and capability='slack.receive.christopher'`;
  assert.equal(result(await ingestCall(sql, { delivery: "a", message: "b" })).code, "receive_capability_denied");
  await sql`update runtime_auth.ingress_sources set mode='enabled' where id='maya-composio-slack-v1'`;
  assert.equal(result(await ingestCall(sql, { delivery: "c", message: "d", validationMode: false })).code, "receive_capability_denied");
  await sql`update runtime_auth.ingress_sources set mode='validation' where id='maya-composio-slack-v1'`;
  await sql`update runtime_auth.capability_grants set state='active'
    where principal_id=${P} and capability='slack.receive.christopher'`;
  await sql`update runtime_auth.production_gates set state='revoked' where id=${GATE_ID}`;
  assert.equal(result(await ingestCall(sql, { delivery: "e", message: "f" })).code, "production_gate_denied");
  await sql`update runtime_auth.production_gates set state='active' where id=${GATE_ID}`;
  assert.equal(result(await ingestCall(sql, { delivery: "0", message: "1", runtimeId: "78000000-0000-4000-8000-000000000999" })).code, "credential_denied");
  assert.equal(result(await ingestCall(sql, { delivery: "2", message: "3", registry: DIGEST("9") })).code, "principal_or_registry_denied");
  assert.equal(result(await ingestCall(sql, { delivery: "4", message: "5", build: "stale-build" })).code, "production_gate_denied");

  await assert.rejects(() => ingestCall(sql, { delivery: "3", message: "4", nonce: "bad" }), /base64|constraint|decode/i);
  const authorizationAfterRejectedCiphertext = await sql`select state,consumed_events from runtime_auth.activation_authorizations where id=${AUTH_ID}`;
  assert.deepEqual(authorizationAfterRejectedCiphertext[0], { state: "active", consumed_events: 0 });

  const concurrent = await Promise.all([
    ingestCall(sql, { delivery: "5", message: "6", provider: "evt_proof_a" }),
    ingestCall(sql, { delivery: "7", message: "8", provider: "evt_proof_b" }),
  ]);
  const accepted = concurrent.map(result).filter((value) => value.ok === true && value.replayed === false);
  const denied = concurrent.map(result).filter((value) => value.ok === false && value.code === "activation_authorization_denied");
  assert.equal(accepted.length, 1, "one validation event accepted");
  assert.equal(denied.length, 1, "second validation event denied");

  const claims = await Promise.all([
    sql`select public.pec78_claim_composio_slack_event(${CREDENTIAL_ID},${RUNTIME_ID},gen_random_uuid(),${BUILD}) as result`,
    sql`select public.pec78_claim_composio_slack_event(${CREDENTIAL_ID},${RUNTIME_ID},gen_random_uuid(),${BUILD}) as result`,
  ]);
  const claimResults = claims.map(result);
  assert.equal(claimResults.filter((value) => value.ok && value.empty === false).length, 1);
  assert.equal(claimResults.filter((value) => value.ok && value.empty === true).length, 1);
  const claim = claimResults.find((value) => value.empty === false);

  const reserve = result(await sql`select public.pec78_reserve_composio_slack_effect(
    ${CREDENTIAL_ID},${RUNTIME_ID},${claim.event_id},${claim.lease_id},${claim.lease_epoch},
    ${DIGEST("1")},${DIGEST("2")},${DIGEST("9")},'google/gemini-3.1-flash-lite','pec78-proof-effect',
    gen_random_uuid(),${BUILD}
  ) as result`);
  assert.equal(reserve.ok, true);
  assert.equal(reserve.state, "reserved");

  const executeAttempt = () => sql`select public.pec78_mark_composio_slack_effect_executing(
    ${CREDENTIAL_ID},${RUNTIME_ID},${reserve.effect_id},${claim.lease_id},${claim.lease_epoch},gen_random_uuid(),${BUILD}
  ) as result`;
  const authorityRaces = [
    ["credential", () => sql`update runtime_auth.credentials set state='revoked' where id=${CREDENTIAL_ROW}`,
      () => sql`update runtime_auth.credentials set state='active' where id=${CREDENTIAL_ROW}`],
    ["principal", () => sql`update runtime_auth.principals set state='suspended' where id=${P}`,
      () => sql`update runtime_auth.principals set state='active' where id=${P}`],
    ["gate", () => sql`update runtime_auth.production_gates set state='revoked' where id=${GATE_ID}`,
      () => sql`update runtime_auth.production_gates set state='active' where id=${GATE_ID}`],
    ["source", () => sql`update runtime_auth.ingress_sources set mode='revoked' where id='maya-composio-slack-v1'`,
      () => sql`update runtime_auth.ingress_sources set mode='validation' where id='maya-composio-slack-v1'`],
    ["capability", () => sql`update runtime_auth.capability_grants set state='revoked' where principal_id=${P} and capability='slack.send.christopher'`,
      () => sql`update runtime_auth.capability_grants set state='active' where principal_id=${P} and capability='slack.send.christopher'`],
    ["destination", () => sql`update runtime_auth.destination_grants set state='revoked' where id=${DESTINATION_ID}`,
      () => sql`update runtime_auth.destination_grants set state='active' where id=${DESTINATION_ID}`],
    ["budget", () => sql`update runtime_auth.activation_budgets set state='revoked' where id='pec78-maya-shadow-2026-07-26'`,
      () => sql`update runtime_auth.activation_budgets set state='active' where id='pec78-maya-shadow-2026-07-26'`],
  ];
  for (const [name, revoke, restore] of authorityRaces) {
    await revoke();
    const denied = result(await executeAttempt());
    assert.equal(denied.ok, false, `${name} revocation denied execute`);
    assert.notEqual(denied.provider_io_authorized, true, `${name} revocation denied provider I/O`);
    await restore();
  }
  for (const [scope, target] of [
    ["global", "all"], ["contract", "pec78-runtime-authorization-v1"], ["principal", P],
    ["credential", CREDENTIAL_ROW], ["capability", "slack.send.christopher"],
    ["destination", DESTINATION_ID], ["effect", reserve.effect_id],
  ]) {
    const killId = `78000000-0000-4000-8000-${String(200 + ["global", "contract", "principal", "credential", "capability", "destination", "effect"].indexOf(scope)).padStart(12, "0")}`;
    await sql`insert into runtime_auth.kill_switches(id,scope,target,reason,actor_subject)
      values(${killId},${scope},${target},'integration race','operator:integration-test')`;
    const denied = result(await executeAttempt());
    assert.equal(denied.code, "authority_killed", `${scope} kill denied execute`);
    assert.equal(denied.provider_io_authorized, false);
    await sql`update runtime_auth.kill_switches set active=false,cleared_at=clock_timestamp() where id=${killId}`;
  }
  const execute = result(await sql`select public.pec78_mark_composio_slack_effect_executing(
    ${CREDENTIAL_ID},${RUNTIME_ID},${reserve.effect_id},${claim.lease_id},${claim.lease_epoch},gen_random_uuid(),${BUILD}
  ) as result`);
  assert.equal(execute.ok, true);
  assert.equal(execute.provider_io_authorized, true);
  const replayedExecute = result(await sql`select public.pec78_mark_composio_slack_effect_executing(
    ${CREDENTIAL_ID},${RUNTIME_ID},${reserve.effect_id},${claim.lease_id},${claim.lease_epoch},gen_random_uuid(),${BUILD}
  ) as result`);
  assert.equal(replayedExecute.ok, false);
  assert.equal(replayedExecute.code, "effect_execution_ambiguous");

  const reconciled = result(await sql`select public.pec78_reconcile_composio_slack_effect(
    ${CREDENTIAL_ID},${RUNTIME_ID},${reserve.effect_id},${claim.lease_id},${claim.lease_epoch},
    'succeeded','1785200001.000002',gen_random_uuid(),${BUILD}
  ) as result`);
  assert.equal(reconciled.ok, true);
  assert.equal(reconciled.state, "succeeded");
  assert.equal(reconciled.event_state, "completed");
  const terminal = await sql`select e.state as event_state,l.state as lease_state,x.state as effect_state
    from runtime_auth.inbound_events e
    join runtime_auth.event_leases l on l.event_id=e.id
    join runtime_auth.slack_effects x on x.event_id=e.id
    where e.id=${claim.event_id}`;
  assert.deepEqual(terminal[0], { event_state: "completed", lease_state: "completed", effect_state: "succeeded" });
  const postCrashClaim = result(await sql`select public.pec78_claim_composio_slack_event(
    ${CREDENTIAL_ID},${RUNTIME_ID},gen_random_uuid(),${BUILD}
  ) as result`);
  assert.equal(postCrashClaim.empty, true, "succeeded effect/event cannot be reclaimed");

  await assert.rejects(
    () => sql`update runtime_auth.event_receipts set code='mutated' where id=(select id from runtime_auth.event_receipts limit 1)`,
    /append.only|runtime_receipts_are_append_only/i,
  );
}

async function assertRollback() {
  await sql`update runtime_auth.ingress_sources set mode='enabled' where id='maya-composio-slack-v1'`;
  await sql`update runtime_auth.activation_budgets set slack_reserved=0
    where id='pec78-maya-shadow-2026-07-26'`;
  const ingested = result(await ingestCall(sql, {
    delivery: "9", message: "a", provider: "evt_rollback_race", validationMode: false,
  }));
  assert.equal(ingested.ok, true);
  const claim = result(await sql`select public.pec78_claim_composio_slack_event(
    ${CREDENTIAL_ID},${RUNTIME_ID},gen_random_uuid(),${BUILD}
  ) as result`);
  assert.equal(claim.ok, true);
  assert.equal(claim.empty, false);
  const reserve = result(await sql`select public.pec78_reserve_composio_slack_effect(
    ${CREDENTIAL_ID},${RUNTIME_ID},${claim.event_id},${claim.lease_id},${claim.lease_epoch},
    ${DIGEST("1")},${DIGEST("2")},${DIGEST("8")},'google/gemini-3.1-flash-lite','pec78-rollback-race',
    gen_random_uuid(),${BUILD}
  ) as result`);
  assert.equal(reserve.ok, true);

  const blocker = await sql.reserve();
  let executeAfterFence;
  let rolledBack;
  try {
    await blocker`begin`;
    await blocker`select pg_advisory_xact_lock(hashtextextended('pec78_maya_runtime_transition',0))`;
    executeAfterFence = sql`select public.pec78_mark_composio_slack_effect_executing(
      ${CREDENTIAL_ID},${RUNTIME_ID},${reserve.effect_id},${claim.lease_id},${claim.lease_epoch},gen_random_uuid(),${BUILD}
    ) as result`.then((rows) => rows);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    rolledBack = result(await blocker`select public.pec78_rollback_composio_runtime(
      'operator:integration-test','PEC-78 nonproduction rollback proof',gen_random_uuid(),${BUILD}
    ) as result`);
    await blocker`commit`;
  } catch (error) {
    await blocker`rollback`;
    throw error;
  } finally {
    blocker.release();
  }
  assert.equal(rolledBack.ok, true);
  assert.equal(rolledBack.state, "fenced");
  const deniedAfterFence = result(await executeAfterFence);
  assert.equal(deniedAfterFence.ok, false);
  assert.notEqual(deniedAfterFence.provider_io_authorized, true);
  const state = await sql`select p.state as principal_state,s.mode as source_mode,
    (select count(*) from runtime_auth.activation_authorizations where state='active')::int as active_authorizations,
    (select count(*) from runtime_auth.production_gates where state='active')::int as active_gates,
    (select count(*) from runtime_auth.event_leases where state='active')::int as active_leases
    from runtime_auth.principals p join runtime_auth.ingress_sources s on s.principal_id=p.id
    where p.id=${P}`;
  assert.deepEqual(state[0], {
    principal_state: "suspended", source_mode: "revoked", active_authorizations: 0, active_gates: 0, active_leases: 0,
  });
}

try {
  await applyMigrations();
  await seedAuthority();
  await assertCatalogContract();
  await assertStateMachine();
  await assertRollback();
  process.stdout.write(JSON.stringify({
    status: "pass",
    target: expectedProjectRef,
    migrations,
    assertions: [
      "catalog_rls_grants", "ciphertext_transaction_rollback", "one_use_concurrency",
      "claim_concurrency", "ingress_authority_matrix", "reserve_execute_authority_matrix",
      "execute_kill_scope_matrix", "execute_replay_denied",
      "atomic_effect_event_completion", "terminal_reclaim_denied", "receipt_immutability",
      "exact_trigger_readiness", "destination_kill_readiness", "rollback_execute_serialization", "operator_rollback",
    ],
  }) + "\n");
} finally {
  await sql.end({ timeout: 5 });
}
