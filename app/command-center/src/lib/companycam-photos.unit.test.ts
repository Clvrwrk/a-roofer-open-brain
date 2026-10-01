import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, loadCompanyCamPhotos } from "@lib/companycam-photos.server";

// Minimal stand-in for the supabase-js query builder + storage signer.
function fakeClient(rows: any[], calls: { filters: string[]; signed: string[][] }) {
  const builder: any = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    eq: (col: string, v: string) => { calls.filters.push(`${col}=${v}`); return builder; },
    or: (expr: string) => { calls.filters.push(`or:${expr}`); return builder; },
    then: (resolve: any) => resolve({ data: rows, error: null }),
  };
  return {
    from: () => builder,
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => {
          calls.signed.push(paths);
          return { data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}` })), error: null };
        },
      }),
    },
  } as any;
}

const row = (id: string, source: "brain" | "companycam", capturedAt: string) => ({
  photo_id: id, project_id: "p1", project_name: "123 Main", property_id: "prop", acculynx_job_id: "job",
  job_number: "J-1", job_name: "Main", current_milestone: "Approved", captured_at: capturedAt,
  creator_name: "Crew", tags: ["Before and After"], description: null, source,
  thumbnail_path: source === "brain" ? `p1/${id}/thumbnail.jpg` : null,
  web_path: source === "brain" ? `p1/${id}/web.jpg` : null,
  original_path: null,
  thumbnail_url: `https://static.companycam.com/${id}/t.jpeg`,
  web_url: `https://static.companycam.com/${id}/w.jpeg`,
  original_url: `https://static.companycam.com/${id}/o.jpeg`,
  project_url: "https://app.companycam.com/projects/p1",
});

describe("loadCompanyCamPhotos", () => {
  it("signs brain-hosted variants and falls back to the CompanyCam CDN for the rest", async () => {
    const calls = { filters: [] as string[], signed: [] as string[][] };
    const client = fakeClient([row("a", "brain", "2026-09-30T10:00:00Z"), row("b", "companycam", "2026-09-29T10:00:00Z")], calls);
    const { photos, nextBefore } = await loadCompanyCamPhotos(client, { propertyId: "prop", limit: 5 });

    expect(calls.filters).toEqual(["property_id=prop"]);
    expect(calls.signed).toEqual([["p1/a/thumbnail.jpg", "p1/a/web.jpg"]]); // one round-trip, brain rows only
    expect(photos[0]).toMatchObject({ source: "brain", thumbnailUrl: "https://signed/p1/a/thumbnail.jpg", originalUrl: "https://static.companycam.com/a/o.jpeg" });
    expect(photos[1]).toMatchObject({ source: "companycam", thumbnailUrl: "https://static.companycam.com/b/t.jpeg" });
    expect(nextBefore).toBeNull();
  });

  it("pages with a keyset cursor over (captured_at, photo_id) and never signs when nothing is copied", async () => {
    const calls = { filters: [] as string[], signed: [] as string[][] };
    const rows = [row("11", "companycam", "2026-09-30T10:00:00Z"), row("10", "companycam", "2026-09-29T10:00:00Z")];
    const before = encodeCursor({ t: "2026-10-01T00:00:00.000Z", id: "99" });
    const { photos, nextBefore } = await loadCompanyCamPhotos(fakeClient(rows, calls), { jobId: "job", limit: 1, before });

    expect(calls.filters).toEqual([
      "acculynx_job_id=job",
      "or:captured_at.lt.2026-10-01T00:00:00.000Z,and(captured_at.eq.2026-10-01T00:00:00.000Z,photo_id.lt.99),captured_at.is.null",
    ]);
    expect(calls.signed).toEqual([]);
    expect(photos).toHaveLength(1);
    expect(decodeCursor(nextBefore!)).toEqual({ t: "2026-09-30T10:00:00.000Z", id: "11" });
  });

  it("keeps undated photos reachable and rejects malformed cursors", async () => {
    const calls = { filters: [] as string[], signed: [] as string[][] };
    await loadCompanyCamPhotos(fakeClient([], calls), { projectId: "p1", before: encodeCursor({ t: null, id: "7" }) });
    expect(calls.filters).toEqual(["project_id=p1", "or:and(captured_at.is.null,photo_id.lt.7)"]);
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor(encodeCursor({ t: "2026-01-01T00:00:00Z", id: "x);drop" }))).toBeNull();
  });
});
