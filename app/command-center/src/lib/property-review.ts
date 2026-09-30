// Property Review (docs/117) — the human half of the AccuLynx job→property link queue.
//
// public.acculynx_job_property_review holds every AccuLynx job the linkers could not tie to
// a property (docs/116 §4). This module loads the queue for /operations/property-review and
// validates decisions before they reach public.record_acculynx_job_property_decision()
// (migration 312), which does the write and the dashboard_action_log entry itself.

import { createServerSupabaseClient } from "@lib/supabase.server";

export type ReviewStatus = "open" | "awaiting_source_fix" | "resolved" | "dismissed";
export type ReviewDecision = "link" | "source_fix" | "dismiss" | "reopen";

export interface PropertyReviewRow {
  jobId: string;
  status: ReviewStatus;
  reason: string;
  recommendedAction: string;
  submittedAddress: string | null;
  geocodedAddress: string | null;
  geocodeStatus: string | null;
  suggestedPropertyId: string | null;
  suggestedAddress: string | null;
  suggestionScore: number | null;
  decision: string | null;
  correctedAddress: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  notes: string | null;
  resolvedAddress: string | null;
  jobNumber: string | null;
  jobName: string | null;
  jobCategory: string | null;
  milestone: string | null;
  city: string | null;
  state: string | null;
  /** The board's scope bucket for this row (the KPI pill it belongs to). */
  scope: ReviewScope;
}

export type ReviewScope = "fix_address" | "confirm_match" | "choose_property" | "vendor" | "awaiting_fix" | "decided";

export interface PropertyReviewBoard {
  status: "live" | "unconfigured" | "error" | "forbidden";
  error?: string;
  generatedAt: string;
  rows: PropertyReviewRow[];
  counts: Record<ReviewScope, number>;
}

export const SCOPE_LABELS: Record<ReviewScope, { label: string; sub: string }> = {
  fix_address: { label: "Fix address in AccuLynx", sub: "missing, incomplete or can't be located" },
  confirm_match: { label: "Confirm a match", sub: "a likely property, weak street-name match" },
  choose_property: { label: "Choose a property", sub: "several properties at one address" },
  vendor: { label: "With the enrichment vendor", sub: "real addresses sent back for parcel data" },
  awaiting_fix: { label: "Waiting on AccuLynx fix", sub: "corrected address recorded, source not fixed yet" },
  decided: { label: "Decided by a person", sub: "linked or dismissed here" },
};

export const REASON_LABELS: Record<string, string> = {
  no_street: "No street",
  no_house_number: "No house number",
  no_zip: "No zip",
  po_box: "PO box",
  ambiguous_multiple_properties: "Several properties",
  weak_match: "Weak match",
  not_enriched: "Not enriched",
  county_unmapped: "County unknown",
};

export function scopeFor(row: { status: string; recommended_action: string | null; decision: string | null }): ReviewScope {
  if (row.status === "awaiting_source_fix") return "awaiting_fix";
  if (row.status === "resolved" || row.status === "dismissed") return "decided";
  switch (row.recommended_action) {
    case "confirm_suggested_match": return "confirm_match";
    case "choose_property": return "choose_property";
    case "resubmit_for_enrichment": return "vendor";
    default: return "fix_address";
  }
}

// PostgREST truncates an un-ranged select at max-rows without an error (D-10) — page through.
const PAGE = 1000;
async function fetchAllRows(make: () => any): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data as any[] | null) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

const COLUMNS = [
  "job_id", "status", "reason", "recommended_action", "submitted_address", "geocoded_address", "geocode_status",
  "suggested_property_id", "suggested_address", "suggestion_score", "decision", "corrected_address",
  "decided_by_name", "decided_at", "notes", "resolved_address", "job_number", "job_name", "job_category_name",
  "current_milestone", "location_city", "location_state_abbrev",
].join(",");

export function toReviewRow(r: any): PropertyReviewRow {
  return {
    jobId: String(r.job_id),
    status: r.status,
    reason: r.reason,
    recommendedAction: r.recommended_action,
    submittedAddress: r.submitted_address ?? null,
    geocodedAddress: r.geocoded_address ?? null,
    geocodeStatus: r.geocode_status ?? null,
    suggestedPropertyId: r.suggested_property_id ?? null,
    suggestedAddress: r.suggested_address ?? null,
    suggestionScore: r.suggestion_score == null ? null : Number(r.suggestion_score),
    decision: r.decision ?? null,
    correctedAddress: r.corrected_address ?? null,
    decidedByName: r.decided_by_name ?? null,
    decidedAt: r.decided_at ?? null,
    notes: r.notes ?? null,
    resolvedAddress: r.resolved_address ?? null,
    jobNumber: r.job_number ?? null,
    jobName: r.job_name ?? null,
    jobCategory: r.job_category_name ?? null,
    milestone: r.current_milestone ?? null,
    city: r.location_city ?? null,
    state: r.location_state_abbrev ?? null,
    scope: scopeFor(r),
  };
}

