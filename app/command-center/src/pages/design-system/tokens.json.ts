import type { APIRoute } from "astro";
import { darkOverrides, tokens } from "@lib/design-system/tokens";
import { APP_VERSION } from "@lib/version";

// Machine-readable token feed for agents and build tools. Read straight from the
// production stylesheet at build time (see src/lib/design-system/tokens.ts), so it can
// never disagree with what the app ships. Shape is W3C DTCG-adjacent: one object per
// token with the raw value, the resolved literal, its group, and the dark-mode value
// where the design system defines one.
export const GET: APIRoute = () => {
  const body = {
    name: "Pro Exteriors Command Center",
    version: APP_VERSION,
    source: "app/command-center/src/styles/global.css :root",
    docs: "https://cc.proexteriorsus.net/design-system",
    modes: ["light", "dark"],
    tokens: tokens.map((t) => ({
      name: t.name,
      group: t.group,
      value: t.value,
      resolved: t.resolved,
      dark: darkOverrides[t.name] ?? null,
    })),
    motion: {
      "--motion-fast": "120ms",
      "--motion-base": "150ms",
      "--motion-slow": "200ms",
      "--motion-reveal": "350ms",
      "--ease-standard": "ease",
      "--ease-out": "cubic-bezier(0.2, 0, 0, 1)",
      "--ease-step": "steps(1, end)",
    },
    breakpoints: { rail: 1180, stack: 820, toc: 1280 },
    longList: { pageSize: 10, control: "Show all N … ▾ (M more)" },
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" },
  });
};
