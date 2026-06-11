#!/usr/bin/env node
// build-acculynx-handoff.mjs — docs/33 Phase 5 (§4.10 AccuLynx handoff, fallback mode)
//
// Builds the structured fallback packet for one estimate run: everything a
// human needs to populate AccuLynx manually without rethinking the job.
// API V2 has no write endpoints for milestones, invoices, material orders,
// or crew schedules (see docs/37-acculynx-write-capability-matrix.md), so
// the packet is the permanent path for those; the packet also lists which
// steps CAN be API-automated once a write-scoped key is wired.
//
// Pure computation: input is a run bundle JSON, output is the packet JSON
// (request_payload for estimate_acculynx_handoffs) plus a Slack-ready
// mrkdwn draft. No network, no credentials.
//
// Usage: node scripts/build-acculynx-handoff.mjs --input bundle.json

import { readFileSync } from 'node:fs';
const args = process.argv.slice(2);
const i = args.indexOf('--input');
const b = JSON.parse(readFileSync(args[i + 1], 'utf8'));

const fmt = (n) => n == null ? '—' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

const packet = {
  packet_version: 1,
  generated: b.date,
  run_id: b.run_id,
  external_reference: { system: 'open-brain-estimate', value: b.run_id,
    api_note: 'POST /jobs/external-references once job exists (idempotency anchor, docs/33 5.9)' },
  job: {
    job_name: `Reroof — ${b.address}`,
    address: b.address,
    job_type: 'retail residential reroof',
    trade_type: 'Roofing',
    work_type: 'Replacement',
    lead_source: 'TBD (intake)',
    contact: b.prepared_for || 'Homeowner — name/phone/email from intake',
  },
  measurements: b.measurements,
  measurement_documents: b.source_documents,
  options: b.options.map((o) => ({ tier: o.tier, shingle_line: o.shingle_line, total: o.total })),
  selected_branch: b.branch,
  proposal: { pdf: b.proposal_pdf, status: 'draft pending Ops approval', initials_blocks: 7, signature: true },
  invoice_draft: { kind: 'deposit', basis: b.invoice_basis },
  open_items: b.open_items,
  manual_steps_acculynx: [
    'Create/locate contact, then create job (or verify existing job) with address + job name above',
    'Set milestone to Prospect once proposal is approved (NO API for milestone writes)',
    'Attach proposal PDF to job documents (API-automatable: POST /jobs/{id}/documents)',
    'Attach Roofr measurement PDF/CSV (API-automatable: POST /jobs/{id}/measurements/files)',
    'Enter worksheet items from selected option after client selection (API-automatable: POST /financials/{id}/worksheet/items)',
    'Create deposit invoice in AccuLynx after client selection (NO API for invoice writes)',
    'Set sales owner / company rep (API-automatable)',
    'Record external reference open-brain-estimate=' + b.run_id,
  ],
  api_automatable_once_key_wired: ['contact+job create', 'custom fields', 'proposal/measurement uploads',
    'worksheet items', 'job message', 'reps', 'external reference'],
  never_api: ['milestone/status updates', 'invoice creation', 'material order', 'crew schedule'],
};

const slack = [
  `*AccuLynx handoff (fallback): Reroof — ${b.address}*`,
  `Run \`${b.run_id.slice(0, 8)}\` • ${b.measurements.squares} sq @ ${b.measurements.predominant_pitch} • waste-adj ${b.measurements.waste_adjusted_squares} sq`,
  `*Options:* ${b.options.map((o) => `${o.tier} ${fmt(o.total)}`).join(' | ')}`,
  `*Branch:* ${b.branch.name} (${b.branch.drive_time_minutes ?? '—'} min)`,
  `*Proposal:* draft pending Ops approval — \`${b.proposal_pdf}\``,
  `*Invoice:* deposit draft, amount pending client selection`,
  `*Open:* ${b.open_items.join('; ')}`,
  `_Full packet + checklist on the operations dashboard._`,
].join('\n');

console.log(JSON.stringify({ packet, slack_draft: slack }, null, 1));
