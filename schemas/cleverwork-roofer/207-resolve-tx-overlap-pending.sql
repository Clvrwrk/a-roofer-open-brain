-- 207 — resolve the Texas overlap_pending branches (docs/82 §6 follow-up).
-- Applied to prod 2026-08-05.
--
-- Every overlap_pending + unassigned branch in the system (15 SRS + 14 QXO, all
-- Texas) was stranded by the OLD two-ring Texas geometry: Euless + Richardson
-- overlapped, so the classifier parked them pending a human pick. Euless is now
-- archived (migration 204, Chris: "Richardson is the sole Texas office"), so the
-- overlap no longer exists — Richardson is the only possible office. Resolving
-- them is deterministic, not a judgment call.
--
-- Effect: DFW SRS branches inherit Richardson's SRS-MELISSA-L4 (in-date -> green,
-- 97 priced lines); QXO TX branches show honestly RED (no QXO agreement — Chris's
-- decision). Idempotent; touches only this exact stranded set.
UPDATE public.vendor_branches vb
SET pricing_status = 'covered',
    pricing_territory_office_id = 'bd3016cc-4b21-4fd0-be65-31aa18b9fdbd',
    suggested_office_id = 'bd3016cc-4b21-4fd0-be65-31aa18b9fdbd',
    territory_decided_by = 'System — Euless archived, Richardson is the sole TX ring (docs/82 R5)',
    territory_decided_at = now()
WHERE vb.pricing_status = 'overlap_pending'
  AND vb.pricing_territory_office_id IS NULL
  AND vb.state = 'TX';
