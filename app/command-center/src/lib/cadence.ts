export type DepartmentId =
  | "accounting"
  | "operations"
  | "sales"
  | "marketing"
  | "executive"
  | "system";

export type CadenceId = "daily" | "weekly" | "monthly" | "quarterly" | "annual" | "ad-hoc";

export type WorkStatus =
  | "scheduled"
  | "queued"
  | "running"
  | "needs_review"
  | "blocked"
  | "done";

export type ApprovalState = "none" | "before_write" | "before_external" | "always";

export interface Department {
  id: DepartmentId;
  label: string;
  agent: string;
  focus: string;
}

export interface Cadence {
  id: CadenceId;
  label: string;
  window: string;
}

export interface WorkDefinition {
  id: string;
  title: string;
  department: DepartmentId;
  cadence: CadenceId;
  owner: string;
  cron: string;
  nextRun: string;
  status: WorkStatus;
  approval: ApprovalState;
  auditorRequired: boolean;
  evidence: string;
  action: string;
  detail: string;
  auditTrail: string[];
}

export interface AgentRuntimeStatus {
  id: string;
  label: string;
  visibility: string;
  lastRun: string;
  nextRun: string;
  health: "ready" | "watch" | "blocked";
  queueDepth: number;
  note: string;
}

export const departments: Department[] = [
  {
    id: "accounting",
    label: "Accounting",
    agent: "@ob-accounting",
    focus: "AR/AP, supplements, draws, job closeout",
  },
  {
    id: "operations",
    label: "Operations",
    agent: "@ob-ops",
    focus: "Crews, materials, daily logs, safety",
  },
  {
    id: "sales",
    label: "Sales",
    agent: "@ob-sales",
    focus: "Leads, estimates, claims, follow-up",
  },
  {
    id: "marketing",
    label: "Marketing",
    agent: "@ob-marketing",
    focus: "Reviews, photos, EEAT, schema",
  },
  {
    id: "executive",
    label: "Executive",
    agent: "@ob-exec",
    focus: "KPIs, capacity, strategy, hiring",
  },
  {
    id: "system",
    label: "System",
    agent: "horizontal agents",
    focus: "Capture, Conductor, Auditor, Maintenance",
  },
];

export const cadences: Cadence[] = [
  { id: "daily", label: "Daily", window: "Business-day and closeout loops" },
  { id: "weekly", label: "Weekly", window: "Planning, hygiene, reconciliation" },
  { id: "monthly", label: "Monthly", window: "Close, reporting, standards" },
  { id: "quarterly", label: "Quarterly", window: "Sustain, archive, improvement" },
  { id: "annual", label: "Annual", window: "Renewals, DR, strategy reset" },
  { id: "ad-hoc", label: "Ad hoc", window: "Slack, webhook, upload, request" },
];

