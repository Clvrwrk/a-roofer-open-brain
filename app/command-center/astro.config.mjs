import { defineConfig } from "astro/config";
import node from "@astrojs/node";

export default defineConfig({
  output: "server",
  vite: {
    envDir: "../..",
    // Sandboxed/CI builds can relocate the vite cache when node_modules/.vite
    // is not writable; defaults to node_modules/.vite when unset.
    ...(process.env.VITE_CACHE_DIR ? { cacheDir: process.env.VITE_CACHE_DIR } : {}),
  },
  security: {
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