const emptyCounts = (): Record<ReviewScope, number> =>
  ({ fix_address: 0, confirm_match: 0, choose_property: 0, vendor: 0, awaiting_fix: 0, decided: 0 });

/** The board a viewer without Operations access sees: no rows, one sentence saying why. */
export function emptyPropertyReviewBoard(message: string): PropertyReviewBoard {
  return { status: "forbidden", error: message, generatedAt: new Date().toISOString(), rows: [], counts: emptyCounts() };
}

export async function loadPropertyReviewBoard(): Promise<PropertyReviewBoard> {
  const generatedAt = new Date().toISOString();
  const counts = emptyCounts();
  const { client, config } = createServerSupabaseClient();
  if (!client) {
    return { status: "unconfigured", error: `Supabase is not configured (${config.missing.join(", ")}).`, generatedAt, rows: [], counts };
  }
  try {
    // Open work plus anything a person has decided here; automation-resolved rows are history.
    const raw = await fetchAllRows(() =>
      client
        .from("v_acculynx_job_property_review_queue")
        .select(COLUMNS)
        .or("status.in.(open,awaiting_source_fix),decision.not.is.null")
        .order("job_id"),
    );
    const rows = raw.map(toReviewRow).sort((a, b) =>
      (a.submittedAddress ?? "").localeCompare(b.submittedAddress ?? ""));
    for (const r of rows) counts[r.scope] += 1;
    return { status: "live", generatedAt, rows, counts };
  } catch (e) {
    return { status: "error", error: `The review queue could not be loaded: ${(e as Error).message}`, generatedAt, rows: [], counts };
  }
}

// ── Decision requests ─────────────────────────────────────────────────────────────
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECISIONS: ReviewDecision[] = ["link", "source_fix", "dismiss", "reopen"];

export interface DecisionRequest {
  jobId: string;
  decision: ReviewDecision;
  propertyId: string | null;
  correctedAddress: string | null;
  note: string | null;
}

export function parseDecisionBody(body: unknown): { ok: true; value: DecisionRequest } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const jobId = typeof b.jobId === "string" ? b.jobId.trim() : "";
  const decision = typeof b.decision === "string" ? (b.decision as ReviewDecision) : ("" as ReviewDecision);
  const propertyId = typeof b.propertyId === "string" && b.propertyId.trim() ? b.propertyId.trim() : null;
  const correctedAddress = typeof b.correctedAddress === "string" && b.correctedAddress.trim()
    ? b.correctedAddress.trim().slice(0, 200) : null;
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 500) : null;

  if (!UUID.test(jobId)) return { ok: false, error: "A valid AccuLynx job id is required." };
  if (!DECISIONS.includes(decision)) return { ok: false, error: "Decision must be link, source_fix, dismiss or reopen." };
  if (decision === "link" && (!propertyId || !UUID.test(propertyId))) {
    return { ok: false, error: "Choose a property to link." };
  }
  if (decision === "source_fix" && !correctedAddress && !note) {
    return { ok: false, error: "Enter the corrected address, or a note saying what is wrong." };
  }
  return { ok: true, value: { jobId, decision, propertyId: decision === "link" ? propertyId : null, correctedAddress, note } };
}

/** Plain-language text for the codes record_acculynx_job_property_decision() returns (W-03). */
export function decisionErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case "actor_required": return "Sign in again — the decision needs to know who made it.";
    case "unknown_decision": return "That decision isn't recognized. Reload the page and try again.";
    case "review_row_not_found": return "This job is no longer in the review queue. Reload to see the current list.";
    case "already_open": return "This row is already open.";
    case "resolved_by_automation": return "An automatic link resolved this row, so there is nothing to undo here.";
    case "not_open": return "Someone already decided this row. Reload to see the current state.";
    case "property_not_found": return "That property no longer exists. Pick another one.";
    case "job_already_linked": return "This job has been linked to a property since the list loaded. Reload to see which one.";
    case "corrected_address_or_note_required": return "Enter the corrected address, or a note saying what is wrong.";
    default: return "The decision was not saved. Try again, and reload if it keeps failing.";
  }
}

/** Escape a user search term for a PostgREST ilike pattern (literal % and _). */
export function ilikeTerm(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/[,()]/g, " ").trim();
}
