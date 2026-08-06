import { ReceiptStore } from "./core.mjs";
import {
  CADENCE_INTERVAL_MS,
  MAYA_CADENCE_STATE_DIR,
  APPROVED,
} from "./policy.mjs";
import {
  ensureCatFirstPair,
  indexLinearOrchestrations,
  listLinearIssues,
} from "./linear-orchestration.mjs";
import { recordCommandCenterIntake } from "./command-center-client.mjs";

export const CADENCE_TIME_ZONE = "America/Chicago";

export const MAYA_CADENCE_LOOPS = Object.freeze([
  {
    id: "morning-inbox-audit",
    cadence: "daily",
    hour: 7,
    minute: 0,
    weekdays: [1, 2, 3, 4, 5],
    title: "Morning inbox audit",
    workType: "accounting_intake",
    instructions: "Count unprocessed intake by category; surface aged invoices and protected HR/payroll items; prepare a concise attention list. Do not extract protected content.",
  },
  {
    id: "daily-summary",
    cadence: "daily",
    hour: 17,
    minute: 0,
    weekdays: [1, 2, 3, 4, 5],
    title: "End-of-day accounting summary",
    workType: "accounting_summary",
    instructions: "Summarize documents processed, work created, material patterns, and items needing attention. Separate facts from interpretations.",
  },
  {
    id: "vendor-aging-report",
    cadence: "weekly",
    hour: 8,
    minute: 0,
    weekdays: [1],
    title: "Vendor aging report",
    workType: "ap_aging",
    instructions: "Group open invoice work by vendor and age bucket (0-30, 31-60, 61-90, 90+). Surface unresolved items over 60 days with source freshness.",
  },
  {
    id: "document-quality-audit",
    cadence: "weekly",
    hour: 9,
    minute: 0,
    weekdays: [5],
    title: "Document quality audit",
    workType: "quality_audit",
    instructions: "Review weekly extraction confidence and corrections; identify recurring vendor/document failures; route evidence to Sam Torres for QA.",
  },
  {
    id: "vendor-onboarding-review",
    cadence: "monthly",
    hour: 9,
    minute: 0,
    dayOfMonth: 1,
    title: "Vendor onboarding review",
    workType: "vendor_review",
    instructions: "List first-seen vendors, verify agreement evidence, and flag vendors without current price agreements. Never infer an agreement from an email alone.",
  },
  {
    id: "extraction-accuracy-report",
    cadence: "monthly",
    hour: 10,
    minute: 0,
    dayOfMonth: 1,
    title: "Extraction accuracy report",
    workType: "quality_report",
    instructions: "Compare Maya-created work against human corrections; calculate accuracy by document type; route the evidence packet to Sam Torres.",
  },
  {
    id: "vendor-relationship-audit",
    cadence: "quarterly",
    hour: 9,
    minute: 0,
    dayOfMonth: 1,
    months: [1, 4, 7, 10],
    title: "Top-20 vendor relationship audit",
    workType: "vendor_audit",
    instructions: "Review top vendors by invoice volume, extraction failures, and recurring price discrepancies; route supported patterns to Alex and Jordan.",
  },
  {
    id: "intake-system-review",
    cadence: "annual",
    hour: 9,
    minute: 0,
    dayOfMonth: 15,
    months: [1],
    title: "Annual accounting intake system review",
    workType: "system_review",
    instructions: "Produce year-over-year accuracy, vendor, and document-volume trends; propose alias/process changes for Dev Conductor review without applying them.",
  },
]);

function zonedParts(now) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: CADENCE_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(values.weekday);
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function occurrencePeriod(loop, parts) {
  const date = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  if (loop.cadence === "daily" || loop.cadence === "weekly") return date;
  if (loop.cadence === "monthly") return date.slice(0, 7);
  if (loop.cadence === "quarterly") return `${parts.year}-Q${Math.floor((parts.month - 1) / 3) + 1}`;
  return String(parts.year);
}

export function dueCadenceOccurrences(now = new Date()) {
  const parts = zonedParts(now);
  return MAYA_CADENCE_LOOPS
    .filter((loop) => loop.hour === parts.hour && loop.minute === parts.minute)
    .filter((loop) => !loop.weekdays || loop.weekdays.includes(parts.weekday))
    .filter((loop) => !loop.dayOfMonth || loop.dayOfMonth === parts.day)
    .filter((loop) => !loop.months || loop.months.includes(parts.month))
    .map((loop) => ({ loop, period: occurrencePeriod(loop, parts) }));
}

