// Auto-maintained by scripts/bump-app-version.mjs — do not edit by hand.
// Policy: docs/62-app-versioning.md
export const APP_VERSION_MAJOR = 0;
export const APP_VERSION_MINOR = 6;
export const APP_VERSION_PATCH = 125;
export const APP_VERSION_STAGE: "A" | "B" | null = "A";
export const APP_VERSION = `${APP_VERSION_MAJOR}.${APP_VERSION_MINOR}.${APP_VERSION_PATCH}${APP_VERSION_STAGE ?? ""}`;
export const APP_VERSION_DATE = "2026-07-01";
