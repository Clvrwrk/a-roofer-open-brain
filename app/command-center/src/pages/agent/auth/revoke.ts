import type { APIRoute } from "astro";
import { notImplementedAgentAuthResponse } from "@lib/agent-auth";

export const prerender = false;

export const POST: APIRoute = () => {
  return notImplementedAgentAuthResponse("Agent registration revocation");
};
