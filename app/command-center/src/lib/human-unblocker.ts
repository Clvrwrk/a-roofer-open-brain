import type { WorkQueueDecision } from "@lib/access-control";
import type { DepartmentId } from "@lib/cadence";
import { formatApproval, formatStatus, type LiveWorkItem } from "@lib/live-work";

export type HumanActionTone = "primary" | "secondary" | "ghost" | "danger";

export interface HumanAction {
  label: string;
  decision: WorkQueueDecision;
  intent: string;
  outcome: string;
  tone: HumanActionTone;
}

export interface TransparencyFact {
  label: string;
  value: string;
}

export interface HumanUnblockerItem {
  id: string;
  workKey: string;
  title: string;
  department: DepartmentId;
  workflow: string;
  primaryHuman: string;
  priority: LiveWorkItem["priority"];
  status: string;
  valueLabel: string;
  sourceLabel: string;
  sourceHref: string;
  stuckBecause: string;
  recommendation: string;
  requiredResponse: string;
  agentNextStep: string;
  evidencePacket: string[];
  transparency: TransparencyFact[];
  actions: HumanAction[];
  raw: LiveWorkItem;
}

export interface HumanDashboardLane {
  label: string;
  owner: string;
  task: string;
  stopCondition: string;
  doneCondition: string;
}

export interface HumanDashboardPlan {
  label: string;
  primaryHuman: string;
  coreTask: string;
  agentBoundary: string;
  doneSignal: string;
  slackRule: string;
  lanes: HumanDashboardLane[];
}

type WorkflowProfile = {
  stuckBecause: (work: LiveWorkItem) => string;
  recommendation: (work: LiveWorkItem) => string;
  requiredResponse: (work: LiveWorkItem) => string;
  nextStep: (work: LiveWorkItem) => string;
  actions?: (work: LiveWorkItem) => HumanAction[];
};

const MONEY_FORMATTER = new Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 0, style: "currency" });

