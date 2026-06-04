// seed_jurisdictions.ts — upsert jurisdictions + an initial regulatory_snapshot
// from config/roofer.config.yaml into the brain. Deno. Called by new-client.sh.
//   deno run --allow-net --allow-env scripts/seed_jurisdictions.ts config/roofer.config.yaml
import { parse } from "https://deno.land/std@0.224.0/yaml/mod.ts";

// deno-lint-ignore no-explicit-any
const D = (globalThis as any).Deno;
const configPath = D.args[0] ?? "config/roofer.config.yaml";
const SUPABASE_URL = D.env.get("SUPABASE_URL");
const KEY = D.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  D.exit(1);
}

interface Jurisdiction {
  name: string;
  ahj?: string;
  building_code?: string;
  wind_zone?: string;
  notes?: string;
}
interface Config {
  jurisdictions?: Jurisdiction[];
}

const cfg = parse(await D.readTextFile(configPath)) as Config;
const list = cfg.jurisdictions ?? [];
console.log(`Seeding ${list.length} jurisdiction(s) from ${configPath}`);

async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": KEY,
      "Authorization": `Bearer ${KEY}`,
      "Prefer": "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return await res.json();
}

for (const j of list) {
  const rows = (await post("jurisdiction", {
    name: j.name,
    ahj: j.ahj ?? null,
    wind_zone: j.wind_zone ?? null,
    notes: j.notes ?? null,
  })) as Array<{ id: string }>;
  const jid = rows[0]?.id;
  if (jid && j.building_code) {
    // Split "IRC-2021 + local amendments" → code_family IRC, code_version 2021.
    const m = String(j.building_code).match(/([A-Za-z]+)[\s-]*([0-9]{4})/);
    await post("regulatory_snapshot", {
      jurisdiction_id: jid,
      code_family: m ? m[1] : "UNKNOWN",
      code_version: m ? m[2] : String(j.building_code),
      effective_from: `${m ? m[2] : "2000"}-01-01`,
      amendments: j.building_code,
    });
  }
  console.log(`  ✓ ${j.name}`);
}
console.log("Done.");