export const workDefinitions: WorkDefinition[] = [
  {
    id: "daily-sales-hot-leads",
    title: "Hot lead triage",
    department: "sales",
    cadence: "daily",
    owner: "@ob-sales",
    cron: "15 6 * * 1-5",
    nextRun: "Tomorrow 6:15 AM",
    status: "needs_review",
    approval: "before_external",
    auditorRequired: true,
    evidence: "8 inbound leads, 3 storm-zone callbacks, 2 estimate drafts",
    action: "Approve follow-up drafts",
    detail:
      "Sales prepares priority callbacks and proposal drafts. External customer messages stay queued until human approval.",
    auditTrail: [
      "Conductor queued daily sales planning",
      "Historian attached prior estimate context",
      "Auditor flagged two claims for human review",
    ],
  },
  {
    id: "daily-ops-readiness",
    title: "Crew and material readiness",
    department: "operations",
    cadence: "daily",
    owner: "@ob-ops",
    cron: "45 6 * * 1-5",
    nextRun: "Tomorrow 6:45 AM",
    status: "running",
    approval: "before_write",
    auditorRequired: false,
    evidence: "4 active crews, 6 supplier checks, 1 permit hold",
    action: "Review blockers",
    detail:
      "Operations compares tomorrow's schedule against material status, permit status, and crew capacity before work orders are updated.",
    auditTrail: [
      "Capture received two daily log updates",
      "Operations matched crews to open jobs",
      "Permit hold routed to Conductor",
    ],
  },
  {
    id: "daily-accounting-invoice-gate",
    title: "Invoice gate review",
    department: "accounting",
    cadence: "daily",
    owner: "@ob-accounting",
    cron: "30 16 * * 1-5",
    nextRun: "Today 4:30 PM",
    status: "queued",
    approval: "before_write",
    auditorRequired: true,
    evidence: "5 pending invoices, 2 supplement deltas, 1 draw request",
    action: "Open queue",
    detail:
      "Accounting checks invoice readiness against job progress, supplement status, and closeout evidence before posting anything downstream.",
    auditTrail: [
      "Supplier import detected new invoice rows",
      "Auditor requires photo evidence on one closeout",
      "No external accounting writes have been performed",
    ],
  },
  {
    id: "daily-capture-atomization",
    title: "Debrief atomization",
    department: "system",
    cadence: "daily",
    owner: "Capture",
    cron: "30 0 * * *",
    nextRun: "Tonight 12:30 AM",
    status: "scheduled",
    approval: "none",
    auditorRequired: false,
    evidence: "Slack, notes, uploads, call summaries",
    action: "Inspect intake",
    detail:
      "Capture turns raw internal events into provenance-preserving atoms for later Historian retrieval.",
    auditTrail: [
      "Maintenance inventory completed",
      "Capture intake folder ready",
      "Historian boundary unchanged",
    ],
  },
  {
    id: "weekly-maintenance-front-desk",
    title: "Workspace 5S front desk",
    department: "system",
    cadence: "weekly",
    owner: "Maintenance",
    cron: "30 2 * * 0",
    nextRun: "Sunday 2:30 AM",
    status: "needs_review",
    approval: "always",
    auditorRequired: false,
    evidence: "5 import candidates, 2 nested Git folders, 1 private candidate",
    action: "Review manifest",
    detail:
      "Maintenance may propose sort and move actions, but file movement waits for an approved manifest.",
    auditTrail: [
      "Front desk scan found raw root imports",
      "Private pricing material classified as private",
      "Nested Git moves blocked until explicitly allowed",
    ],
  },
  {
    id: "weekly-exec-capacity",
    title: "Capacity and pipeline readout",
    department: "executive",
    cadence: "weekly",
    owner: "@ob-exec",
    cron: "0 6 * * 1",
    nextRun: "Monday 6:00 AM",
    status: "scheduled",
    approval: "none",
    auditorRequired: true,
    evidence: "Crew load, estimate velocity, closeout risk",
    action: "Preview dashboard",
    detail:
      "Executive receives a week-ahead capacity picture with sales, operations, and accounting constraints in one digest.",
    auditTrail: [
      "Conductor scheduled weekly planning",
      "Auditor will check KPI provenance",
      "No client-facing output planned",
    ],
  },
  {
    id: "weekly-marketing-proof-pack",
    title: "Proof pack assembly",
    department: "marketing",
    cadence: "weekly",
    owner: "@ob-marketing",
    cron: "0 10 * * 5",
    nextRun: "Friday 10:00 AM",
    status: "blocked",
    approval: "before_external",
    auditorRequired: true,
    evidence: "12 photos pending release, 4 review requests drafted",
    action: "Resolve release hold",
    detail:
      "Marketing prepares review requests and job proof packs, then waits for release approval before publication or outreach.",
    auditTrail: [
      "CompanyCam bridge marked four photos as unknown release state",
      "Auditor blocked publication",
      "Conductor requested human decision",
    ],
  },
  {
    id: "monthly-accounting-close",
    title: "Month-close packet",
    department: "accounting",
    cadence: "monthly",
    owner: "@ob-accounting",
    cron: "0 3 1 * *",
    nextRun: "July 1 3:00 AM",
    status: "scheduled",
    approval: "before_write",
    auditorRequired: true,
    evidence: "AR aging, AP aging, WIP, supplement outcomes",
    action: "View checklist",
    detail:
      "Accounting compiles close evidence and flags entries that require human posting decisions.",
    auditTrail: [
      "Recurring definition drafted",
      "Approval required before accounting system writes",
      "Auditor required for packet completeness",
    ],
  },
  {
    id: "monthly-marketing-schema",
    title: "Schema and EEAT standardization",
    department: "marketing",
    cadence: "monthly",
    owner: "@ob-marketing",
    cron: "30 3 1 * *",
    nextRun: "July 1 3:30 AM",
    status: "scheduled",
    approval: "before_write",
    auditorRequired: true,
    evidence: "Service pages, project pages, review entities",
    action: "Inspect plan",
    detail:
      "Marketing audits entity consistency, schema opportunities, and proof signals before website updates are proposed.",
    auditTrail: [
      "Schema task mapped to monthly cadence",
      "Researcher remains external-only",
      "Website writes require approval",
    ],
  },
  {
    id: "quarterly-qc-dmaic",
    title: "QC DMAIC sample",
    department: "system",
    cadence: "quarterly",
    owner: "Quality Control",
    cron: "0 4 1 1,4,7,10 *",
    nextRun: "July 1 4:00 AM",
    status: "scheduled",
    approval: "always",
    auditorRequired: false,
    evidence: "Sampled runs, trust tier changes, standard deltas",
    action: "Open standard review",
    detail:
      "Quality Control reviews cross-job patterns and may update standards, including trust tier decisions.",
    auditTrail: [
      "QC is separate from Auditor",
      "Trust tier editing reserved to QC",
      "A3 improvement proposals accepted as inputs",
    ],
  },
  {
    id: "annual-risk-renewals",
    title: "Licensing and insurance renewal map",
    department: "executive",
    cadence: "annual",
    owner: "@ob-exec",
    cron: "0 8 5 1 *",
    nextRun: "Jan 5 8:00 AM",
    status: "scheduled",
    approval: "before_external",
    auditorRequired: true,
    evidence: "Licenses, insurance, vendor contracts, DR checklist",
    action: "Review renewal map",
    detail:
      "Executive receives the annual renewal and risk map before any external notices or vendor updates are prepared.",
    auditTrail: [
      "Annual cadence placeholder created",
      "External action requires approval",
      "DR test remains a tracked requirement",
    ],
  },
  {
    id: "adhoc-claims-escalation",
    title: "Insurance claim escalation",
    department: "sales",
    cadence: "ad-hoc",
    owner: "@ob-sales",
    cron: "",
    nextRun: "Event driven",
    status: "queued",
    approval: "before_external",
    auditorRequired: true,
    evidence: "Slack escalation, claim note, estimate delta",
    action: "Open case",
    detail:
      "A human-triggered claims escalation can launch immediately, but outreach and claim-system changes stay approval gated.",
    auditTrail: [
      "Slack event accepted by Conductor",
      "Historian attached internal claim context",
      "Researcher not invoked",
    ],
  },
];

