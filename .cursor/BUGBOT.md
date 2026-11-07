# Bugbot review rules

Bugbot is the first reviewer on this repo. CodeRabbit gives a second opinion only on request. Greptile is used only on labelled high-stakes PRs in EF-CRM and CRM_PWA.

## Scope
- Review application code only: TypeScript, JavaScript, SQL migrations, server functions, CI and infra config.
- Do not comment on content: `*.md`, `*.mdx`, `docs/**`, images (png, jpg, webp, avif, svg, gif, ico), video, or `src/data/journal.ts`. Internal ringer swarms validate blogs, vlogs and scripts.
- If a PR changes only content files, post nothing.

## Priorities (highest first)
1. Security: auth and authorization gaps, Supabase RLS missing or bypassed, service-role keys in client code, secrets in code, injection.
2. Data integrity: migrations that lock or rewrite large tables (indexes should use `CREATE INDEX CONCURRENTLY`), destructive SQL without a guard, multi-tenant (organization_id / office) isolation leaks.
3. Correctness: logic bugs, unhandled errors, race conditions, broken null handling.
4. Performance on hot paths only: N+1 queries, unindexed foreign keys.

## Noise control
- Skip style, naming and formatting nits that a linter would catch.
- Don't repeat a finding that an earlier Bugbot, CodeRabbit or Greptile comment already made on this PR.
- Every finding needs a concrete failure scenario and a suggested fix.
