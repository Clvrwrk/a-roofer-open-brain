#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";

const AGENTS = ["maya-chen", "alex-rivers", "casey-morgan", "jordan-price", "sam-torres", "rowan-vale", "lena-brooks", "ops-conductor"];
const REQUIRED = ["Personality and voice", "Communication standard", "NEPQ", "Scope boundary", "No DMs between agents"];
let failures = 0;

for (const slug of AGENTS) {
  const profilePath = `agents/profiles/${slug}.yaml`;
  const soulPath = `agents/profiles/${slug}/SOUL.md`;
  console.log(`\n## ${slug}`);
  if (!existsSync(profilePath)) {
    console.log(`❌ Missing ${profilePath}`);
    failures += 1;
    continue;
  }
  if (!existsSync(soulPath)) {
    console.log(`❌ Missing ${soulPath}`);
    failures += 1;
    continue;
  }
  const profile = readFileSync(profilePath, "utf8");
  const soul = readFileSync(soulPath, "utf8");
  const display = /display_name:\s*"([^"]+)"/.exec(profile)?.[1];
  if (display && soul.includes(display)) console.log(`✅ SOUL matches profile display name: ${display}`);
  else {
    console.log(`❌ SOUL does not include profile display name ${display ?? "unknown"}`);
    failures += 1;
  }
  for (const phrase of REQUIRED) {
    if (soul.includes(phrase)) console.log(`✅ includes ${phrase}`);
    else {
      console.log(`❌ missing ${phrase}`);
      failures += 1;
    }
  }
  if (slug === "rowan-vale" && !soul.includes("Research gate")) {
    console.log("❌ Rowan missing research gate");
    failures += 1;
  }
}

console.log(`\nSOUL validation ${failures ? "FAILED" : "PASSED"} (${failures} failure(s))`);
process.exitCode = failures ? 1 : 0;