const DEPARTMENT_PLANS: Record<DepartmentId, HumanDashboardPlan> = {
  accounting: {
    agentBoundary:
      "Agents draft packets and assemble evidence. Lucinda sends external accounting email, Roberto approves margin/pricing gates, and Chris verifies escalations.",
    coreTask:
      "Protect margin by matching every invoice and order against the correct price agreement, requesting credit memos for variance, and blocking payment until evidence is complete.",
    doneSignal:
      "Invoice released only after pricing is verified, any credit memo is issued or tracked, and the packet has a durable dashboard action.",
    label: "Accounting Human Loop",
    lanes: [
      {
        doneCondition: "No variance, or credit memo packet approved and tracked until issued.",
        label: "Invoice Price Gate",
        owner: "Lucinda",
        stopCondition: "Invoice line lacks agreement coverage, has a variance, or the source row is unresolved.",
        task: "Review invoice against price agreement and decide whether payment can move.",
      },
      {
        doneCondition: "Branch agreement coverage is verified or the missing-agreement request is sent by Lucinda.",
        label: "Price Agreement Coverage",
        owner: "Roberto / Chris",
        stopCondition: "SKU, UOM, branch, region, date window, or agreement authority is missing.",
        task: "Approve the pricing fix or request a current agreement for the branch within the office drive radius.",
      },
      {
        doneCondition: "Post-job packet archived with all links and review outcome.",
        label: "Job Costing Packet",
        owner: "Roberto / Lucinda",
        stopCondition: "Roberto approves the job and agents need final profitability evidence assembled.",
        task: "Review the connected job packet and keep guardrail notes for the two-year historical review.",
      },
    ],
    primaryHuman: "Lucinda",
    slackRule: "Dashboard is source of truth. Slack mirrors packet/action ids for Lucinda, Roberto, and Chris.",
  },
  operations: {
    agentBoundary:
      "Agents detect readiness gaps and draft internal messages. Roberto is the human gate for job readiness, scheduling, crew, material, and pre-production gaps.",
    coreTask:
      "Prevent jobs from moving forward until prerequisites, deposits, contracts, estimates, materials, crew, permits, and field documentation are complete.",
    doneSignal: "Job moves only when all prerequisites are complete and Roberto marks it approved.",
    label: "Operations Human Loop",
    lanes: [
      {
        doneCondition: "Prerequisites complete, deposit collected, estimate within tolerance, Roberto approved.",
        label: "Pre-Production Gate",
        owner: "Roberto",
        stopCondition: "Accepted proposal is ready to move but one required prerequisite is incomplete.",
        task: "Approve ready status or push the missing prerequisite into the daily gap queue.",
      },
      {
        doneCondition: "Delivery, branch/vendor, shortage check, and scope match are verified.",
        label: "Material Readiness",
        owner: "Roberto",
        stopCondition: "Material order, price agreement, delivery, or scope match is not proven.",
        task: "Confirm the material packet before production changes.",
      },
      {
        doneCondition: "Schedule move, crew assignment, or daily gap is recorded.",
        label: "Schedule And Crew",
        owner: "Roberto",
        stopCondition: "Crew, permit, inspection, weather, dumpster, customer confirmation, or field proof blocks execution.",
        task: "Approve schedule action or ask the agent for the missing fact.",
      },
    ],
    primaryHuman: "Roberto",
    slackRule: "Agents do not message crews, subs, vendors, or customers directly. Slack mirrors drafts for humans.",
  },
  sales: {
    agentBoundary:
      "Agents draft follow-up, estimates, contracts, and field-info requests. Roberto decides movement when a client accepts and is ready to pay.",
    coreTask:
      "Move accepted prospects into production only after contracts, deposits, margin tolerance, and required claim/field documentation are complete.",
    doneSignal: "Contracts signed and deposit collected, with field documentation validated.",
    label: "Sales Human Loop",
    lanes: [
      {
        doneCondition: "Required claim and field facts are attached or sent back to field sales.",
        label: "Claim Intake",
        owner: "Roberto",
        stopCondition: "Claim number, carrier, adjuster, DOL, deductible, photos, measurements, or scope is missing.",
        task: "Approve follow-up or request field information.",
      },
      {
        doneCondition: "Proposal accepted, contract drafted, and deposit path ready.",
        label: "Estimate To Contract",
        owner: "Roberto",
        stopCondition: "Client is ready but contract/deposit/margin evidence is not complete.",
        task: "Authorize the contract packet or send it back for evidence.",
      },
      {
        doneCondition: "Customer contact is approved by a human or no contact is sent.",
        label: "Customer Follow-Up",
        owner: "Roberto",
        stopCondition: "The next customer message requires human review.",
        task: "Approve the drafted follow-up, mark lost, or escalate claim work.",
      },
    ],
    primaryHuman: "Roberto",
    slackRule: "Agents draft customer emails, texts, and contracts. Humans send.",
  },
  marketing: {
    agentBoundary:
      "Marketing agents may execute research and production tasks, but Chris approves publication and spend.",
    coreTask:
      "Produce weekly social and web campaigns, review requests, local SEO proof, storm/hail targeting, and field asset workflows without unapproved spend or publication.",
    doneSignal: "Chris approves publish/spend, or the agent keeps work internal.",
    label: "Marketing Human Loop",
    lanes: [
      {
        doneCondition: "Chris approves market activation or asks for more proof.",
        label: "Storm And Hail Activation",
        owner: "Chris",
        stopCondition: "Campaign market, budget, or public activation needs approval.",
        task: "Approve the market action or request supporting proof.",
      },
      {
        doneCondition: "Assets are publishable or sent back to field collection.",
        label: "Proof Assets",
        owner: "Chris",
        stopCondition: "Photos, reviews, badges, or release state is missing.",
        task: "Approve publish, request assets, or reject the packet.",
      },
      {
        doneCondition: "Weekly web/social campaign is approved or returned for edits.",
        label: "Campaign Output",
        owner: "Chris",
        stopCondition: "External publication or revenue spend is proposed.",
        task: "Approve publish/spend or keep the agent internal.",
      },
    ],
    primaryHuman: "Chris",
    slackRule: "Slack mirrors all marketing decisions. Only Chris approves publication or spend.",
  },
  executive: {
    agentBoundary:
      "Executive agents report and escalate. Chris controls strategy, spend, hiring, customer, SOP, vendor, and automation gates.",
    coreTask:
      "See cross-department constraints, cash/margin risk, throughput, capacity, agent performance, and process changes without department clutter.",
    doneSignal: "Chris approves, assigns, or escalates the constraint and the department owner continues.",
    label: "Executive Human Loop",
    lanes: [
      {
        doneCondition: "Constraint assigned to a department owner or escalated with a report.",
        label: "Strategic Constraint",
        owner: "Chris",
        stopCondition: "A blocker crosses department boundaries or affects cash, margin, capacity, or customer risk.",
        task: "Approve, assign, or escalate the executive constraint.",
      },
      {
        doneCondition: "Repeated blocker promoted to SOP/process-change candidate or suppressed.",
        label: "SOP Reduction",
        owner: "Chris / QC",
        stopCondition: "Same issue and solution repeat enough to reduce human workload.",
        task: "Decide whether agents should automate or standardize the repeated task.",
      },
      {
        doneCondition: "Agent performance issue routed to System, QC, or department owner.",
        label: "Agent Performance",
        owner: "Chris",
        stopCondition: "An agent is stuck, noisy, stale, or blocked by source truth.",
        task: "Authorize the next recovery path.",
      },
    ],
    primaryHuman: "Chris",
    slackRule: "Full Slack mirror for now. Dashboard remains the source of truth.",
  },
  system: {
    agentBoundary:
      "Horizontal agents self-heal where safe, then report failures with source evidence. Auditor can stop work; QC promotes standards.",
    coreTask:
      "Keep syncs, Slack mirrors, dashboard state, memory, repo hygiene, and source trust healthy enough for department decisions.",
    doneSignal: "Failure is self-healed, trusted, suppressed with reason, or escalated to Executive.",
    label: "System Human Loop",
    lanes: [
      {
        doneCondition: "Sync retry succeeds or stale data remains blocked with an executive report.",
        label: "Source Freshness",
        owner: "Conductor / Maintenance",
        stopCondition: "API sync, webhook, mirror, or data freshness failure can corrupt a dashboard decision.",
        task: "Retry, mark trusted, request verification, or escalate.",
      },
      {
        doneCondition: "Pattern is accepted as SOP fix, assigned, or rejected.",
        label: "QC Pattern",
        owner: "Auditor / QC",
        stopCondition: "Same blocker and solution repeat enough to become a standard.",
        task: "Create a process fix or keep the case as one-off evidence.",
      },
      {
        doneCondition: "Workspace cleanup report is accepted or routed to Executive.",
        label: "Maintenance",
        owner: "Maintenance",
        stopCondition: "Repo, archive, import, or generated-cache hygiene needs human-visible action.",
        task: "Approve cleanup, request a report, or escalate.",
      },
    ],
    primaryHuman: "Conductor / Auditor",
    slackRule: "Everything mirrors to Slack until Chris narrows the noise.",
  },
};

