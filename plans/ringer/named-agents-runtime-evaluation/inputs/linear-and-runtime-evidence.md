# Linear and Runtime Evidence Packet

Prepared 2026-07-26. This packet is a bounded starting point, not a substitute for
checking the cited local files and official vendor documentation.

## Linear issues

- PEC-1 — DevEngine Agent Status: establishes the boundary that named Roofing-Ops
  agents never use Open Engine or Linear.
- PEC-2 — DevEngine Standing Context: all DevTeam runtimes reported manual-required;
  most heartbeats were from 2026-06-28, with Cursor last seen 2026-07-11.
- PEC-8 — Command Center dual-interface go-live: urgent and incomplete; the Slack
  attachment repair was deployed, but comments do not prove full Slack/Linear intake.
- PEC-12 — Port this engine to Roofer 1Brain: high priority and unstarted; calls for
  receipts, checks, VPS scheduling, and a database architecture review.
- PEC-14 — P0 coordination gaps: urgent and still in progress; Slack intake must
  create `dashboard_work_items`, Slack-to-Linear titles must become claimable, and a
  durable runner status is missing.
- PEC-9 — Roofers Brain Agent Status: later comments show cw-cowork blocked because
  its repository was not connected and cw-claude lacked installed context.

## Repository evidence

- `docs/58-dev-vs-ops-agent-delineation.md` defines separate DevTeam and Roofing-Ops
  planes.
- `docs/70-agent-coordination-stabilization-and-migration-plan.md` documents the
  incomplete shared queue, cadence drift, persona drift, and designed-but-not-live
  autonomous layer.
- `docs/roofing-ops-runtime-status.md` claims isolated Hermes homes and eight Slack
  listeners on the agent VPS, but also requires a human-originated Slack test.
- `docs/roofing-ops-slack-agent-routing.md` defines the seven named personas and
  their Slack routing.
- `deployment/remote/slack/README.md` describes an older single-app/read-only phase
  and conflicts with newer multi-agent/two-way documentation.
- `deployment/remote/agentmail/README.md` documents ten service-role inboxes and
  approval-gated outbound sends.
- `deployment/remote/orgo/README.md` assigns Google Workspace identities to all
  seven personas and proposes five persistent browser desktops.
- `app/command-center/runtime/roofing-ops-agent-router.mjs` contains hard-coded
  persona routing and an obsolete `[roofing ops intake]` escalation title.
- `app/command-center/runtime/slack-socket-runtime.mjs` handles Slack events, while
  user-facing text still says write-side actions are disabled.
- `app/command-center/src/lib/agentmail.ts` maps shared service inboxes; Sam routes
  through Conductor because Auditor intentionally has no mailbox.

## Confirmed Maya runtime facts

- Maya has a dedicated Orgo Chrome desktop and is already logged into her Google
  Workspace identity. She will not use the local Mac mini.
- The canonical credential name supplied by the operator is
  `ORGO_PE_CC_MAYA_API_KEY` in the Master environment. Never copy or print its value.
- The checked-in Orgo provisioner currently reads `ORGO_API_KEY`, so integration must
  deliberately map the per-persona key and reuse the existing desktop.
- Orgo authentication is Bearer-token based. Keys are account-wide or
  workspace-scoped; there is no documented computer-scoped key. Confirm the key's
  real scope rather than inferring it from its environment-variable name.
- Orgo officially supports installing Hermes inside a persistent computer for a
  24/7 runtime. This makes Hermes-on-Orgo the lowest-change baseline to prove before
  adding a second orchestration framework.
- Operator decision: Maya's isolated Orgo + Google Workspace + Hermes pattern is the
  canonical template for all seven named agents. The target state gives Jordan and
  Sam dedicated Orgo computers as well; older workspace-only documentation is now a
  migration input, not the desired architecture.
- Read-only Orgo verification on 2026-07-26: the supplied temporary master key
  authenticated successfully, listed one `PE-open-brain` workspace with one running
  `Maya Chen` computer, and returned `404 Project not found` for a nonexistent
  workspace rather than `403 workspace_scope_mismatch`. Based on Orgo's documented
  behavior, this is evidence that the key is account-wide. No resource was created,
  started, stopped, or modified. Rotate the key after planning and use it only in the
  provisioning control plane.
- SSH verification of the documented agent VPS failed with the available public-key
  identity. Treat the remote service state as unknown until an authorized health
  check succeeds.

## Official sources to verify

- Vercel eve: https://vercel.com/eve
- Vercel announcement: https://vercel.com/blog/introducing-eve
- Vercel eve repository: https://github.com/vercel/eve
- Cursor Cloud Agents: https://cursor.com/blog/cloud-agents
- Cursor Automations: https://cursor.com/blog/automations
- Cursor self-hosted Cloud Agents: https://cursor.com/blog/self-hosted-cloud-agents
- Devin Slack integration: https://docs.devin.ai/integrations/slack
- Devin scheduled sessions: https://docs.devin.ai/product-guides/scheduled-sessions
- Devin secrets: https://docs.devin.ai/product-guides/secrets
- Devin computer use: https://docs.devin.ai/work-with-devin/computer-use
- Orgo authentication: https://docs.orgo.ai/api-reference/authentication
- Orgo API index and Hermes runtime guidance: https://docs.orgo.ai/llms.txt
