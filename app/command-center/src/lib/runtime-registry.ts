// The runtime inventory behind /agents (docs/109). Every API, agent, scheduled job,
// edge function and data feed the board must show a light for is declared HERE, in
// one place, with the cadence the colour rules are derived from (docs/109 D5).
//
// Adding a component = adding a row. Keys are stable identifiers shared with
// runtime_heartbeats.component_key (mig 286) and the Better Stack names created by
// scripts/betterstack-provision.sh.

export type RuntimeKind = "api" | "page" | "pg_cron" | "systemd" | "edge_function" | "feed" | "agent" | "deploy" | "integration";

export interface PgCronSpec {
  key: string;            // pgcron.<jobname>
  jobname: string;
  label: string;
  purpose: string;
  cadenceS: number;
}

export interface SystemdSpec {
  key: string;            // systemd.<unit without .service>
  unit: string;
  label: string;
  purpose: string;
  cadenceS: number;
  scheduleLabel: string;
  docs?: string;
}

export interface MonitoredRouteSpec {
  key: string;
  path: string;
  label: string;
  kind: "api" | "page";
  purpose: string;
  /** The healthy answer to an anonymous ping (D10: 401 on an API route means the gate is up). */
  expect: number;
  expectBody?: string;
}

/**
 * A system we depend on, pinged directly by the Command Center (docs/109 D16).
 * `url` may carry `{ENV_NAME}` placeholders. When `authEnv` is set on this deployment
 * the ping authenticates and expects `expectAuthed` (default 200); otherwise it pings
 * `anonUrl ?? url` anonymously and expects `expectAnon` — the code that endpoint gives
 * every anonymous caller, so a network or server fault is still visible.
 */
export interface IntegrationSpec {
  key: string;            // int.<system>
  label: string;
  purpose: string;
  url: string;
  anonUrl?: string;
  method?: "GET" | "POST";
  body?: string;
  authEnv?: string;
  auth?: "bearer" | "apikey" | "raw";
  expectAuthed?: number;
  expectAnon: number;
  expectBody?: string;
  /** Where the real credential lives when it is deliberately not on this app. */
  credentialHome?: string;
}

export interface FeedSpec {
  key: string;            // matches v_runtime_feed_freshness.feed_key
  label: string;
  purpose: string;
  expectedWindowS: number; // how old the newest row may be before the light degrades
  expectsRowsDaily: boolean; // green-but-empty guard (the 9/1 ABC outage signature)
  jobKey?: string;         // the job that produces it, for the detail line
}

export interface EdgeFunctionSpec {
  key: string;
  name: string;
  label: string;
  purpose: string;
}

export interface AgentSpec {
  key: string;
  displayName: string;
  handle: string;
  role: string;
  /** Slack bot token env var (per .claude/skills/slack-agents). */
  slackTokenEnv?: string;
  /** Service identity id from access-control SERVICE_AGENT_IDENTITIES, when the agent authenticates to the API. */
  serviceIdentityId?: string;
  /** Jobs that ARE this agent's work; the agent inherits their worst light. */
  jobKeys: string[];
}

