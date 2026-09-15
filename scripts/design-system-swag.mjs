#!/usr/bin/env node
// Generates the swag reference renders shown on cc.proexteriorsus.net/design-system/swag.
//
// Model: OpenAI GPT Image 2.5 (Flare) on fal.ai, EDIT endpoint, with the official
// full-colour logo passed as the reference image so the wordmark, roof mark and the
// navy / flag-red inks are reproduced faithfully rather than re-imagined.
//
// Usage (FAL_KEY must be in the environment; never commit it):
//   node scripts/design-system-swag.mjs            # render every item not yet on disk
//   node scripts/design-system-swag.mjs --force    # re-render everything
//   node scripts/design-system-swag.mjs pen magnet # only these slugs
//
// Output: app/command-center/public/design-system/swag/<slug>.png (+ manifest.json with
// the prompt, model, size and timestamp for each render, which the page renders as
// provenance). Downsample afterwards with scripts/design-system-swag-optimize.sh.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const OUT_DIR = resolve(repo, "app/command-center/public/design-system/swag");
const LOGO = resolve(repo, "config/brand/assets/logo_color.png");
const MODEL = "openai/gpt-image-2.5/flare/edit";
const ENDPOINT = `https://fal.run/${MODEL}`;

const BRAND =
  "Brand: Pro Exteriors LLC, a roofing and exterior contractor. Reproduce the attached logo exactly as supplied: " +
  "a navy roof-line silhouette with the word PRO in navy inside a white panel, the word EXTERIORS in flag red bold italic capitals, " +
  "and a small LLC. Brand inks are deep navy (#11133F, Pantone 2766 C) and flag red (#C22326, Pantone 186 C); accent gold (#EAA221, Pantone 1235 C) may appear only as a thin rule or trim. " +
  "No other logo, no extra text, no fake taglines, no watermarks. Product photography style: studio lighting, neutral light-grey seamless background, sharp focus, realistic materials.";

export const ITEMS = [
  {
    slug: "pen",
    title: "Click pen",
    prompt: `${BRAND} A white plastic retractable click pen with a navy clip and navy click button, the logo pad-printed in full colour along the barrel, lying at a slight angle beside a second identical pen standing in a clear acrylic holder.`,
  },
  {
    slug: "marker",
    title: "Permanent marker",
    prompt: `${BRAND} A navy-bodied chisel-tip permanent marker with a navy cap, the logo printed in white knockout along the barrel (one-colour white version: the whole lockup in white), cap removed and resting beside it, on a workshop bench.`,
  },
  {
    slug: "magnet",
    title: "Refrigerator magnet",
    prompt: `${BRAND} A rectangular 3.5 by 2 inch glossy refrigerator magnet with rounded corners: white background, the full-colour logo centred, a thin gold rule beneath it and the phone-number line left blank as an empty white strip. Photographed on a stainless-steel refrigerator door with a soft reflection.`,
  },
  {
    slug: "hard-hat",
    title: "Hard hat",
    prompt: `${BRAND} A white safety hard hat with the full-colour logo decal on the front, photographed three-quarter view on a job-site plank with blurred shingles behind.`,
  },
  {
    slug: "polo",
    title: "Crew polo",
    prompt: `${BRAND} A navy pique polo shirt on a ghost mannequin, the logo embroidered on the left chest in the one-colour white version (entire lockup in white thread, roughly 3.5 inches wide), front view, studio lighting.`,
  },
  {
    slug: "tshirt",
    title: "Crew t-shirt",
    prompt: `${BRAND} A heather-grey cotton t-shirt laid flat with the full-colour logo screen-printed large across the chest, about 10 inches wide, top-down photograph.`,
  },
  {
    slug: "yard-sign",
    title: "Yard sign",
    prompt: `${BRAND} An 18 by 24 inch corrugated plastic yard sign on an H-stake in a suburban front lawn: white background, the full-colour logo large at the top, a navy band across the bottom left blank, photographed at eye level with a house and new roof softly out of focus behind.`,
  },
  {
    slug: "truck-door",
    title: "Truck door decal",
    prompt: `${BRAND} A white pickup truck door with the full-colour logo as a vinyl decal about 20 inches wide, centred on the door panel, photographed side-on in daylight in a driveway.`,
  },
  {
    slug: "mug",
    title: "Coffee mug",
    prompt: `${BRAND} A white ceramic 11 oz coffee mug with a navy handle and navy interior, the full-colour logo printed on the side facing the camera, sitting on a light wood desk.`,
  },
  {
    slug: "notepad",
    title: "Estimate notepad",
    prompt: `${BRAND} A 5.5 by 8.5 inch white notepad with the full-colour logo printed small at the top-left header and thin navy ruled lines below, a navy click pen resting on it, photographed top-down on a clipboard.`,
  },
  {
    slug: "cap",
    title: "Crew cap",
    prompt: `${BRAND} A navy structured baseball cap with the one-colour white version of the logo embroidered on the front panel, three-quarter view on a plain surface.`,
  },
  {
    slug: "sticker",
    title: "Die-cut sticker",
    prompt: `${BRAND} A die-cut vinyl sticker of the logo with a 2 millimetre white border following the outline of the lockup, peeling slightly off its backing paper, photographed close up.`,
  },
];

function dataUri(path) {
  const buf = readFileSync(path);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

async function render(item, logo) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: item.prompt,
      image_urls: [logo],
      image_size: "square_hd",
      quality: "high",
      num_images: 1,
      output_format: "png",
    }),
  });
  if (!res.ok) throw new Error(`${item.slug}: fal ${res.status} ${await res.text()}`);
  const json = await res.json();
  const img = json.images?.[0];
  if (!img?.url) throw new Error(`${item.slug}: no image in response ${JSON.stringify(json).slice(0, 300)}`);
  const bytes = Buffer.from(await (await fetch(img.url)).arrayBuffer());
  return { bytes, width: img.width, height: img.height };
}

async function main() {
  if (!process.env.FAL_KEY) {
    console.error("FAL_KEY is not set in this shell; nothing rendered.");
    process.exit(2);
  }
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const only = new Set(args.filter((a) => !a.startsWith("--")));
  mkdirSync(OUT_DIR, { recursive: true });
  const manifestPath = resolve(OUT_DIR, "manifest.json");
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
  const logo = dataUri(LOGO);

  for (const item of ITEMS) {
    if (only.size && !only.has(item.slug)) continue;
    const target = resolve(OUT_DIR, `${item.slug}.png`);
    if (!force && existsSync(target)) {
      console.log(`skip ${item.slug} (exists)`);
      continue;
    }
    process.stdout.write(`render ${item.slug} … `);
    try {
      const { bytes, width, height } = await render(item, logo);
      writeFileSync(target, bytes);
      manifest[item.slug] = {
        title: item.title,
        model: MODEL,
        prompt: item.prompt,
        reference: "config/brand/assets/logo_color.png",
        width,
        height,
        renderedAt: new Date().toISOString(),
      };
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
      console.log(`ok ${width}x${height} ${(bytes.length / 1024).toFixed(0)} KB`);
    } catch (err) {
      console.log("FAILED");
      console.error(String(err));
    }
  }
}

main();
