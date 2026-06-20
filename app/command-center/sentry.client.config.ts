// Sentry browser-side init for the Command Center (loaded by the @sentry/astro integration).
//
// DSN is read from PUBLIC_SENTRY_DSN, baked in at build time (Docker build ENV). When the var is
// absent (local dev, or a build without Sentry configured) we DON'T init — so dev never reports.
//
// PII posture (CLAUDE.md rule 2): sendDefaultPii=false, and Session Replay masks ALL text + inputs
// and blocks media, so a replay shows clicks/navigation/layout but never customer names, property
// addresses, or pricing.
import * as Sentry from "@sentry/astro";

// A Sentry DSN is a PUBLIC identifier (it ships in the client bundle by design) — not a secret,
// so a literal fallback is safe and guarantees prod telemetry even if PUBLIC_SENTRY_DSN isn't wired
// as a build arg. Gated on import.meta.env.PROD so local `astro dev` stays silent.
const LITERAL_DSN = "https://64100fe85831a3ae8523eb6e810773af@o4511120856449024.ingest.us.sentry.io/4511599368798208";
const dsn = import.meta.env.PUBLIC_SENTRY_DSN ?? (import.meta.env.PROD ? LITERAL_DSN : undefined);

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.PUBLIC_SENTRY_ENVIRONMENT ?? "production",
    release: import.meta.env.PUBLIC_SENTRY_RELEASE,

    // Full tracing for the alpha (low traffic). Dial down post-launch.
    tracesSampleRate: 1.0,

    // Session Replay: every error session, 10% of normal sessions.
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],

    sendDefaultPii: false,
  });
}