export const PG_CRON_JOBS: PgCronSpec[] = [
  { key: "pgcron.acculynx-geoid-match-daily", jobname: "acculynx-geoid-match-daily", label: "AccuLynx geo-id match", purpose: "Daily property ↔ AccuLynx job geo matching", cadenceS: 86_400 },
  { key: "pgcron.pvp_refresh_nightly", jobname: "pvp_refresh_nightly", label: "Price-vs-purchase matview", purpose: "Nightly refresh of the purchase-price matview", cadenceS: 86_400 },
  { key: "pgcron.top20_refresh_quarterly", jobname: "top20_refresh_quarterly", label: "Top-20 items (quarterly)", purpose: "Quarterly top-20 purchased items refresh", cadenceS: 7_862_400 },
  { key: "pgcron.acculynx-hourly-sync", jobname: "acculynx-hourly-sync", label: "AccuLynx hourly sync", purpose: "Dispatches the acculynx-sync edge function for all 8 accounts", cadenceS: 3_600 },
  { key: "pgcron.acculynx-reconcile", jobname: "acculynx-reconcile", label: "AccuLynx reconcile", purpose: "Reconciles dispatched sync batches every 10 min", cadenceS: 600 },
  { key: "pgcron.acculynx-alert-check", jobname: "acculynx-alert-check", label: "AccuLynx alert check", purpose: "Flags timed-out / errored sync batches every 15 min", cadenceS: 900 },
  { key: "pgcron.wip-ar-master-nightly", jobname: "wip-ar-master-nightly", label: "WIP/AR master (nightly)", purpose: "Recomputes wip_ar_master (Friday board, 13WCF receipts)", cadenceS: 86_400 },
  { key: "pgcron.wip-ar-week-roll-thursday", jobname: "wip-ar-week-roll-thursday", label: "WIP/AR week roll (Thu)", purpose: "Rolls the WIP/AR week forward every Thursday", cadenceS: 604_800 },
  { key: "pgcron.refresh-office-pricing-matviews", jobname: "refresh-office-pricing-matviews", label: "Invoice audit matviews (15 min)", purpose: "mv_invoice_audit_line + office pricing matviews, CM claims sync + reconcile", cadenceS: 900 },
  { key: "pgcron.nightly-silo-assertions", jobname: "nightly-silo-assertions", label: "Silo assertions (nightly)", purpose: "Vendor / office silo invariants (docs/105)", cadenceS: 86_400 },
  { key: "pgcron.service-matview-refresh-requests", jobname: "service-matview-refresh-requests", label: "On-demand matview refresh", purpose: "Serves matview_refresh_request rows every minute", cadenceS: 300 },
  { key: "pgcron.refresh-overhead-matview", jobname: "refresh-overhead-matview", label: "Overhead matview (nightly)", purpose: "mv_overhead_account_month for Fixed Costs / Cash Runway", cadenceS: 86_400 },
  { key: "pgcron.refresh-order-acculynx-match", jobname: "refresh-order-acculynx-match", label: "Order ↔ AccuLynx match matview (15 min)", purpose: "mv_order_acculynx_match for the Operations order audit (mig 288)", cadenceS: 900 },
  { key: "pgcron.runtime-heartbeat-pump", jobname: "runtime-heartbeat-pump", label: "Heartbeat pump (5 min)", purpose: "Pings one Better Stack heartbeat per new successful run (mig 286)", cadenceS: 300 },
];

export const SYSTEMD_JOBS: SystemdSpec[] = [
  { key: "systemd.openbrain-abc-sync", unit: "openbrain-abc-sync.service", label: "ABC nightly sync", purpose: "Catalog sync → invoice ingest → PDF backfill → Alex No-Price triage", cadenceS: 86_400, scheduleLabel: "03:30 ET daily", docs: "scripts/abc-nightly-sync.sh" },
  { key: "systemd.openbrain-jt-sentinel", unit: "openbrain-jt-sentinel.service", label: "JobTread sync sentinel", purpose: "Daily JobTread mirror sweep + drift report", cadenceS: 86_400, scheduleLabel: "10:00 PT daily", docs: "docs/80" },
  { key: "systemd.openbrain-maya-gate", unit: "openbrain-maya-gate.service", label: "Maya gate pass", purpose: "PEC intake diagnose → Slack-approved repair gate", cadenceS: 900, scheduleLabel: "every 15 min", docs: "scripts/maya-gate.sh" },
  { key: "systemd.openbrain-maya-qa", unit: "openbrain-maya-qa.service", label: "Maya nightly QA", purpose: "Wide site walk + chaos forensic pass of the live site", cadenceS: 86_400, scheduleLabel: "04:30 CT daily" },
  { key: "systemd.openbrain-qbo-thursday-sync", unit: "openbrain-qbo-thursday-sync.service", label: "QBO mirror refresh", purpose: "Read-only QuickBooks Online → Supabase mirror (PEC-102)", cadenceS: 86_400, scheduleLabel: "20:00 CT daily", docs: "docs/74" },
  { key: "systemd.openbrain-site-sweep", unit: "openbrain-site-sweep.service", label: "Site quality sweep", purpose: "Static + live + DB money-truth checks (PEC-218)", cadenceS: 86_400, scheduleLabel: "06:00 CT daily", docs: "docs/92" },
  { key: "systemd.openbrain-wip-pack-thursday", unit: "openbrain-wip-pack-thursday.service", label: "AR/WIP pack build", purpose: "refresh_wip_ar_master + Excel pack → wip-packs bucket", cadenceS: 86_400, scheduleLabel: "06:00 CT daily", docs: "docs/85" },
];

