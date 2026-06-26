import type { APIRoute } from "astro";

export const prerender = false;

const worker = String.raw`
const VERSION = "cc-page-cache-v20260626a";
const PAGE_ROUTES = [
  "/",
  "/accounting/invoice-audit",
  "/accounting/price-list/review",
  "/operations/order-audit",
  "/operations/estimate-audit",
  "/weekly-snapshot",
  "/accounting/vendor-regions",
  "/accounting",
  "/operations",
  "/sales",
  "/marketing",
  "/executive",
  "/system",
];
const API_ROUTES = ["/api/vendor-territories"];
let actorCacheKey = "unknown";

function safeActorKey(value) {
  return String(value || "unknown").toLowerCase().replace(/[^a-z0-9._-]+/g, "_").slice(0, 80) || "unknown";
}

function pageCacheName() {
  return VERSION + ":pages:" + actorCacheKey;
}

function apiCacheName() {
  return VERSION + ":api:" + actorCacheKey;
}

function responsePathMatches(response, requestedPath) {
  try {
    const finalUrl = new URL(response.url);
    return finalUrl.origin === self.location.origin && finalUrl.pathname === requestedPath;
  } catch {
    return false;
  }
}

function htmlLooksComplete(html) {
  if (!html || html.length < 2000) return false;
  const lowered = html.toLowerCase();
  if (lowered.includes("supabase pending")) return false;
  if (lowered.includes("no invoices found in the live pipeline")) return false;
  if (lowered.includes("loading invoice detail")) return false;
  if (lowered.includes("territory data failed to load")) return false;
  if (lowered.includes("map unavailable")) return false;
  if (lowered.includes("workos-authenticated command center session")) return false;
  if (lowered.includes('data-rendered="1"') && !lowered.includes('class="iv-ln')) return false;
  return true;
}

function isCacheableHtml(response, requestedPath) {
  if (!response || !response.ok) return false;
  const type = response.headers.get("content-type") || "";
  return type.includes("text/html") && responsePathMatches(response, requestedPath);
}

async function maybeCacheHtmlResponse(cache, key, response, requestedPath) {
  if (!isCacheableHtml(response, requestedPath)) return;
  const copy = response.clone();
  const html = await copy.text();
  if (htmlLooksComplete(html)) {
    await cache.put(key, new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }));
  }
}

async function cacheRenderedHtml(path, html) {
  if (!path || !htmlLooksComplete(html)) return;
  const cache = await caches.open(pageCacheName());
  await cache.put(path, new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }));
}

function isCacheableJson(response) {
  if (!response || !response.ok) return false;
  return (response.headers.get("content-type") || "").includes("application/json");
}

async function cacheHtmlRoute(path) {
  const cache = await caches.open(pageCacheName());
  const request = new Request(path, { credentials: "include", headers: { accept: "text/html" } });
  const response = await fetch(request);
  await maybeCacheHtmlResponse(cache, path, response, path);
}

async function cacheApiRoute(path) {
  const cache = await caches.open(apiCacheName());
  const request = new Request(path, { credentials: "include", headers: { accept: "application/json" } });
  const response = await fetch(request);
  if (isCacheableJson(response)) await cache.put(path, response.clone());
}

async function precache(urls) {
  const unique = [...new Set((urls && urls.length ? urls : PAGE_ROUTES).filter(Boolean))];
  await Promise.allSettled(unique.map((path) => cacheHtmlRoute(path)));
  await Promise.allSettled(API_ROUTES.map((path) => cacheApiRoute(path)));
}

async function clearCommandCenterCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith("cc-page-cache-")).map((key) => caches.delete(key)));
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SET_ACTOR") actorCacheKey = safeActorKey(data.actorId || data.actorEmail || data.actorName);
  if (data.type === "PRECACHE") event.waitUntil(precache(data.urls));
  if (data.type === "CACHE_RENDERED_PAGE") event.waitUntil(cacheRenderedHtml(data.path, data.html));
  if (data.type === "CLEAR") event.waitUntil(clearCommandCenterCaches());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js" || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/_astro/") || url.pathname.startsWith("/_image")) return;

  if (request.mode === "navigate") {
    event.respondWith(staleWhileRevalidateHtml(event, request, url.pathname));
    return;
  }

  if (API_ROUTES.includes(url.pathname)) {
    event.respondWith(staleWhileRevalidateApi(event, request, url.pathname));
  }
});

async function staleWhileRevalidateHtml(event, request, pathname) {
  const cache = await caches.open(pageCacheName());
  const cached = await cache.match(pathname);
  const refresh = fetch(request).then(async (response) => {
    await maybeCacheHtmlResponse(cache, pathname, response, pathname);
    return response;
  });

  if (cached) {
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }

  return refresh;
}

async function staleWhileRevalidateApi(event, request, pathname) {
  const cache = await caches.open(apiCacheName());
  const cached = await cache.match(request);
  const refresh = fetch(request).then(async (response) => {
    if (isCacheableJson(response)) await cache.put(request, response.clone());
    return response;
  });

  if (cached) {
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }

  return refresh;
}
`;

export const GET: APIRoute = async () =>
  new Response(worker, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-cache",
      "service-worker-allowed": "/",
    },
  });
