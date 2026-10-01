// GET /api/companycam/photos?propertyId=<uuid> | jobId=<uuid> | projectId=<id> [&before=<iso>&limit=<n>]
// Job-site photos for a property, AccuLynx job or CompanyCam project, newest first (docs/120).
// Brain-hosted photos come back as short-lived signed URLs; ones not yet copied fall back to
// the CompanyCam CDN. Read-only. Agents call it with their service bearer token.

import * as Sentry from "@sentry/astro";
import type { APIRoute } from "astro";
import { actorCanAccessDepartment, buildUnauthorizedResponse } from "@lib/access-control";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { loadCompanyCamPhotos } from "@lib/companycam-photos.server";

export const prerender = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT_ID = /^\d{1,20}$/;
const PHOTO_DEPARTMENTS = ["operations", "sales", "executive"] as const;

export const GET: APIRoute = async ({ locals, url }) => {
  const actor = locals.actor;
  if (!actor) return buildUnauthorizedResponse();
  if (!PHOTO_DEPARTMENTS.some((d) => actorCanAccessDepartment(actor, d))) {
    return jsonApiResponse({ error: "forbidden", error_description: "This account cannot read job-site photos." }, { status: 403 });
  }

  const propertyId = (url.searchParams.get("propertyId") ?? "").trim();
  const jobId = (url.searchParams.get("jobId") ?? "").trim();
  const projectId = (url.searchParams.get("projectId") ?? "").trim();
  const before = (url.searchParams.get("before") ?? "").trim();
  const limit = Number(url.searchParams.get("limit") ?? 60);

  if (!propertyId && !jobId && !projectId) {
    return jsonApiResponse({ error: "invalid_request", error_description: "propertyId, jobId or projectId is required." }, { status: 400 });
  }
  if ((propertyId && !UUID.test(propertyId)) || (jobId && !UUID.test(jobId)) || (projectId && !PROJECT_ID.test(projectId))
      || (before && Number.isNaN(Date.parse(before))) || !Number.isFinite(limit)) {
    return jsonApiResponse({ error: "invalid_request", error_description: "A filter value is malformed." }, { status: 400 });
  }

  const { client, config } = createServerSupabaseClient();
  if (!client) return jsonApiResponse({ error: "supabase_unconfigured", error_description: config.missing.join(", ") }, { status: 503 });

  try {
    const result = await loadCompanyCamPhotos(client, {
      propertyId: propertyId || undefined,
      jobId: jobId || undefined,
      projectId: projectId || undefined,
      before: before || undefined,
      limit,
    });
    return jsonApiResponse(result);
  } catch (error) {
    Sentry.captureException(error, { tags: { route: "companycam.photos" }, extra: { propertyId, jobId, projectId } });
    return jsonApiResponse({ error: "read_failed", error_description: "Photos could not be loaded." }, { status: 500 });
  }
};
