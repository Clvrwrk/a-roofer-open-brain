// Chapter map for cc.proexteriorsus.net/design-system.
//
// One entry per page under src/pages/design-system/. `sections` lists the h2 ids on
// that page so the rail can show sub-links, the search box can find a section by
// name, and an agent can deep-link a rule (`/design-system/color#pantone`).
// Keep ids stable once published — other docs and Linear issues link to them.

export interface DsSection {
  id: string;
  label: string;
}

export interface DsChapter {
  slug: string; // "" for the index page
  title: string;
  short: string; // rail label
  group: "Foundations" | "Surfaces" | "Behaviour" | "Collateral" | "Governance";
  summary: string;
  sections: DsSection[];
}

export const DS_BASE = "/design-system";

export const dsChapters: DsChapter[] = [
  {
    slug: "",
    title: "Pro Exteriors Design System",
    short: "Overview",
    group: "Foundations",
    summary: "What the system is, the first-principles method every surface is built with, and how to read the rest.",
    sections: [
      { id: "purpose", label: "Purpose" },
      { id: "first-principles", label: "First-principles method" },
      { id: "user-first", label: "User over designer, user over client" },
      { id: "sources", label: "Sources of truth" },
      { id: "reading", label: "How to read this site" },
      { id: "rule-index", label: "Rule index" },
    ],
  },
  {
    slug: "color",
    title: "Color & Pantone management",
    short: "Color",
    group: "Foundations",
    summary: "Brand inks with Pantone, CMYK, RGB and HEX for every reproduction path, the five-role discipline, semantic status colors, and every contrast pairing measured.",
    sections: [
      { id: "brand-inks", label: "Brand inks" },
      { id: "pantone", label: "Pantone & print management" },
      { id: "roles", label: "Five-color role discipline" },
      { id: "surface-ink", label: "Surface & ink tokens" },
      { id: "semantic", label: "Semantic status colors" },
      { id: "surface-palettes", label: "Audit-surface palettes" },
      { id: "contrast", label: "Contrast matrix (measured)" },
      { id: "vendor-colors", label: "Vendor colors" },
      { id: "color-rules", label: "Rules" },
    ],
  },
  {
    slug: "logo",
    title: "Logo & mark",
    short: "Logo",
    group: "Foundations",
    summary: "Every approved artwork file, clear space, minimum sizes, backgrounds, the favicon and mark, vendor badges, alt text, and the misuse gallery.",
    sections: [
      { id: "files", label: "Approved files" },
      { id: "anatomy", label: "Anatomy" },
      { id: "clear-space", label: "Clear space & minimum size" },
      { id: "backgrounds", label: "Backgrounds & variants" },
      { id: "placement", label: "Placement in the app" },
      { id: "mark", label: "Roof mark & favicon" },
      { id: "vendor-badges", label: "Vendor & office badges" },
      { id: "misuse", label: "Misuse" },
      { id: "logo-motion", label: "Logo motion" },
      { id: "logo-alt", label: "Alt text for the logo" },
    ],
  },
  {
    slug: "typography",
    title: "Typography",
    short: "Type",
    group: "Foundations",
    summary: "Inter, the type ramp per surface, weights, tracking and kerning rules, line length, numerals, and the print and mobile ramps.",
    sections: [
      { id: "family", label: "Family & loading" },
      { id: "ramp", label: "The ramp" },
      { id: "weights", label: "Weights" },
      { id: "tracking", label: "Tracking, kerning & case" },
      { id: "numerals", label: "Numerals & money" },
      { id: "measure", label: "Measure & line height" },
      { id: "mobile-print", label: "Mobile & print ramps" },
      { id: "type-rules", label: "Rules" },
    ],
  },
  {
    slug: "spacing",
    title: "Spacing, layout & grid",
    short: "Spacing",
    group: "Foundations",
    summary: "The 4px scale, the single content rail, the app frame, breakpoints, density, and the full-bleed work-surface contract.",
    sections: [
      { id: "scale", label: "Spacing scale" },
      { id: "app-frame", label: "App frame" },
      { id: "container", label: "The content rail" },
      { id: "breakpoints", label: "Breakpoints" },
      { id: "full-bleed", label: "Full-bleed work surfaces" },
      { id: "density", label: "Density" },
      { id: "z-index", label: "Stacking order" },
      { id: "spacing-rules", label: "Rules" },
    ],
  },
  {
    slug: "iconography",
    title: "Icons, imagery & alt text",
    short: "Icons & images",
    group: "Foundations",
    summary: "The stroke icon grammar, image sizing per slot, file formats, and the alt-text rules for every kind of image the app or a brochure carries.",
    sections: [
      { id: "icon-grammar", label: "Icon grammar" },
      { id: "icon-set", label: "The set in use" },
      { id: "image-sizing", label: "Image sizing" },
      { id: "formats", label: "Formats & weight" },
      { id: "alt-text", label: "Alt text rules" },
      { id: "image-rules", label: "Rules" },
    ],
  },
  {
    slug: "components",
    title: "Component library",
    short: "Components",
    group: "Surfaces",
    summary: "Every component in production, with anatomy, live specimen in both modes, states, tokens, and the rules for when to use it.",
    sections: [
      { id: "buttons", label: "Buttons" },
      { id: "pills", label: "Status pills & badges" },
      { id: "kpi", label: "KPI & metric cards" },
      { id: "tables", label: "Tables" },
      { id: "toolbar", label: "Toolbar & filters" },
      { id: "segmented", label: "Segmented scope control" },
      { id: "inputs", label: "Inputs & selects" },
      { id: "disclosure", label: "Disclosures & groups" },
      { id: "show-more", label: "Show-more pane" },
      { id: "nav", label: "Side rail & top bar" },
      { id: "surface", label: "Work surface & section head" },
      { id: "queue", label: "Queue item & list-detail" },
      { id: "notices", label: "Banners & notices" },
      { id: "states", label: "Empty, loading & error states" },
      { id: "popup", label: "Popups & dialogs" },
      { id: "meters", label: "Meters & progress" },
      { id: "lights", label: "Runtime lights" },
      { id: "theme-control", label: "Theme control" },
      { id: "chips", label: "Chips & tabs" },
      { id: "vendor-marks", label: "Vendor marks & map markers" },
    ],
  },
  {
    slug: "modes",
    title: "Light & dark mode",
    short: "Light / dark",
    group: "Surfaces",
    summary: "The one preference, the token mapping for every role, and how each component must behave in each mode.",
    sections: [
      { id: "mechanism", label: "Mechanism" },
      { id: "mapping", label: "Token mapping" },
      { id: "per-component", label: "Per-component behaviour" },
      { id: "elevation-dark", label: "Elevation in dark" },
      { id: "media-dark", label: "Logos, images & charts in dark" },
      { id: "mode-rules", label: "Rules" },
    ],
  },
  {
    slug: "motion",
    title: "Motion & transitions",
    short: "Motion",
    group: "Behaviour",
    summary: "Every animation the app is allowed to make, each shown live, with duration and easing tokens, logo and graphic motion, and reduced-motion behaviour.",
    sections: [
      { id: "principles", label: "Principles" },
      { id: "tokens", label: "Duration & easing tokens" },
      { id: "catalog", label: "The catalogue (live)" },
      { id: "logo-graphic", label: "Logo & graphic motion" },
      { id: "reduced-motion", label: "Reduced motion" },
      { id: "motion-rules", label: "Rules" },
    ],
  },
  {
    slug: "dashboards",
    title: "Dashboards & data",
    short: "Dashboards",
    group: "Behaviour",
    summary: "Layout rules for work boards and executive dashboards built on Tufte's principles: data-ink, small multiples, layering, numbers as the first-class object.",
    sections: [
      { id: "tufte", label: "Tufte's principles, applied" },
      { id: "shapes", label: "Page shapes" },
      { id: "kpi-rules", label: "KPI rows" },
      { id: "charts", label: "Charts" },
      { id: "table-rules", label: "Tables as the primary chart" },
      { id: "numbers", label: "Number formatting" },
      { id: "lights-rules", label: "Status lights" },
      { id: "dash-rules", label: "Rules" },
    ],
  },
  {
    slug: "decisions",
    title: "UX decisions log",
    short: "Decisions",
    group: "Behaviour",
    summary: "Every product-level UI decision the team has made, with the reason and where it is recorded: nesting, filters, tables, feedback-driven changes.",
    sections: [
      { id: "nesting", label: "Office / vendor / branch nesting" },
      { id: "filters", label: "Filter rules" },
      { id: "table-decisions", label: "Table rules" },
      { id: "feedback", label: "Feedback-driven changes" },
      { id: "actions", label: "Actions & approval gates" },
      { id: "nav-decisions", label: "Navigation" },
      { id: "never", label: "Never-do list" },
    ],
  },
  {
    slug: "mobile",
    title: "Mobile & responsive",
    short: "Mobile",
    group: "Behaviour",
    summary: "How every surface adapts from a 1440px desk to a 375px phone, including surfaces built mobile-first.",
    sections: [
      { id: "philosophy", label: "Philosophy" },
      { id: "breakpoint-behaviour", label: "Behaviour at each breakpoint" },
      { id: "touch", label: "Touch targets & reach" },
      { id: "tables-mobile", label: "Tables on a phone" },
      { id: "mobile-first", label: "Building a mobile-first surface" },
      { id: "pwa", label: "Offline & install" },
      { id: "mobile-rules", label: "Rules" },
    ],
  },
  {
    slug: "accessibility",
    title: "Accessibility",
    short: "Accessibility",
    group: "Behaviour",
    summary: "WCAG 2.2 AA as the floor: contrast, focus, keyboard, ARIA patterns in use, and status that never relies on color alone.",
    sections: [
      { id: "floor", label: "The floor" },
      { id: "focus", label: "Focus & keyboard" },
      { id: "aria", label: "ARIA patterns in use" },
      { id: "color-independence", label: "Color independence" },
      { id: "forms", label: "Forms & errors" },
      { id: "a11y-rules", label: "Rules" },
    ],
  },
  {
    slug: "content",
    title: "Content & microcopy",
    short: "Content",
    group: "Behaviour",
    summary: "Voice, labels, numbers, dates, money, empty states, control labels that state their cost, and the words we never use.",
    sections: [
      { id: "voice", label: "Voice" },
      { id: "labels", label: "Labels & headings" },
      { id: "numbers-dates", label: "Numbers, dates & money" },
      { id: "controls", label: "Control labels" },
      { id: "messages", label: "Messages & empty states" },
      { id: "content-rules", label: "Rules" },
    ],
  },
  {
    slug: "print",
    title: "Print, brochures & infographics",
    short: "Print",
    group: "Collateral",
    summary: "Sizes, bleed, margins, ink, type floors and layout rules for one-pagers, trifolds, infographics and estimate documents.",
    sections: [
      { id: "sizes", label: "Sizes & bleed" },
      { id: "ink", label: "Ink & color management" },
      { id: "print-type", label: "Type in print" },
      { id: "one-pager", label: "One-pager anatomy" },
      { id: "trifold", label: "Trifold anatomy" },
      { id: "infographic", label: "Infographics" },
      { id: "estimate-doc", label: "Estimate & invoice documents" },
      { id: "print-rules", label: "Rules" },
    ],
  },
  {
    slug: "swag",
    title: "Swag & apparel",
    short: "Swag",
    group: "Collateral",
    summary: "Rendered references for every promotional item, with imprint method, colour path, minimum logo size and artwork file per item.",
    sections: [
      { id: "renders", label: "Reference renders" },
      { id: "imprint", label: "Imprint methods & colour paths" },
      { id: "item-specs", label: "Per-item specifications" },
      { id: "swag-rules", label: "Rules" },
      { id: "provenance", label: "Provenance" },
    ],
  },
  {
    slug: "web",
    title: "Landing pages & marketing web",
    short: "Marketing web",
    group: "Collateral",
    summary: "Anatomy of a public page: one offer, one action, proof the visitor can trust, and the roofing-specific patterns.",
    sections: [
      { id: "anatomy", label: "Page anatomy" },
      { id: "hero", label: "Hero" },
      { id: "proof", label: "Proof" },
      { id: "cta", label: "Calls to action" },
      { id: "forms-web", label: "Lead forms" },
      { id: "performance", label: "Performance & SEO" },
      { id: "web-rules", label: "Rules" },
    ],
  },
  {
    slug: "agents",
    title: "Agent handbook",
    short: "Agent handbook",
    group: "Governance",
    summary: "The build recipe for any new surface, the review checklist, the file map, and the machine-readable token feed.",
    sections: [
      { id: "recipe", label: "Build recipe" },
      { id: "checklist", label: "Ship checklist" },
      { id: "file-map", label: "File map" },
      { id: "tokens-feed", label: "Token feed" },
      { id: "escalation", label: "When to escalate" },
      { id: "changelog", label: "Changelog" },
    ],
  },
];

export function chapterHref(chapter: DsChapter): string {
  return chapter.slug ? `${DS_BASE}/${chapter.slug}` : DS_BASE;
}

export function findChapter(slug: string): DsChapter | undefined {
  return dsChapters.find((c) => c.slug === slug);
}

export function neighbours(slug: string): { prev?: DsChapter; next?: DsChapter } {
  const i = dsChapters.findIndex((c) => c.slug === slug);
  return { prev: i > 0 ? dsChapters[i - 1] : undefined, next: i >= 0 && i < dsChapters.length - 1 ? dsChapters[i + 1] : undefined };
}

/** Flat search index: every chapter and every section, for the rail search box. */
export function searchIndex(): { label: string; href: string; chapter: string }[] {
  const out: { label: string; href: string; chapter: string }[] = [];
  for (const c of dsChapters) {
    const href = chapterHref(c);
    out.push({ label: c.title, href, chapter: c.short });
    for (const s of c.sections) out.push({ label: s.label, href: `${href}#${s.id}`, chapter: c.short });
  }
  return out;
}