const COMPANY_PLAN: HumanDashboardPlan = {
  agentBoundary:
    "Agents work until they hit a gate that requires a human answer, source trust, external send, spend, publication, or approval.",
  coreTask:
    "Give each human the smallest possible decision packet that unblocks agents while preserving full source transparency behind expanders.",
  doneSignal: "The dashboard writes the decision first, mirrors Slack second, and records memory for future SOP reduction.",
  label: "Company Human Loop",
  lanes: [
    {
      doneCondition: "Accounting packet approved, fixed, sent, received, or released.",
      label: "Accounting",
      owner: "Lucinda / Roberto / Chris",
      stopCondition: "Pricing, credit memo, margin, QB question, or close evidence blocks the agent.",
      task: "Protect invoice payment and margin gates.",
    },
    {
      doneCondition: "Readiness, field, material, crew, or schedule blocker is decided.",
      label: "Operations And Sales",
      owner: "Roberto",
      stopCondition: "A job or accepted proposal cannot move without human approval or missing field facts.",
      task: "Move work forward only when prerequisites are complete.",
    },
    {
      doneCondition: "Campaign, spend, source trust, SOP, or strategy gate is decided.",
      label: "Marketing / Executive / System",
      owner: "Chris / Conductor / Auditor",
      stopCondition: "Public action, revenue spend, cross-department risk, or stale data needs a human.",
      task: "Approve the right external, strategic, or infrastructure action.",
    },
  ],
  primaryHuman: "All humans in the loop",
  slackRule: "Dashboard is source. Slack is mirror. Memory records preserve the learning loop.",
};

