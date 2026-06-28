# A3 — Context7 MCP (DevTeam conditional pilot)

**Status:** conditional_pilot — pending human approval  
**Owner:** Tool Manager  
**ROI:** Version-correct library docs for implementation runtimes; reduces hallucinated API calls.

## Scope

Containerized Context7 endpoint on Hetzner for pe-cc-cursor, pe-cc-codex, pe-cc-claude interactive sessions only.

## Gate checklist

- [ ] License and ToS review
- [ ] Egress: Context7 API only; no repo source upload without policy review
- [ ] No roofing brain credentials in same container
- [ ] Rollback: disable container reference in dev profile `.env`
- [ ] Human approval: Chris

## Verdict target

`conditional_pilot` → `allow` after 30 days with zero egress incidents.