export const MONITORED_ROUTES: MonitoredRouteSpec[] = [
  { key: "site.healthz", path: "/healthz", label: "/healthz", kind: "page", purpose: "Public liveness + buildCommit", expect: 200, expectBody: '"status":"ok"' },
  { key: "page.agents", path: "/agents", label: "/agents (WorkOS gate)", kind: "page", purpose: "Human surface behind the WorkOS gate — a 302 to login proves the gate", expect: 302 },
  { key: "page.auth-md", path: "/auth.md", label: "/auth.md", kind: "page", purpose: "Agent auth discovery document", expect: 200 },
  { key: "api.accounting.kpi-pills", path: "/api/accounting/kpi-pills", label: "accounting/kpi-pills", kind: "api", purpose: "Invoice Audit KPI strip", expect: 401 },
  { key: "api.invoice-audit.pending-verification", path: "/api/invoice-audit/pending-verification", label: "invoice-audit/pending-verification", kind: "api", purpose: "Pay-It verification queue", expect: 401 },
  { key: "api.executive.cash-runway", path: "/api/executive/cash-runway.json", label: "executive/cash-runway", kind: "api", purpose: "Cash runway (13WCF)", expect: 401 },
  { key: "api.agent.work-queue", path: "/api/agent/work-queue", label: "agent/work-queue", kind: "api", purpose: "Agent work queue", expect: 401 },
  { key: "api.credit-memos.pending", path: "/api/credit-memos/pending", label: "credit-memos/pending", kind: "api", purpose: "Claim-It pending CM lines", expect: 401 },
  { key: "api.accounting.friday-wip", path: "/api/accounting/friday-wip.json", label: "accounting/friday-wip", kind: "api", purpose: "Friday WIP/AR board", expect: 401 },
];

export const INTEGRATIONS: IntegrationSpec[] = [
  { key: "int.supabase-rest", label: "Supabase PostgREST (shared prod DB)", purpose: "Every work surface reads through it", url: "{SUPABASE_URL}/rest/v1/roof_system_category?select=key&limit=1", authEnv: "SUPABASE_ANON_KEY", auth: "apikey", expectAuthed: 200, expectAnon: 401 },
  { key: "int.supabase-auth", label: "Supabase Auth", purpose: "GoTrue health behind the same project", url: "{SUPABASE_URL}/auth/v1/health", authEnv: "SUPABASE_ANON_KEY", auth: "apikey", expectAuthed: 200, expectAnon: 401 },
  { key: "int.workos", label: "WorkOS", purpose: "Staff sign-in for cc and crm", url: "https://api.workos.com/user_management/users?limit=1", authEnv: "WORKOS_API_KEY", expectAuthed: 200, expectAnon: 401 },
  { key: "int.jobtread", label: "JobTread (Pave API)", purpose: "Job mirror + sync sentinel", url: "https://api.jobtread.com/pave", method: "POST", body: '{"query":{}}', expectAnon: 200, credentialHome: "grant key on the agent host (master.env)" },
  { key: "int.acculynx", label: "AccuLynx API", purpose: "Hourly sync for 8 accounts (edge function)", url: "https://api.acculynx.com/api/v2/users", expectAnon: 401, credentialHome: "per-account keys in Supabase edge-function secrets" },
  { key: "int.quickbooks", label: "QuickBooks Online (Intuit platform)", purpose: "Read-only mirror (hard rule 13)", url: "https://oauth.platform.intuit.com/op/v1/jwks", expectAnon: 200, credentialHome: "OAuth tokens on the agent host" },
  { key: "int.slack", label: "Slack API", purpose: "Agent bot identities post here", url: "https://slack.com/api/auth.test", anonUrl: "https://slack.com/api/api.test", authEnv: "MAYA_CHEN_BOT_TOKEN", expectAuthed: 200, expectAnon: 200, expectBody: '"ok":true', credentialHome: "bot tokens per agent (slack-agents skill)" },
  { key: "int.abc-supply", label: "ABC Supply Partners API", purpose: "Nightly invoice / order mirror", url: "https://auth.partners.abcsupply.com/oauth2/ausvvp0xuwGKLenYy357/.well-known/openid-configuration", expectAnon: 200, credentialHome: "client credentials on the agent host (partners.abcsupply.com)" },
  { key: "int.coolify", label: "Coolify (deploy host)", purpose: "Builds and runs this app", url: "https://coolify.proexteriorsus.net/api/health", expectAnon: 200 },
  { key: "int.betterstack", label: "Better Stack Uptime API", purpose: "Outside-in site monitors + job heartbeats", url: "https://uptime.betterstack.com/api/v2/monitors?per_page=1", authEnv: "BETTERSTACK_API_TOKEN", expectAuthed: 200, expectAnon: 401 },
  { key: "int.github", label: "GitHub API", purpose: "origin/main for the deploy-drift light", url: "https://api.github.com/user", anonUrl: "https://api.github.com/", authEnv: "GITHUB_TOKEN", expectAuthed: 200, expectAnon: 200 },
  { key: "int.linear", label: "Linear", purpose: "Issue tracking (PEC tickets)", url: "https://api.linear.app/graphql", anonUrl: "https://api.linear.app/graphql", method: "POST", body: '{"query":"{ viewer { id } }"}', authEnv: "LINEAR_API_KEY", auth: "raw", expectAuthed: 200, expectAnon: 400 },
  { key: "int.agentmail", label: "AgentMail", purpose: "Agent mailboxes (Maya intake)", url: "https://api.agentmail.to/v0/inboxes", authEnv: "AGENTMAIL_API_KEY", expectAuthed: 200, expectAnon: 401 },
];