function moneyLabel(value: number) {
  return value ? MONEY_FORMATTER.format(value) : "No direct dollar exposure";
}

function action(
  label: string,
  decision: WorkQueueDecision,
  intent: string,
  outcome: string,
  tone: HumanActionTone = "secondary",
): HumanAction {
  return { decision, intent, label, outcome, tone };
}

function defaultActions(work: LiveWorkItem): HumanAction[] {
  const actions: HumanAction[] = [];
  if (work.approval !== "none") {
    actions.push(action("Approve Gate", "approve", "approve_gate", "Owning agent may continue from this approved gate.", "primary"));
  }
  actions.push(
    action("Needs Info", "needs_more_evidence", "needs_info", "Owning agent must return with a tighter evidence packet."),
    action("Resume Agent", "resume_agent", "resume_agent", "Owning agent continues with the current evidence and your note."),
    action("Mark Complete", "mark_done", "mark_complete", "Work item is closed with this dashboard action."),
  );
  if (work.approval !== "none") {
    actions.push(action("Reject", "reject", "reject_packet", "Owning agent closes or rebuilds the packet.", "danger"));
  }
  return actions;
}

function accountingActions(work: LiveWorkItem): HumanAction[] {
  if (work.workflow === "price-agreement-gap") {
    return [
      action("Approve Pricing Fix", "approve", "approve_pricing_fix", "Pricing fix becomes the next evidence step for the agent.", "primary"),
      action("Needs Agreement", "needs_more_evidence", "request_price_agreement", "Agent drafts the missing price agreement request for Lucinda."),
      action("Send To Lucinda", "resume_agent", "route_to_lucinda", "Conductor mirrors the packet to Lucinda for human send."),
      action("Reject Match", "reject", "reject_pricing_match", "Agent keeps the invoice blocked and rebuilds the match.", "danger"),
    ];
  }

  return [
    action("Approve Packet", "approve", "approve_accounting_packet", "Agent may advance the invoice, credit memo, or review queue path.", "primary"),
    action("Needs Fix", "needs_more_evidence", "needs_accounting_fix", "Agent adds invoice, order, agreement, or PDF evidence."),
    action("Send To Lucinda", "resume_agent", "route_to_lucinda", "Conductor mirrors the verified draft to Lucinda."),
    action("Mark Sent", "external_sent", "external_email_sent", "Agent tracks the outside-party response."),
    action("Credit Received", "external_received", "credit_memo_received", "Agent releases the next invoice/payment gate."),
    action("Reject", "reject", "reject_accounting_packet", "Agent keeps the item blocked and rebuilds the packet.", "danger"),
  ];
}

