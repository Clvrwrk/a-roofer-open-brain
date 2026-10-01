// CompanyCam API object → mirror row mapping (docs/120, migration 318).
//
// Single source for both writers: the Node sync (integrations/bridges/companycam/sync.mjs)
// and the Deno webhook receiver (./index.ts) import this file, so a field means the same thing
// whichever path wrote it. Plain JS on purpose: both runtimes load it without a build step.
//
// Rows never carry link or storage columns, so an upsert can't wipe a human link or copy
// state. `seen_run_id` is set only by sweeps (runId given); the webhook omits it so a delivery
// that lands mid-sweep can't make the sweep mark that row removed.

export const ts = (v) => (v ? new Date(typeof v === "number" ? v * 1000 : v).toISOString() : null);
export const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function withRun(row, runId) {
  if (runId) row.seen_run_id = runId;
  return row;
}

export function mapProject(p, runId) {
  const a = p.address || {};
  const now = new Date().toISOString();
  return withRun({
    id: String(p.id),
    company_id: p.company_id ?? null,
    name: p.name ?? null,
    status: p.status ?? null,
    archived: Boolean(p.archived),
    is_public: p.public ?? null,
    street_address_1: a.street_address_1 || null,
    street_address_2: a.street_address_2 || null,
    city: a.city || null,
    state: a.state || null,
    postal_code: a.postal_code || null,
    country: a.country || null,
    latitude: num(p.coordinates?.lat),
    longitude: num(p.coordinates?.lon),
    project_url: p.project_url ?? null,
    public_url: p.public_url ?? null,
    embedded_project_url: p.embedded_project_url ?? null,
    photo_count: p.photo_count ?? null,
    document_count: p.document_count ?? null,
    creator_name: p.creator_name ?? null,
    cc_created_at: ts(p.created_at),
    cc_updated_at: ts(p.updated_at),
    raw: p,
    synced_at: now,
    last_seen_by_api: now,
    removed_at: null,
  }, runId);
}

export function mapPhoto(p, runId) {
  const uri = (type) => p.uris?.find((u) => u.type === type)?.url ?? null;
  const ann = p.annotations;
  const hasAnn = Boolean(ann && ((ann.text?.length || 0) + (ann.stickers?.length || 0) + (ann.shapes?.length || 0)));
  return withRun({
    id: String(p.id),
    project_id: String(p.project_id),
    company_id: p.company_id ?? null,
    creator_id: p.creator_id ?? null,
    creator_name: p.creator_name ?? null,
    captured_at: ts(p.captured_at),
    cc_created_at: ts(p.created_at),
    cc_updated_at: ts(p.updated_at),
    latitude: num(p.coordinates?.lat),
    longitude: num(p.coordinates?.lon),
    status: p.status ?? null,
    processing_status: p.processing_status ?? null,
    internal: p.internal ?? null,
    origin: p.origin ?? null,
    description: p.description?.plain_text_content ?? null,
    tags: (p.tags || []).map((t) => t.display_value).filter(Boolean),
    has_annotations: hasAnn,
    thumbnail_url: uri("thumbnail"),
    web_url: uri("web"),
    original_url: uri("original"),
    raw: p,
    synced_at: new Date().toISOString(),
    removed_at: null,
  }, runId);
}

export function mapVideo(v, runId) {
  return withRun({
    id: String(v.id),
    project_id: String(v.project_id),
    company_id: v.company_id ?? null,
    creator_id: v.creator_id ?? null,
    creator_name: v.creator_name ?? null,
    captured_at: ts(v.captured_at),
    cc_created_at: ts(v.created_at),
    cc_updated_at: ts(v.updated_at),
    latitude: num(v.coordinates?.lat),
    longitude: num(v.coordinates?.lon),
    status: v.status ?? null,
    internal: v.internal ?? null,
    format: v.format ?? null,
    duration_s: Number.isFinite(v.duration) ? v.duration : null,
    transcript: v.transcript?.text || null,
    thumbnail_url: v.thumbnail_urls?.large ?? null,
    raw: v,
    synced_at: new Date().toISOString(),
    removed_at: null,
  }, runId);
}
