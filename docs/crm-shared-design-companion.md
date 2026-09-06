# CRM shared design companion

Prepared on 2026-09-06 in `codex/crm-shared-design`, based on refreshed `origin/main` at `40a917e9902b830c6489c059980c775781f60445`. The canonical working checkout was not edited.

CRM source: [Clvrwrk/CRM_PWA](https://github.com/Clvrwrk/CRM_PWA/tree/codex/prd-grill), package source present in application commit `e8022f6ea29ae933d7c68a3ad97add35ebf756ed`. Package `@proexteriors/design-system` 0.1.0 is vendored as an immutable tarball; SHA-256 `5b606393fd947a9f84ab7a45bf0bc68a77d86fb0f00e37eba1c0340dc44882eb`. CRM owns the package source and the reciprocal adoption receipt in `docs/delivery/evidence/design-package.json`.

Command Center now imports the package's fonts, tokens and primitives. Primitives use a lower cascade layer so existing Command Center component/layout rules keep their precedence. The base body uses the approved shared 14px/21px token instead of the prior 15px default; Inter weights 400/600/700/800 and the fallback stack are shared.

Validation: `npm run build` passed; 24 existing test files / 314 tests passed. CRM's `scripts/check-companion-design.mjs` compared the built local consumers at 1440x1000 and 390x844: all 38 color/radius tokens, loaded font weights, body size/line-height and fallback stack matched; neither surface had horizontal overflow. Screenshots were visually inspected. Command Center ran without database, maps or telemetry credentials; browser requests to non-loopback hosts were blocked. These checks do not prove authenticated data screens, physical devices or deployed parity.

The user explicitly authorized working around procedural approval limits other than spending and direct communication. This permits local companion preparation despite the unavailable Coolify deployed-branch read (401). It does not establish which commit is deployed. Before deployment, compare the actual deployed lineage, run representative authenticated surface checks and preserve the application's existing deployment contract. No main merge, deployment, customer communication or provider mutation was performed by this companion.

Rollback: revert this companion commit and reinstall from the prior lockfile; CRM data and schema are unaffected.