function operationsActions() {
  return [
    action("Approve Ready", "approve", "approve_job_ready", "Operations agent can advance the job readiness state.", "primary"),
    action("Needs Info", "needs_more_evidence", "needs_ops_fact", "Agent adds the missing prerequisite to the daily gap queue."),
    action("Authorize Internal Message", "resume_agent", "authorize_internal_message", "Agent drafts the internal handoff for Roberto's channel."),
    action("Mark Complete", "mark_done", "mark_ops_complete", "The blocker is closed with this action."),
    action("Escalate", "assign", "escalate_ops", "Conductor routes the item to Executive or the right department owner."),
  ];
}

function salesActions() {
  return [
    action("Approve Follow-Up", "approve", "approve_sales_follow_up", "Sales agent may continue with the approved follow-up path.", "primary"),
    action("Needs Field Info", "needs_more_evidence", "needs_field_info", "Agent requests missing field documentation from the sales team."),
    action("Draft Contract", "resume_agent", "draft_contract", "Agent prepares the contract packet for human send."),
    action("Mark Lost", "reject", "mark_lost", "Agent records loss context and removes it from active follow-up.", "danger"),
    action("Move Stage", "mark_done", "move_sales_stage", "Agent marks the current stage task complete."),
  ];
}

function marketingActions() {
  return [
    action("Approve Publish", "approve", "approve_publish_or_spend", "Marketing agent may publish or spend within this approved packet.", "primary"),
    action("Needs Asset", "needs_more_evidence", "needs_marketing_asset", "Agent asks field or media owner for the missing asset."),
    action("Draft Campaign", "resume_agent", "draft_campaign", "Agent continues campaign drafting without publishing."),
    action("Reject", "reject", "reject_marketing_packet", "Agent archives or rewrites the marketing packet.", "danger"),
  ];
}

function executiveActions(work: LiveWorkItem) {
  const actions = work.approval === "none"
    ? [
        action("Assign Owner", "assign", "assign_constraint_owner", "Conductor routes the constraint to the selected owner.", "primary"),
        action("Needs Report", "needs_more_evidence", "needs_executive_report", "Agent returns with a sharper executive report."),
      ]
    : [
        action("Approve Gate", "approve", "approve_executive_gate", "Agent may proceed through the executive gate.", "primary"),
        action("Needs Report", "needs_more_evidence", "needs_executive_report", "Agent returns with a sharper executive report."),
      ];

  return [
    ...actions,
    action("Create SOP Fix", "resume_agent", "create_sop_fix", "QC/Conductor converts the repeated blocker into a process fix candidate."),
    action("Mark Complete", "mark_done", "mark_executive_complete", "The executive review item is closed."),
  ];
}

function systemActions() {
  return [
    action("Retry Sync", "resume_agent", "retry_sync", "Maintenance or Conductor attempts the safe recovery path.", "primary"),
    action("Mark Source Trusted", "approve", "mark_source_trusted", "Dependent dashboards may trust the source after this gate."),
    action("Request Verification", "needs_more_evidence", "request_human_verification", "Agent returns with a source trust packet."),
    action("Create SOP Fix", "assign", "create_system_sop_fix", "QC receives a process-change candidate."),
    action("Suppress Noise", "snooze", "suppress_noise", "Conductor suppresses this item until a new source change."),
  ];
}

