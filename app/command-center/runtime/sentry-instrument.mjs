// Sentry init for the standalone Node background runtimes (Slack socket runtime; and, on the agent
// host, the nightly ABC sync). Loaded BEFORE app code via `node --import ./runtime/sentry-instrument.mjs`
// so @sentry/node can auto-instrument imports.
//
// No-ops unless SENTRY_DSN is set, so local/dev runs stay silent. SENTRY_COMPONENT tags which
// process this is (slack-runtime | abc-sync | …) so issues are distinguishable in one Sentry project.
import * as Sentry from "@sentry/node";

// DSN is a public identifier (not a secret); literal fallback guarantees the Slack runtime reports
// in prod even without SENTRY_DSN in the env. Gated on NODE_ENV=production (the container sets it;
// the agent-host nightly sync stays gated behind its own SENTRY_DSN check in abc-nightly-sync.sh).
const LITERAL_DSN = "https://64100fe85831a3ae8523eb6e810773af@o4511120856449024.ingest.us.sentry.io/4511599368798208";
const dsn = process.env.SENTRY_DSN ?? (process.env.NODE_ENV === "production" ? LITERAL_DSN : undefined);

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? "production",
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: 1.0,
    sendDefaultPii: false,
    initialScope: {
      tags: { component: process.env.SENTRY_COMPONENT ?? "node-runtime" },
    },
  });
}
