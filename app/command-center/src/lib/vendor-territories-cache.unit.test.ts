import { afterEach, describe, expect, it } from "vitest";
import {
  invalidateVendorTerritorySurfaceCache,
  loadVendorTerritorySurface,
  setVendorTerritoryPayloadLoaderForTests,
  type VendorTerritoryMapPayload,
} from "@lib/vendor-territories";

// The territory surface is cached for 10 minutes and dropped by the assign route
// (Greptile on PR #30). A load that started before the assign must not refill
// the cache with the pre-assign payload.

function payload(label: string) {
  return { source: "live", label } as unknown as VendorTerritoryMapPayload;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

afterEach(() => {
  setVendorTerritoryPayloadLoaderForTests(null);
});

describe("loadVendorTerritorySurface cache", () => {
  it("serves a live payload from cache until invalidated", async () => {
    let calls = 0;
    setVendorTerritoryPayloadLoaderForTests(async () => payload(`load-${++calls}`));

    expect(await loadVendorTerritorySurface({})).toMatchObject({ label: "load-1" });
    expect(await loadVendorTerritorySurface({})).toMatchObject({ label: "load-1" });
    expect(calls).toBe(1);

    invalidateVendorTerritorySurfaceCache();
    expect(await loadVendorTerritorySurface({})).toMatchObject({ label: "load-2" });
    expect(calls).toBe(2);
  });

  it("does not let a load started before an invalidate refill the cache", async () => {
    const preAssign = deferred<VendorTerritoryMapPayload>();
    const postAssign = deferred<VendorTerritoryMapPayload>();
    const loads = [preAssign, postAssign];
    let calls = 0;
    setVendorTerritoryPayloadLoaderForTests(() => loads[calls++].promise);

    // A read starts before the branch is routed to an office.
    const staleRead = loadVendorTerritorySurface({});
    // The assign route drops the cache while that read is still in flight.
    invalidateVendorTerritorySurfaceCache();
    // A read after the assign starts its own load.
    const freshRead = loadVendorTerritorySurface({});
    expect(calls).toBe(2);

    // The old load finishes first. Its caller still gets its answer...
    preAssign.resolve(payload("before-assign"));
    expect(await staleRead).toMatchObject({ label: "before-assign" });

    // ...but it neither filled the cache nor cleared the newer in-flight load.
    const joined = loadVendorTerritorySurface({});
    expect(calls).toBe(2);

    postAssign.resolve(payload("after-assign"));
    expect(await freshRead).toMatchObject({ label: "after-assign" });
    expect(await joined).toMatchObject({ label: "after-assign" });

    // The cache now holds the post-assign payload.
    expect(await loadVendorTerritorySurface({})).toMatchObject({ label: "after-assign" });
    expect(calls).toBe(2);
  });

  it("drops a pre-invalidate result even when no newer read has started", async () => {
    const preAssign = deferred<VendorTerritoryMapPayload>();
    let calls = 0;
    setVendorTerritoryPayloadLoaderForTests(() => {
      calls += 1;
      return calls === 1 ? preAssign.promise : Promise.resolve(payload("after-assign"));
    });

    const staleRead = loadVendorTerritorySurface({});
    invalidateVendorTerritorySurfaceCache();
    preAssign.resolve(payload("before-assign"));
    await staleRead;

    expect(await loadVendorTerritorySurface({})).toMatchObject({ label: "after-assign" });
    expect(calls).toBe(2);
  });
});
