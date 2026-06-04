import type { APIRoute } from "astro";
import { buildProtectedResourceMetadata, jsonResponse } from "@lib/agent-auth";

export const prerender = false;

export const GET: APIRoute = () => {
  return jsonResponse(buildProtectedResourceMetadata(), {
    headers: {
      "cache-control": "public, max-age=300",
    },
  });
};