const WORKFLOW_PROFILES: Record<string, WorkflowProfile> = {
  "abc-review": {
    actions: accountingActions,
    nextStep: (work) => `Accounting agent updates the ABC review path, mirrors Slack, and keeps invoice ${work.evidence} blocked or released based on the decision.`,
    recommendation: (work) => `Start with the highest-value unresolved ABC source row and decide whether Lucinda has enough invoice/order/agreement evidence to move it.`,
    requiredResponse: () => "Approve the packet, request the missing evidence, route to Lucinda, mark an outside send/receipt, or reject the packet.",
    stuckBecause: (work) => `The ABC review queue row is unresolved: ${work.detail}`,
  },
  "price-agreement-gap": {
    actions: accountingActions,
    nextStep: (work) => `Agent applies the approved pricing path, drafts any missing-agreement email for Lucinda, and keeps the invoice blocked until coverage is proven.`,
    recommendation: (work) => work.action || "Verify product, UOM, branch, agreement date, and variance before invoice payment.",
    requiredResponse: () => "Roberto/Chris confirm the pricing fix or Lucinda gets a request packet for the missing price agreement.",
    stuckBecause: (work) => `Invoice pricing cannot be trusted until this price agreement gap is resolved: ${work.detail}`,
  },
  "invoice-payment-gate": {
    actions: accountingActions,
    nextStep: () => "Accounting agent keeps the invoice blocked, releases it, or drafts the missing evidence request after Lucinda's decision.",
    recommendation: (work) => `Verify pricing agreement coverage, extraction status, and any payment block before Lucinda releases this invoice.`,
    requiredResponse: () => "Lucinda approves the gate, asks for invoice/order/agreement evidence, routes a verified packet, or rejects release.",
    stuckBecause: (work) => `The invoice is not ready for payment: ${work.detail}`,
  },
  "credit-memo-issued": {
    actions: accountingActions,
    nextStep: () => "Accounting agent matches the credit memo to the open packet/original invoice and releases the related invoice gate after Lucinda verifies it.",
    recommendation: (work) => `Match this ABC credit memo against the original invoice, original order, and price agreement before any payment release.`,
    requiredResponse: () => "Lucinda confirms the credit memo is received/matched, requests a fix, or rejects the match.",
    stuckBecause: (work) => `A credit memo exists in ABC but still needs human matching: ${work.detail}`,
  },
  "job-costing-review": {
    actions: accountingActions,
    nextStep: () => "Accounting agent assembles the connected job packet, archives the review, and preserves facts for the future margin guardrail study.",
    recommendation: () => "Review the connected job evidence without inventing profit guardrails; use Roberto approval and source paperwork as the current gate.",
    requiredResponse: () => "Roberto approves the post-job packet, asks for missing paperwork, or escalates the job for close review.",
    stuckBecause: (work) => `The job needs accounting closeout/job-costing evidence before archive: ${work.detail}`,
  },
  "sales-follow-up": {
    actions: salesActions,
    nextStep: () => "Sales agent drafts the follow-up, contract, stage movement, or field-info request for Roberto to send or approve.",
    recommendation: (work) => `Prioritize this opportunity because the source row shows ${work.evidence}.`,
    requiredResponse: () => "Roberto approves follow-up, asks for field facts, drafts contract, marks lost, or moves the stage.",
    stuckBecause: (work) => `The customer/prospect path is waiting on a human-reviewed next step: ${work.detail}`,
  },
  "claim-intake": {
    actions: salesActions,
    nextStep: () => "Sales agent requests missing claim/field facts or drafts the next claim follow-up for human send.",
    recommendation: () => "Validate claim facts before customer or carrier-facing action: carrier, claim number, DOL, deductible, photos, measurements, and scope.",
    requiredResponse: () => "Roberto approves follow-up, asks field sales for facts, escalates the claim, or marks it lost.",
    stuckBecause: (work) => `Insurance claim intake is incomplete or awaiting review: ${work.detail}`,
  },
  "contract-deposit-gate": {
    actions: salesActions,
    nextStep: () => "Sales agent prepares the contract/deposit handoff or returns missing prerequisites to the daily gap list.",
    recommendation: () => "Move forward only when contracts are signed, deposit is collected, margin tolerance is acceptable, and Roberto approves.",
    requiredResponse: () => "Roberto approves the handoff, asks for field info, drafts contract, or blocks stage movement.",
    stuckBecause: (work) => `Accepted/approved CRM work needs contract and deposit validation: ${work.detail}`,
  },
  "call-priority": {
    actions: salesActions,
    nextStep: () => "Sales agent turns the approved priority into a field/customer action draft.",
    recommendation: (work) => `Use the call-priority source signals before outreach: ${work.evidence}.`,
    requiredResponse: () => "Approve outreach, ask for missing field proof, or remove the call from active work.",
    stuckBecause: (work) => `The agent needs a human decision before customer contact: ${work.detail}`,
  },
  "pre-prospect-readiness": {
    actions: operationsActions,
    nextStep: () => "Operations agent adds missing field prerequisites to the daily gap task list or prepares the handoff packet.",
    recommendation: () => "Clear estimate, contract, field documentation, and prerequisite gaps before the work reaches production readiness.",
    requiredResponse: () => "Roberto approves readiness, asks for missing facts, authorizes an internal message, or escalates.",
    stuckBecause: (work) => `Pre-production information is incomplete: ${work.detail}`,
  },
  "production-readiness": {
    actions: operationsActions,
    nextStep: () => "Operations agent advances readiness, assigns the internal handoff, or keeps the job blocked in the daily gap task list.",
    recommendation: (work) => `Confirm production readiness only if prerequisites, deposit, estimate tolerance, and Roberto approval are complete.`,
    requiredResponse: () => "Roberto approves ready, asks for missing facts, authorizes an internal message, or escalates.",
    stuckBecause: (work) => `The job cannot safely move forward until readiness is confirmed: ${work.detail}`,
  },
  "fleet-data-gap": {
    actions: operationsActions,
    nextStep: () => "Operations agent records the data fix and keeps related decisions blocked until the gap is closed.",
    recommendation: (work) => `Treat this as a daily gap task because the source says ${work.evidence}.`,
    requiredResponse: () => "Approve the fix, request the missing fact, or escalate the source gap.",
    stuckBecause: (work) => `A missing operations fact blocks reliable execution: ${work.detail}`,
  },
  "fleet-variance": {
    actions: operationsActions,
    nextStep: () => "Operations agent records whether this was an exception, training issue, or data problem.",
    recommendation: (work) => `Review the variance before any payroll, vendor, or operations-facing action.`,
    requiredResponse: () => "Approve resolution, ask for evidence, or escalate the variance.",
    stuckBecause: (work) => `A variance alert needs human classification: ${work.detail}`,
  },
  "hail-market-activation": {
    actions: marketingActions,
    nextStep: () => "Marketing agent drafts or publishes only inside Chris-approved market/spend boundaries.",
    recommendation: (work) => `Use the hail heat-zone signals to decide whether this market gets campaign attention now.`,
    requiredResponse: () => "Chris approves publish/spend, requests assets, drafts internally, or rejects the campaign packet.",
    stuckBecause: (work) => `The marketing agent needs publication or market approval: ${work.detail}`,
  },
  "executive-pipeline-readout": {
    actions: executiveActions,
    nextStep: () => "Conductor routes the executive constraint to the department owner or creates an SOP-improvement candidate.",
    recommendation: (work) => `Review this constraint in the executive queue because it carries ${moneyLabel(work.valueAtRisk)} of visible source-backed value.`,
    requiredResponse: () => "Chris assigns an owner, asks for a report, creates an SOP fix, or closes the review.",
    stuckBecause: (work) => `This cross-department constraint is visible in the executive pipeline: ${work.detail}`,
  },
  "runtime-escalation": {
    actions: systemActions,
    nextStep: () => "Maintenance attempts safe self-heal, then Conductor blocks dependent dashboards until source trust is restored.",
    recommendation: () => "Treat stale or failed syncs as blockers before humans rely on downstream department dashboards.",
    requiredResponse: () => "Retry sync, mark source trusted, request verification, create SOP fix, or suppress noise.",
    stuckBecause: (work) => `Runtime freshness is blocking trusted decisions: ${work.detail}`,
  },
  "sync-health": {
    actions: systemActions,
    nextStep: () => "Maintenance retries or reports the failure, and Auditor keeps dependent decisions stopped when source truth is stale.",
    recommendation: () => "Fix or explicitly trust the source before department dashboards consume it.",
    requiredResponse: () => "Retry sync, mark source trusted, request verification, create SOP fix, or suppress noise.",
    stuckBecause: (work) => `A sync monitor is unhealthy: ${work.detail}`,
  },
  "memory-record-health": {
    actions: systemActions,
    nextStep: () => "Maintenance installs or reports the memory sidecar gap; dashboard decisions continue carrying the full memory JSON in action payloads until sidecar tables exist.",
    recommendation: () => "Install the OB1 memory sidecar so dashboard decisions become governed recall/write-back records, not only action-log payloads.",
    requiredResponse: () => "Conductor/Auditor confirms source trust, retries schema deployment, or escalates to Executive.",
    stuckBecause: (work) => `Governed memory write-back is not fully live: ${work.detail}`,
  },
};

