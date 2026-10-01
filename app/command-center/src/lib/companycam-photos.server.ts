// CompanyCam photo feed for Command Center surfaces and agents (docs/120, migration 318).
//
// Reads v_companycam_photo_feed through the service-role client. A photo whose bytes are in the
// brain (`source = 'brain'`) gets a short-lived signed URL from the private companycam-photos
// bucket; one still waiting in the copy queue falls back to its CompanyCam CDN URL. Callers never
// see the difference except in `source`.

import type { SupabaseClient } from "@supabase/supabase-js";

export const COMPANYCAM_BUCKET = "companycam-photos";
const SIGNED_URL_TTL_S = 3_600;

export interface CompanyCamPhotoFilter {
  propertyId?: string;
  jobId?: string;
  projectId?: string;
  /** ISO timestamp; returns photos captured strictly before it (cursor for "load more"). */
  before?: string;
  limit?: number;
}

export interface CompanyCamPhoto {
  photoId: string;
  projectId: string;
  projectName: string | null;
  propertyId: string | null;
  jobId: string | null;
  jobNumber: string | null;
  jobName: string | null;
  milestone: string | null;
  capturedAt: string | null;
  creatorName: string | null;
  tags: string[];
  description: string | null;
  source: "brain" | "companycam";
  thumbnailUrl: string | null;
  webUrl: string | null;
  originalUrl: string | null;
  companycamProjectUrl: string | null;
}

const COLUMNS =
  "photo_id,project_id,project_name,property_id,acculynx_job_id,job_number,job_name,current_milestone," +
  "captured_at,creator_name,tags,description,source,thumbnail_path,web_path,original_path," +
  "thumbnail_url,web_url,original_url,project_url";

export async function loadCompanyCamPhotos(client: SupabaseClient, filter: CompanyCamPhotoFilter) {
  const limit = Math.max(1, Math.min(200, filter.limit ?? 60));
  let query = client.from("v_companycam_photo_feed").select(COLUMNS)
    .order("captured_at", { ascending: false, nullsFirst: false })
    .limit(limit + 1);
  if (filter.propertyId) query = query.eq("property_id", filter.propertyId);
  if (filter.jobId) query = query.eq("acculynx_job_id", filter.jobId);
  if (filter.projectId) query = query.eq("project_id", filter.projectId);
  if (filter.before) query = query.lt("captured_at", filter.before);

  const { data, error } = await query;
  if (error) throw error;
  const rows = ((data as any[] | null) ?? []);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  // One signing round-trip for every brain-hosted variant on the page.
  const paths = page.filter((r) => r.source === "brain")
    .flatMap((r) => [r.thumbnail_path, r.web_path, r.original_path])
    .filter((p): p is string => Boolean(p));
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls, error: signError } = await client.storage.from(COMPANYCAM_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_S);
    if (signError) throw signError;
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }
  const pick = (path: string | null, cdn: string | null) => (path && signed.get(path)) || cdn || null;

  const photos: CompanyCamPhoto[] = page.map((r) => ({
    photoId: r.photo_id,
    projectId: r.project_id,
    projectName: r.project_name,
    propertyId: r.property_id,
    jobId: r.acculynx_job_id,
    jobNumber: r.job_number,
    jobName: r.job_name,
    milestone: r.current_milestone,
    capturedAt: r.captured_at,
    creatorName: r.creator_name,
    tags: r.tags ?? [],
    description: r.description,
    source: r.source === "brain" ? "brain" : "companycam",
    thumbnailUrl: pick(r.thumbnail_path, r.thumbnail_url),
    webUrl: pick(r.web_path, r.web_url),
    originalUrl: pick(r.original_path, r.original_url),
    companycamProjectUrl: r.project_url,
  }));

  return { photos, nextBefore: hasMore ? page[page.length - 1]?.captured_at ?? null : null };
}
