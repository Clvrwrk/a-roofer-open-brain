import type { APIRoute } from "astro";
import { buildAuthMdDocument } from "@lib/agent-auth";

export const prerender = false;

export const GET: APIRoute = () => {
  return new Response(buildAuthMdDocument(), {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
};