function profileFor(work: LiveWorkItem): WorkflowProfile {
  return WORKFLOW_PROFILES[work.workflow] ?? {
    actions: defaultActions,
    nextStep: () => "Owning agent uses the decision, mirrors Slack, and writes the memory record for future SOP reduction.",
    recommendation: (item) => item.action,
    requiredResponse: (item) => `Human response required from ${item.primaryHuman}.`,
    stuckBecause: (item) => item.detail,
  };
}

export function getHumanDashboardPlan(department?: DepartmentId): HumanDashboardPlan {
  return department ? DEPARTMENT_PLANS[department] : COMPANY_PLAN;
}

export function toHumanUnblockerItem(work: LiveWorkItem): HumanUnblockerItem {
  const profile = profileFor(work);
  const actions = profile.actions?.(work) ?? defaultActions(work);
  const evidencePacket = [
    work.evidence,
    `Source: ${work.sourceLabel}`,
    `Source row: ${work.sourceTable} / ${work.sourcePk}`,
    ...work.auditTrail,
  ];

  return {
    actions,
    agentNextStep: profile.nextStep(work),
    department: work.department,
    evidencePacket,
    id: work.id,
    primaryHuman: work.primaryHuman,
    priority: work.priority,
    raw: work,
    recommendation: profile.recommendation(work),
    requiredResponse: profile.requiredResponse(work),
    sourceHref: work.href,
    sourceLabel: work.sourceLabel,
    status: formatStatus(work.status),
    stuckBecause: profile.stuckBecause(work),
    title: work.title,
    transparency: [
      { label: "Work key", value: work.workKey },
      { label: "Workflow", value: work.workflow },
      { label: "Department", value: work.department },
      { label: "Owner", value: work.owner },
      { label: "Primary human", value: work.primaryHuman },
      { label: "Cadence", value: work.cadence },
      { label: "Next run", value: work.nextRun },
      { label: "Status", value: formatStatus(work.status) },
      { label: "Priority", value: work.priority },
      { label: "Approval", value: formatApproval(work.approval) },
      { label: "Auditor required", value: work.auditorRequired ? "Yes" : "No" },
      { label: "Value at risk", value: moneyLabel(work.valueAtRisk) },
      { label: "Source label", value: work.sourceLabel },
      { label: "Source table", value: work.sourceTable },
      { label: "Source row ID", value: work.sourcePk },
      { label: "Source URL", value: work.href },
    ],
    valueLabel: moneyLabel(work.valueAtRisk),
    workflow: work.workflow,
    workKey: work.workKey,
  };
}

export function buildAutomationCandidates(items: HumanUnblockerItem[]) {
  const counts = new Map<string, { department: DepartmentId; workflow: string; count: number; owner: string }>();
  for (const item of items) {
    const current = counts.get(item.workflow) ?? {
      count: 0,
      department: item.department,
      owner: item.primaryHuman,
      workflow: item.workflow,
    };
    current.count += 1;
    counts.set(item.workflow, current);
  }
  return Array.from(counts.values())
    .filter((item) => item.count >= 3)
    .sort((a, b) => b.count - a.count);
}
