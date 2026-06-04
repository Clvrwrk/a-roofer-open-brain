import type { APIRoute } from "astro";
import { jsonResponse } from "@lib/agent-auth";
import { loadProductSurface } from "@lib/product-data";

export const prerender = false;

export const GET: APIRoute = async () => {
  const surface = await loadProductSurface();
  return jsonResponse(surface);
};