export const FEEDS: FeedSpec[] = [
  { key: "abc_invoices", label: "ABC invoice mirror", purpose: "abc_invoices rows from the ABC Partners API (nightly)", expectedWindowS: 2 * 86_400, expectsRowsDaily: true, jobKey: "systemd.openbrain-abc-sync" },
  { key: "mv_invoice_audit_line", label: "Invoice audit matview", purpose: "Every audit surface reads this; lagging rows = invoices the audit cannot see", expectedWindowS: 1_800, expectsRowsDaily: false, jobKey: "pgcron.refresh-office-pricing-matviews" },
  { key: "acculynx_watermark", label: "AccuLynx watermarks", purpose: "Newest successful sync across the 8 accounts", expectedWindowS: 2 * 3_600, expectsRowsDaily: false, jobKey: "pgcron.acculynx-hourly-sync" },
  { key: "vendor_invoices", label: "SRS / QXO invoice mirror", purpose: "Manual CSV / PDF ingests (weekly cadence, human-driven)", expectedWindowS: 14 * 86_400, expectsRowsDaily: false },
  { key: "wip_ar_master", label: "WIP/AR master", purpose: "Friday board + 13WCF receipts source", expectedWindowS: 2 * 86_400, expectsRowsDaily: false, jobKey: "pgcron.wip-ar-master-nightly" },
  { key: "credit_memo_receipts", label: "Credit-memo receipts", purpose: "Received CM documents reconciled to requests", expectedWindowS: 30 * 86_400, expectsRowsDaily: false, jobKey: "pgcron.refresh-office-pricing-matviews" },
];

export const EDGE_FUNCTIONS: EdgeFunctionSpec[] = [
  { key: "edge.acculynx-sync", name: "acculynx-sync", label: "acculynx-sync", purpose: "Hourly incremental pull per account" },
  { key: "edge.acculynx-webhook", name: "acculynx-webhook", label: "acculynx-webhook", purpose: "Inbound AccuLynx events" },
  { key: "edge.acculynx-read-sweep", name: "acculynx-read-sweep", label: "acculynx-read-sweep", purpose: "Read sweep for the AccuLynx agent" },
  { key: "edge.acculynx-write-sweep", name: "acculynx-write-sweep", label: "acculynx-write-sweep", purpose: "Gated write sweep (enqueue → approve → execute)" },
  { key: "edge.acculynx-write-action", name: "acculynx-write-action", label: "acculynx-write-action", purpose: "Executes one approved write action" },
];

