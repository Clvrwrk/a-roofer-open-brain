// Sentry init for the standalone Node background runtimes (Slack socket runtime; and, on the agent
// host, the nightly ABC sync). Loaded BEFORE app code via `node --import ./runtime/sentry-instrument.mjs`
// so @sentry/node can auto-instrument imports.
//
// No-ops unless SENTRY_DSN is set, so local/dev runs stay silent. SENTRY_COMPONENT tags which
// process this is (slack-runtime | abc-sync | …) so issues are distinguishable in one Sentry project.
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;

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
