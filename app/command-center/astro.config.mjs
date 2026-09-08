import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import sentry from "@sentry/astro";
import react from "@astrojs/react";

export default defineConfig({
  output: "server",
  // Preserve Astro 6 whitespace behavior while the shared surfaces are revalidated.
  compressHTML: true,
  integrations: [
    react(),
    // Loads sentry.client.config.ts + sentry.server.config.ts and, during a production build,
    // uploads source maps (needs SENTRY_AUTH_TOKEN at build time — passed as a Docker build secret).
    // When the token is absent (local builds) the upload is skipped with a warning; the app still builds.
    sentry({
      sourceMapsUploadOptions: {
        org: "cleverwork",
        project: "cc-proexteriorsus",
        authToken: process.env.SENTRY_AUTH_TOKEN,
      },
      telemetry: false,
    }),
  ],
  vite: {
    envDir: "../..",
    // Sandboxed/CI builds can relocate the vite cache when node_modules/.vite
    // is not writable; defaults to node_modules/.vite when unset.
    ...(process.env.VITE_CACHE_DIR ? { cacheDir: process.env.VITE_CACHE_DIR } : {}),
  },
  security: {
    // Traefik terminates TLS. Trust only this deployed host when Astro restores
    // the external origin used by the canonical Sales BFF's origin/CSRF checks.
    allowedDomains: [{hostname: "cc.proexteriorsus.net", protocol: "https"}],
    // Agent OAuth endpoints accept machine-to-machine form and SET POSTs.
    checkOrigin: false,
  },
  adapter: node({
    mode: "standalone",
  }),
  server: {
    host: true,
  },
});
