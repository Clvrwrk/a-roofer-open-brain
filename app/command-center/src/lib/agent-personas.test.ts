import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPersona } from "../../runtime/personas.mjs";

const profiles = resolve(__dirname, "../../../../agents/profiles");
const registry = JSON.parse(readFileSync(resolve(__dirname, "../../runtime/named-agent-principals.json"), "utf8"));

describe("bundled personas", () => {
  it("ships a persona for every registry principal", () => {
    for (const p of registry.principals) expect(loadPersona(p.persona_id), p.persona_id).toBeTruthy();
  });
  it("matches agents/profiles/<id>/SOUL.md byte for byte", () => {
    for (const id of readdirSync(profiles, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
      const src = readFileSync(resolve(profiles, id, "SOUL.md"), "utf8").trim();
      expect(loadPersona(id), id).toBe(src);
    }
  });
  it("rejects path traversal and unknown ids", () => {
    expect(loadPersona("../../package")).toBeNull();
    expect(loadPersona("nobody")).toBeNull();
  });
});
