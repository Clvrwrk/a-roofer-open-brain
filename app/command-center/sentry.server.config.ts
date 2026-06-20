// Sentry server-side init for the Command Center SSR (loaded by the @sentry/astro integration into
// dist/server/entry.mjs). DSN comes from the runtime env (SENTRY_DSN, injected by Coolify in prod);
// when absent we don't init, so local dev stays silent.
//
// PII posture (CLAUDE.md rule 2): sendDefaultPii=false (no IPs/cookies/headers by default) plus a
// belt-and-suspenders beforeSend that drops cookies + the Authorization header.
import * as Sentry from "@sentry/astro";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? "production",
    release: process.env.SENTRY_RELEASE,

    // Full tracing for the alpha (low traffic). Dial down post-launch.
    tracesSampleRate: 1.0,

    sendDefaultPii: false,

    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers.cookie;
          delete event.request.headers.authorization;
          delete event.request.headers.Authorization;
        }
      }
      return event;
    },
  });
}
