import type { APIRoute } from "astro";
import { buildAuthorizationServerMetadata, jsonResponse } from "@lib/agent-auth";

export const prerender = false;

export const GET: APIRoute = () => {
  return jsonResponse(buildAuthorizationServerMetadata(), {
    headers: {
      "cache-control": "public, max-age=300",
    },
  });
};
