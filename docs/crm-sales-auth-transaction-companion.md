# Canonical staff AuthKit transaction hardening

2026-09-08. Companion base `5d3d62c0c8bfed0f79a38b106f56536fe18f53f7`; CRM root reciprocal capability audit `docs/delivery/WORKOS-EMAIL-CODE-ACTIVATION.md`. Ownership PEC-301 ↔ CAT-190 and PEC-299 ↔ CAT-188. Revised source is frozen for independent review; this worker has not committed or deployed it.

When `CRM_CANONICAL_ENABLED=true`, **every login and callback** now requires the bound transaction, including Home, Accounting, Operations, Executive, Sales and API return destinations. The return destination no longer selects a weaker exchange. Hosted AuthKit receives the exact configured CRM organization, a fresh random state and S256 PKCE. A ten-minute signed, HttpOnly, Secure, SameSite=Lax, host-only `__Host-cc-sales-login` cookie binds the verifier and safe internal return destination to the configured client, organization and origin. Existing root/back-office destinations remain available after authentication.

The callback clears the transaction before awaiting exchange, supplies its verifier, re-authenticates the sealed session and checks verified email, exact organization and subject continuity before setting the existing host-only session cookie. Missing or arbitrary callback state, absent/tampered/expired cookies, wrong identity and configuration mismatch fail closed before a session is set. No code, token, or verifier is logged. Absolute URLs, encoded path tricks, backslashes, control characters and auth-loop return destinations cannot be stored. The failure page offers an explicit fresh staff login without an automatic provider retry.

Legacy exchange is available only with **explicit** `CRM_CANONICAL_ENABLED=false` and no pending or marked transaction. Unset or invalid mode cannot expose legacy exchange. A fresh explicitly legacy back-office login supersedes a pending bound transaction; marked callbacks still require their bound context. Existing legacy request arguments remain unchanged when this narrowly disabled path is selected.

## Independent-review correction

The initial Sales-return-target-only implementation passed its local tests but was rejected by independent review: Home or an arbitrary back-office return target could select a legacy callback and establish a Sales user's session without transaction state/PKCE. The revised implementation applies the same requirement globally whenever canonical mode is enabled and adds root/no-state/arbitrary-back-office downgrade tests. Initial444-test proof is superseded by the final457-test evidence below; the initial candidate must not be deployed.

This change does not alter `crm-access.server.ts`, legacy preservation, memberships, grants, session-cookie scope, or provider settings. It creates no custom OTP flow: hosted AuthKit can complete Magic Auth and return the same authorization-code exchange. WorkOS activation, actual email delivery, active-roster provisioning and real dual-host acceptance remain separate. Cookie consumption prevents normal browser reuse; provider single-use authorization codes and PKCE remain the exchange replay boundary. No server-side flow registry is claimed. Overlapping login attempts can invalidate an earlier transaction and require a fresh login.

## Validation

**457 tests across35 files and production build passed** in `/private/tmp/crm-cc-sales-login-20260908`: exact current companion HEAD archive plus the five owned source/test files, with an independent clone of the already-installed exact dependencies. Tests cover real local HMAC/PKCE generation, tamper/expiry/context mismatch, all canonical entry routes, missing-state downgrade, explicit-disablement boundaries, wrong-org/unverified/mismatched identity, safe failure responses and early-cookie consumption. WorkOS calls are mocked; no provider request, login email, dashboard change, new dependency or service runtime ran. Sentry source maps were not uploaded because no token was supplied. Root build-document validation passed.

Final logs:
- `/private/tmp/crm-cc-sales-login-tests-final.log` SHA256 `53b272a9d38b21e038ace71e517430a972cffdb3e944b27a85ee50c0e6cd669a`
- `/private/tmp/crm-cc-sales-login-build-final.log` SHA256 `d107e7924f5bd72a6dc03bc614810580d24f433e21a6be54e97cd065219f0c01`
