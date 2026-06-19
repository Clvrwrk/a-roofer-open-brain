-- 112-estimate-audit-edits.sql
-- Operator edit overlay for Estimate Audit. Additive + idempotent.
--
-- Estimate Audit reads read-only views (v_estimate_audit_*) produced by the
-- estimate pipeline; operator edits (margin %, line qty, line unit cost, add/
-- delete line) must PERSIST without mutating generated pipeline data. This overlay
-- captures edits keyed by estimate_id (+ line_id for line scope); the loader merges
-- them on read and recomputes totals. Mirrors the invoice_line_audit /
-- agreement_package_items overlay pattern.

CREATE TABLE IF NOT EXISTS public.estimate_audit_edits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id  text NOT NULL,
  run_id       text,
  scope        text NOT NULL CHECK (scope IN ('estimate','line')),
  line_id      text,            -- null for estimate scope; view line_id, or 'new-<n>' for added lines
  line_action  text CHECK (line_action IN ('edit','added','deleted')),
  margin_pct   numeric,         -- estimate scope
  description  text,            -- line scope (added lines)
  qty          numeric,         -- line scope
  uom          text,            -- line scope
  unit_cost    numeric,         -- line scope
  edited_by    text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
-- One overlay row per (estimate, scope, line). Estimate scope uses '' for line_id.
CREATE UNIQUE INDEX IF NOT EXISTS uq_estimate_audit_edit
  ON public.estimate_audit_edits (estimate_id, scope, (coalesce(line_id, '')));
CREATE INDEX IF NOT EXISTS idx_estimate_audit_edits_est ON public.estimate_audit_edits (estimate_id);
