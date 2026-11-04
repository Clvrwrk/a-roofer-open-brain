// The CC design-system site (/design-system, docs/112) was retired on 2026-11-04.
// The Pro Exteriors design system now lives at https://ds.proexteriorsus.net
// (@proexteriors/ds in Clvrwrk/CRM_PWA). Every old path is a permanent redirect,
// never a 404 (ds rule S-06): a chapter with an obvious ds page goes there, and
// everything else goes to the ds home page.

export const DS_ORIGIN = "https://ds.proexteriorsus.net";

// Old chapter slug -> ds page. Chapters with no clear ds counterpart (components,
// content, dashboards, iconography, motion, print, swag, web) fall through to "/".
const CHAPTER_TO_DS: Record<string, string> = {
  "": "/",
  accessibility: "/a11y.html",
  agents: "/adopt.html",
  color: "/color.html",
  decisions: "/rules.html",
  logo: "/shell.html",
  mobile: "/layout.html",
  modes: "/color.html",
  spacing: "/layout.html",
  typography: "/type.html",
  "tokens.json": "/assets/tokens.json",
};

/** Returns the ds URL for a /design-system path, or null for any other path. */
export function designSystemRedirect(pathname: string): string | null {
  if (pathname !== "/design-system" && !pathname.startsWith("/design-system/")) return null;
  const rest = pathname.slice("/design-system".length).replace(/^\/+|\/+$/g, "");
  const chapter = rest.split("/")[0] ?? "";
  return DS_ORIGIN + (CHAPTER_TO_DS[chapter] ?? "/");
}