export const agentRuntimeStatuses: AgentRuntimeStatus[] = [
  {
    id: "hermes",
    label: "Hermes front desk",
    visibility: "Agent intake",
    lastRun: "Today 9:12 AM",
    nextRun: "On every agent start",
    health: "ready",
    queueDepth: 0,
    note: "Workspace map and naming conventions are committed.",
  },
  {
    id: "maintenance",
    label: "Maintenance",
    visibility: "Weekly hygiene",
    lastRun: "Today 9:18 AM",
    nextRun: "Sunday 2:30 AM",
    health: "watch",
    queueDepth: 5,
    note: "Move manifest awaits review; raw imports remain in place.",
  },
  {
    id: "conductor",
    label: "Conductor",
    visibility: "Routing and digests",
    lastRun: "Phase 1 seed",
    nextRun: "Runtime integration",
    health: "ready",
    queueDepth: 12,
    note: "Static work definitions are ready for live queue wiring.",
  },
  {
    id: "auditor",
    label: "Auditor",
    visibility: "Quality gates",
    lastRun: "Phase 1 seed",
    nextRun: "Runtime integration",
    health: "ready",
    queueDepth: 7,
    note: "Approval and evidence states are represented in the UI.",
  },
  {
    id: "gsd-core",
    label: "GSD Core",
    visibility: "Build operating loop",
    lastRun: "Installed locally",
    nextRun: "$gsd-map-codebase",
    health: "ready",
    queueDepth: 0,
    note: "Local .codex assets are present for Codex runtime workflows.",
  },
];

export function getDepartment(id: DepartmentId) {
  return departments.find((department) => department.id === id);
}

export function getCadence(id: CadenceId) {
  return cadences.find((cadence) => cadence.id === id);
}

export function formatStatus(status: WorkStatus) {
  return status.replace("_", " ");
}

export function formatApproval(approval: ApprovalState) {
  if (approval === "none") return "None";
  if (approval === "before_write") return "Before write";
  if (approval === "before_external") return "Before external";
  return "Always";
}
