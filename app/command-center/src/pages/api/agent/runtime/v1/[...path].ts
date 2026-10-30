import type { APIRoute } from "astro";
export const prerender = false;
// Maya retired by operator direction on 2026-10-23. Preserve history; never execute old schedules or sends.
export const ALL: APIRoute = async () => new Response(JSON.stringify({error:"maya_retired"}), {
  status:410, headers:{"content-type":"application/json", "cache-control":"no-store"},
});
export const POST = ALL;
export const GET = ALL;