export const AGENTS: AgentSpec[] = [
  { key: "agent.alex-rivers", displayName: "Alex Rivers", handle: "alex_rivers", role: "Pricing — No-Price triage, agreement gaps", slackTokenEnv: "ALEX_RIVERS_BOT_TOKEN", jobKeys: ["systemd.openbrain-abc-sync", "pgcron.refresh-office-pricing-matviews"] },
  { key: "agent.maya-chen", displayName: "Maya Chen", handle: "maya_chen_accounting", role: "Accounting — intake gate, nightly QA", slackTokenEnv: "MAYA_CHEN_BOT_TOKEN", jobKeys: ["systemd.openbrain-maya-gate", "systemd.openbrain-maya-qa"] },
  { key: "agent.casey-morgan", displayName: "Casey Morgan", handle: "casey_morgan", role: "Vendor comms — credit-memo requests", slackTokenEnv: "CASEY_MORGAN_BOT_TOKEN", jobKeys: ["pgcron.refresh-office-pricing-matviews"] },
  { key: "agent.jordan-price", displayName: "Jordan Price", handle: "jordan_price", role: "Finance — WIP/AR pack, cash surfaces", slackTokenEnv: "JORDAN_PRICE_BOT_TOKEN", jobKeys: ["systemd.openbrain-wip-pack-thursday", "pgcron.wip-ar-master-nightly", "pgcron.refresh-overhead-matview"] },
  { key: "agent.lena-brooks", displayName: "Lena Brooks", handle: "lena_brooks", role: "Marketing", slackTokenEnv: "LENA_BROOKS_BOT_TOKEN", jobKeys: [] },
  { key: "agent.rowan-vale", displayName: "Rowan Vale", handle: "rowan_vale", role: "Research (external-only)", slackTokenEnv: "ROWAN_VALE_BOT_TOKEN", jobKeys: [] },
  { key: "agent.sam-torres", displayName: "Sam Torres", handle: "sam_torres", role: "QA — site sweep", slackTokenEnv: "SAM_TORRES_BOT_TOKEN", jobKeys: ["systemd.openbrain-site-sweep"] },
  { key: "agent.ops-conductor", displayName: "Ops Conductor", handle: "ops_conductor", role: "Conductor — routing, digests", slackTokenEnv: "OPS_CONDUCTOR_BOT_TOKEN", serviceIdentityId: "conductor", jobKeys: ["systemd.openbrain-jt-sentinel", "pgcron.acculynx-hourly-sync"] },
  { key: "agent.openbrain-shared", displayName: "openbrain (shared fallback)", handle: "openbrain", role: "Shared Slack bot identity", slackTokenEnv: "SLACK_BOT_TOKEN", jobKeys: [] },
];

export const GROUP_ORDER: Array<{ id: string; label: string; description: string }> = [
  { id: "site", label: "Site & APIs", description: "Outside-in from Better Stack when it is configured; otherwise the app pings its own public routes (a 401 on an API route means the app and its auth gate are up)." },
  { id: "integrations", label: "Connected systems · direct pings", description: "The Command Center pings each system we depend on itself, once a minute — no third-party monitor in the path. Green = the documented healthy answer: 200, or the code that endpoint gives every anonymous caller where the credential deliberately lives elsewhere." },
  { id: "feeds", label: "Data feeds", description: "Is the data the work surfaces read actually current? Green-but-empty is yellow on purpose." },
  { id: "pg_cron", label: "Scheduled jobs · database (pg_cron)", description: "Latest run result, time since last success, and the Better Stack heartbeat." },
  { id: "systemd", label: "Scheduled jobs · agent host (systemd)", description: "Reported by each unit's ExecStopPost hook (mig 286); heartbeat from Better Stack." },
  { id: "edge", label: "Edge functions", description: "Supabase edge functions, judged by their most recent dispatch outcome." },
  { id: "agents", label: "Agents", description: "Slack bot identities and API service identities, inheriting the worst light of the jobs that are their work." },
  { id: "deploy", label: "Deployment", description: "What is actually running versus what the repo says should be." },
];
