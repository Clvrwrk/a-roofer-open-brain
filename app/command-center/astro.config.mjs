import { defineConfig } from "astro/config";
import node from "@astrojs/node";

export default defineConfig({
  output: "server",
  vite: {
    envDir: "../..",
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
