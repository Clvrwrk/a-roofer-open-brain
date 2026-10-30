#!/usr/bin/env node
/**
 * Put a price-agreement source document into the `agreements` bucket and, optionally,
 * bind it to the agreement it evidences.
 *
 * The gap this fills: nothing in the repo could write to that bucket. `promote.ts`
 * *references* `pdf_storage_bucket: "agreements"` but never uploads, and Maya's mailbox
 * intake records attachment FILENAMES only (`lib/agent-intake.ts` types them
 * `string[]` — no download, no upload; the Slack path has a real processor, Gmail does
 * not). So every one of the bucket's objects was placed by hand on 2026-06-20, and
 * `price_agreements.source_pdf_url` is NULL on every SRS agreement. A claim citing an
 * agreement with no document behind it cannot be shown to a vendor in a dispute.
 *
 *   node scripts/upload-agreement-pdf.mjs <file.pdf> [--as <object-name>] \
 *        [--agreement <id|number>] [--dry-run]
 *
 * Naming follows the bucket's existing convention, <city>-<vendor|agreement>-<period>:
 *   denver-branch49-pricelist-2024.pdf   wichita-2036874-16-jun2026.pdf
 *
 * ENV: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Never overwrites: an existing object name is an error, not a silent replace.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { basename } from "node:path";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const has = (n) => args.includes(n);
const file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--as" && args[args.indexOf(a) - 1] !== "--agreement");

const die = (m) => { console.error(`error: ${m}`); process.exit(1); };
if (!file) die("usage: upload-agreement-pdf.mjs <file.pdf> [--as name] [--agreement id|number] [--dry-run]");
if (!existsSync(file)) die(`no such file: ${file}`);
if (!file.toLowerCase().endsWith(".pdf")) die("only .pdf source documents belong in the agreements bucket");

const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) die("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

const objectName = (flag("--as") || basename(file)).replace(/[^A-Za-z0-9._-]/g, "-").toLowerCase();
const bytes = readFileSync(file);
const dry = has("--dry-run");
const hdrs = { apikey: key, authorization: `Bearer ${key}` };

const existing = await fetch(`${url}/storage/v1/object/info/agreements/${encodeURIComponent(objectName)}`, { headers: hdrs });
if (existing.ok) die(`agreements/${objectName} already exists — pick another --as name rather than overwriting a source document`);

console.log(`${dry ? "[dry-run] would upload" : "uploading"} ${file} (${statSync(file).size} bytes) -> agreements/${objectName}`);
if (dry) process.exit(0);

const up = await fetch(`${url}/storage/v1/object/agreements/${encodeURIComponent(objectName)}`, {
  method: "POST",
  headers: { ...hdrs, "content-type": "application/pdf", "x-upsert": "false" },
  body: bytes,
});
if (!up.ok) die(`upload failed: ${up.status} ${(await up.text()).slice(0, 300)}`);
console.log(`uploaded agreements/${objectName}`);

const agreement = flag("--agreement");
if (!agreement) {
  console.log("no --agreement given: the file is stored but not yet bound to an agreement (source_pdf_url stays NULL).");
  process.exit(0);
}
// bind by uuid id, else by agreement_number
const isUuid = /^[0-9a-f-]{36}$/i.test(agreement);
const filter = isUuid ? `id=eq.${agreement}` : `agreement_number=eq.${encodeURIComponent(agreement)}`;
const patch = await fetch(`${url}/rest/v1/price_agreements?${filter}`, {
  method: "PATCH",
  headers: { ...hdrs, "content-type": "application/json", prefer: "return=representation" },
  body: JSON.stringify({ source_pdf_url: `agreements/${objectName}` }),
});
if (!patch.ok) die(`bind failed: ${patch.status} ${(await patch.text()).slice(0, 300)}`);
const rows = await patch.json();
if (!rows.length) die(`no price_agreements row matched ${agreement} — file uploaded but unbound`);
console.log(`bound to ${rows.length} agreement(s): ${rows.map((r) => r.agreement_number || r.id).join(", ")}`);