export async function runCadenceTick({
  composio,
  store,
  signal,
  expected = APPROVED,
  onEvent = () => {},
  now = new Date(),
  recordIntake = recordCommandCenterIntake,
}) {
  const due = dueCadenceOccurrences(now);
  if (due.length === 0) return { state: "idle", due: 0, created: 0 };
  const known = indexLinearOrchestrations(await listLinearIssues(composio, signal, expected));
  let created = 0;
  for (const { loop, period } of due) {
    const sourceKeys = [`recurring:${loop.id}:${period}`];
    const claim = await store.claim(sourceKeys[0], {
      actorId: "maya-chen",
      channelId: "linear",
      triggerId: loop.id,
    });
    if (!claim.claimed) continue;
    try {
      const pair = await ensureCatFirstPair({
        composio,
        sourceKeys,
        knownIndex: known,
        buildSourceArguments: (keys) => ({
          team_id: expected.linearSourceTeamId,
          project_id: expected.linearSourceProjectId,
          parent_id: expected.linearSourceParentId,
          state_id: expected.linearSourceTodoStateId,
          assignee_id: expected.linearReviewerId,
          title: `[Maya loop][${loop.cadence}] ${loop.title} — ${period}`.slice(0, 140),
          priority: 3,
          description: [
            "Maya CAT source: true",
            ...keys.map((key) => `Maya source key: ${key}`),
            "Source channel: recurring",
            `Cadence: ${loop.cadence}`,
            `Time zone: ${CADENCE_TIME_ZONE}`,
            `Occurrence: ${period}`,
            "",
            "## Assignment",
            loop.instructions,
            "",
            "## Audit contract",
            "All work and results must remain linked to this CAT source. Financial mutations and external sends remain human-gated.",
          ].join("\n"),
        }),
        buildWorkArguments: ({ source, sourceKeys: keys }) => ({
          team_id: expected.linearWorkTeamId,
          parent_id: source.id,
          state_id: expected.linearWorkTodoStateId,
          assignee_id: expected.linearReviewerId,
          title: `[MAYA][${loop.cadence}] ${loop.title} — ${period}`.slice(0, 140),
          priority: 3,
          description: [
            "[MAYA] Governed recurring accounting work",
            `CAT source issue: ${source.reference}`,
            ...keys.map((key) => `Maya source key: ${key}`),
            "Maya execution gate: Agent Todo",
            `Maya work type: ${loop.workType}`,
            `Cadence time zone: ${CADENCE_TIME_ZONE}`,
            "",
            "## Work",
            loop.instructions,
            "",
            "## Completion rule",
            "Attach evidence and leave the issue in Agent Review. Do not promote prices, decide credit memos, edit WIP/AR, send externally, or mutate QuickBooks without the applicable human approval gate.",
          ].join("\n"),
        }),
        signal,
        expected,
        onConfirmed: (action, providerReference) => store.recordAction(claim.name, action, providerReference),
      });
      const intake = await recordIntake({
        payload: {
          messageId: sourceKeys[0],
          externalEventId: sourceKeys[0],
          sourceChannel: "recurring",
          sourceThreadId: loop.id,
          orchestrationKey: sourceKeys[0],
          catSourceIssue: pair.source.reference,
          downstreamIssue: pair.work.reference,
          alias: "recurring",
          classification: "unknown",
          subject: `${loop.title} — ${period}`,
          from: "maya-chen",
          receivedAt: now.toISOString(),
          attachments: [],
          gmailLabels: [],
          slackChannelId: "",
          slackThreadTs: "",
        },
        signal,
        expected,
      });
      await store.recordAction(claim.name, "command_center_intake", intake.providerReference);
      await store.confirm(claim.name, pair.work.id, "linear-cadence-v1");
      created += pair.created ? 1 : 0;
      onEvent("cadence_occurrence_confirmed", { cadence: loop.cadence, loop_id: loop.id });
    } catch (error) {
      await store.ambiguous(claim.name, error?.name ?? "Error");
      onEvent("cadence_occurrence_ambiguous", { cadence: loop.cadence, loop_id: loop.id, error_class: error?.name ?? "Error" });
    }
  }
  return { state: "complete", due: due.length, created };
}

export async function startCadenceExecutor({
  composio,
  expected = APPROVED,
  onEvent = () => {},
  stateDirectory = MAYA_CADENCE_STATE_DIR,
}) {
  const controller = new AbortController();
  const store = new ReceiptStore(stateDirectory);
  await store.initialize();
  let timer;
  let active = Promise.resolve();
  let stopped = false;
  const schedule = () => {
    if (stopped) return;
    const delay = CADENCE_INTERVAL_MS - (Date.now() % CADENCE_INTERVAL_MS) + 250;
    timer = setTimeout(run, delay);
  };
  const run = () => {
    if (stopped) return;
    active = runCadenceTick({ composio, store, signal: controller.signal, expected, onEvent })
      .catch((error) => onEvent("cadence_tick_failed", { error_class: error?.name ?? "Error" }))
      .finally(schedule);
  };
  schedule();
  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      controller.abort();
      await active;
    },
  };
}
