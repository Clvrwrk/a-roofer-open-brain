# A3 — DataForSEO API (DevTeam conditional pilot)

**Status:** conditional_pilot — pending human approval  
**Owner:** SEO Engineer / Tool Manager  
**ROI:** Lighthouse fallback when PageSpeed Insights quota/rate-limits; SERP/on-page APIs for weekly SEO audits on proexteriorsus.com.

## Scope

`DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` in dev Hermes profiles (seo-engineer, pe-cc-agents weekly cron). Never on roofing-ops plane. Runner: `scripts/seo-dataforseo-lighthouse.mjs`.

## Gate checklist

- [ ] License: DataForSEO ToS
- [ ] Egress: `api.dataforseo.com` only; audit URLs limited to `seo-maintenance.config.json`
- [ ] Spend cap monitored by Tool Manager monthly cron (Lighthouse live tasks billed per URL)
- [ ] Rollback: revoke credentials + remove from provision-dev-agent-env.sh
- [ ] Human approval: Chris

## Verdict target

`conditional_pilot` → `allow` after doc 54 review and first weekly audit receipt with DataForSEO scores in `reports/seo-maintenance/`.
