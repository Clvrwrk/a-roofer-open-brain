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
  /** Opaque cursor from a previous page's `nextBefore` ("load more"). */
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

// Keyset cursor over (captured_at DESC NULLS LAST, photo_id DESC): photos sharing a timestamp
// across a page boundary are not skipped, and undated photos (sorted last) stay reachable.
interface Cursor { t: string | null; id: string }
export function encodeCursor(c: Cursor) {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}
export function decodeCursor(raw: string): Cursor | null {
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof c?.id !== "string" || !/^\d{1,20}$/.test(c.id)) return null;
    if (c.t !== null && (typeof c.t !== "string" || Number.isNaN(Date.parse(c.t)))) return null;
    return { t: c.t === null ? null : new Date(c.t).toISOString(), id: c.id };
  } catch {
    return null;
  }
}
function afterCursor(c: Cursor) {
  return c.t === null
    ? `and(captured_at.is.null,photo_id.lt.${c.id})`
    : `captured_at.lt.${c.t},and(captured_at.eq.${c.t},photo_id.lt.${c.id}),captured_at.is.null`;
}

export async function loadCompanyCamPhotos(client: SupabaseClient, filter: CompanyCamPhotoFilter) {
  const limit = Math.max(1, Math.min(200, filter.limit ?? 60));
  let query = client.from("v_companycam_photo_feed").select(COLUMNS)
    .order("captured_at", { ascending: false, nullsFirst: false })
    .order("photo_id", { ascending: false })
    .limit(limit + 1);
  if (filter.propertyId) query = query.eq("property_id", filter.propertyId);
  if (filter.jobId) query = query.eq("acculynx_job_id", filter.jobId);
  if (filter.projectId) query = query.eq("project_id", filter.projectId);
  if (filter.before) {
    const cursor = decodeCursor(filter.before);
    if (!cursor) throw new Error("invalid cursor");
    query = query.or(afterCursor(cursor));
  }

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

  const last = page[page.length - 1];
  return { photos, nextBefore: hasMore && last ? encodeCursor({ t: last.captured_at ?? null, id: last.photo_id }) : null };
}
