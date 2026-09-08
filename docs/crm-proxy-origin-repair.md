# Sales HTTPS origin repair — September 8, 2026

Live authenticated browser inspection found the Command Center Sales shell recognized the staff user, but the canonical session API returned forbidden. The CRM PWA loaded the same user's scoped weekly data. Normal desktop reauthentication did not resolve it.

The deployed Command Center did not configure Astro `security.allowedDomains`. With TLS terminating at Traefik, the installed Astro 7.3.1 / Node adapter 11.1.5 runtime retained the internal HTTP request origin. The shared canonical BFF correctly rejected it against the configured public HTTPS origin.

Trust only `https://cc.proexteriorsus.net` in Astro's forwarded-host restoration. Preserve the existing exact-origin, session, role and CSRF checks. No wildcard domain, broad access, provider key or financial change is introduced. The preexisting machine-to-machine Astro checkOrigin setting is unchanged.

Verification: 568 companion tests passed, including eight new regression cases. Independent review exercised the actual Node request → FetchState → action context request → canonical HTTP path: eight additional groups passed, including old-config failure, exact HTTPS restoration, wrong origin/protocol/port, missing session and POST Origin/CSRF denials. Production build passed; deployment and actual hosted acceptance are recorded separately in CRM_PWA.

Owning work: PEC-301; reciprocal Codex trail CAT-190. Detailed review: CRM_PWA/docs/delivery/CC-PROXY-ORIGIN-RED-TEAM.md. CODEX receipt: docs/linear/teams/PEC/2026-09-07-crm-pwa-release.md. [Astro configuration reference](https://v6.docs.astro.build/en/reference/configuration-reference/#securityalloweddomains) corroborates the host allowlist; installed runtime source provides the version-specific behavior.

A healthy deployment or successful staff-session read is not completion of the full Wednesday/Ops/Friday beta acceptance.
